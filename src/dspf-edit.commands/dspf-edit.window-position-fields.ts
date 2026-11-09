/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.window-position-fields.ts
*/

import * as vscode from 'vscode';
import { FieldInfo, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { validateFieldNameFormat } from './dspf-edit.edit-field';
import { HiddenFieldDefinition, describeFieldDefinition, findField, formatDefinition, hiddenFieldLine, insertHiddenFieldLines, isNamedByRecordKeywords, deleteUnusedFields } from './dspf-edit.hidden-fields';

/**
 * A window whose line or position (or both) the program sets at run time: WINDOW(&LIN &POS rows
 * cols), WINDOW(&LIN 20 rows cols), WINDOW(5 &POS rows cols). Per the DDS reference, each of the
 * start line and start position is a number or a P field — signed numeric (S), usage P, at most 3
 * digits, in the window's record. The window's lines and positions (its size) are always numbers.
 */

/** One part of the window's start: the name of the P field holding it (without the '&'), or a fixed number. */
export type WindowStartPart = string | number;

/** The window's start line and position, at least one of them a P field. */
export interface WindowPositionFields {
    row: WindowStartPart;
    col: WindowStartPart;
};

/** How a missing line or position field is created. */
export const WINDOW_POSITION_FIELD: HiddenFieldDefinition = { type: 'S', length: 3, decimals: 0, usage: 'P' };

/** The names offered when the window has no fields yet. */
const SUGGESTED_NAMES = { row: 'WDWLIN', col: 'WDWPOS' };

/** The start as coded in WINDOW(): '&LIN &POS', '&LIN 20', '5 &POS'. */
export function windowStartText(start: WindowPositionFields): string {
    const part = (value: WindowStartPart) => typeof value === 'string' ? `&${value}` : String(value);
    return `${part(start.row)} ${part(start.col)}`;
};

/** The P field names a start uses, line first. */
export function windowStartFieldNames(start: WindowPositionFields): string[] {
    return [start.row, start.col].filter((part): part is string => typeof part === 'string');
};

/**
 * Why an existing field can't hold a window's line or position — how it's defined instead, e.g.
 * "10A B" — or undefined when it can: signed numeric (S), usage P, at most 3 digits, no decimals.
 */
export function windowPositionFieldProblem(field: FieldInfo): string | undefined {
    const fits = !field.referenced
        && (field.type || '').toUpperCase() === 'S'
        && field.length >= 1 && field.length <= 3
        && (field.decimals ?? 0) === 0
        && (field.usage || '').toUpperCase() === 'P';
    return fits ? undefined : describeFieldDefinition(field);
};

/** Which parts of the start the program sets. */
type VariableParts = 'both' | 'row' | 'col';

/**
 * Asks which of the window's start line and position the program sets, then, for each, the name
 * of the field holding it — offering the current one (or a suggested name) — or the fixed number.
 * A name no field has yet is fine: the field is created. One that exists must be defined as the
 * DDS reference requires (see windowPositionFieldProblem).
 * @param recordName - The window's record; undefined for a record not created yet, whose fields
 * can't exist
 * @param current - The start the window has now, if any: field names, or numbers
 * @param takenNames - Names other fields of a record not created yet will have, which can't be used
 * @param screen - The smallest display size the window goes on, bounding a fixed line or position
 * @returns The start, names upper-cased, or undefined if cancelled
 */
export async function collectWindowPositionFields(
    recordName: string | undefined,
    current: Partial<WindowPositionFields> = {},
    takenNames: string[] = [],
    screen: { rows: number; cols: number } = { rows: 24, cols: 80 }
): Promise<WindowPositionFields | undefined> {
    const recordLabel = recordName ? ` for ${recordName}` : '';
    const isField = (part: WindowStartPart | undefined) => typeof part === 'string';
    const currentChoice: VariableParts = isField(current.row) && !isField(current.col) ? 'row'
        : !isField(current.row) && isField(current.col) ? 'col'
        : 'both';
    const choices: (vscode.QuickPickItem & { parts: VariableParts })[] = [
        { label: 'Line and position', description: '&LIN &POS', detail: 'The program sets both, in two P fields', parts: 'both' },
        { label: 'Only the line', description: '&LIN 20', detail: 'The program sets the line in a P field; the position is a fixed number', parts: 'row' },
        { label: 'Only the position', description: '5 &POS', detail: 'The program sets the position in a P field; the line is a fixed number', parts: 'col' }
    ];
    const picker = vscode.window.createQuickPick<typeof choices[number]>();
    picker.title = `Window position${recordLabel} - Set by the program`;
    picker.placeholder = 'Which of the window\'s line and position does the program set?';
    picker.items = choices;
    picker.activeItems = choices.filter(choice => choice.parts === currentChoice);
    picker.ignoreFocusOut = true;
    const picked = await new Promise<typeof choices[number] | undefined>(resolve => {
        picker.onDidAccept(() => { resolve(picker.selectedItems[0] ?? picker.activeItems[0]); picker.hide(); });
        picker.onDidHide(() => resolve(undefined));
        picker.show();
    });
    picker.dispose();
    if (!picked) {
        return undefined;
    };

    const parts = [
        { key: 'row' as const, what: 'line (row) of the window\'s top-left corner', max: screen.rows },
        { key: 'col' as const, what: 'position (column) of the window\'s top-left corner', max: screen.cols }
    ];
    const start: Partial<WindowPositionFields> = {};
    const steps = parts.length;
    for (const [index, part] of parts.entries()) {
        const variable = picked.parts === 'both' || picked.parts === part.key;
        const step = `${index + 1}/${steps}`;
        const now = current[part.key];
        const value = variable
            ? await vscode.window.showInputBox({
                title: `Window position${recordLabel} - Field ${step}`,
                prompt: `Field (${formatDefinition(WINDOW_POSITION_FIELD)}) the program sets with the ${part.what}`,
                value: typeof now === 'string' ? now : SUGGESTED_NAMES[part.key],
                ignoreFocusOut: true,
                validateInput: input => {
                    const name = input.trim().toUpperCase();
                    if (!name) {return 'This field is required.';}
                    const formatError = validateFieldNameFormat(name);
                    if (formatError) {return formatError;}
                    if (index === 1 && name === start.row) {
                        return 'The line and the position need a field each.';
                    };
                    if (takenNames.includes(name)) {
                        return `${name} is already used by another field of the new record.`;
                    };
                    const existing = recordName
                        ? fieldsPerRecords.find(r => r.record === recordName)?.fields.find(f => f.name.toUpperCase() === name)
                        : undefined;
                    const problem = existing ? windowPositionFieldProblem(existing) : undefined;
                    return problem
                        ? `${name} is already defined in ${recordName} as ${problem}; it must be signed numeric, usage P, up to 3 digits (e.g. ${formatDefinition(WINDOW_POSITION_FIELD)}).`
                        : null;
                }
            })
            : await vscode.window.showInputBox({
                title: `Window position${recordLabel} - Fixed ${part.key === 'row' ? 'line' : 'position'} ${step}`,
                prompt: `The ${part.what} (1-${part.max})`,
                value: String(typeof now === 'number' ? now : 2),
                ignoreFocusOut: true,
                validateInput: input => {
                    const text = input.trim();
                    const number = Number(text);
                    return /^\d+$/.test(text) && number >= 1 && number <= part.max
                        ? null
                        : `Enter a number from 1 to ${part.max}.`;
                }
            });
        if (value === undefined) {
            return undefined;
        };
        start[part.key] = variable ? value.trim().toUpperCase() : Number(value.trim());
    };
    return start as WindowPositionFields;
};

/** The source lines of the line and/or position fields, for a record that doesn't have them yet. */
export function windowPositionFieldLines(fields: WindowPositionFields): string[] {
    return windowStartFieldNames(fields).map(name => hiddenFieldLine(name, WINDOW_POSITION_FIELD));
};

/**
 * Creates the line and position fields the record doesn't have yet, after its hidden fields.
 * @returns The names created, or undefined if the edit couldn't be applied
 */
export async function createMissingWindowPositionFields(editor: vscode.TextEditor, recordName: string, fields: WindowPositionFields): Promise<string[] | undefined> {
    const missing = windowStartFieldNames(fields).filter(name => !findField(editor, recordName, name));
    const lines = missing.map(name => hiddenFieldLine(name, WINDOW_POSITION_FIELD));
    return (await insertHiddenFieldLines(editor, recordName, lines)) ? missing : undefined;
};

/**
 * Offers to delete fields the window no longer takes its line and position from — the program
 * may still use them — unless another keyword of the record names them.
 * @returns The names deleted, or undefined if an edit failed
 */
export async function deleteUnusedWindowPositionFields(editor: vscode.TextEditor, recordName: string, names: string[]): Promise<string[] | undefined> {
    const unused = names.filter(name => findField(editor, recordName, name) && !isNamedByRecordKeywords(editor, recordName, name));
    return deleteUnusedFields(editor, recordName, 'WINDOW', unused);
};
