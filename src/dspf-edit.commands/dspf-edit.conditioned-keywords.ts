/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.conditioned-keywords.ts
*/

import * as vscode from 'vscode';
import { findElementInsertionPoint, applyWorkspaceEdit, removeKeywordTextFromLines, replaceKeywordTextInLines } from '../dspf-edit.utils/dspf-edit.helper';
import { manageLineCondition, copyLineCondition, removeLineCondition } from './dspf-edit.add-indicators';

/**
 * What the Attributes (DSPATR) and Colors (COLOR) commands share: the summary menu listing what a
 * field or constant already has, and removing one entry or changing its indicators.
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
};

interface KeywordValueMenuItem extends vscode.QuickPickItem {
    valueIndex: number;
    action?: 'addNew' | 'removeAll';
};

export type KeywordValueMenuChoice = { action: 'edit' | 'remove' | 'addNew' | 'removeAll'; valueIndex: number };

/** The wording of one summary menu: Attributes or Colors. */
export interface KeywordValueMenuText {
    title: string;
    placeholder: string;
    /** Label of the row that adds more, or undefined when there's nothing left to add. */
    addLabel: string | undefined;
    removeAllLabel: string;
    /** Turns a value into its row's label, e.g. 'HI' into 'HI — High intensity'. */
    describe: (code: string) => string;
};

// SUMMARY MENU

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Change indicators' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Shows the summary menu — one row per value the element already has (with its indicator
 * condition, and edit + trash buttons), plus an "add" row, plus a "remove all" row when there's
 * more than one (with just one, its own trash button already does the same thing) — and resolves
 * to what the user did: picked a row (or its edit button) to change its indicators (`'edit'`),
 * clicked a row's trash button (`'remove'`), or picked a trailing action row — undefined if
 * dismissed. Needs the raw `createQuickPick` API rather than the simpler `showQuickPick` helper,
 * since only it exposes per-item buttons (`onDidTriggerItemButton`). Same shape as the
 * error-messages menu (see showErrorMessageMenu in dspf-edit.add-error-messages.ts).
 * @param values - The element's current values
 * @param text - The menu's wording
 */
export function showKeywordValueMenu(values: KeywordValue[], text: KeywordValueMenuText): Promise<KeywordValueMenuChoice | undefined> {
    const items: KeywordValueMenuItem[] = values.map((value, index) => ({
        valueIndex: index,
        label: text.describe(value.code),
        description: value.conditionText ? `When ${value.conditionText}` : 'Always (no indicators)',
        buttons: [EDIT_BUTTON, REMOVE_BUTTON]
    }));
    if (text.addLabel) {
        items.push({ valueIndex: -1, action: 'addNew', label: `$(add) ${text.addLabel}` });
    };
    if (values.length > 1) {
        items.push({ valueIndex: -1, action: 'removeAll', label: `$(trash) ${text.removeAllLabel}` });
    };

    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<KeywordValueMenuItem>();
        quickPick.items = items;
        quickPick.title = text.title;
        quickPick.placeholder = text.placeholder;
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: KeywordValueMenuChoice | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'edit', valueIndex: event.item.valueIndex });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            if (!picked) { finish(undefined); return; };
            finish({ action: picked.action ?? 'edit', valueIndex: picked.valueIndex });
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

// SOURCE EDITS

/** The keyword name of a keyword text: 'DSPATR' for 'DSPATR(UL HI)'. */
function keywordName(keywordText: string): string {
    return keywordText.substring(0, keywordText.indexOf('('));
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
 * Removes just one value (the summary menu's trash button). A value sharing its keyword with
 * others, as HI does in DSPATR(UL HI), is taken out of the keyword, which stays with the rest;
 * otherwise the whole keyword goes.
 * @param editor - The active text editor
 * @param element - The DDS element the value belongs to
 * @param value - The value to remove
 */
export async function removeKeywordValue(editor: vscode.TextEditor, element: any, value: KeywordValue): Promise<boolean> {
    const siblings = keywordCodes(value.keywordText).filter(code => code !== value.code);
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
    const alone = keywordCodes(value.keywordText).length === 1;
    if (alone && hasLineOfItsOwn(editor, element, value)) {
        return value.lineIndex;
    };

    // The new line goes in below the old one, so the old one keeps its index to copy from.
    const insertionPoint = findElementInsertionPoint(editor, element);
    const newLine = '     A'.padEnd(44, ' ') + `${keywordName(value.keywordText)}(${value.code})`;
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
 * Changes one value's indicators (the summary menu's edit button), with the same menu and the same
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

    await manageLineCondition(editor, { lineIndex }, `${keywordName(value.keywordText)}(${value.code})`);
    // Moving the value to its own line is an edit too, even when the indicators were left alone.
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');
};
