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
 * A window whose line and position the program sets at run time, WINDOW(&LIN &POS rows cols): the
 * two P fields that hold them. Per the DDS reference, each must be in the window's record, signed
 * numeric (S), usage P, at most 3 digits long.
 */

/** The names of the line and position fields, without the '&'. */
export interface WindowPositionFields {
    row: string;
    col: string;
};

/** How a missing line or position field is created. */
export const WINDOW_POSITION_FIELD: HiddenFieldDefinition = { type: 'S', length: 3, decimals: 0, usage: 'P' };

/** The names offered when the window has no fields yet. */
const SUGGESTED_NAMES: WindowPositionFields = { row: 'WDWLIN', col: 'WDWPOS' };

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

/**
 * Asks for the names of the fields holding the window's line and position, offering the current
 * ones (or suggested names). A name no field has yet is fine: the field is created. One that
 * exists must be defined as the DDS reference requires (see windowPositionFieldProblem).
 * @param recordName - The window's record; undefined for a record not created yet, whose fields
 * can't exist
 * @param current - The fields the window uses now, if any
 * @param takenNames - Names other fields of a record not created yet will have, which can't be used
 * @returns The names, upper-cased, or undefined if cancelled
 */
export async function collectWindowPositionFields(recordName: string | undefined, current?: Partial<WindowPositionFields>, takenNames: string[] = []): Promise<WindowPositionFields | undefined> {
    const parts = [
        { key: 'row' as const, what: 'line (row) of the window\'s top-left corner' },
        { key: 'col' as const, what: 'position (column) of the window\'s top-left corner' }
    ];
    const names: Partial<WindowPositionFields> = {};
    const recordLabel = recordName ? ` for ${recordName}` : '';

    for (const [index, part] of parts.entries()) {
        const value = await vscode.window.showInputBox({
            title: `Window position${recordLabel} - Field ${index + 1}/2`,
            prompt: `Field (${formatDefinition(WINDOW_POSITION_FIELD)}) the program sets with the ${part.what}`,
            value: current?.[part.key] ?? SUGGESTED_NAMES[part.key],
            ignoreFocusOut: true,
            validateInput: input => {
                const name = input.trim().toUpperCase();
                if (!name) {return 'This field is required.';}
                const formatError = validateFieldNameFormat(name);
                if (formatError) {return formatError;}
                if (index === 1 && name === names.row) {
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
        });
        if (value === undefined) {
            return undefined;
        };
        names[part.key] = value.trim().toUpperCase();
    };
    return names as WindowPositionFields;
};

/** The source lines of the line and position fields, for a record that doesn't have them yet. */
export function windowPositionFieldLines(fields: WindowPositionFields): string[] {
    return [fields.row, fields.col].map(name => hiddenFieldLine(name, WINDOW_POSITION_FIELD));
};

/**
 * Creates the line and position fields the record doesn't have yet, after its hidden fields.
 * @returns The names created, or undefined if the edit couldn't be applied
 */
export async function createMissingWindowPositionFields(editor: vscode.TextEditor, recordName: string, fields: WindowPositionFields): Promise<string[] | undefined> {
    const missing = [fields.row, fields.col].filter(name => !findField(editor, recordName, name));
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
