/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.selection-field.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { fieldsPerRecords, getRecordSize, getSizeForFormat, getAvailableDisplayFormats, fileSizeAttributes } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument,
    insertKeywordLines,
    replaceKeywordTextInLines,
    formatIndicatorCondition,
    paginateKeywordText
} from '../dspf-edit.utils/dspf-edit.helper';
import { KeywordValue, removeWholeKeyword, reparseElement, nudgeCursor, changeKeywordValueIndicators } from './dspf-edit.conditioned-keywords';
import { findField, hiddenFieldLine, insertHiddenFieldLines, renameFieldLine, deleteUnusedFields, HiddenFieldDefinition } from './dspf-edit.hidden-fields';
import {
    ChoiceKeyword, SelectionKeyword, SINGLE_CHOICE_ONLY_OPTIONS,
    parseChoiceKeyword, formatChoiceKeyword, parseChoiceText, choiceMnemonic, validateChoiceText,
    parseSelectionKeyword, formatSelectionKeyword, parseChoiceControlKeyword, nextControlFieldName,
    nextChoiceNumber, choiceListWidth
} from '../dspf-edit.utils/dspf-edit.choice-text';

/**
 * Selection fields: a single-choice (SNGCHCFLD, radio buttons on a graphical display) or
 * multiple-choice (MLTCHCFLD, check boxes) field and its choices, CHOICE(number 'text'). Per the
 * DDS reference, the field is 2Y 0, input-capable (I or B), with one or more CHOICE keywords:
 * numbers 1-99, no repeats; at most one mnemonic per choice (the character after '>'), not a blank
 * and not repeated. A multiple-choice field also needs a CHCCTL(number &field) per choice, whose
 * 1Y 0 H field tells the program whether the choice was selected; they're created as CTL01,
 * CTL02... and can be renamed. The screen designer doesn't edit these, so they're written by hand
 * the usual way: the selection keyword on the field's own line, one CHOICE per line after it.
 */

// CONSTANTS AND TYPES

const CONTROL_FIELD: HiddenFieldDefinition = { type: 'Y', length: 1, decimals: 0 };

/** A choice of the field, with where its keywords are. */
interface Choice extends ChoiceKeyword {
    keywordText: string;
    lineIndex: number;
    lastLineIndex: number;
    conditionText: string;
    indicators?: any[];
    /** MLTCHCFLD: its CHCCTL keyword and field, if it has one. */
    control?: { field: string; keywordText: string; lineIndex: number; lastLineIndex: number };
};

/** The selection field as it is in the source now. */
interface SelectionField {
    element: any;
    keyword: SelectionKeyword;
    keywordAttr: { value: string; lineIndex: number; lastLineIndex: number };
    choices: Choice[];
};

type RowAction = 'edit' | 'spaceBefore' | 'indicators' | 'control' | 'remove';
type MenuAction = RowAction | 'add' | 'layout' | 'type' | 'indicatorsShown';

interface MenuItem extends vscode.QuickPickItem {
    action?: MenuAction;
    choice?: Choice;
};

const BUTTONS: Record<RowAction, vscode.QuickInputButton> = {
    edit: { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Change the text' },
    spaceBefore: { iconPath: new vscode.ThemeIcon('fold-up'), tooltip: 'Blank line before it (on/off)' },
    indicators: { iconPath: new vscode.ThemeIcon('symbol-boolean'), tooltip: 'Indicators' },
    control: { iconPath: new vscode.ThemeIcon('symbol-field'), tooltip: 'Control field (CHCCTL)' },
    remove: { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' }
};

// COMMAND REGISTRATION

/**
 * Registers the "Choices" command for selection fields.
 * @param context - The VS Code extension context
 */
export function selectionFieldChoices(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dspf-edit.selection-field-choices', async (node: DdsNode) => {
            await handleChoicesCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * The "Choices" window: lists the field's choices, each with buttons to change its text, its blank
 * line before, its indicators, its control field (multiple choice) or remove it, plus adding a
 * choice, the layout, the type and whether radio buttons/check boxes show. It comes back after
 * each change, until closed.
 * @param node - The field's node
 */
async function handleChoicesCommand(node: DdsNode): Promise<void> {
    try {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {return;}

        let element: any = node.ddsElement;
        if (element.kind !== 'field' || !readSelectionField(element)) {
            vscode.window.showWarningMessage('Choices can only be managed on a selection field (single or multiple choice). Create one with Add Field.');
            return;
        };

        while (true) {
            element = reparseElement(editor, element);
            const field = element ? readSelectionField(element) : undefined;
            if (!field) {return;}

            const picked = await showChoicesMenu(field);
            if (!picked) {return;}

            const done = await runAction(editor, field, picked.action, picked.choice);
            if (done) {
                await nudgeCursor();
            };
        };
    } catch (error) {
        console.error('Error managing choices:', error);
        vscode.window.showErrorMessage('An error occurred while managing the choices.');
    };
};

// READING

/** Reads a field's selection keyword, choices and control fields; undefined when it isn't a selection field. */
function readSelectionField(element: any): SelectionField | undefined {
    const attributes = (element.attributes ?? []) as { value: string; indicators?: any[]; lineIndex: number; lastLineIndex?: number }[];
    const keywordAttr = attributes.find(attr => parseSelectionKeyword(attr.value));
    if (!keywordAttr) {return undefined;}

    const controls = new Map<number, Choice['control']>();
    for (const attr of attributes) {
        const control = parseChoiceControlKeyword(attr.value);
        if (control) {
            controls.set(control.number, { field: control.field, keywordText: attr.value, lineIndex: attr.lineIndex, lastLineIndex: attr.lastLineIndex ?? attr.lineIndex });
        };
    };

    const choices: Choice[] = [];
    for (const attr of attributes) {
        const choice = parseChoiceKeyword(attr.value);
        if (!choice) {continue;}
        choices.push({
            ...choice,
            keywordText: attr.value,
            lineIndex: attr.lineIndex,
            lastLineIndex: attr.lastLineIndex ?? attr.lineIndex,
            conditionText: formatIndicatorCondition(attr.indicators),
            indicators: attr.indicators,
            control: controls.get(choice.number)
        });
    };

    return {
        element,
        keyword: parseSelectionKeyword(keywordAttr.value)!,
        keywordAttr: { value: keywordAttr.value, lineIndex: keywordAttr.lineIndex, lastLineIndex: keywordAttr.lastLineIndex ?? keywordAttr.lineIndex },
        choices
    };
};

/** "One column", "3 columns" (*NUMCOL), "2 rows" (*NUMROW), with the gutter when coded. */
function describeLayout(keyword: SelectionKeyword): string {
    const gutter = keyword.gutter !== undefined ? `, ${keyword.gutter} spaces apart` : '';
    if (keyword.numCol !== undefined) {return `${keyword.numCol} per row${gutter}`;}
    if (keyword.numRow !== undefined) {return `${keyword.numRow} per column${gutter}`;}
    return 'One column';
};

function indicatorNoun(multiple: boolean): string {
    return multiple ? 'Check boxes' : 'Radio buttons';
};

// MENU

function showChoicesMenu(field: SelectionField): Promise<{ action: MenuAction; choice?: Choice } | undefined> {
    const { keyword, choices } = field;
    const rows: MenuItem[] = choices.map(choice => {
        const shown = choice.isFieldReference ? `&${choice.text}` : parseChoiceText(choice.text).text;
        const mnemonic = choice.isFieldReference ? undefined : choiceMnemonic(choice.text);
        const details = [
            mnemonic ? `mnemonic ${mnemonic}` : '',
            choice.spaceBefore ? 'blank line before' : '',
            choice.conditionText ? `when ${choice.conditionText}` : '',
            keyword.multiple ? (choice.control ? `control &${choice.control.field}` : 'no control field') : ''
        ].filter(Boolean);
        const buttons: vscode.QuickInputButton[] = [
            ...(choice.isFieldReference ? [] : [BUTTONS.edit]),
            BUTTONS.spaceBefore,
            BUTTONS.indicators,
            ...(keyword.multiple ? [BUTTONS.control] : []),
            ...(choices.length > 1 ? [BUTTONS.remove] : [])
        ];
        return { label: `${choice.number}. ${shown}`, description: details.join(' · '), choice, action: choice.isFieldReference ? 'indicators' : 'edit', buttons };
    });

    const items: MenuItem[] = [
        ...rows,
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(add) Add choice', action: 'add' },
        { label: '$(list-flat) Layout', description: describeLayout(keyword), action: 'layout' },
        { label: '$(arrow-swap) Type', description: keyword.multiple ? 'Multiple choice — check boxes' : 'Single choice — radio buttons', action: 'type' },
        {
            label: `$(${keyword.multiple ? 'check' : 'circle-large-outline'}) ${indicatorNoun(keyword.multiple)}`,
            description: keyword.selectionIndicators ? 'Shown on a graphical display' : 'Not shown (*NOSLTIND)',
            action: 'indicatorsShown'
        }
    ];

    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<MenuItem>();
        quickPick.items = items;
        quickPick.title = `Choices for ${field.element.name} — ${keyword.multiple ? 'multiple choice' : 'single choice'}`;
        quickPick.placeholder = 'Select a choice to change its text, or use its buttons';
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: { action: MenuAction; choice?: Choice } | undefined) => {
            if (settled) {return;}
            settled = true;
            resolve(result);
            quickPick.hide();
        };
        quickPick.onDidTriggerItemButton(event => {
            const action = (Object.keys(BUTTONS) as RowAction[]).find(key => BUTTONS[key] === event.button);
            finish(action ? { action, choice: event.item.choice } : undefined);
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            finish(picked?.action ? { action: picked.action, choice: picked.choice } : undefined);
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });
        quickPick.show();
    });
};

// ACTIONS

/** Runs one action of the window. True when the source changed. */
async function runAction(editor: vscode.TextEditor, field: SelectionField, action: MenuAction, choice?: Choice): Promise<boolean> {
    switch (action) {
        case 'edit': return changeChoiceText(editor, field, choice!);
        case 'spaceBefore': return replaceChoice(editor, choice!, { ...choice!, spaceBefore: !choice!.spaceBefore });
        case 'indicators': await changeKeywordValueIndicators(editor, field.element, toKeywordValue(choice!)); return false;
        case 'control': return changeControlField(editor, field, choice!);
        case 'remove': return removeChoice(editor, field, choice!);
        case 'add': return addChoice(editor, field);
        case 'layout': return changeLayout(editor, field);
        case 'type': return changeType(editor, field);
        case 'indicatorsShown': return replaceSelectionKeyword(editor, field, { ...field.keyword, selectionIndicators: !field.keyword.selectionIndicators });
    };
};

function toKeywordValue(choice: Choice): KeywordValue {
    return {
        code: choice.keywordText,
        keywordText: choice.keywordText,
        lineIndex: choice.lineIndex,
        lastLineIndex: choice.lastLineIndex,
        conditionText: choice.conditionText,
        wholeKeyword: true
    };
};

async function replaceChoice(editor: vscode.TextEditor, choice: Choice, updated: ChoiceKeyword): Promise<boolean> {
    return replaceKeywordTextInLines(editor, choice.lineIndex, choice.lastLineIndex, choice.keywordText, formatChoiceKeyword(updated));
};

async function replaceSelectionKeyword(editor: vscode.TextEditor, field: SelectionField, keyword: SelectionKeyword): Promise<boolean> {
    return replaceKeywordTextInLines(editor, field.keywordAttr.lineIndex, field.keywordAttr.lastLineIndex, field.keywordAttr.value, formatSelectionKeyword(keyword));
};

/** The mnemonics of every choice but one. */
function otherMnemonics(choices: Choice[], except?: Choice): string[] {
    return choices
        .filter(choice => choice !== except && !choice.isFieldReference)
        .map(choice => choiceMnemonic(choice.text))
        .filter((mnemonic): mnemonic is string => !!mnemonic);
};

/**
 * Asks for a choice's text, checking the CHOICE rules and that the choice list still fits on the
 * display (or window).
 */
async function askChoiceText(field: SelectionField, number: number, current?: Choice): Promise<string | undefined> {
    const others = field.choices.filter(choice => choice !== current);
    return vscode.window.showInputBox({
        title: `Choices for ${field.element.name} — ${current ? `Change choice ${number}` : `New choice ${number}`}`,
        prompt: 'Text of the choice. Put > before a letter to make it the mnemonic (e.g. >Development); >> for a > in the text.',
        value: current?.text ?? '',
        ignoreFocusOut: true,
        validateInput: value => validateChoiceText(value, otherMnemonics(field.choices, current))
            ?? fitMessage(field.element, [...others, { number, text: value, isFieldReference: false, spaceBefore: false }], field.keyword)
    });
};

async function changeChoiceText(editor: vscode.TextEditor, field: SelectionField, choice: Choice): Promise<boolean> {
    const text = await askChoiceText(field, choice.number, choice);
    if (text === undefined || text === choice.text) {return false;}
    return replaceChoice(editor, choice, { ...choice, text });
};

/** Adds a choice after the last one, with its control field for a multiple-choice field. */
async function addChoice(editor: vscode.TextEditor, field: SelectionField): Promise<boolean> {
    const number = nextChoiceNumber(field.choices.map(choice => choice.number));
    if (number === undefined) {
        vscode.window.showWarningMessage('Choice numbers go up to 99: there is no number left for another choice.');
        return false;
    };
    const text = await askChoiceText(field, number);
    if (text === undefined) {return false;}

    const lastLine = Math.max(field.element.lineIndex, ...field.choices.flatMap(choice => [choice.lastLineIndex, choice.control?.lastLineIndex ?? -1]));
    if (!(await insertKeywordLines(editor, lastLine + 1, formatChoiceKeyword({ number, text, isFieldReference: false, spaceBefore: false })))) {
        return false;
    };
    if (field.keyword.multiple) {
        const element = reparseElement(editor, field.element);
        const added = element ? readSelectionField(element)?.choices.find(choice => choice.number === number) : undefined;
        if (added && !(await addControlField(editor, field.element, added))) {
            return false;
        };
    };
    return true;
};

/**
 * Gives a choice of a multiple-choice field its CHCCTL, right after its CHOICE, and creates its
 * control field (1Y 0 H, CTL01, CTL02...) when the record doesn't have it.
 */
async function addControlField(editor: vscode.TextEditor, element: any, choice: Choice, name?: string): Promise<boolean> {
    const fieldName = name ?? nextControlFieldName(recordFieldNames(element.recordname));
    if (!(await insertKeywordLines(editor, choice.lastLineIndex + 1, `CHCCTL(${choice.number} &${fieldName})`))) {
        return false;
    };
    if (findField(editor, element.recordname, fieldName)) {
        return true;
    };
    return insertHiddenFieldLines(editor, element.recordname, [hiddenFieldLine(fieldName, CONTROL_FIELD)]);
};

function recordFieldNames(recordName: string): string[] {
    return (fieldsPerRecords.find(r => r.record === recordName)?.fields ?? []).map(f => f.name.toUpperCase());
};

/** Removes a choice, with its CHCCTL; a control field left unused can then be deleted. */
async function removeChoice(editor: vscode.TextEditor, field: SelectionField, choice: Choice): Promise<boolean> {
    if (field.choices.length <= 1) {
        vscode.window.showWarningMessage('A selection field needs at least one choice.');
        return false;
    };
    // The CHCCTL goes first: it's below the CHOICE, so the CHOICE's lines don't move.
    const control = choice.control;
    if (control) {
        if (!(await removeWholeKeyword(editor, field.element, { keywordText: control.keywordText, lineIndex: control.lineIndex, lastLineIndex: control.lastLineIndex }))) {
            return false;
        };
    };
    const below = control && control.lineIndex < choice.lineIndex ? control.lastLineIndex - control.lineIndex + 1 : 0;
    if (!(await removeWholeKeyword(editor, field.element, { keywordText: choice.keywordText, lineIndex: choice.lineIndex - below, lastLineIndex: choice.lastLineIndex - below }))) {
        return false;
    };
    if (control) {
        await offerToDeleteControlFields(editor, field.element.recordname, [control.field]);
    };
    return true;
};

/** Offers to delete control fields no CHCCTL of the record uses any more. */
async function offerToDeleteControlFields(editor: vscode.TextEditor, recordName: string, names: string[]): Promise<void> {
    parseDocument(editor.document.getText());
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    const stillUsed = new Set((recordInfo?.fields ?? [])
        .flatMap(f => f.attributes.map(attr => parseChoiceControlKeyword(attr.value)?.field))
        .filter((name): name is string => !!name));
    const unused = [...new Set(names)].filter(name => !stillUsed.has(name) && findField(editor, recordName, name));
    await deleteUnusedFields(editor, recordName, 'CHCCTL', unused);
};

/** Renames a choice's control field, or gives it one when it has none. */
async function changeControlField(editor: vscode.TextEditor, field: SelectionField, choice: Choice): Promise<boolean> {
    const recordName = field.element.recordname;
    const current = choice.control?.field;
    const taken = recordFieldNames(recordName).filter(name => name !== current);
    const name = (await vscode.window.showInputBox({
        title: `Choices for ${field.element.name} — Control field of choice ${choice.number}`,
        prompt: 'Name of the 1Y 0 hidden field that tells the program whether the choice was selected (CHCCTL)',
        value: current ?? nextControlFieldName(recordFieldNames(recordName)),
        ignoreFocusOut: true,
        validateInput: value => {
            const upper = value.trim().toUpperCase();
            if (!/^[A-Z@#$][A-Z0-9@#$_]{0,9}$/.test(upper)) {
                return 'Up to 10 characters: letters, digits, @ # $ _, not starting with a digit.';
            };
            if (taken.includes(upper)) {
                const existing = fieldsPerRecords.find(r => r.record === recordName)?.fields.find(f => f.name.toUpperCase() === upper);
                const isControlKind = existing && (existing.type ?? '').toUpperCase() === 'Y' && existing.length === 1 && (existing.usage ?? '').toUpperCase() === 'H';
                return isControlKind ? null : `Record ${recordName} already has a field ${upper} that isn't 1Y 0 H.`;
            };
            return null;
        }
    }))?.trim().toUpperCase();
    if (!name || name === current) {return false;}

    if (!choice.control) {
        return addControlField(editor, field.element, choice, name);
    };

    // Point the CHCCTL at the new name, then rename the field itself unless the new name is an
    // existing field (then the old one may be left unused).
    if (!(await replaceKeywordTextInLines(editor, choice.control.lineIndex, choice.control.lastLineIndex, choice.control.keywordText,
        choice.control.keywordText.replace(new RegExp(`&${current}(?![A-Z0-9@#$_])`, 'i'), `&${name}`)))) {
        return false;
    };
    const existingNew = findField(editor, recordName, name);
    const oldField = findField(editor, recordName, current!);
    if (existingNew || !oldField) {
        if (!existingNew && !(await insertHiddenFieldLines(editor, recordName, [hiddenFieldLine(name, CONTROL_FIELD)]))) {
            return false;
        };
        await offerToDeleteControlFields(editor, recordName, [current!]);
        return true;
    };
    return renameFieldLine(editor, oldField, name);
};

/** Changes how the choices are arranged: one column, n per row (*NUMCOL) or n per column (*NUMROW), and the gutter. */
async function changeLayout(editor: vscode.TextEditor, field: SelectionField): Promise<boolean> {
    const current = field.keyword;
    const pick = await vscode.window.showQuickPick([
        { label: 'One column', value: 'one' as const, description: current.numCol === undefined && current.numRow === undefined ? '(current)' : '' },
        { label: 'Several per row', value: 'col' as const, description: `filled row by row (*NUMCOL)${current.numCol !== undefined ? ' (current)' : ''}` },
        { label: 'Several per column', value: 'row' as const, description: `filled column by column (*NUMROW)${current.numRow !== undefined ? ' (current)' : ''}` }
    ], { title: `Choices for ${field.element.name} — Layout`, placeHolder: 'How the choices are arranged', ignoreFocusOut: true });
    if (!pick) {return false;}

    let updated: SelectionKeyword = { ...current, numCol: undefined, numRow: undefined, gutter: undefined };
    if (pick.value !== 'one') {
        const count = await askNumber(
            pick.value === 'col' ? 'How many choices per row' : 'How many choices per column',
            pick.value === 'col' ? current.numCol : current.numRow, 1,
            value => fitMessage(field.element, field.choices, pick.value === 'col'
                ? { numCol: value, gutter: current.gutter } : { numRow: value, gutter: current.gutter }));
        if (count === undefined) {return false;}
        const gutter = await askNumber('Spaces between columns (at least 2; 3 when left as is)', current.gutter ?? 3, 2,
            value => fitMessage(field.element, field.choices, pick.value === 'col' ? { numCol: count, gutter: value } : { numRow: count, gutter: value }));
        if (gutter === undefined) {return false;}
        updated = { ...updated, ...(pick.value === 'col' ? { numCol: count } : { numRow: count }), gutter: gutter === 3 ? undefined : gutter };
    };
    if (formatSelectionKeyword(updated) === formatSelectionKeyword(current)) {return false;}
    return replaceSelectionKeyword(editor, field, updated);
};

async function askNumber(prompt: string, current: number | undefined, min: number, check: (value: number) => string | undefined): Promise<number | undefined> {
    const input = await vscode.window.showInputBox({
        prompt,
        value: String(current ?? ''),
        ignoreFocusOut: true,
        validateInput: value => {
            if (!/^\d{1,2}$/.test(value.trim()) || parseInt(value, 10) < min) {
                return `Enter a number from ${min} to 99.`;
            };
            return check(parseInt(value, 10));
        }
    });
    return input === undefined ? undefined : parseInt(input.trim(), 10);
};

/**
 * Single choice ↔ multiple choice. Going multiple, each choice gets its CHCCTL and control field,
 * and the auto-select/auto-enter parameters (single choice only) are dropped. Going single, the
 * CHCCTLs are removed and their fields can be deleted.
 */
async function changeType(editor: vscode.TextEditor, field: SelectionField): Promise<boolean> {
    const toMultiple = !field.keyword.multiple;
    const dropped = toMultiple ? field.keyword.options.filter(option => SINGLE_CHOICE_ONLY_OPTIONS.includes(option)) : [];
    const controls = field.choices.map(choice => choice.control).filter((c): c is NonNullable<Choice['control']> => !!c);

    const answer = await vscode.window.showWarningMessage(
        toMultiple
            ? `Make ${field.element.name} a multiple-choice field (check boxes)? Each choice gets a control field (CHCCTL) the program reads to know whether it was selected.${dropped.length ? ` ${dropped.join(' ')} only applies to single choice and is removed.` : ''}`
            : `Make ${field.element.name} a single-choice field (radio buttons)? Its control fields (CHCCTL) are removed.`,
        { modal: true },
        'Change'
    );
    if (answer !== 'Change') {return false;}

    if (!(await replaceSelectionKeyword(editor, field, {
        ...field.keyword,
        multiple: toMultiple,
        options: field.keyword.options.filter(option => !dropped.includes(option))
    }))) {
        return false;
    };

    if (toMultiple) {
        // From the last choice up, so the choices above keep their lines.
        for (const choice of [...field.choices].reverse()) {
            if (choice.control) {continue;}
            const element = reparseElement(editor, field.element);
            const current = element ? readSelectionField(element)?.choices.find(c => c.number === choice.number) : undefined;
            if (!current || !(await addControlField(editor, field.element, current))) {
                return false;
            };
        };
        return true;
    };

    for (const control of [...controls].sort((a, b) => b.lineIndex - a.lineIndex)) {
        if (!(await removeWholeKeyword(editor, field.element, control))) {
            return false;
        };
    };
    await offerToDeleteControlFields(editor, field.element.recordname, controls.map(control => control.field));
    return true;
};

// FITTING ON THE DISPLAY

/**
 * The rows and columns the field has to fit in: its window's, in a window record; otherwise the
 * screen of the display format the field is conditioned on, or the smaller one when the file
 * declares two (the DDS reference: choices must fit on the smallest display size).
 */
function getAvailableColumns(element: any): number {
    const size = getRecordSize(element.recordname);
    if (size?.source === 'window') {return size.cols;}
    if (element.displayFormat) {
        const formatSize = getSizeForFormat(element.displayFormat);
        if (formatSize) {return formatSize.cols;}
    };
    const formats = getAvailableDisplayFormats();
    return formats.length === 0 ? fileSizeAttributes.maxCol1 : Math.min(...formats.map(f => f.cols));
};

/** A message when the choices, laid out as the screen designer shows them, don't fit; undefined when they do. */
function fitMessage(element: any, choices: ChoiceKeyword[], layout: Pick<SelectionKeyword, 'numCol' | 'numRow' | 'gutter'>): string | undefined {
    const col = fieldsPerRecords.find(r => r.record === element.recordname)?.fields.find(f => f.lineIndex === element.lineIndex)?.col;
    if (!col) {return undefined;}
    const labels = choices.map(choice => ({ number: choice.number, text: choice.isFieldReference ? choice.text : parseChoiceText(choice.text).text }));
    const lastCol = col + choiceListWidth(labels, layout) - 1;
    const available = getAvailableColumns(element);
    return lastCol > available
        ? `The choices would reach column ${lastCol}, past the ${available} columns available.`
        : undefined;
};

// CREATING A SELECTION FIELD (Add Field)

/**
 * Asks for the choices of a new selection field, one after another, until one is left empty.
 * @param fieldName - The new field's name, for the titles
 * @returns The texts, or undefined if cancelled or none was given
 */
export async function collectNewChoices(fieldName: string): Promise<string[] | undefined> {
    const texts: string[] = [];
    while (texts.length < 99) {
        const others = texts.map(text => choiceMnemonic(text)).filter((m): m is string => !!m);
        const input = await vscode.window.showInputBox({
            title: `Add field '${fieldName}' — Choice ${texts.length + 1}`,
            prompt: texts.length === 0
                ? 'Text of the first choice. Put > before a letter to make it the mnemonic (e.g. >Development).'
                : 'Text of the next choice, or leave it empty to finish.',
            ignoreFocusOut: true,
            validateInput: value => value === '' && texts.length > 0 ? null : validateChoiceText(value, others)
        });
        if (input === undefined) {
            return texts.length > 0 && (await confirmStop()) ? texts : undefined;
        };
        if (input === '') {break;}
        texts.push(input);
    };
    return texts.length > 0 ? texts : undefined;
};

async function confirmStop(): Promise<boolean> {
    return (await vscode.window.showWarningMessage('Create the field with the choices entered so far?', { modal: true }, 'Create')) === 'Create';
};

/**
 * The source lines of a new selection field: the field (2Y 0B, the selection keyword on its own
 * line), then each CHOICE, and for a multiple-choice field each CHCCTL after its CHOICE. The control
 * fields themselves are returned apart, to go with the record's other hidden fields.
 * @param fieldLine - The field's definition line, without keywords
 * @param multiple - MLTCHCFLD rather than SNGCHCFLD
 * @param texts - The choices' texts, numbered from 1
 * @param recordName - The record, to find free control field names
 */
export function buildSelectionFieldLines(fieldLine: string, multiple: boolean, texts: string[], recordName: string): { lines: string; controlFieldLines: string[] } {
    const keywordLine = (text: string) => paginateKeywordText(text).map(chunk => '     A'.padEnd(44, ' ') + chunk);
    const lines = [fieldLine.padEnd(44, ' ') + (multiple ? 'MLTCHCFLD' : 'SNGCHCFLD')];
    const taken = recordFieldNames(recordName);
    const controlFieldLines: string[] = [];

    texts.forEach((text, index) => {
        lines.push(...keywordLine(formatChoiceKeyword({ number: index + 1, text, isFieldReference: false, spaceBefore: false })));
        if (multiple) {
            const name = nextControlFieldName(taken);
            taken.push(name);
            lines.push(...keywordLine(`CHCCTL(${index + 1} &${name})`));
            controlFieldLines.push(hiddenFieldLine(name, CONTROL_FIELD));
        };
    });
    return { lines: lines.join('\n'), controlFieldLines };
};

/** Adds the control fields of a new multiple-choice field, after the record's other hidden fields. */
export async function insertControlFields(editor: vscode.TextEditor, recordName: string, lines: string[]): Promise<boolean> {
    return insertHiddenFieldLines(editor, recordName, lines);
};
