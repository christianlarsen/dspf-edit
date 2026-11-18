/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.commands/dspf-edit.menu-members.ts
*/

// A menu is two members (MENU.MNUDDS + MENUQQ.MNUCMD, see dspf-edit.utils/dspf-edit.menu.ts).
// Opening one of them offers a link at the top of the editor to open the other one, and while the
// commands member is the active editor the tree says which menu it belongs to.

import * as vscode from 'vscode';
import * as path from 'path';
import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { ExtensionState } from '../dspf-edit.states/state';
import { getMenuMemberKind, getMenuMemberPair } from '../dspf-edit.utils/dspf-edit.menu';

const OPEN_MENU_MEMBER_COMMAND = 'dspf-edit.open-menu-member';

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

/** Opens the given member, reusing its editor if it is already visible. */
async function openMenuMember(uri: vscode.Uri): Promise<void> {
    try {
        await vscode.workspace.fs.stat(uri);
    } catch {
        vscode.window.showWarningMessage(`Member ${memberName(uri.path)} not found next to this menu member.`);
        return;
    };
    const visible = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === uri.toString());
    await vscode.window.showTextDocument(uri, { preview: false, viewColumn: visible?.viewColumn });
};

/**
 * "Open menu commands (MENUQQ)" at the top of a menu image, and "Open menu image (MENU)" at the top
 * of its commands member.
 */
export class MenuMemberCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const kind = getMenuMemberKind(document.uri.path);
        const otherUri = getOtherMenuMemberUri(document.uri);
        if (!kind || !otherUri) {
            return [];
        };
        const title = kind === 'dds'
            ? `Open menu commands (${memberName(otherUri.path)})`
            : `Open menu image (${memberName(otherUri.path)})`;
        return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
            title,
            command: OPEN_MENU_MEMBER_COMMAND,
            arguments: [otherUri]
        })];
    };
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
        : `Commands of menu ${pair.menuName}. Use "Open menu image" at the top of the editor to work with the menu.`;
};

export function registerMenuMemberCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(OPEN_MENU_MEMBER_COMMAND, (uri: vscode.Uri) => openMenuMember(uri)),
        vscode.languages.registerCodeLensProvider(
            [{ language: 'dds.dspf' }, { language: 'dds.mnucmd' }],
            new MenuMemberCodeLensProvider()
        )
    );
};
