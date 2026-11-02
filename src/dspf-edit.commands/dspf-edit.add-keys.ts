/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-keys.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { attributesFileLevel, fieldsPerRecords, DdsAttribute } from '../dspf-edit.model/dspf-edit.model';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import {
    checkForEditorAndDocument,
    handleDspsizWorkflow,
    findElementInsertionPoint,
    formatIndicatorCondition,
    insertKeywordLines,
    replaceKeywordTextInLines
} from '../dspf-edit.utils/dspf-edit.helper';
import { KeywordValue, removeWholeKeyword, changeKeywordValueIndicators, nudgeCursor } from './dspf-edit.conditioned-keywords';
import { addConditionedKeywordLine } from './dspf-edit.add-indicators';

// INTERFACES AND TYPES

type KeyType = 'CA' | 'CF';

/** A command key keyword: CAnn[(response-indicator ['text'])] or CFnn[(...)]. */
interface KeyCommandContent {
    type: KeyType;
    /** '01' to '24'. */
    keyNumber: string;
    responseIndicator?: string;
    text?: string;
};

/** One command key a record (or the file) has, and where its keyword sits in the source. */
interface KeyCommand {
    content: KeyCommandContent;
    value: KeywordValue;
};

/** A command key anywhere in the display file, for checking a key isn't CA in one place and CF in another. */
interface KeyUse extends KeyCommandContent {
    /** 'file level' or 'record NAME'. */
    where: string;
    lineIndex: number;
};

/** What the window manages: one record's command keys, or the file-level ones. */
interface KeyScope {
    /** The record, or for the file a stand-in whose lineIndex (-1) no source line has, so nothing
     * is taken for its definition line and new keys go in before the first record. */
    element: any;
    /** 'file level' or 'record NAME', as KeyUse.where. */
    where: string;
};

/** One row of the window: a key the scope has (`keyIndex` into its keys), or the add row (-1). */
interface KeyCommandItem extends vscode.QuickPickItem {
    keyIndex: number;
};

type KeyWindowOutcome =
    | { action: 'edit' | 'indicators' | 'remove'; keyIndex: number }
    | { action: 'add' }
    | { action: 'removeAll' };

// COMMAND REGISTRATION

/**
 * Registers the add key command for DDS records.
 * Allows users to interactively manage key commands for records.
 * @param context - The VS Code extension context
 */
export function addKeyCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-key", async (node: DdsNode) => {
            await handleAddKeyCommandCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add key command for a DDS record or the file.
 * @param node - The DDS node containing the record, or the file
 */
async function handleAddKeyCommandCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type - key commands can only be added to records
        if (node.ddsElement.kind !== 'record' && node.ddsElement.kind !== 'file') {
            vscode.window.showWarningMessage('Key commands can only be added to records or at file level.');
            return;
        };

        let scope: KeyScope;
        if (node.ddsElement.kind === 'file') {
            // Handle DSPSIZ specification if needed (only for file-level operations)
            const dspsizConfig = await handleDspsizWorkflow(editor, 'key command addition');
            if (dspsizConfig === undefined) {
                return;
            };
            scope = { element: { kind: 'file', lineIndex: -1 }, where: 'file level' };
        } else {
            scope = { element: node.ddsElement, where: `record ${node.ddsElement.name}` };
        };

        await manageKeyCommands(editor, scope);

    } catch (error) {
        console.error('Error managing key commands:', error);
        vscode.window.showErrorMessage('An error occurred while managing key commands.');
    };
};

// THE WINDOW

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Change key' };
const INDICATORS_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('symbol-boolean'), tooltip: 'Change indicators' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Manages a record's (or the file's) command keys from one window, as the Error Messages window
 * does: one row per key it has, then a row to add one. Picking a row or its pencil changes the key,
 * the indicators button changes its indicators with the same menu a field's own use, the trash
 * removes it, and the title bar's trash removes them all. Each is applied at once and the window
 * comes back.
 * A key can't be CA in one place of the display file and CF in another — CRTDSPF rejects it, and
 * STRSDA doesn't check it. So a key is offered with the type it already has elsewhere, the other
 * type is refused, and keys that already clash are flagged.
 * @param editor - The active text editor
 * @param scope - The record, or the file
 */
async function manageKeyCommands(editor: vscode.TextEditor, scope: KeyScope): Promise<void> {
    let focusKeyword: string | undefined;

    while (true) {
        const keys = readScopeKeys(scope);
        const uses = readKeyUses();
        const items = buildKeyItems(keys, uses, scope);
        const title = `Command keys for ${scope.where === 'file level' ? 'the file' : scope.where}`;
        const outcome = await showKeyWindow(items, keys.length > 0, title,
            items.find(item => item.keyIndex >= 0 && keys[item.keyIndex].value.keywordText === focusKeyword));
        if (!outcome) return;

        const key = 'keyIndex' in outcome ? keys[outcome.keyIndex] : undefined;
        focusKeyword = key?.value.keywordText;

        let done: boolean;
        switch (outcome.action) {
            case 'add':
                done = await addKey(editor, scope, keys, uses);
                break;
            case 'edit':
                done = await editKey(editor, key!, uses, scope);
                focusKeyword = undefined;
                break;
            case 'indicators':
                await changeKeywordValueIndicators(editor, scope.element, key!.value);
                done = true;
                break;
            case 'remove':
                done = await removeWholeKeyword(editor, scope.element, key!.value);
                if (done) vscode.window.showInformationMessage(`Removed ${key!.value.keywordText} from the ${scope.where}.`);
                break;
            case 'removeAll':
                done = await removeAllKeys(editor, scope);
                if (done) vscode.window.showInformationMessage(`Removed all command keys from the ${scope.where}.`);
                break;
        };

        if (done) await nudgeCursor();
        if (!refreshScope(editor, scope)) return;
    };
};

/**
 * The window's rows: the keys the scope has, in key order, with their indicators and response
 * indicator — and an error when the key is the other type somewhere else, or is also at the other
 * level — then the add row.
 */
function buildKeyItems(keys: KeyCommand[], uses: KeyUse[], scope: KeyScope): KeyCommandItem[] {
    const items: KeyCommandItem[] = keys
        .map((key, index) => ({ key, index }))
        .sort((a, b) => a.key.content.keyNumber.localeCompare(b.key.content.keyNumber))
        .map(({ key, index }) => {
            const { type, keyNumber, responseIndicator, text } = key.content;
            const levelClashes = otherLevelUses(keyNumber, uses, scope);
            const clashes = [...levelClashes, ...uses.filter(use => use.keyNumber === keyNumber && use.type !== type && !levelClashes.includes(use))];
            return {
                keyIndex: index,
                label: `${keyLabel(keyNumber)} — ${type}${keyNumber}${text ? ` '${text}'` : ''}`,
                description: [
                    key.value.conditionText ? `When ${key.value.conditionText}` : 'Always (no indicators)',
                    responseIndicator ? `response ${responseIndicator}` : 'no response indicator'
                ].join(' · '),
                detail: clashes.length > 0 ? `$(error) Won't compile: ${describeUses(clashes)}` : undefined,
                buttons: [EDIT_BUTTON, INDICATORS_BUTTON, REMOVE_BUTTON]
            };
        });

    if (items.length > 0) {
        items.push({ keyIndex: -1, label: '', kind: vscode.QuickPickItemKind.Separator });
    };
    items.push({ keyIndex: -1, label: '$(add) Add command key...' });
    return items;
};

/**
 * The key where it can't also be: at file level when the scope is a record, in any record when
 * it's the file. CRTDSPF rejects a key at both levels, whatever its type: "Keyword not allowed at
 * both file and record level."
 */
function otherLevelUses(keyNumber: string, uses: KeyUse[], scope: KeyScope): KeyUse[] {
    const atFileLevel = scope.where === 'file level';
    return uses.filter(use => use.keyNumber === keyNumber && (use.where === 'file level') !== atFileLevel);
};

/** 'F5' for key '05'. */
function keyLabel(keyNumber: string): string {
    return `F${parseInt(keyNumber, 10)}`;
};

/** Where else a key is: "CF05 in record LIST, CF05 at file level". */
function describeUses(uses: KeyUse[]): string {
    const described = uses.map(use => `${use.type}${use.keyNumber} ${use.where === 'file level' ? 'at' : 'in'} ${use.where}`);
    return described.length > 3 ? `${described.slice(0, 3).join(', ')} and ${described.length - 3} more` : described.join(', ');
};

/**
 * Shows the window and resolves to what the user did, or undefined if dismissed. Needs the raw
 * `createQuickPick` API rather than the simpler `showQuickPick` helper, since only it exposes
 * per-item and title-bar buttons.
 */
function showKeyWindow(
    items: KeyCommandItem[],
    canRemoveAll: boolean,
    title: string,
    focus: KeyCommandItem | undefined
): Promise<KeyWindowOutcome | undefined> {
    const removeAllButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove all' };

    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<KeyCommandItem>();
        quickPick.items = items;
        if (focus) quickPick.activeItems = [focus];
        quickPick.title = title;
        quickPick.placeholder = 'Select a key to change it — its buttons set indicators or remove it';
        quickPick.buttons = canRemoveAll ? [removeAllButton] : [];
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: KeyWindowOutcome | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerButton(() => finish({ action: 'removeAll' }));
        quickPick.onDidTriggerItemButton(event => {
            const action = event.button === REMOVE_BUTTON ? 'remove' : event.button === INDICATORS_BUTTON ? 'indicators' : 'edit';
            finish({ action, keyIndex: event.item.keyIndex });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            if (!picked) return;
            finish(picked.keyIndex >= 0 ? { action: 'edit', keyIndex: picked.keyIndex } : { action: 'add' });
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
 * Reads a CAnn/CFnn keyword: CA03, CA02(92), CF05(05 'Refresh').
 * @param keywordText - The keyword, exactly as parsed
 * @returns The key, or undefined when the keyword is no command key
 */
export function parseKeyCommand(keywordText: string): KeyCommandContent | undefined {
    // A quote inside the text is written twice, as in every DDS literal.
    const match = keywordText.match(/^(CA|CF)(\d{2})(?:\(\s*(\d{1,2})?\s*(?:'((?:[^']|'')*)')?\s*\))?$/i);
    if (!match) return undefined;
    return {
        type: match[1].toUpperCase() as KeyType,
        keyNumber: match[2],
        responseIndicator: match[3]?.padStart(2, '0'),
        text: match[4]?.replace(/''/g, "'")
    };
};

/** The command keys among some keywords — a record's, or the file's. */
function readKeyCommands(attributes: DdsAttribute[]): KeyCommand[] {
    return attributes.flatMap(attr => {
        const content = parseKeyCommand(attr.value);
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

/** The scope's command keys, from the last parse. */
function readScopeKeys(scope: KeyScope): KeyCommand[] {
    if (scope.element.kind === 'file') {
        return readKeyCommands(attributesFileLevel);
    };
    return readKeyCommands(fieldsPerRecords.find(record => record.record === scope.element.name)?.attributes ?? []);
};

/** Every command key in the display file, file level and every record, from the last parse. */
export function readKeyUses(): KeyUse[] {
    const toUses = (keys: KeyCommand[], where: string): KeyUse[] => keys.map(key => ({ ...key.content, where, lineIndex: key.value.lineIndex }));
    return [
        ...toUses(readKeyCommands(attributesFileLevel), 'file level'),
        ...fieldsPerRecords.flatMap(record => toUses(readKeyCommands(record.attributes ?? []), `record ${record.record}`))
    ];
};

/**
 * Parses the source again after an edit, bringing the shared model up to date, and finds the
 * record again by its definition line — which none of these edits move, as they all happen below it.
 * @returns False when the record can't be found any more
 */
function refreshScope(editor: vscode.TextEditor, scope: KeyScope): boolean {
    const elements = parseDocument(editor.document.getText());
    if (scope.element.kind === 'file') return true;

    const record = elements.find(el => el.kind === 'record' && el.lineIndex === scope.element.lineIndex);
    if (!record) return false;
    scope.element = record;
    return true;
};

/** The keyword a key is written as: the text only goes with a response indicator. */
export function keyCommandKeyword(content: KeyCommandContent): string {
    const { type, keyNumber, responseIndicator, text } = content;
    if (!responseIndicator) return `${type}${keyNumber}`;
    return `${type}${keyNumber}(${responseIndicator}${text ? ` '${text.replace(/'/g, "''")}'` : ''})`;
};

// SOURCE EDITS

/**
 * Adds a key the scope doesn't have yet, unconditioned, after its other keywords: asks which one,
 * then its type, response indicator and text. Indicators are set afterwards with the row's button.
 * @returns True when the key was added
 */
async function addKey(editor: vscode.TextEditor, scope: KeyScope, keys: KeyCommand[], uses: KeyUse[]): Promise<boolean> {
    const keyNumber = await pickNewKeyNumber(keys, uses, scope);
    if (!keyNumber) return false;

    const content = await collectKeyCommand(keyNumber, uses);
    if (!content) return false;

    const keywordText = keyCommandKeyword(content);
    if (!(await insertKeywordLines(editor, findElementInsertionPoint(editor, scope.element), keywordText))) return false;
    vscode.window.showInformationMessage(`Added ${keywordText} to the ${scope.where}.`);
    return true;
};

/**
 * Changes a key where it is, keeping its indicators and any keyword beside it.
 * @returns True when it was changed
 */
async function editKey(editor: vscode.TextEditor, key: KeyCommand, uses: KeyUse[], scope: KeyScope): Promise<boolean> {
    // The key's own keyword doesn't clash with what it's being changed to.
    const others = uses.filter(use => !(use.where === scope.where && use.lineIndex === key.value.lineIndex && use.keyNumber === key.content.keyNumber));
    const content = await collectKeyCommand(key.content.keyNumber, others, key.content);
    if (!content) return false;

    const newKeywordText = keyCommandKeyword(content);
    if (newKeywordText === key.value.keywordText) return false;

    const { lineIndex, lastLineIndex, keywordText } = key.value;
    return replaceKeywordTextInLines(editor, lineIndex, lastLineIndex, keywordText, newKeywordText);
};

/**
 * Removes keys from the last line up, so that each one still to remove is where it was read —
 * two on one line share it, so each removal re-reads the scope first.
 */
async function removeKeys(editor: vscode.TextEditor, scope: KeyScope, keys: KeyCommand[]): Promise<boolean> {
    for (const target of [...keys].sort((a, b) => b.value.lineIndex - a.value.lineIndex)) {
        const current = readScopeKeys(scope).find(key =>
            key.value.keywordText === target.value.keywordText && key.value.lineIndex === target.value.lineIndex);
        if (!current) continue;
        if (!(await removeWholeKeyword(editor, scope.element, current.value))) return false;
        if (!refreshScope(editor, scope)) return false;
    };
    return true;
};

async function removeAllKeys(editor: vscode.TextEditor, scope: KeyScope): Promise<boolean> {
    return removeKeys(editor, scope, readScopeKeys(scope));
};

// USER INTERACTION FUNCTIONS

/**
 * Asks which key to add, among those the scope doesn't have yet. A key already at the other level
 * is listed with where it is, and picking it explains why it can't be added and asks again.
 * @returns The key, '01' to '24', or undefined if cancelled
 */
async function pickNewKeyNumber(keys: KeyCommand[], uses: KeyUse[], scope: KeyScope): Promise<string | undefined> {
    const items: (vscode.QuickPickItem & { keyNumber: string; clashes: KeyUse[] })[] = [];
    for (let i = 1; i <= 24; i++) {
        const keyNumber = i.toString().padStart(2, '0');
        if (keys.some(key => key.content.keyNumber === keyNumber)) continue;
        const clashes = otherLevelUses(keyNumber, uses, scope);
        items.push({
            keyNumber,
            clashes,
            label: keyLabel(keyNumber),
            description: clashes.length > 0 ? `$(error) Already ${describeUses(clashes)}` : undefined
        });
    };
    if (items.length === 0) {
        vscode.window.showInformationMessage('Every key from F1 to F24 is already assigned.');
        return undefined;
    };

    while (true) {
        const picked = await vscode.window.showQuickPick(items, {
            title: 'Add Command Key',
            placeHolder: 'Select the key to add',
            ignoreFocusOut: true
        });
        if (!picked) return undefined;
        if (picked.clashes.length === 0) return picked.keyNumber;

        await vscode.window.showErrorMessage(
            `${picked.label} can't be added to the ${scope.where}: it is ${describeUses(picked.clashes)}. ` +
            `A key can't be at both file and record level — CRTDSPF fails.`,
            { modal: true }
        );
    };
};

/**
 * Asks for a key's type, response indicator and text, prefilled with `current` when changing one.
 * The type it already has elsewhere in the file comes first, and the other one is refused.
 * @param keyNumber - The key, '01' to '24'
 * @param uses - Every other command key in the file
 * @param current - The key as it is, when changing one
 * @returns The key, or undefined if cancelled
 */
async function collectKeyCommand(keyNumber: string, uses: KeyUse[], current?: KeyCommandContent): Promise<KeyCommandContent | undefined> {
    const type = await pickKeyType(keyNumber, uses, current?.type);
    if (!type) return undefined;

    const responseIndicator = await vscode.window.showInputBox({
        title: `${keyLabel(keyNumber)} — Response Indicator`,
        prompt: `Enter the indicator set on when ${keyLabel(keyNumber)} is pressed (01-99), or leave it blank for none`,
        value: current ? current.responseIndicator ?? '' : keyNumber,
        placeHolder: keyNumber,
        ignoreFocusOut: true,
        validateInput: value => !value.trim() || /^(0[1-9]|[1-9]\d)$/.test(value.trim().padStart(2, '0')) ? null : 'Enter an indicator from 01 to 99, or leave it blank'
    });
    if (responseIndicator === undefined) return undefined;
    if (!responseIndicator.trim()) {
        return { type, keyNumber };
    };

    const text = await vscode.window.showInputBox({
        title: `${keyLabel(keyNumber)} — Text`,
        prompt: 'Enter the text that documents the response indicator, or leave it blank for none',
        value: current?.text,
        placeHolder: 'Refresh',
        ignoreFocusOut: true,
        validateInput: value => value.trim().length > 50 ? 'The text must be 50 characters or fewer' : null
    });
    if (text === undefined) return undefined;

    return { type, keyNumber, responseIndicator: responseIndicator.trim().padStart(2, '0'), text: text.trim() || undefined };
};

/**
 * Asks CA or CF. The type the key already has elsewhere in the file comes first; picking the
 * other one explains where it clashes and asks again.
 * @returns The type, or undefined if cancelled
 */
async function pickKeyType(keyNumber: string, uses: KeyUse[], currentType?: KeyType): Promise<KeyType | undefined> {
    const sameKey = uses.filter(use => use.keyNumber === keyNumber);
    const clashesWith = (type: KeyType) => sameKey.filter(use => use.type !== type);
    const usedType = sameKey.length > 0 && clashesWith(sameKey[0].type).length === 0 ? sameKey[0].type : undefined;
    const preferred = usedType ?? currentType ?? 'CF';

    const items = (['CF', 'CA'] as KeyType[])
        .sort((a, b) => (a === preferred ? -1 : 0) - (b === preferred ? -1 : 0))
        .map(type => {
            const clashes = clashesWith(type);
            return {
                type,
                label: `${type}${keyNumber}`,
                description: type === 'CF' ? 'Command function: sends the changed data' : 'Command attention: no data is sent',
                detail: clashes.length > 0 ? `$(error) Won't compile: ${describeUses(clashes)}` : usedType === type ? `As in ${describeUses(sameKey)}` : undefined
            };
        });

    while (true) {
        const picked = await vscode.window.showQuickPick(items, {
            title: `${keyLabel(keyNumber)} — Key Type${currentType ? ` (current: ${currentType})` : ''}`,
            placeHolder: 'Choose CF (function key) or CA (attention key)',
            ignoreFocusOut: true
        });
        if (!picked) return undefined;

        const clashes = clashesWith(picked.type);
        if (clashes.length === 0) return picked.type;

        await vscode.window.showErrorMessage(
            `${keyLabel(keyNumber)} can't be ${picked.type}${keyNumber}: it is ${describeUses(clashes)}. ` +
            `A display file can't use the same key as both CA and CF — CRTDSPF fails.`,
            { modal: true }
        );
    };
};
