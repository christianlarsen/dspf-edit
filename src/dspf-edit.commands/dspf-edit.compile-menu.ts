/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.commands/dspf-edit.compile-menu.ts
*/

// "Compile Menu": creates (or re-creates) a menu on the IBM i from its two members, in the steps
// CRTMNU TYPE(*DSPF) needs (see buildMenuCompileCommands): CRTDSPF from the menu image, a message
// file with one message per option's command, and CRTMNU with the command line and function keys
// chosen in the preview. Run through the Code for i connection; each step is written to an output
// channel, and the first one that fails stops it.

import * as vscode from 'vscode';
import { ExtensionState } from '../dspf-edit.states/state';
import {
    getMenuMemberKind, getMenuMemberPair, parseMenuCommands, buildMenuCompileCommands, menuCommandsTooLong,
    MENU_MESSAGE_MAX_LENGTH, MenuCommandLine, MenuCreateOptions
} from '../dspf-edit.utils/dspf-edit.menu';
import { getMenuCreateOptions, setMenuCreateOptions } from './dspf-edit.menu-members';
import { getIBMiConnection, parseSourceMemberPath, runClCommand } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';

let output: vscode.OutputChannel | undefined;

function log(line: string): void {
    output ??= vscode.window.createOutputChannel('DSPF-edit: Compile Menu');
    output.appendLine(line);
};

/** The open document for a URI, if it's open. */
function openDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
};

/** Saves the document for a URI if it's open with unsaved changes. False if it couldn't be saved. */
async function saveIfDirty(uri: vscode.Uri): Promise<boolean> {
    const document = openDocument(uri);
    return !document?.isDirty || await document.save();
};

const COMMAND_LINE_CHOICES: { value: MenuCommandLine; label: string; detail: string }[] = [
    { value: '*LONG', label: 'Long', detail: 'A 153-character command line, over two lines' },
    { value: '*SHORT', label: 'Short', detail: 'A 73-character command line, on one line' },
    { value: '*NONE', label: 'None', detail: 'No command line, just a 4-character option field' }
];

/**
 * Shows the options the menu will be created with (the command line and function keys chosen in
 * the preview's toolbar) and lets them be changed before compiling. A change is remembered for
 * the menu, so the preview shows it too. Undefined if cancelled.
 */
async function confirmCompileOptions(menuImageUri: vscode.Uri, object: string): Promise<MenuCreateOptions | undefined> {
    type Item = vscode.QuickPickItem & { action: 'compile' | 'commandLine' | 'functionKeys' };
    for (;;) {
        const options = getMenuCreateOptions(menuImageUri);
        const commandLine = COMMAND_LINE_CHOICES.find(choice => choice.value === options.commandLine) ?? COMMAND_LINE_CHOICES[0];
        const items: Item[] = [
            { label: '$(play) Compile', description: `CMDLIN(${options.commandLine}) DSPKEY(${options.functionKeys ? '*YES' : '*NO'})`, action: 'compile' },
            { label: `$(terminal) Command line: ${commandLine.label}`, detail: commandLine.detail, action: 'commandLine' },
            { label: `$(keyboard) Function keys: ${options.functionKeys ? 'Yes' : 'No'}`, detail: options.functionKeys ? 'The function key legend at the bottom of the menu' : 'No function key legend', action: 'functionKeys' }
        ];
        const picked = await vscode.window.showQuickPick(items, {
            title: `Compile Menu ${object}`,
            placeHolder: 'Compile, or change how the menu is created first'
        });
        if (!picked) {
            return undefined;
        };
        if (picked.action === 'compile') {
            return options;
        };

        if (picked.action === 'commandLine') {
            const choice = await vscode.window.showQuickPick(
                COMMAND_LINE_CHOICES.map(c => ({ ...c, description: c.value === options.commandLine ? 'current' : undefined })),
                { title: `Compile Menu ${object}: command line` });
            if (choice) {
                await setMenuCreateOptions(menuImageUri, { ...options, commandLine: choice.value });
            };
        } else {
            await setMenuCreateOptions(menuImageUri, { ...options, functionKeys: !options.functionKeys });
        };
    };
};

/** Runs one step, writing it and its messages to the output. */
async function runStep(command: string): Promise<{ ok: boolean; messages: string }> {
    log(`> ${command}`);
    const result = await runClCommand(command);
    if (result.messages) {
        log(result.messages.split('\n').map(line => `  ${line}`).join('\n'));
    };
    return result;
};

/**
 * Compiles the menu the given member (image or commands) belongs to. Only for members on the
 * IBM i (Code for i), since that's where the objects are created from.
 */
export async function compileMenu(menuMemberUri: vscode.Uri): Promise<void> {
    const pair = getMenuMemberPair(menuMemberUri.path);
    if (!pair) {
        vscode.window.showWarningMessage('This is not a menu member: a menu is MENU (type MNUDDS) plus MENUQQ (type MNUCMD).');
        return;
    };
    const location = parseSourceMemberPath(pair.ddsPath);
    if (menuMemberUri.scheme !== 'member' || !location) {
        vscode.window.showWarningMessage('A menu is compiled from its members on the IBM i: open them from Code for i.');
        return;
    };
    if (!getIBMiConnection()) {
        vscode.window.showWarningMessage('Connect to the IBM i with Code for i to compile the menu.');
        return;
    };

    const menuImageUri = menuMemberUri.with({ path: pair.ddsPath });
    const commandsUri = menuMemberUri.with({ path: pair.commandsPath });
    const menuName = location.member;

    // The objects are created from the members as they are on the IBM i
    if (!(await saveIfDirty(menuImageUri)) || !(await saveIfDirty(commandsUri))) {
        vscode.window.showWarningMessage(`The members of menu ${menuName} couldn't be saved, so it wasn't compiled.`);
        return;
    };

    let commands: { option: number; command: string }[] = [];
    try {
        const commandsDocument = await vscode.workspace.openTextDocument(commandsUri);
        commands = parseMenuCommands(commandsDocument.getText().split(/\r?\n/)).commands;
    } catch {
        // No commands member: the menu is created without commands
    };
    const tooLong = menuCommandsTooLong(commands);
    if (tooLong.length > 0) {
        vscode.window.showWarningMessage(
            `The command of option ${tooLong.join(', ')} is longer than ${MENU_MESSAGE_MAX_LENGTH} characters, ` +
            'the most a message of the menu can hold. Shorten it in Menu Commands, then compile again.');
        return;
    };

    const options = getMenuCreateOptions(menuImageUri);
    const library = await vscode.window.showInputBox({
        title: `Compile Menu ${menuName}`,
        prompt: 'Library to create the menu, its display file and its message file in',
        value: options.library ?? location.library,
        validateInput: text => /^[A-Za-z0-9_$#@]{1,10}$/.test(text.trim()) ? undefined : 'A library name: up to 10 letters, digits, _ $ # @.'
    });
    if (library === undefined) {
        return;
    };
    const objectLibrary = library.trim().toUpperCase();
    const object = `${objectLibrary}/${menuName}`;
    await setMenuCreateOptions(menuImageUri, { ...options, library: objectLibrary });

    const compileOptions = await confirmCompileOptions(menuImageUri, object);
    if (!compileOptions) {
        return;
    };

    const steps = buildMenuCompileCommands({
        sourceLibrary: location.library,
        sourceFile: location.file,
        menuName,
        library: objectLibrary,
        commands,
        options: compileOptions
    });
    log('');
    log(`Compile Menu ${object} (${new Date().toLocaleString()})`);

    const ok = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Compiling menu ${object}`
    }, async progress => {
        const fail = (step: string) => {
            vscode.window.showErrorMessage(`Compile Menu ${object}: ${step} failed.`, 'Show Log').then(choice => {
                if (choice) {
                    output?.show();
                };
            });
            return false;
        };
        try {
            progress.report({ message: 'display file (CRTDSPF)' });
            if (!(await runStep(steps.crtdspf)).ok) {
                return fail('creating the display file (CRTDSPF; see its listing in your spooled files)');
            };

            progress.report({ message: 'message file' });
            // A message file left from an earlier compile is replaced; none there is fine
            await runStep(steps.dltmsgf);
            if (!(await runStep(steps.crtmsgf)).ok) {
                return fail('creating the message file (CRTMSGF)');
            };
            for (const message of steps.addmsgd) {
                progress.report({ message: `option ${message.option}` });
                if (!(await runStep(message.command)).ok) {
                    return fail(`adding the command of option ${message.option} (ADDMSGD)`);
                };
            };

            progress.report({ message: 'menu (CRTMNU)' });
            if (!(await runStep(steps.crtmnu)).ok) {
                return fail('creating the menu (CRTMNU)');
            };
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Compile Menu ${object}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        };
    });

    if (ok) {
        log(`Menu ${object} created. Run it with GO MENU(${object}).`);
        vscode.window.showInformationMessage(`Menu ${object} created. Run it with GO MENU(${object}).`, 'Show Log').then(choice => {
            if (choice) {
                output?.show();
            };
        });
    };
};

export function registerCompileMenu(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dspf-edit.compile-menu', async (target?: unknown) => {
            const uri = target instanceof vscode.Uri
                ? target
                : [ExtensionState.lastDdsDocument?.uri, vscode.window.activeTextEditor?.document.uri]
                    .find(candidate => candidate !== undefined && getMenuMemberKind(candidate.path) !== undefined);
            if (!uri) {
                vscode.window.showWarningMessage('Open a menu (MNUDDS or MNUCMD member) to compile it.');
                return;
            };
            await compileMenu(uri);
        }),
        { dispose: () => output?.dispose() }
    );
};
