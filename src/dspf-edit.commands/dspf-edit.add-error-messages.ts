/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-error-messages.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, findElementInsertionPoint, replaceKeywordTextInLines, formatIndicatorCondition } from '../dspf-edit.utils/dspf-edit.helper';
import { KeywordValue, removeWholeKeyword, changeKeywordValueIndicators, reparseElement, nudgeCursor } from './dspf-edit.conditioned-keywords';
import { addConditionedKeywordLine } from './dspf-edit.add-indicators';

// INTERFACES AND TYPES

/** A message with its own text (ERRMSG). */
interface TextMessage {
    kind: 'text';
    text: string;
    responseIndicator?: string;
};

/** A message from a message file (ERRMSGID). */
interface FileMessage {
    kind: 'file';
    messageId: string;
    /** The message file, qualified or not: 'QCPFMSG', 'MYLIB/MYMSGF'. */
    messageFile: string;
    responseIndicator?: string;
    /** The field the message data comes from, without its '&'. */
    messageData?: string;
};

type ErrorMessageContent = TextMessage | FileMessage;

/** One error message a field has, and where its keyword sits in the source. */
interface ErrorMessage {
    content: ErrorMessageContent;
    value: KeywordValue;
};

/** One row of the window: a message the field has (`messageIndex`), or one of the add rows. */
interface ErrorMessageItem extends vscode.QuickPickItem {
    messageIndex: number;
    add?: ErrorMessageContent['kind'];
};

type ErrorMessageWindowOutcome =
    | { action: 'edit' | 'indicators' | 'remove'; messageIndex: number }
    | { action: 'add'; kind: ErrorMessageContent['kind'] }
    | { action: 'removeAll' };

// COMMAND REGISTRATION

/**
 * Registers the add error message command for DDS fields.
 * Allows users to interactively manage error messages for input fields.
 * @param context - The VS Code extension context
 */
export function addErrorMessage(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-error-message", async (node: DdsNode) => {
            await handleAddErrorMessageCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add error message command for a DDS field.
 * Validates field type and manages existing error messages.
 * @param node - The DDS node containing the field
 */
async function handleAddErrorMessageCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type - error messages can only be added to input-capable fields
        if (node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Error messages can only be added to fields.');
            return;
        };

        // Validate field usage - only input (I) and both (B) fields can have error messages
        const field = node.ddsElement;
        if (!isInputCapableField(field)) {
            vscode.window.showWarningMessage(
                `Error messages can only be added to input-capable fields (usage 'I' or 'B'). ` +
                `Field '${field.name}' has usage '${field.usage}'.`
            );
            return;
        };

        await manageErrorMessages(editor, field);

    } catch (error) {
        console.error('Error managing error messages:', error);
        vscode.window.showErrorMessage('An error occurred while managing error messages.');
    };
};

// VALIDATION FUNCTIONS

/**
 * Checks if a field is input-capable and can have error messages.
 * @param field - The DDS field to check
 * @returns true if field can have error messages
 */
function isInputCapableField(field: any): boolean {
    const usage = field.usage?.toUpperCase();
    // Only Input (I) and Both (B) fields can have error messages
    return usage === 'I' || usage === 'B';
};

// THE WINDOW

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Change message' };
const INDICATORS_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('symbol-boolean'), tooltip: 'Change indicators' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Manages a field's error messages from one window, as the Attributes and Colors windows do: one
 * row per message, its own text (ERRMSG) or one from a message file (ERRMSGID), with its indicators.
 * Picking a row or its pencil changes the message, the indicators button changes its indicators
 * with the same menu a field's own use, the trash removes it, and the title bar's trash removes
 * them all; the add rows add a new one. Each is applied at once and the window comes back.
 * A field can have both kinds, and each more than once: the indicators choose which one shows.
 * @param editor - The active text editor
 * @param field - The field
 */
async function manageErrorMessages(editor: vscode.TextEditor, field: any): Promise<void> {
    let focusKeyword: string | undefined;

    while (true) {
        const messages = readErrorMessages(field);
        const items = buildErrorMessageItems(messages);
        const outcome = await showErrorMessageWindow(items, messages.length > 0, field.name,
            items.find(item => item.messageIndex >= 0 && messages[item.messageIndex].value.keywordText === focusKeyword));
        if (!outcome) return;

        const message = 'messageIndex' in outcome ? messages[outcome.messageIndex] : undefined;
        focusKeyword = message?.value.keywordText;

        let done: boolean;
        switch (outcome.action) {
            case 'add':
                done = await addOneErrorMessage(editor, field, outcome.kind);
                break;
            case 'edit':
                done = await editErrorMessage(editor, message!);
                focusKeyword = undefined;
                break;
            case 'indicators':
                await changeKeywordValueIndicators(editor, field, message!.value);
                done = true;
                break;
            case 'remove':
                done = await removeWholeKeyword(editor, field, message!.value);
                if (done) vscode.window.showInformationMessage(`Removed error message ${describeMessage(message!.content)} from ${field.name}.`);
                break;
            case 'removeAll':
                done = await removeAllErrorMessages(editor, field, messages);
                if (done) vscode.window.showInformationMessage(`Removed all error messages from ${field.name}.`);
                break;
        };

        if (done) await nudgeCursor();
        field = reparseElement(editor, field);
        if (!field) return;
    };
};

/** The window's rows: every message the field has, in source order, then the two add rows. */
function buildErrorMessageItems(messages: ErrorMessage[]): ErrorMessageItem[] {
    const items: ErrorMessageItem[] = messages.map((message, index) => ({
        messageIndex: index,
        label: describeMessage(message.content),
        description: [
            message.value.conditionText ? `When ${message.value.conditionText}` : 'Always (no indicators)',
            message.content.responseIndicator ? `response ${message.content.responseIndicator}` : '',
            message.content.kind === 'file' && message.content.messageData ? `data from ${message.content.messageData}` : ''
        ].filter(Boolean).join(' · '),
        buttons: [EDIT_BUTTON, INDICATORS_BUTTON, REMOVE_BUTTON]
    }));

    if (items.length > 0) {
        items.push({ messageIndex: -1, label: '', kind: vscode.QuickPickItemKind.Separator });
    };
    items.push(
        { messageIndex: -1, add: 'text', label: '$(add) Add error message...' },
        { messageIndex: -1, add: 'file', label: '$(add) Add error message from a message file...' }
    );
    return items;
};

/** A message as its row and messages name it: its text quoted, or its ID and message file. */
function describeMessage(content: ErrorMessageContent): string {
    return content.kind === 'text' ? `"${content.text}"` : `${content.messageId} from ${content.messageFile}`;
};

/**
 * Shows the window and resolves to what the user did, or undefined if dismissed. Needs the raw
 * `createQuickPick` API rather than the simpler `showQuickPick` helper, since only it exposes
 * per-item and title-bar buttons.
 */
function showErrorMessageWindow(
    items: ErrorMessageItem[],
    canRemoveAll: boolean,
    fieldName: string,
    focus: ErrorMessageItem | undefined
): Promise<ErrorMessageWindowOutcome | undefined> {
    const removeAllButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove all' };

    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<ErrorMessageItem>();
        quickPick.items = items;
        if (focus) quickPick.activeItems = [focus];
        quickPick.title = `Error messages for ${fieldName}`;
        quickPick.placeholder = 'Select a message to change it — its buttons set indicators or remove it';
        quickPick.buttons = canRemoveAll ? [removeAllButton] : [];
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: ErrorMessageWindowOutcome | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerButton(() => finish({ action: 'removeAll' }));
        quickPick.onDidTriggerItemButton(event => {
            const action = event.button === REMOVE_BUTTON ? 'remove' : event.button === INDICATORS_BUTTON ? 'indicators' : 'edit';
            finish({ action, messageIndex: event.item.messageIndex });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            if (!picked) return;
            finish(picked.add ? { action: 'add', kind: picked.add } : { action: 'edit', messageIndex: picked.messageIndex });
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

// READING

/**
 * The field's error messages, ERRMSG and ERRMSGID alike, from its already-parsed attributes —
 * whether on its own definition line or on lines below it, continued or not.
 * @param field - The DDS field element
 */
function readErrorMessages(field: any): ErrorMessage[] {
    const attributes = (field.attributes || []) as DdsAttribute[];
    return attributes.flatMap(attr => {
        const content = parseErrorMessage(attr.value);
        return content ? [{
            content,
            value: {
                code: attr.value,
                keywordText: attr.value,
                lineIndex: attr.lineIndex,
                lastLineIndex: attr.lastLineIndex ?? attr.lineIndex,
                conditionText: formatIndicatorCondition(attr.indicators),
                wholeKeyword: true
            }
        }] : [];
    });
};

/**
 * Reads an ERRMSG('message-text' [response-indicator]) or an
 * ERRMSGID(msgid [library-name/]msg-file [response-indicator] [&msg-data]) keyword.
 * @param keywordText - The keyword, exactly as parsed
 * @returns The message, or undefined when the keyword is neither
 */
function parseErrorMessage(keywordText: string): ErrorMessageContent | undefined {
    // A quote inside the text is written twice, as in every DDS literal.
    const errmsg = keywordText.match(/^ERRMSG\(\s*'((?:[^']|'')*)'\s*(\d{1,2})?\s*\)$/i);
    if (errmsg) {
        return { kind: 'text', text: errmsg[1].replace(/''/g, "'"), responseIndicator: errmsg[2]?.padStart(2, '0') };
    };

    const errmsgid = keywordText.match(/^ERRMSGID\(\s*(.*?)\s*\)$/i);
    if (errmsgid) {
        const [messageId, messageFile, ...rest] = errmsgid[1].split(/\s+/);
        if (!messageId || !messageFile) return undefined;
        return {
            kind: 'file',
            messageId,
            messageFile,
            responseIndicator: rest.find(part => /^\d{1,2}$/.test(part))?.padStart(2, '0'),
            messageData: rest.find(part => part.startsWith('&'))?.substring(1)
        };
    };

    return undefined;
};

/** The keyword a message is written as. */
function errorMessageKeyword(content: ErrorMessageContent): string {
    if (content.kind === 'text') {
        const response = content.responseIndicator ? ` ${content.responseIndicator}` : '';
        return `ERRMSG('${content.text.replace(/'/g, "''")}'${response})`;
    };
    const parts = [content.messageId, content.messageFile, content.responseIndicator, content.messageData && `&${content.messageData}`];
    return `ERRMSGID(${parts.filter(Boolean).join(' ')})`;
};

// SOURCE EDITS

/**
 * Adds a new message on line(s) of its own after the field's last line, asking for it and then
 * for the indicators that show it — DDS shows an error message when its indicators are on, so one
 * without them would show on every output to the record.
 * @returns True when the message was added
 */
async function addOneErrorMessage(editor: vscode.TextEditor, field: any, kind: ErrorMessageContent['kind']): Promise<boolean> {
    const content = kind === 'text' ? await collectTextMessage() : await collectFileMessage();
    if (!content) return false;

    const added = await addConditionedKeywordLine(editor, findElementInsertionPoint(editor, field), errorMessageKeyword(content));
    if (added) {
        vscode.window.showInformationMessage(`Added error message ${describeMessage(content)} to ${field.name}.`);
    } else {
        vscode.window.showInformationMessage('No indicators entered: the error message was not added.');
    };
    return added;
};

/**
 * Changes a message where it is, keeping its indicators and any keyword beside it.
 * @returns True when it was changed
 */
async function editErrorMessage(editor: vscode.TextEditor, message: ErrorMessage): Promise<boolean> {
    const content = message.content.kind === 'text' ? await collectTextMessage(message.content) : await collectFileMessage(message.content);
    if (!content) return false;

    const newKeywordText = errorMessageKeyword(content);
    if (newKeywordText === message.value.keywordText) return false;

    const { lineIndex, lastLineIndex, keywordText } = message.value;
    return replaceKeywordTextInLines(editor, lineIndex, lastLineIndex, keywordText, newKeywordText);
};

/**
 * Removes every message, from the last line up so that each one still to remove is where it was
 * read — two on one line share it, so each removal re-reads the field first.
 */
async function removeAllErrorMessages(editor: vscode.TextEditor, field: any, messages: ErrorMessage[]): Promise<boolean> {
    for (const target of [...messages].sort((a, b) => b.value.lineIndex - a.value.lineIndex)) {
        const current = readErrorMessages(field).find(message =>
            message.value.keywordText === target.value.keywordText && message.value.lineIndex === target.value.lineIndex);
        if (!current) continue;
        if (!(await removeWholeKeyword(editor, field, current.value))) return false;
        field = reparseElement(editor, field);
        if (!field) return false;
    };
    return true;
};

// USER INTERACTION FUNCTIONS

/**
 * Asks for a message with its own text, prefilled with `current` when changing one.
 * @returns The message, or undefined if cancelled
 */
async function collectTextMessage(current?: TextMessage): Promise<TextMessage | undefined> {
    const text = await vscode.window.showInputBox({
        title: 'Error Message Text',
        prompt: 'Enter the error message text to display',
        value: current?.text,
        placeHolder: 'No stock available',
        ignoreFocusOut: true,
        validateInput: value => {
            if (!value.trim()) return 'Error message text cannot be empty';
            // Practical length limit (can be longer due to continuation lines)
            if (value.trim().length > 200) return 'Error message text should be 200 characters or fewer';
            return null;
        }
    });
    if (text === undefined) return undefined;

    const responseIndicator = await collectResponseIndicator(current?.responseIndicator);
    if (responseIndicator === undefined) return undefined;

    return { kind: 'text', text: text.trim(), responseIndicator: responseIndicator || undefined };
};

/**
 * Asks for a message from a message file, prefilled with `current` when changing one.
 * @returns The message, or undefined if cancelled
 */
async function collectFileMessage(current?: FileMessage): Promise<FileMessage | undefined> {
    const messageId = await vscode.window.showInputBox({
        title: 'Message ID',
        prompt: 'Enter the message ID: three characters and four hexadecimal digits',
        value: current?.messageId,
        placeHolder: 'USR0001',
        ignoreFocusOut: true,
        validateInput: value => /^[A-Z][A-Z0-9]{2}[0-9A-F]{4}$/i.test(value.trim()) ? null : 'A message ID is three characters and four hexadecimal digits, e.g. CPF1234'
    });
    if (messageId === undefined) return undefined;

    const objectName = '[A-Z$#@][A-Z0-9$#@_.]{0,9}';
    const messageFile = await vscode.window.showInputBox({
        title: 'Message File',
        prompt: 'Enter the message file, with its library or without it',
        value: current?.messageFile,
        placeHolder: 'MYLIB/MYMSGF',
        ignoreFocusOut: true,
        validateInput: value => new RegExp(`^((\\*LIBL|\\*CURLIB|${objectName})/)?${objectName}$`, 'i').test(value.trim())
            ? null : 'Enter a message file name, optionally qualified: MYMSGF or MYLIB/MYMSGF'
    });
    if (messageFile === undefined) return undefined;

    const responseIndicator = await collectResponseIndicator(current?.responseIndicator);
    if (responseIndicator === undefined) return undefined;

    const messageData = await vscode.window.showInputBox({
        title: 'Message Data',
        prompt: 'Enter the field the message data comes from, or leave it blank for none',
        value: current?.messageData,
        placeHolder: 'MSGDTA',
        ignoreFocusOut: true,
        validateInput: value => !value.trim() || /^&?[A-Z$#@][A-Z0-9$#@_]{0,9}$/i.test(value.trim()) ? null : 'Enter a field name'
    });
    if (messageData === undefined) return undefined;

    return {
        kind: 'file',
        messageId: messageId.trim().toUpperCase(),
        messageFile: messageFile.trim().toUpperCase(),
        responseIndicator: responseIndicator || undefined,
        messageData: messageData.trim().replace(/^&/, '').toUpperCase() || undefined
    };
};

/**
 * Asks for a message's response indicator — DDS turns it off once the message is shown, so it is
 * usually the same indicator that shows the message.
 * @param current - The message's current one, when changing a message
 * @returns The indicator, '' for none, or undefined if cancelled
 */
async function collectResponseIndicator(current?: string): Promise<string | undefined> {
    const responseIndicator = await vscode.window.showInputBox({
        title: 'Response Indicator',
        prompt: 'Enter the response indicator (01-99), usually the same one that shows the message — or leave it blank for none',
        value: current,
        placeHolder: '50',
        ignoreFocusOut: true,
        validateInput: value => !value.trim() || /^(0[1-9]|[1-9]\d)$/.test(value.trim().padStart(2, '0')) ? null : 'Enter an indicator from 01 to 99, or leave it blank'
    });
    return responseIndicator?.trim() ? responseIndicator.trim().padStart(2, '0') : responseIndicator?.trim();
};
