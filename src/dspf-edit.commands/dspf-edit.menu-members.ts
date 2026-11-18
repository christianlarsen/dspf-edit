/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.commands/dspf-edit.menu-members.ts
*/

// A menu is two members (MENU.MNUDDS + MENUQQ.MNUCMD, see dspf-edit.utils/dspf-edit.menu.ts).
// As in SDA, opening either one opens the menu: opening the commands member brings up the menu
// image (its commands are worked with from the "Menu Commands" panel), and while the commands
// member is the active editor the tree says which menu it belongs to.

import * as vscode from 'vscode';
import * as path from 'path';
import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { ExtensionState } from '../dspf-edit.states/state';
import { getMenuMemberKind, getMenuMemberPair, parseMenuCommands, MenuCommands, MenuCreateOptions, DEFAULT_MENU_CREATE_OPTIONS } from '../dspf-edit.utils/dspf-edit.menu';

/** Member name (no extension) of a path, as written in it. */
function memberName(filePath: string): string {
    return path.posix.basename(filePath, path.posix.extname(filePath));
};

/** The URI of the other member of the menu the given document belongs to, if it is a menu member. */
function getOtherMenuMemberUri(uri: vscode.Uri): vscode.Uri | undefined {
    const kind = getMenuMemberKind(uri.path);
    const pair = getMenuMemberPair(uri.path);
    if (!kind || !pair) {
        return undefined;
    };
    return uri.with({ path: kind === 'dds' ? pair.commandsPath : pair.ddsPath });
};

// OPENING THE COMMANDS MEMBER OPENS THE MENU

/**
 * Commands members already open, that are no longer sent to their menu image: each one is sent
 * there only the first time it's opened, so it can still be looked at afterwards (clicking its
 * tab, or "Open the commands member" in the Menu Commands panel).
 */
const commandsMembersShown = new Set<string>();

/** Opens a commands member as it is, without sending it to its menu image. */
export async function showCommandsMember(uri: vscode.Uri, viewColumn?: vscode.ViewColumn): Promise<void> {
    commandsMembersShown.add(uri.toString());
    await vscode.window.showTextDocument(uri, { preview: false, viewColumn });
};

/**
 * When a commands member (MENUQQ) becomes the active editor for the first time, opens its menu
 * image (MENU) in the same column, as SDA opens the menu whichever member is chosen.
 */
export async function openMenuImageForCommandsMember(editor: vscode.TextEditor | undefined): Promise<void> {
    const uri = editor?.document.uri;
    if (!uri || getMenuMemberKind(uri.path) !== 'commands' || commandsMembersShown.has(uri.toString())) {
        return;
    };
    commandsMembersShown.add(uri.toString());
    const menuImageUri = getOtherMenuMemberUri(uri);
    if (!menuImageUri) {
        return;
    };
    try {
        await vscode.workspace.fs.stat(menuImageUri);
    } catch {
        vscode.window.showWarningMessage(`Menu image ${memberName(menuImageUri.path)} (type MNUDDS) not found next to ${memberName(uri.path)}.`);
        return;
    };
    await vscode.window.showTextDocument(menuImageUri, { preview: false, viewColumn: editor?.viewColumn });
};

/**
 * While a menu commands member is the active editor, the tree tells which menu it belongs to
 * (the tree itself keeps showing the last display file, as with any other non-DDS editor).
 */
export function updateMenuTreeMessage(treeProvider: DdsTreeProvider, document: vscode.TextDocument | undefined): void {
    const treeView = treeProvider.getTreeView();
    if (!treeView) {
        return;
    };
    // Other editors (RPG, CL...) leave the message as it was, like they leave the tree
    if (!document || (document.languageId !== 'dds.dspf' && getMenuMemberKind(document.uri.path) !== 'commands')) {
        return;
    };

    if (getMenuMemberKind(document.uri.path) !== 'commands') {
        treeView.message = undefined;
        // "Menu mode": a menu image only allows what SDA allows on it (constants, colors and
        // attributes), so the tree hides record/file commands and new fields (package.json "when").
        vscode.commands.executeCommand('setContext', 'dspf-edit.isMenu', getMenuMemberKind(document.uri.path) === 'dds');
        return;
    };

    const pair = getMenuMemberPair(document.uri.path);
    if (!pair) {
        treeView.message = `${memberName(document.uri.path)} is not part of a menu: a menu commands member is named like its menu plus QQ.`;
        return;
    };
    const ddsUri = document.uri.with({ path: pair.ddsPath }).toString();
    treeView.message = ExtensionState.lastDdsDocument?.uri.toString() === ddsUri
        ? `Commands of menu ${pair.menuName}. The tree shows its menu image.`
        : `Commands of menu ${pair.menuName}. Open its menu image (${pair.menuName}) to work with the menu.`;
};

// CRTMNU OPTIONS PER MENU

// CMDLIN isn't kept in the source, so the preview remembers the ones chosen for each
// menu (global storage, keyed by the menu image's URI), starting with CRTMNU's own defaults.

const MENU_CREATE_OPTIONS_KEY = 'dspf-edit.menuCreateOptions';

function storedMenuCreateOptions(): Record<string, MenuCreateOptions> {
    return ExtensionState.context?.globalState.get<Record<string, MenuCreateOptions>>(MENU_CREATE_OPTIONS_KEY) ?? {};
};

/** The CRTMNU options chosen for the menu whose image is the given URI (CRTMNU's defaults if none). */
export function getMenuCreateOptions(menuImage: vscode.Uri): MenuCreateOptions {
    return { ...DEFAULT_MENU_CREATE_OPTIONS, ...storedMenuCreateOptions()[menuImage.toString()] };
};

/** Remembers the CRTMNU options chosen for the menu whose image is the given URI. */
export async function setMenuCreateOptions(menuImage: vscode.Uri, options: MenuCreateOptions): Promise<void> {
    const all = { ...storedMenuCreateOptions(), [menuImage.toString()]: options };
    await ExtensionState.context.globalState.update(MENU_CREATE_OPTIONS_KEY, all);
};

// MENU COMMANDS FOR THE PREVIEW

// The preview shows each option's command (from MENUQQ) when hovering its number. The commands
// member is read in the background the first time and then kept up to date while it's edited, so
// the preview never waits on it; listeners hear when it changes, to re-render.

/** Commands per menu image URI; null once known that there is no commands member to read. */
const menuCommandsCache = new Map<string, MenuCommands | null>();
const loading = new Set<string>();
const menuCommandsChanged = new vscode.EventEmitter<void>();

/** Fires when the commands of a menu were (re)read. */
export const onDidChangeMenuCommands = menuCommandsChanged.event;

/**
 * The commands of the menu whose image is the given document, if already read. The first call
 * starts reading them and returns undefined; onDidChangeMenuCommands fires when they are ready.
 */
export function getMenuCommandsFor(menuImage: vscode.TextDocument): MenuCommands | undefined {
    const commandsUri = getOtherMenuMemberUri(menuImage.uri);
    if (!commandsUri || getMenuMemberKind(menuImage.uri.path) !== 'dds') {
        return undefined;
    };
    const key = menuImage.uri.toString();
    if (menuCommandsCache.has(key)) {
        return menuCommandsCache.get(key) ?? undefined;
    };
    if (!loading.has(key)) {
        loading.add(key);
        vscode.workspace.openTextDocument(commandsUri).then(
            document => menuCommandsCache.set(key, parseMenuCommands(document.getText().split(/\r?\n/))),
            () => menuCommandsCache.set(key, null)
        ).then(() => {
            loading.delete(key);
            menuCommandsChanged.fire();
        });
    };
    return undefined;
};

/** Re-reads a menu's commands when its commands member is edited (unsaved changes included). */
function refreshMenuCommandsOnEdit(document: vscode.TextDocument): void {
    if (getMenuMemberKind(document.uri.path) !== 'commands') {
        return;
    };
    const ddsUri = getOtherMenuMemberUri(document.uri);
    if (!ddsUri) {
        return;
    };
    menuCommandsCache.set(ddsUri.toString(), parseMenuCommands(document.getText().split(/\r?\n/)));
    menuCommandsChanged.fire();
};

export function registerMenuMemberCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        menuCommandsChanged,
        vscode.workspace.onDidChangeTextDocument(event => refreshMenuCommandsOnEdit(event.document)),
        // A commands member created after the menu image was first previewed is read again
        vscode.workspace.onDidOpenTextDocument(document => refreshMenuCommandsOnEdit(document)),
        // Closed and opened again: sent to its menu image again, as the first time
        vscode.workspace.onDidCloseTextDocument(document => commandsMembersShown.delete(document.uri.toString())),
        vscode.window.onDidChangeActiveTextEditor(editor => openMenuImageForCommandsMember(editor))
    );
    openMenuImageForCommandsMember(vscode.window.activeTextEditor);
};
