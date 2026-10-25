/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.conditioned-keywords.ts
*/

import * as vscode from 'vscode';
import { findElementInsertionPoint, applyWorkspaceEdit, removeKeywordTextFromLines, replaceKeywordTextInLines } from '../dspf-edit.utils/dspf-edit.helper';
import { manageLineCondition, copyLineCondition, removeLineCondition, addConditionedKeywordLine } from './dspf-edit.add-indicators';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';

/**
 * What the Attributes (DSPATR) and Colors (COLOR) commands share: the window listing what a field
 * or constant has and can have, and removing one entry or changing its indicators.
 */

// INTERFACES AND TYPES

/** One attribute or color a field/constant already has, and where its keyword sits in the source. */
export interface KeywordValue {
    /** The value itself: 'HI', 'RED'... */
    code: string;
    /** The whole keyword text it was read from — shared by every attribute of a multi-attribute
     * keyword such as DSPATR(UL HI). */
    keywordText: string;
    lineIndex: number;
    lastLineIndex: number;
    /** Its indicator condition spelled out ("50 AND NOT 51  OR  60"), '' when unconditioned. */
    conditionText: string;
    /** True when the value is the whole keyword, never split into the values inside it — OVERLAY,
     * or SFLEND(*SCRBAR *MORE) — rather than one of them, as HI is in DSPATR(UL HI). */
    wholeKeyword?: boolean;
    /** True for a keyword DDS doesn't allow without indicators, such as SFLEND. */
    requiresCondition?: boolean;
};

/** What one window manages — Attributes (DSPATR) or Colors (COLOR) — and how it reads and edits them. */
export interface KeywordValueSpec {
    /** The keyword name: 'DSPATR', 'COLOR'. */
    keyword: string;
    /** Every value the keyword takes, in the order the window lists them. */
    codes: string[];
    /** 'attribute', 'color'... and its plural, for titles and messages. */
    noun: string;
    nounPlural: string;
    /** Turns a value into its row's label, e.g. 'HI' into 'HI — High intensity'. */
    describe: (code: string) => string;
    /** The values the element has now. */
    read: (element: any) => KeywordValue[];
    /** Adds values, unconditioned, the same way the multi-element flow does. */
    add: (editor: vscode.TextEditor, element: any, codes: string[]) => Promise<boolean>;
    /** Removes every value the element has. */
    removeAll: (editor: vscode.TextEditor, element: any) => Promise<boolean>;
};

/** One row of the window: a value the element has (`valueIndex` into its current values), or one
 * it doesn't have yet (`valueIndex` -1). */
interface KeywordValueItem extends vscode.QuickPickItem {
    code: string;
    valueIndex: number;
};

type KeywordValueWindowOutcome =
    | { action: 'apply'; checked: readonly KeywordValueItem[] }
    | { action: 'edit' | 'remove'; item: KeywordValueItem; checked: readonly KeywordValueItem[] }
    | { action: 'removeAll' };

// THE WINDOW

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Change indicators' };
const ADD_WITH_INDICATORS_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Add with indicators' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Manages one element's attributes or colors from a single window, the same multi-select window
 * used for several elements at once: every value listed with a checkbox, checked when the element
 * already has it. Enter applies the checkboxes — checked values are added, unchecked ones removed.
 * A row's pencil sets its indicators (adding the value if the element doesn't have it yet), its
 * trash button removes it, and the title bar's trash button removes them all; each of those is
 * applied at once and the window comes back, refreshed, keeping the checkboxes not yet applied.
 * @param editor - The active text editor
 * @param element - The field or constant
 * @param spec - What is managed and how
 */
export async function manageKeywordValues(editor: vscode.TextEditor, element: any, spec: KeywordValueSpec): Promise<void> {
    const elementName = element.name;
    // Checkboxes changed but not applied yet, by value — carried over each time the window comes back.
    const toggledOn = new Set<string>();
    const toggledOff = new Set<string>();
    let focusCode: string | undefined;

    while (true) {
        const values = spec.read(element);
        const items = buildKeywordValueItems(values, spec);
        const isChecked = (item: KeywordValueItem) => item.valueIndex >= 0 ? !toggledOff.has(item.code) : toggledOn.has(item.code);

        const outcome = await showKeywordValueWindow(items, items.filter(isChecked), values.length > 0, {
            title: `${capitalize(spec.nounPlural)} for ${elementName}`,
            placeholder: `Check the ${spec.nounPlural} it should have and press Enter — pencil sets indicators, trash removes`
        }, items.find(item => item.code === focusCode));
        if (!outcome) return;

        if (outcome.action === 'apply') {
            await applyKeywordValueChecks(editor, element, spec, items, outcome.checked);
            return;
        };

        let done: boolean;
        if (outcome.action === 'removeAll') {
            toggledOn.clear();
            toggledOff.clear();
            focusCode = undefined;
            done = await spec.removeAll(editor, element);
            if (done) vscode.window.showInformationMessage(`Removed all ${spec.nounPlural} from ${elementName}.`);
        } else {
            rememberToggles(items, outcome.checked, toggledOn, toggledOff);
            const { item } = outcome;
            toggledOn.delete(item.code);
            toggledOff.delete(item.code);
            focusCode = item.code;

            if (outcome.action === 'remove') {
                done = await removeKeywordValue(editor, element, values[item.valueIndex]);
                if (done) vscode.window.showInformationMessage(`Removed ${spec.noun} ${item.code} from ${elementName}.`);
            } else if (item.valueIndex >= 0) {
                await changeKeywordValueIndicators(editor, element, values[item.valueIndex]);
                done = true;
            } else {
                done = await addConditionedKeywordLine(editor, findElementInsertionPoint(editor, element), `${spec.keyword}(${item.code})`);
            };
        };
        if (!done) return;

        await nudgeCursor();
        element = reparseElement(editor, element);
        if (!element) return;
    };
};

/**
 * The window's rows: every value the keyword takes, in `spec.codes` order, those the element has
 * with their indicator condition. A value the element has more than once (under different
 * indicators) gets one row each; one it has but the window doesn't know comes last.
 */
function buildKeywordValueItems(values: KeywordValue[], spec: KeywordValueSpec): KeywordValueItem[] {
    const existingItem = (value: KeywordValue, index: number): KeywordValueItem => ({
        code: value.code,
        valueIndex: index,
        label: spec.describe(value.code),
        description: value.conditionText ? `When ${value.conditionText}` : 'Always (no indicators)',
        buttons: [EDIT_BUTTON, REMOVE_BUTTON]
    });

    const items: KeywordValueItem[] = [];
    for (const code of spec.codes) {
        const existing = values.flatMap((value, index) => value.code === code ? [existingItem(value, index)] : []);
        items.push(...(existing.length > 0 ? existing : [{
            code,
            valueIndex: -1,
            label: spec.describe(code),
            buttons: [ADD_WITH_INDICATORS_BUTTON]
        }]));
    };
    values.forEach((value, index) => {
        if (!spec.codes.includes(value.code)) items.push(existingItem(value, index));
    });
    return items;
};

/**
 * Shows the window and resolves to what the user did, or undefined if dismissed. Needs the raw
 * `createQuickPick` API rather than the simpler `showQuickPick` helper, since only it exposes
 * per-item and title-bar buttons.
 */
function showKeywordValueWindow(
    items: KeywordValueItem[],
    checked: KeywordValueItem[],
    canRemoveAll: boolean,
    text: { title: string; placeholder: string },
    focus: KeywordValueItem | undefined
): Promise<KeywordValueWindowOutcome | undefined> {
    const removeAllButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove all' };

    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<KeywordValueItem>();
        quickPick.canSelectMany = true;
        quickPick.items = items;
        quickPick.selectedItems = checked;
        if (focus) quickPick.activeItems = [focus];
        quickPick.title = text.title;
        quickPick.placeholder = text.placeholder;
        quickPick.buttons = canRemoveAll ? [removeAllButton] : [];
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: KeywordValueWindowOutcome | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerButton(() => finish({ action: 'removeAll' }));
        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'edit', item: event.item, checked: [...quickPick.selectedItems] });
        });
        quickPick.onDidAccept(() => finish({ action: 'apply', checked: [...quickPick.selectedItems] }));
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

/** Records which checkboxes now differ from what the element has. */
function rememberToggles(items: KeywordValueItem[], checked: readonly KeywordValueItem[], toggledOn: Set<string>, toggledOff: Set<string>): void {
    for (const item of items) {
        const isChecked = checked.includes(item);
        if (item.valueIndex >= 0) {
            if (isChecked) toggledOff.delete(item.code); else toggledOff.add(item.code);
        } else {
            if (isChecked) toggledOn.add(item.code); else toggledOn.delete(item.code);
        };
    };
};

/**
 * Applies the checkboxes: removes the values unchecked, then adds those checked, unconditioned.
 * Removing from the last line up keeps every value still to remove where it was read — but two
 * values of one keyword, as in DSPATR(UL HI), share it, so each removal re-reads the element first.
 */
async function applyKeywordValueChecks(
    editor: vscode.TextEditor,
    element: any,
    spec: KeywordValueSpec,
    items: KeywordValueItem[],
    checked: readonly KeywordValueItem[]
): Promise<void> {
    const values = spec.read(element);
    const toRemove = items.filter(item => item.valueIndex >= 0 && !checked.includes(item)).map(item => values[item.valueIndex]);
    const toAdd = items.filter(item => item.valueIndex < 0 && checked.includes(item)).map(item => item.code);
    if (toRemove.length === 0 && toAdd.length === 0) return;

    for (const target of toRemove.sort((a, b) => b.lineIndex - a.lineIndex)) {
        const current = spec.read(element).find(value => value.code === target.code && value.lineIndex === target.lineIndex);
        if (!current) continue;
        if (!(await removeKeywordValue(editor, element, current))) return;
        element = reparseElement(editor, element);
        if (!element) return;
    };

    if (toAdd.length > 0 && !(await spec.add(editor, element, toAdd))) return;
    await nudgeCursor();

    const changes = [
        toAdd.length > 0 ? `added ${toAdd.join(', ')}` : '',
        toRemove.length > 0 ? `removed ${toRemove.map(value => value.code).join(', ')}` : ''
    ].filter(Boolean).join('; ');
    vscode.window.showInformationMessage(`${capitalize(spec.nounPlural)} for ${element.name}: ${changes}.`);
};

/**
 * The element as it is now in the source, parsed again after an edit, found by its definition
 * line — which none of these edits move, as they all happen on it or below it. Parsing also brings
 * the shared model (fieldsPerRecords) up to date, which the add edits read.
 */
function reparseElement(editor: vscode.TextEditor, element: any): any {
    return parseDocument(editor.document.getText()).find(el => el.kind === element.kind && el.lineIndex === element.lineIndex);
};

/** Nudges the cursor so the tree and preview pick up the edit, as every command here does. */
async function nudgeCursor(): Promise<void> {
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');
};

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
};

// SOURCE EDITS

/** The keyword name of a keyword text: 'DSPATR' for 'DSPATR(UL HI)'. */
function keywordName(keywordText: string): string {
    return keywordText.substring(0, keywordText.indexOf('('));
};

/** The keyword text of one value on its own: 'DSPATR(HI)' for HI in 'DSPATR(UL HI)'. */
function valueKeywordText(value: KeywordValue): string {
    return value.wholeKeyword ? value.keywordText : `${keywordName(value.keywordText)}(${value.code})`;
};

/** The values inside a keyword text: ['UL', 'HI'] for 'DSPATR(UL HI)'. */
function keywordCodes(keywordText: string): string[] {
    return keywordText.substring(keywordText.indexOf('(') + 1, keywordText.lastIndexOf(')')).trim().split(/\s+/);
};

/**
 * True when the keyword is the only thing on a line of its own: not on the element's definition
 * line, and with no other keyword beside it. Only then are the line's indicators this keyword's
 * alone, and only then does removing the keyword remove the line.
 */
function hasLineOfItsOwn(editor: vscode.TextEditor, element: any, value: Pick<KeywordValue, 'keywordText' | 'lineIndex' | 'lastLineIndex'>): boolean {
    return value.lineIndex !== element.lineIndex
        && value.lineIndex === value.lastLineIndex
        && editor.document.lineAt(value.lineIndex).text.substring(44, 80).trim() === value.keywordText;
};

/**
 * Removes a whole keyword from the line(s) it's on, leaving sibling keywords untouched. When the
 * keyword has a line of its own, the indicator-only continuation lines above it (the rest of its
 * condition, when it has more than three indicators or OR'd groups) go with it — left behind, they
 * would condition whatever comes next in the source.
 * @param editor - The active text editor
 * @param element - The DDS element the keyword belongs to
 * @param value - Where the keyword is
 */
export async function removeWholeKeyword(
    editor: vscode.TextEditor,
    element: any,
    value: Pick<KeywordValue, 'keywordText' | 'lineIndex' | 'lastLineIndex'>
): Promise<boolean> {
    if (hasLineOfItsOwn(editor, element, value)) {
        const lineIndex = await removeLineCondition(editor, value.lineIndex);
        if (lineIndex === undefined) {
            return false;
        };
        return removeKeywordTextFromLines(editor, lineIndex, lineIndex, value.keywordText);
    };

    // The element's own definition line (field or constant) must keep its columns 1-44 even if
    // nothing else is left in its keyword area once this keyword is removed.
    return removeKeywordTextFromLines(editor, value.lineIndex, value.lastLineIndex, value.keywordText, value.lineIndex === element.lineIndex);
};

/**
 * Removes just one value (the window's trash button). A value sharing its keyword with
 * others, as HI does in DSPATR(UL HI), is taken out of the keyword, which stays with the rest;
 * otherwise the whole keyword goes.
 * @param editor - The active text editor
 * @param element - The DDS element the value belongs to
 * @param value - The value to remove
 */
export async function removeKeywordValue(editor: vscode.TextEditor, element: any, value: KeywordValue): Promise<boolean> {
    const siblings = value.wholeKeyword ? [] : keywordCodes(value.keywordText).filter(code => code !== value.code);
    if (siblings.length > 0) {
        return replaceKeywordTextInLines(editor, value.lineIndex, value.lastLineIndex, value.keywordText,
            `${keywordName(value.keywordText)}(${siblings.join(' ')})`);
    };

    return removeWholeKeyword(editor, element, value);
};

/**
 * Gives a value a line of its own, right after the element's last line, when it doesn't have one:
 * it shares the element's definition line, a line with other keywords, or its keyword with other
 * values. Indicators condition a whole line, so that's the only way to change this value's
 * condition without changing anyone else's. It keeps the condition it had — none when it came off
 * the element's own line, whose indicators condition the element, not the keyword.
 * @returns The line the value's keyword is on now, or undefined if an edit couldn't be applied
 */
async function giveValueLineOfItsOwn(editor: vscode.TextEditor, element: any, value: KeywordValue): Promise<number | undefined> {
    const alone = value.wholeKeyword || keywordCodes(value.keywordText).length === 1;
    if (alone && hasLineOfItsOwn(editor, element, value)) {
        return value.lineIndex;
    };

    // The new line goes in below the old one, so the old one keeps its index to copy from.
    const insertionPoint = findElementInsertionPoint(editor, element);
    const newLine = '     A'.padEnd(44, ' ') + valueKeywordText(value);
    const workspaceEdit = new vscode.WorkspaceEdit();
    const atEnd = insertionPoint >= editor.document.lineCount;
    workspaceEdit.insert(editor.document.uri, new vscode.Position(insertionPoint, 0), atEnd ? `\n${newLine}` : `${newLine}\n`);
    if (!(await applyWorkspaceEdit(workspaceEdit, 'move the attribute'))) {
        return undefined;
    };

    let lineIndex: number | undefined = insertionPoint;
    if (value.lineIndex !== element.lineIndex) {
        // The condition is read from the keyword's last line: that's the one carrying it.
        lineIndex = await copyLineCondition(editor, value.lastLineIndex, insertionPoint);
        if (lineIndex === undefined) {
            return undefined;
        };
    };

    // Taking the value out of where it was can only shorten that block, all of it above the new line.
    const linesBefore = editor.document.lineCount;
    if (!(await removeKeywordValue(editor, element, value))) {
        return undefined;
    };
    return lineIndex - (linesBefore - editor.document.lineCount);
};

/**
 * Changes one value's indicators (the window's pencil), with the same menu and the same
 * limits as a field or constant's own: up to nine ANDed indicators per condition, and up to nine
 * OR'd conditions.
 * @param editor - The active text editor
 * @param element - The DDS element the value belongs to
 * @param value - The value whose indicators to change
 */
export async function changeKeywordValueIndicators(editor: vscode.TextEditor, element: any, value: KeywordValue): Promise<void> {
    const lineIndex = await giveValueLineOfItsOwn(editor, element, value);
    if (lineIndex === undefined) {
        return;
    };

    await manageLineCondition(editor, { lineIndex }, valueKeywordText(value), value.requiresCondition);
    // Moving the value to its own line is an edit too, even when the indicators were left alone.
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');
};
