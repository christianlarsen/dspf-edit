/*
    Christian Larsen, 2026
    "RPG structure"
    webview/dspf-edit.menu-commands-panel.ts
*/

import * as vscode from 'vscode';
import * as path from 'path';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import {
    getMenuMemberPair, parseMenuCommands, menuCommandEdit, menuCommandProblem,
    menuOptionOfConstant, MENU_COMMAND_MAX_LENGTH
} from '../dspf-edit.utils/dspf-edit.menu';
import { onDidChangeMenuCommands, showCommandsMember } from '../dspf-edit.commands/dspf-edit.menu-members';
import { addSourceMember, parseSourceMemberPath } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';

/** One row of the panel, as sent to its script. */
interface MenuCommandRow {
    option: number;
    command: string;
    /** The menu image shows this option's number ("1.", "90. Sign Off"). */
    onScreen: boolean;
};

/**
 * "Menu Commands": the command each option of a menu runs, kept in its commands member (MENUQQ,
 * type MNUCMD) — SDA's F10 "Define Menu Commands" display. Lists the options that have a command
 * or are shown on the menu image (or all of 01-99), and writes each change straight into the
 * commands member, in SDA's own layout (see menuCommandEdit), saving it.
 * There is one panel, retargeted to whichever menu it's opened for.
 */
export class MenuCommandsPanel {

    private static current: MenuCommandsPanel | undefined;

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private menuImageUri: vscode.Uri;
    private commandsUri: vscode.Uri;

    private constructor(menuImageUri: vscode.Uri, commandsUri: vscode.Uri) {
        this.menuImageUri = menuImageUri;
        this.commandsUri = commandsUri;
        this.panel = vscode.window.createWebviewPanel(
            'dspfEditMenuCommands',
            this.title(),
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.webview.html = this.getHtml();

        this.disposables.push(
            this.panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)),
            // The commands member edited by hand (or saved from here), or the menu image changed
            onDidChangeMenuCommands(() => this.postRows()),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.toString() === this.menuImageUri.toString()) {
                    this.postRows();
                };
            })
        );
        this.panel.onDidDispose(() => {
            this.disposables.forEach(d => d.dispose());
            if (MenuCommandsPanel.current === this) {
                MenuCommandsPanel.current = undefined;
            };
        });
    };

    /**
     * Opens the panel for the menu the given member (image or commands) belongs to.
     * If the commands member doesn't exist yet, it offers to create it (see createCommandsMember).
     */
    static async show(menuMemberUri: vscode.Uri): Promise<void> {
        const pair = getMenuMemberPair(menuMemberUri.path);
        if (!pair) {
            vscode.window.showWarningMessage('This is not a menu member: a menu is MENU (type MNUDDS) plus MENUQQ (type MNUCMD).');
            return;
        };
        const menuImageUri = menuMemberUri.with({ path: pair.ddsPath });
        const commandsUri = menuMemberUri.with({ path: pair.commandsPath });
        const commandsMember = path.posix.basename(pair.commandsPath, path.posix.extname(pair.commandsPath));

        if (!(await MenuCommandsPanel.exists(commandsUri))) {
            if (!(await MenuCommandsPanel.createCommandsMember(commandsUri, commandsMember, pair.menuName))) {
                return;
            };
        };

        const current = MenuCommandsPanel.current;
        if (current) {
            current.menuImageUri = menuImageUri;
            current.commandsUri = commandsUri;
            current.panel.title = current.title();
            current.panel.reveal(vscode.ViewColumn.Beside, false);
            await current.postRows();
            return;
        };
        MenuCommandsPanel.current = new MenuCommandsPanel(menuImageUri, commandsUri);
    };

    /**
     * Creates a menu's missing commands member, after asking: a local file directly, a member on
     * the IBM i with ADDPFM (type MNUCMD, same source file). Either way it starts with its header.
     * @returns True if the member exists now
     */
    private static async createCommandsMember(commandsUri: vscode.Uri, commandsMember: string, menuName: string): Promise<boolean> {
        const header = `${commandsMember.toUpperCase()},1\n`;
        if (commandsUri.scheme === 'file') {
            const create = await vscode.window.showInformationMessage(
                `The menu has no commands member yet. Create ${path.posix.basename(commandsUri.path)}?`, 'Create', 'Cancel');
            if (create !== 'Create') {
                return false;
            };
            await vscode.workspace.fs.writeFile(commandsUri, Buffer.from(header, 'utf8'));
            return true;
        };

        const location = parseSourceMemberPath(commandsUri.path);
        if (!location) {
            vscode.window.showWarningMessage(`Member ${commandsMember} (type MNUCMD) not found. Create it in the same source file, then open the menu commands again.`);
            return false;
        };
        const create = await vscode.window.showInformationMessage(
            `The menu has no commands member yet. Create member ${location.member} (type MNUCMD) in ${location.library}/${location.file}?`,
            'Create', 'Cancel');
        if (create !== 'Create') {
            return false;
        };
        try {
            await addSourceMember(location, `Commands of menu ${menuName.toUpperCase()}`);
            await vscode.workspace.fs.writeFile(commandsUri, Buffer.from(header, 'utf8'));
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Could not create member ${location.member}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        };
    };

    private static async exists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        };
    };

    private title(): string {
        return `Menu Commands: ${path.posix.basename(this.menuImageUri.path, path.posix.extname(this.menuImageUri.path))}`;
    };

    private memberName(uri: vscode.Uri): string {
        return path.posix.basename(uri.path, path.posix.extname(uri.path));
    };

    /** The option numbers the menu image shows. */
    private async optionsOnScreen(): Promise<Set<number>> {
        const options = new Set<number>();
        try {
            const document = await vscode.workspace.openTextDocument(this.menuImageUri);
            for (const element of parseDocument(document.getText())) {
                if (element.kind !== 'constant') {
                    continue;
                };
                const text = String((element as { name: string }).name).replace(/^'([\s\S]*)'$/, '$1');
                const option = menuOptionOfConstant(text);
                if (option !== undefined) {
                    options.add(option);
                };
            };
        } catch {
            // No menu image to read: no option is "on screen"
        };
        return options;
    };

    /** Sends the panel's script the rows to show: every option with a command or on screen. */
    private async postRows(): Promise<void> {
        let commandsText = '';
        try {
            commandsText = (await vscode.workspace.openTextDocument(this.commandsUri)).getText();
        } catch {
            commandsText = '';
        };
        const commands = parseMenuCommands(commandsText.split(/\r?\n/)).commands;
        const onScreen = await this.optionsOnScreen();

        const rows: MenuCommandRow[] = [];
        for (let option = 1; option <= 99; option++) {
            const command = commands.find(c => c.option === option)?.command ?? '';
            rows.push({ option, command, onScreen: onScreen.has(option) });
        };
        this.panel.webview.postMessage({
            type: 'rows',
            rows,
            menuName: this.memberName(this.menuImageUri),
            commandsMember: this.memberName(this.commandsUri)
        });
    };

    private async onDidReceiveMessage(message: any): Promise<void> {
        if (message?.type === 'ready') {
            await this.postRows();
            return;
        };
        if (message?.type === 'openCommandsMember') {
            await showCommandsMember(this.commandsUri, vscode.ViewColumn.One);
            return;
        };
        if (message?.type === 'setCommand' && typeof message.option === 'number' && typeof message.command === 'string') {
            await this.setCommand(message.option, message.command);
        };
    };

    /** Writes one option's command into the commands member and saves it. */
    private async setCommand(option: number, command: string): Promise<void> {
        const problem = menuCommandProblem(command);
        if (problem) {
            this.panel.webview.postMessage({ type: 'error', option, text: problem });
            return;
        };
        if (option < 1 || option > 99) {
            return;
        };

        const document = await vscode.workspace.openTextDocument(this.commandsUri);
        const lines = document.getText().split(/\r?\n/);
        const edit = menuCommandEdit(lines, this.memberName(this.commandsUri), option, command);
        const newLines = [...lines];
        newLines.splice(edit.startLine, edit.deleteCount, ...edit.lines);

        const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(this.commandsUri, fullRange, newLines.join(eol));
        if (!(await vscode.workspace.applyEdit(workspaceEdit))) {
            this.panel.webview.postMessage({ type: 'error', option, text: `Could not change ${this.memberName(this.commandsUri)}.` });
            return;
        };
        if (!(await document.save())) {
            this.panel.webview.postMessage({ type: 'error', option, text: `${this.memberName(this.commandsUri)} was changed but could not be saved.` });
        };
    };

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    body {
        font-family: var(--vscode-font-family, sans-serif);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 12px 16px;
    }
    h2 {
        font-size: 1.1em;
        margin: 0 0 4px 0;
    }
    .hint {
        color: var(--vscode-descriptionForeground);
        margin: 0 0 10px 0;
    }
    .bar {
        display: flex;
        gap: 16px;
        align-items: center;
        margin-bottom: 10px;
    }
    a {
        color: var(--vscode-textLink-foreground);
        cursor: pointer;
    }
    table {
        border-collapse: collapse;
        width: 100%;
    }
    th {
        text-align: left;
        font-weight: normal;
        color: var(--vscode-descriptionForeground);
        padding: 2px 6px;
    }
    td {
        padding: 3px 6px;
        vertical-align: top;
    }
    td.option {
        font-family: var(--vscode-editor-font-family, monospace);
        width: 3ch;
        padding-top: 6px;
    }
    textarea {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: var(--vscode-editor-font-size, 13px);
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, #444);
        padding: 3px 4px;
    }
    textarea.saving {
        border-color: var(--vscode-focusBorder);
    }
    td.status {
        width: 16ch;
        padding-top: 6px;
        color: var(--vscode-editorWarning-foreground, #cca700);
        white-space: nowrap;
    }
    .error {
        color: var(--vscode-errorForeground);
    }
</style>
</head>
<body>
<h2 id="title">Menu commands</h2>
<p class="hint">The command each option runs. Leave the box (or press Enter) to save it; an empty box removes the option's command. A command starting with ? is prompted before it runs. Up to ${MENU_COMMAND_MAX_LENGTH} characters.</p>
<div class="bar">
    <label><input type="checkbox" id="showAll"> Show all options (01-99)</label>
    <a id="openMember">Open the commands member</a>
</div>
<table>
    <thead><tr><th>Opt</th><th>Command</th><th></th></tr></thead>
    <tbody id="rows"></tbody>
</table>
<script>
    const vscode = acquireVsCodeApi();
    const rowsBody = document.getElementById('rows');
    const showAll = document.getElementById('showAll');
    const title = document.getElementById('title');
    let rows = [];

    function statusOf(row) {
        if (row.onScreen && !row.command) {
            return { text: '⚠ No command', tip: 'The menu shows this option, but it has no command' };
        }
        if (!row.onScreen && row.command) {
            return { text: '⚠ Not on the menu', tip: 'This option has a command, but the menu image does not show its number' };
        }
        return { text: '', tip: '' };
    }

    function render() {
        // Rebuilt whenever the member changes (e.g. right after saving another option): the box
        // being typed in keeps what was typed and where the cursor was
        const focused = document.activeElement && document.activeElement.tagName === 'TEXTAREA' ? document.activeElement : undefined;
        const focusedOption = focused ? focused.dataset.option : undefined;
        const focusedState = focused ? { value: focused.value, start: focused.selectionStart, end: focused.selectionEnd } : undefined;
        rowsBody.textContent = '';
        for (const row of rows) {
            if (!showAll.checked && !row.command && !row.onScreen) {
                continue;
            }
            const tr = document.createElement('tr');
            const optionCell = document.createElement('td');
            optionCell.className = 'option';
            optionCell.textContent = String(row.option).padStart(2, '0');

            const commandCell = document.createElement('td');
            const box = document.createElement('textarea');
            box.rows = row.command.length > 75 ? 2 : 1;
            box.maxLength = ${MENU_COMMAND_MAX_LENGTH};
            box.spellcheck = false;
            box.value = row.command;
            box.dataset.option = String(row.option);
            box.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    box.blur();
                } else if (ev.key === 'Escape') {
                    box.value = row.command;
                    box.blur();
                }
            });
            box.addEventListener('blur', () => {
                if (box.value.trim() !== row.command.trim()) {
                    box.classList.add('saving');
                    vscode.postMessage({ type: 'setCommand', option: row.option, command: box.value });
                }
            });
            commandCell.appendChild(box);
            const errorLine = document.createElement('div');
            errorLine.className = 'error';
            errorLine.id = 'error-' + row.option;
            commandCell.appendChild(errorLine);

            const statusCell = document.createElement('td');
            statusCell.className = 'status';
            const status = statusOf(row);
            statusCell.textContent = status.text;
            statusCell.title = status.tip;

            tr.appendChild(optionCell);
            tr.appendChild(commandCell);
            tr.appendChild(statusCell);
            rowsBody.appendChild(tr);

            if (focusedOption === String(row.option) && focusedState) {
                box.value = focusedState.value;
                box.focus();
                box.setSelectionRange(focusedState.start, focusedState.end);
            }
        }
    }

    showAll.addEventListener('change', render);
    document.getElementById('openMember').addEventListener('click', () => vscode.postMessage({ type: 'openCommandsMember' }));

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'rows') {
            rows = message.rows;
            title.textContent = 'Menu ' + message.menuName + ': commands in ' + message.commandsMember;
            render();
        } else if (message.type === 'error') {
            const line = document.getElementById('error-' + message.option);
            if (line) {
                line.textContent = message.text;
            }
        }
    });

    vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    };
}
