/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.hidden-fields.ts
*/

import * as vscode from 'vscode';
import { FieldInfo, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { findElementInsertionPoint, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';
import { generateNewFieldLine } from './dspf-edit.edit-field';

/**
 * What the record keywords that name fields of their record share — RTNCSRLOC, SFLCSRRRN and
 * SFLRCDNBR: finding those fields, creating them as hidden fields, renaming and deleting them.
 * They usually go together in the source, right after the record's keywords, so new ones are
 * added after the hidden fields already there.
 */

// INTERFACES AND TYPES

/** The definition a keyword's hidden field is created with. */
export interface HiddenFieldDefinition {
    type: 'A' | 'S';
    length: number;
    decimals?: number;
};

// READING

/**
 * The record's field with this name as it is in the source now — parsed again, since each edit
 * can move the fields below it.
 */
export function findField(editor: vscode.TextEditor, recordName: string, name: string): FieldInfo | undefined {
    parseDocument(editor.document.getText());
    return fieldsPerRecords.find(r => r.record === recordName)?.fields.find(f => f.name.toUpperCase() === name);
};

/** How a definition reads, e.g. "10A H" or "4S 0 H". */
export function formatDefinition(definition: HiddenFieldDefinition): string {
    return `${definition.length}${definition.type}${definition.decimals !== undefined ? ` ${definition.decimals}` : ''} H`;
};

/** How an existing field is defined, e.g. "5A B" or "4S 0 H", or "a referenced field". A blank data type is character. */
export function describeFieldDefinition(field: FieldInfo): string {
    if (field.referenced) {
        return 'a referenced field';
    };
    const type = (field.type || 'A').toUpperCase();
    return `${field.length}${type}${field.decimals !== undefined && type !== 'A' ? ` ${field.decimals}` : ''} ${(field.usage || 'O').toUpperCase()}`;
};

/** True when the record's own keywords name the field as a parameter (&NAME). */
export function isNamedByRecordKeywords(editor: vscode.TextEditor, recordName: string, name: string): boolean {
    parseDocument(editor.document.getText());
    const attributes = fieldsPerRecords.find(r => r.record === recordName)?.attributes ?? [];
    return attributes.some(attr => new RegExp(`&${name.replace(/[$#@]/g, '\\$&')}(?![A-Z0-9@#$_])`, 'i').test(attr.value));
};

// EDITING

/** The source line of a hidden field, with an optional keyword on it (e.g. "SFLRCDNBR(CURSOR)"). */
export function hiddenFieldLine(name: string, definition: HiddenFieldDefinition, keywordText?: string): string {
    const line = generateNewFieldLine({
        name,
        position: { row: 0, column: 0 },
        usage: { type: 'H', description: 'Hidden' },
        isReferenced: false,
        typeConfig: { type: definition.type, size: { length: definition.length, decimals: definition.decimals } }
    });
    return keywordText ? line.padEnd(44, ' ') + keywordText : line;
};

/**
 * Inserts field lines, in order, after the hidden fields that follow the record's keywords — or
 * right after the keywords when there are none.
 * @param editor - The active text editor
 * @param recordName - The record they belong to
 * @param lines - The field lines, from hiddenFieldLine
 */
export async function insertHiddenFieldLines(editor: vscode.TextEditor, recordName: string, lines: string[]): Promise<boolean> {
    if (lines.length === 0) {
        return true;
    };
    parseDocument(editor.document.getText());
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) {
        return false;
    };

    let insertionPoint = findElementInsertionPoint(editor, { lineIndex: recordInfo.startIndex });
    let hidden = recordInfo.fields.find(f => f.lineIndex === insertionPoint && (f.usage || '').toUpperCase() === 'H');
    while (hidden) {
        insertionPoint = findElementInsertionPoint(editor, { lineIndex: hidden.lineIndex });
        hidden = recordInfo.fields.find(f => f.lineIndex === insertionPoint && (f.usage || '').toUpperCase() === 'H');
    };

    const text = lines.join('\n');
    const workspaceEdit = new vscode.WorkspaceEdit();
    const atEnd = insertionPoint >= editor.document.lineCount;
    workspaceEdit.insert(editor.document.uri, new vscode.Position(insertionPoint, 0), atEnd ? `\n${text}` : `${text}\n`);
    return applyWorkspaceEdit(workspaceEdit, `add ${lines.length === 1 ? 'the field' : 'the fields'}`);
};

/** Renames a field on its definition line (positions 19-28). */
export async function renameFieldLine(editor: vscode.TextEditor, field: FieldInfo, newName: string): Promise<boolean> {
    const line = editor.document.lineAt(field.lineIndex);
    const text = line.text.padEnd(28, ' ');
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(editor.document.uri, line.range, (text.substring(0, 18) + newName.padEnd(10, ' ') + text.substring(28)).replace(/\s+$/, ''));
    return applyWorkspaceEdit(workspaceEdit, `rename ${field.name}`);
};

/**
 * Offers to delete fields a keyword no longer uses — the program may still use them — and deletes
 * them, with their keyword lines, from the last one up.
 * @param editor - The active text editor
 * @param recordName - The record they belong to
 * @param keyword - The keyword that used them, for the question
 * @param names - The fields
 * @returns The names deleted (none if the user kept them), or undefined if an edit failed
 */
export async function deleteUnusedFields(editor: vscode.TextEditor, recordName: string, keyword: string, names: string[]): Promise<string[] | undefined> {
    if (names.length === 0) {
        return [];
    };

    const answer = await vscode.window.showWarningMessage(
        `${keyword} no longer uses ${names.length === 1 ? 'field' : 'fields'} ${names.join(', ')} in record ${recordName}. Delete ${names.length === 1 ? 'it' : 'them'}?`,
        { modal: true },
        'Delete'
    );
    if (answer !== 'Delete') {
        return [];
    };

    const fields = names.map(name => findField(editor, recordName, name)).filter((f): f is FieldInfo => !!f);
    for (const field of [...fields].sort((a, b) => b.lineIndex - a.lineIndex)) {
        const endLine = findElementInsertionPoint(editor, { lineIndex: field.lineIndex });
        const workspaceEdit = new vscode.WorkspaceEdit();
        const document = editor.document;
        const range = endLine >= document.lineCount
            ? new vscode.Range(field.lineIndex > 0 ? document.lineAt(field.lineIndex - 1).range.end : new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end)
            : new vscode.Range(field.lineIndex, 0, endLine, 0);
        workspaceEdit.delete(document.uri, range);
        if (!(await applyWorkspaceEdit(workspaceEdit, `delete field ${field.name}`))) {
            return undefined;
        };
    };
    return fields.map(field => field.name);
};
