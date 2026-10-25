/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.cursor-location.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute, FieldInfo, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument,
    findElementInsertionPoint,
    insertKeywordLines,
    replaceKeywordTextInLines
} from '../dspf-edit.utils/dspf-edit.helper';
import { removeWholeKeyword } from './dspf-edit.conditioned-keywords';
import { validateFieldNameFormat } from './dspf-edit.edit-field';
import {
    HiddenFieldDefinition,
    findField,
    formatDefinition,
    describeFieldDefinition,
    hiddenFieldLine,
    insertHiddenFieldLines,
    renameFieldLine,
    deleteUnusedFields
} from './dspf-edit.hidden-fields';

/**
 * The record-level keywords that return where the cursor is to the program, each in hidden fields
 * of the same record:
 * - RTNCSRLOC([*RECNAME] &cursor-record &cursor-field [&cursor-position]): the record and field
 *   the cursor is on (10A H each), and optionally its position within the field (4S 0 H).
 * - RTNCSRLOC({*WINDOW | *MOUSE} &cursor-row &cursor-column [&cursor-row2 [&cursor-column2]]): the
 *   cursor's row and column on the display, and optionally relative to the active window (*WINDOW)
 *   or where it was when a two-event mouse definition began (*MOUSE), all 3S 0 H.
 * - SFLCSRRRN(&relative-record), on a subfile control record only: the relative record number of
 *   the subfile record the cursor is on (5S 0 H).
 * A record can have both RTNCSRLOC formats. This command keeps each keyword's hidden fields in step
 * with it: it creates the ones missing, renames one when its parameter is renamed, and offers to
 * delete the ones no longer used. Option indicators are not valid for these keywords.
 */

// INTERFACES AND TYPES

type CursorLocationFormat = 'record' | 'position' | 'subfile';

/** One parameter of the keyword: what it returns, its field's definition and its suggested name. */
interface ParameterSpec {
    description: string;
    definition: HiddenFieldDefinition;
    suggestedName: string;
    optional: boolean;
};

/** One of the record's cursor location keywords, as read from the source. */
interface CursorLocationKeyword {
    attr: DdsAttribute;
    /** '*RECNAME', '*WINDOW', '*MOUSE', or '' when there's none. */
    qualifier: string;
    fields: string[];
};

type CursorLocationKeywords = Partial<Record<CursorLocationFormat, CursorLocationKeyword>>;

interface CursorLocationMenuItem extends vscode.QuickPickItem {
    format: CursorLocationFormat;
};

// CONSTANTS

const RECORD_NAME_FIELD: HiddenFieldDefinition = { type: 'A', length: 10 };
const POSITION_FIELD: HiddenFieldDefinition = { type: 'S', length: 4, decimals: 0 };
const ROW_COLUMN_FIELD: HiddenFieldDefinition = { type: 'S', length: 3, decimals: 0 };
const RELATIVE_RECORD_FIELD: HiddenFieldDefinition = { type: 'S', length: 5, decimals: 0 };

const FORMATS: CursorLocationFormat[] = ['record', 'position', 'subfile'];

const FORMAT_LABELS: Record<CursorLocationFormat, string> = {
    record: 'Record and field the cursor is on',
    position: 'Row and column of the cursor',
    subfile: 'Subfile record the cursor is on'
};

const RECORD_PARAMETERS: ParameterSpec[] = [
    { description: 'the record the cursor is on', definition: RECORD_NAME_FIELD, suggestedName: 'CSRRCD', optional: false },
    { description: 'the field the cursor is on', definition: RECORD_NAME_FIELD, suggestedName: 'CSRFLD', optional: false },
    { description: 'the cursor position within the field', definition: POSITION_FIELD, suggestedName: 'CSRPOS', optional: true }
];

const SUBFILE_PARAMETERS: ParameterSpec[] = [
    { description: 'the relative record number of the subfile record the cursor is on', definition: RELATIVE_RECORD_FIELD, suggestedName: 'CSRRRN', optional: false }
];

/** The position format's parameters; what the last two return depends on *WINDOW or *MOUSE. */
function positionParameters(qualifier: string): ParameterSpec[] {
    const relativeTo = qualifier === '*MOUSE' ? 'when a two-event mouse definition began' : 'within the active window';
    return [
        { description: 'the cursor row on the display', definition: ROW_COLUMN_FIELD, suggestedName: 'CSRROW', optional: false },
        { description: 'the cursor column on the display', definition: ROW_COLUMN_FIELD, suggestedName: 'CSRCOL', optional: false },
        { description: `the cursor row ${relativeTo}`, definition: ROW_COLUMN_FIELD, suggestedName: qualifier === '*MOUSE' ? 'MSEROW' : 'WDWROW', optional: true },
        { description: `the cursor column ${relativeTo}`, definition: ROW_COLUMN_FIELD, suggestedName: qualifier === '*MOUSE' ? 'MSECOL' : 'WDWCOL', optional: true }
    ];
};

function parametersOf(format: CursorLocationFormat, qualifier: string): ParameterSpec[] {
    return format === 'record' ? RECORD_PARAMETERS : format === 'position' ? positionParameters(qualifier) : SUBFILE_PARAMETERS;
};

function keywordNameOf(format: CursorLocationFormat): string {
    return format === 'subfile' ? 'SFLCSRRRN' : 'RTNCSRLOC';
};

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Set/change' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

// COMMAND REGISTRATION

/**
 * Registers the "Return Cursor Location" command for records.
 * @param context - The VS Code extension context
 */
export function addCursorLocation(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.cursor-location", async (node: DdsNode) => {
            await handleCursorLocationCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the "Return Cursor Location" command: a menu with RTNCSRLOC's two formats — and, on a
 * subfile control record, SFLCSRRRN — each set or changed with its pencil and removed with its
 * trash button.
 * @param node - The DDS node the command was invoked from
 */
async function handleCursorLocationCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const record = node.ddsElement;
        if (record.kind !== 'record' || record.attributes?.some(attr => attr.value.trim().toUpperCase() === 'SFL')) {
            vscode.window.showWarningMessage('RTNCSRLOC can only be set on a record that is not a subfile record (SFL).');
            return;
        };
        const isSflCtl = record.attributes?.some(attr => /^SFLCTL\(/i.test(attr.value.trim())) ?? false;

        const keywords = readCursorLocationKeywords(record.attributes);
        const formats = FORMATS.filter(format => format !== 'subfile' || isSflCtl);
        const choice = await showCursorLocationMenu(keywords, formats, record.name);
        if (!choice) {
            return;
        };

        if (choice.action === 'remove') {
            await removeCursorLocation(editor, record, keywords, choice.format);
        } else {
            await setCursorLocation(editor, record, keywords, choice.format);
        };
    } catch (error) {
        console.error('Error managing the cursor location:', error);
        vscode.window.showErrorMessage('An error occurred while managing the cursor location.');
    };
};

// READING THE KEYWORDS

/**
 * The record's cursor location keywords, by format: at most one of each.
 * @param attributes - The record's own attributes
 */
function readCursorLocationKeywords(attributes: DdsAttribute[] | undefined): CursorLocationKeywords {
    const result: CursorLocationKeywords = {};
    for (const attr of attributes ?? []) {
        const match = attr.value.trim().match(/^(RTNCSRLOC|SFLCSRRRN)\(\s*(.*?)\s*\)$/i);
        if (!match) continue;
        const tokens = match[2].toUpperCase().split(/\s+/).filter(Boolean);
        const qualifier = tokens[0]?.startsWith('*') ? tokens.shift()! : '';
        const format: CursorLocationFormat = match[1].toUpperCase() === 'SFLCSRRRN'
            ? 'subfile'
            : qualifier === '*WINDOW' || qualifier === '*MOUSE' ? 'position' : 'record';
        if (!result[format]) {
            result[format] = { attr, qualifier, fields: tokens.map(token => token.replace(/^&/, '')) };
        };
    };
    return result;
};

/** The keyword's text, e.g. "RTNCSRLOC(&CSRRCD &CSRFLD)" or "SFLCSRRRN(&CSRRRN)". */
function buildKeywordText(format: CursorLocationFormat, qualifier: string, fields: string[]): string {
    return `${keywordNameOf(format)}(${[qualifier, ...fields.map(name => `&${name}`)].filter(Boolean).join(' ')})`;
};

/** The fields used by every keyword but the one of `format`. */
function otherFormatsFields(keywords: CursorLocationKeywords, format: CursorLocationFormat): string[] {
    return FORMATS.filter(other => other !== format).flatMap(other => keywords[other]?.fields ?? []);
};

// MENU

/**
 * Shows the menu: one row per format, with what it is set to. Needs the raw `createQuickPick` API
 * for the per-item buttons, same as the other summary menus.
 */
function showCursorLocationMenu(
    keywords: CursorLocationKeywords,
    formats: CursorLocationFormat[],
    recordName: string
): Promise<{ action: 'set' | 'remove'; format: CursorLocationFormat } | undefined> {
    const items: CursorLocationMenuItem[] = formats.map(format => {
        const keyword = keywords[format];
        return {
            format,
            label: FORMAT_LABELS[format],
            description: keyword ? buildKeywordText(format, keyword.qualifier, keyword.fields) : '(not set)',
            buttons: keyword ? [EDIT_BUTTON, REMOVE_BUTTON] : [EDIT_BUTTON]
        };
    });

    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<CursorLocationMenuItem>();
        quickPick.items = items;
        quickPick.title = `Return Cursor Location for ${recordName}`;
        quickPick.placeholder = 'Select what to return to the program, or use its buttons';
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: { action: 'set' | 'remove'; format: CursorLocationFormat } | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'set', format: event.item.format });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            finish(picked ? { action: 'set', format: picked.format } : undefined);
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

// SETTING A FORMAT

/**
 * Sets or changes one format: asks for its parameters' field names (offering the current ones, or
 * suggested ones), writes the keyword, then brings the hidden fields in step: a field whose
 * parameter was renamed is renamed too (when nothing else uses it and no field has the new name
 * yet), missing ones are created, and those no longer used are deleted if the user agrees.
 */
async function setCursorLocation(
    editor: vscode.TextEditor,
    record: any,
    keywords: CursorLocationKeywords,
    format: CursorLocationFormat
): Promise<void> {
    const recordName: string = record.name;
    const current = keywords[format];
    const otherFields = otherFormatsFields(keywords, format);

    let qualifier = current?.qualifier ?? '';
    if (format === 'position') {
        const picked = await pickPositionQualifier(qualifier);
        if (!picked) return;
        qualifier = picked;
    };
    const parameters = parametersOf(format, qualifier);

    const names = await collectFieldNames(recordName, parameters, current?.fields ?? [], otherFields);
    if (!names) {
        return;
    };

    const oldNames = current?.fields ?? [];
    if (current && current.qualifier === qualifier && sameNames(oldNames, names)) {
        return;
    };

    // The keyword first: it sits above the record's fields, so whatever it adds or removes there
    // is re-read before touching any field.
    const keywordText = buildKeywordText(format, qualifier, names);
    const written = current
        ? await replaceKeywordTextInLines(editor, current.attr.lineIndex, current.attr.lastLineIndex ?? current.attr.lineIndex, current.attr.value, keywordText)
        : await insertKeywordLines(editor, findElementInsertionPoint(editor, record), keywordText);
    if (!written) {
        return;
    };

    // Renames: a parameter whose old field can carry the new name, as its definition is right and
    // nothing else uses it.
    const stillUsed = new Set([...names, ...otherFields]);
    const renamed: string[] = [];
    for (let i = 0; i < names.length; i++) {
        const oldName = oldNames[i];
        const newName = names[i];
        if (!oldName || oldName === newName || stillUsed.has(oldName) || findField(editor, recordName, newName)) continue;
        const oldField = findField(editor, recordName, oldName);
        if (!oldField || definitionProblem(oldField, parameters[i].definition)) continue;
        if (!(await renameFieldLine(editor, oldField, newName))) return;
        renamed.push(`${oldName} → ${newName}`);
    };

    // Fields no longer used by any of the keywords, if the user agrees.
    const unused = oldNames.filter(name => !stillUsed.has(name) && findField(editor, recordName, name));
    const deleted = await deleteUnusedFields(editor, recordName, keywordNameOf(format), unused);
    if (deleted === undefined) return;

    // Fields still missing, created after the record's hidden fields.
    const created = names.filter(name => !findField(editor, recordName, name));
    const createdLines = created.map(name => hiddenFieldLine(name, parameters[names.indexOf(name)].definition));
    if (!(await insertHiddenFieldLines(editor, recordName, createdLines))) return;

    await nudgeCursor();
    const details = [
        created.length > 0 ? `created ${created.join(', ')}` : '',
        renamed.length > 0 ? `renamed ${renamed.join(', ')}` : '',
        deleted.length > 0 ? `deleted ${deleted.join(', ')}` : ''
    ].filter(Boolean).join('; ');
    vscode.window.showInformationMessage(`${keywordText} set on record ${recordName}${details ? ` (fields ${details})` : ''}.`);
};

/** Asks between *WINDOW and *MOUSE, which say what the optional third and fourth fields return. */
async function pickPositionQualifier(current: string): Promise<string | undefined> {
    const mark = (value: string) => current === value ? ' (current)' : '';
    const picked = await vscode.window.showQuickPick([
        { label: '*WINDOW', description: `Optionally also the row and column within the active window${mark('*WINDOW')}` },
        { label: '*MOUSE', description: `Optionally also where the cursor was when a two-event mouse definition began${mark('*MOUSE')}` }
    ], {
        title: 'Return Cursor Location - Row and column',
        placeHolder: 'Select what the optional third and fourth fields return',
        ignoreFocusOut: true
    });
    return picked?.label;
};

/**
 * Asks for each parameter's field name, in order. An optional one can be left empty, which also
 * leaves out the ones after it (a parameter can't be given without the ones before it).
 * @param recordName - The record the fields belong to
 * @param parameters - The format's parameters
 * @param currentNames - The format's current field names, offered as they are
 * @param otherNames - The other keywords' field names, which can't be used again
 * @returns The names, upper-cased, or undefined if cancelled
 */
async function collectFieldNames(recordName: string, parameters: ParameterSpec[], currentNames: string[], otherNames: string[]): Promise<string[] | undefined> {
    const names: string[] = [];
    for (let i = 0; i < parameters.length; i++) {
        const parameter = parameters[i];
        const definition = formatDefinition(parameter.definition);
        const value = await vscode.window.showInputBox({
            title: `Return Cursor Location for ${recordName} - Field ${i + 1}/${parameters.length}`,
            prompt: `Hidden field (${definition}) that returns ${parameter.description}${parameter.optional ? ' — optional, leave empty for none' : ''}`,
            value: currentNames[i] ?? (parameter.optional ? '' : parameter.suggestedName),
            placeHolder: parameter.suggestedName,
            ignoreFocusOut: true,
            validateInput: input => {
                const name = input.trim().toUpperCase();
                if (!name) return parameter.optional ? null : 'This field is required.';
                const formatError = validateFieldNameFormat(name);
                if (formatError) return formatError;
                if (names.includes(name) || otherNames.includes(name)) {
                    return `${name} is already used by another parameter: each one needs a field of its own.`;
                };
                const existing = fieldsPerRecords.find(r => r.record === recordName)?.fields.find(f => f.name.toUpperCase() === name);
                const problem = existing ? definitionProblem(existing, parameter.definition) : undefined;
                return problem ? `${name} is already defined in ${recordName} as ${problem}, but this parameter needs ${definition}.` : null;
            }
        });
        if (value === undefined) {
            return undefined;
        };
        const name = value.trim().toUpperCase();
        if (!name) {
            break;
        };
        names.push(name);
    };
    return names;
};

// REMOVING A FORMAT

/** Removes one format's keyword, then offers to delete the hidden fields only it used. */
async function removeCursorLocation(
    editor: vscode.TextEditor,
    record: any,
    keywords: CursorLocationKeywords,
    format: CursorLocationFormat
): Promise<void> {
    const keyword = keywords[format];
    if (!keyword) {
        return;
    };
    const recordName: string = record.name;

    if (!(await removeWholeKeyword(editor, record, {
        keywordText: keyword.attr.value,
        lineIndex: keyword.attr.lineIndex,
        lastLineIndex: keyword.attr.lastLineIndex ?? keyword.attr.lineIndex
    }))) {
        return;
    };

    const otherFields = otherFormatsFields(keywords, format);
    const unused = keyword.fields.filter(name => !otherFields.includes(name) && findField(editor, recordName, name));
    const deleted = await deleteUnusedFields(editor, recordName, keywordNameOf(format), unused);
    if (deleted === undefined) return;

    await nudgeCursor();
    vscode.window.showInformationMessage(`${keyword.attr.value} removed from record ${recordName}${deleted.length > 0 ? ` (fields deleted: ${deleted.join(', ')})` : ''}.`);
};

// SMALL HELPERS

/**
 * Why an existing field can't be used for a parameter — how it is defined instead, e.g. "5A B" —
 * or undefined when it's defined as the parameter needs. A blank data type is character.
 */
function definitionProblem(field: FieldInfo, definition: HiddenFieldDefinition): string | undefined {
    const matches = !field.referenced
        && (field.type || 'A').toUpperCase() === definition.type
        && field.length === definition.length
        && (definition.decimals === undefined || (field.decimals ?? 0) === definition.decimals)
        && (field.usage || '').toUpperCase() === 'H';
    return matches ? undefined : describeFieldDefinition(field);
};

function sameNames(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((name, i) => name === b[i]);
};

/** Nudges the cursor so the tree and preview pick up the edit, as every command here does. */
async function nudgeCursor(): Promise<void> {
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');
};
