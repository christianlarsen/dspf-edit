/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.subfile-record-number.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { AttributeWithIndicators, FieldInfo, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument,
    findElementInsertionPoint,
    insertKeywordLines,
    replaceKeywordTextInLines,
    applyWorkspaceEdit
} from '../dspf-edit.utils/dspf-edit.helper';
import { removeWholeKeyword } from './dspf-edit.conditioned-keywords';
import { validateFieldNameFormat } from './dspf-edit.edit-field';
import {
    HiddenFieldDefinition,
    findField,
    describeFieldDefinition,
    isNamedByRecordKeywords,
    hiddenFieldLine,
    insertHiddenFieldLines,
    renameFieldLine,
    deleteUnusedFields
} from './dspf-edit.hidden-fields';

/**
 * SFLRCDNBR (Subfile Record Number), a field-level keyword of the subfile control record: the
 * field holds the relative record number of the subfile record whose page is shown —
 * SFLRCDNBR[([CURSOR] [*TOP])]. CURSOR also puts the cursor on that record, and *TOP shows it first
 * on the page. The field must be signed numeric (S), up to 4 digits, 0 decimal positions, and used
 * as output, both or hidden; it's created as 4S 0 H. Option indicators are not valid for it.
 */

// INTERFACES AND TYPES

/** The SFLCTL record's field that has SFLRCDNBR, and the keyword itself. */
interface RecordNumberField {
    field: FieldInfo;
    attr: AttributeWithIndicators;
};

interface OptionsItem extends vscode.QuickPickItem {
    value: string;
};

interface MenuItem extends vscode.QuickPickItem {
    action: 'options' | 'field' | 'remove';
};

// CONSTANTS

const RECORD_NUMBER_FIELD: HiddenFieldDefinition = { type: 'S', length: 4, decimals: 0 };
const SUGGESTED_NAME = 'RCDNBR';

// COMMAND REGISTRATION

/**
 * Registers the "Subfile Record Number" command for subfile control (SFLCTL) records.
 * @param context - The VS Code extension context
 */
export function addSubfileRecordNumber(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.subfile-record-number", async (node: DdsNode) => {
            await handleSubfileRecordNumberCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the "Subfile Record Number" command: adds SFLRCDNBR to a field of the subfile control
 * record (creating the field when there's none with that name), or changes its options, moves it to
 * another field or removes it.
 * @param node - The DDS node the command was invoked from
 */
async function handleSubfileRecordNumberCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const record = node.ddsElement;
        if (record.kind !== 'record' || !record.attributes?.some(attr => /^SFLCTL\(/i.test(attr.value.trim()))) {
            vscode.window.showWarningMessage('SFLRCDNBR can only be set on a field of a subfile control (SFLCTL) record.');
            return;
        };
        const recordName = record.name;

        const current = findRecordNumberField(recordName);
        if (!current) {
            await addRecordNumber(editor, recordName);
            return;
        };

        const choice = await vscode.window.showQuickPick<MenuItem>([
            { action: 'options', label: '$(symbol-enum) Change options...', description: optionsOf(current.attr.value) || '(none)' },
            { action: 'field', label: '$(symbol-field) Change field...', description: current.field.name },
            { action: 'remove', label: '$(trash) Remove' }
        ], {
            title: `Subfile Record Number for ${recordName} — ${current.field.name} ${current.attr.value}`,
            placeHolder: 'Select what to change',
            ignoreFocusOut: true
        });
        if (!choice) {
            return;
        };

        if (choice.action === 'options') {
            const options = await pickOptions(optionsOf(current.attr.value));
            if (options === undefined || options === optionsOf(current.attr.value)) {
                return;
            };
            const keywordText = buildKeywordText(options);
            if (!(await replaceKeywordTextInLines(editor, current.attr.lineIndex, current.attr.lastLineIndex, current.attr.value, keywordText))) {
                return;
            };
            await nudgeCursor();
            vscode.window.showInformationMessage(`${keywordText} set on field ${current.field.name}.`);
        } else if (choice.action === 'field') {
            await changeRecordNumberField(editor, recordName, current);
        } else {
            if (!(await removeKeyword(editor, current))) {
                return;
            };
            const deleted = await offerToDeleteField(editor, recordName, current.field);
            if (deleted === undefined) return;
            await nudgeCursor();
            vscode.window.showInformationMessage(`SFLRCDNBR removed from field ${current.field.name}${deleted.length > 0 ? ' (field deleted)' : ''}.`);
        };
    } catch (error) {
        console.error('Error managing SFLRCDNBR:', error);
        vscode.window.showErrorMessage('An error occurred while managing SFLRCDNBR.');
    };
};

// ADDING AND CHANGING

/** Adds SFLRCDNBR: asks for the field and the options, then writes it on that field, creating it if needed. */
async function addRecordNumber(editor: vscode.TextEditor, recordName: string): Promise<void> {
    const name = await askFieldName(recordName, undefined);
    if (!name) {
        return;
    };
    const options = await pickOptions(undefined);
    if (options === undefined) {
        return;
    };
    const keywordText = buildKeywordText(options);

    const existing = findField(editor, recordName, name);
    const written = existing
        ? await addKeywordToField(editor, existing, keywordText)
        : await insertHiddenFieldLines(editor, recordName, [hiddenFieldLine(name, RECORD_NUMBER_FIELD, keywordText)]);
    if (!written) {
        return;
    };
    await nudgeCursor();
    vscode.window.showInformationMessage(`${keywordText} set on ${existing ? 'field' : 'new field'} ${name}.`);
};

/**
 * Changes the field that has SFLRCDNBR. A name no field has yet renames the current field; the name
 * of another field moves the keyword to it, and the old field can then be deleted.
 */
async function changeRecordNumberField(editor: vscode.TextEditor, recordName: string, current: RecordNumberField): Promise<void> {
    const name = await askFieldName(recordName, current.field.name);
    if (!name || name === current.field.name) {
        return;
    };

    const target = findField(editor, recordName, name);
    if (!target) {
        if (!(await renameFieldLine(editor, current.field, name))) return;
        await nudgeCursor();
        vscode.window.showInformationMessage(`Field ${current.field.name} renamed to ${name}.`);
        return;
    };

    // Moving: the keyword comes off the old field first, then goes on the new one, re-read since
    // removing it may have taken a line out above.
    if (!(await removeKeyword(editor, current))) return;
    const moved = findField(editor, recordName, name);
    if (!moved || !(await addKeywordToField(editor, moved, current.attr.value))) return;
    const deleted = await offerToDeleteField(editor, recordName, current.field);
    if (deleted === undefined) return;

    await nudgeCursor();
    vscode.window.showInformationMessage(`${current.attr.value} moved from field ${current.field.name} to ${name}${deleted.length > 0 ? ` (${current.field.name} deleted)` : ''}.`);
};

/**
 * Asks for the field's name, rejecting one already defined in a way SFLRCDNBR doesn't allow.
 * @param recordName - The SFLCTL record
 * @param currentName - The field that has it now, or undefined when adding
 */
async function askFieldName(recordName: string, currentName: string | undefined): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
        title: `Subfile Record Number for ${recordName}`,
        prompt: 'Field with the relative record number of the record whose page is shown. A name no field has yet '
            + (currentName ? 'renames the field' : 'creates a hidden 4S 0 field'),
        value: currentName ?? SUGGESTED_NAME,
        placeHolder: SUGGESTED_NAME,
        ignoreFocusOut: true,
        validateInput: input => {
            const name = input.trim().toUpperCase();
            const formatError = validateFieldNameFormat(name);
            if (formatError) return formatError;
            if (name === currentName) return null;
            const existing = fieldsPerRecords.find(r => r.record === recordName)?.fields.find(f => f.name.toUpperCase() === name);
            return existing ? fieldProblem(existing) : null;
        }
    });
    return value === undefined ? undefined : value.trim().toUpperCase();
};

/**
 * Asks for the keyword's options.
 * @param current - The current options ('' for none), to mark them, or undefined when adding
 * @returns The options to write ('' for none), or undefined if cancelled
 */
async function pickOptions(current: string | undefined): Promise<string | undefined> {
    const mark = (value: string) => current === value ? ' (current)' : '';
    const picked = await vscode.window.showQuickPick<OptionsItem>([
        { value: '', label: 'SFLRCDNBR', description: `Shows the page with that record${mark('')}` },
        { value: 'CURSOR', label: 'SFLRCDNBR(CURSOR)', description: `Also puts the cursor on that record${mark('CURSOR')}` },
        { value: '*TOP', label: 'SFLRCDNBR(*TOP)', description: `Shows that record first on the page${mark('*TOP')}` },
        { value: 'CURSOR *TOP', label: 'SFLRCDNBR(CURSOR *TOP)', description: `Both${mark('CURSOR *TOP')}` }
    ], {
        title: 'Subfile Record Number - Options',
        placeHolder: 'Select how the record is shown',
        ignoreFocusOut: true
    });
    return picked?.value;
};

// SOURCE EDITS

/** Puts the keyword on the field's own line when its keyword area is free, or on a line of its own below it. */
async function addKeywordToField(editor: vscode.TextEditor, field: FieldInfo, keywordText: string): Promise<boolean> {
    const line = editor.document.lineAt(field.lineIndex);
    if (line.text.substring(44).trim() === '' && 44 + keywordText.length <= 80) {
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(editor.document.uri, line.range, line.text.padEnd(44, ' ') + keywordText);
        return applyWorkspaceEdit(workspaceEdit, `add ${keywordText}`);
    };
    return insertKeywordLines(editor, findElementInsertionPoint(editor, { lineIndex: field.lineIndex }), keywordText);
};

/** Removes the keyword from its field, keeping the field's own line. */
async function removeKeyword(editor: vscode.TextEditor, current: RecordNumberField): Promise<boolean> {
    return removeWholeKeyword(editor, { lineIndex: current.field.lineIndex }, {
        keywordText: current.attr.value,
        lineIndex: current.attr.lineIndex,
        lastLineIndex: current.attr.lastLineIndex
    });
};

/** Offers to delete a field left without SFLRCDNBR, when it's hidden and no record keyword names it. */
async function offerToDeleteField(editor: vscode.TextEditor, recordName: string, field: FieldInfo): Promise<string[] | undefined> {
    const isHidden = (field.usage || '').toUpperCase() === 'H';
    if (!isHidden || isNamedByRecordKeywords(editor, recordName, field.name)) {
        return [];
    };
    return deleteUnusedFields(editor, recordName, 'SFLRCDNBR', [field.name]);
};

// SMALL HELPERS

/** The SFLCTL record's field that has SFLRCDNBR, if any. */
function findRecordNumberField(recordName: string): RecordNumberField | undefined {
    for (const field of fieldsPerRecords.find(r => r.record === recordName)?.fields ?? []) {
        const attr = field.attributes.find(a => /^SFLRCDNBR(\(|$)/i.test(a.value.trim()));
        if (attr) {
            return { field, attr };
        };
    };
    return undefined;
};

/** The keyword's options as written: '' for none, 'CURSOR', '*TOP' or 'CURSOR *TOP'. */
function optionsOf(keywordText: string): string {
    const match = keywordText.match(/^SFLRCDNBR\(\s*([^)]*?)\s*\)$/i);
    if (!match) {
        return '';
    };
    const tokens = match[1].toUpperCase().split(/\s+/).filter(Boolean);
    return ['CURSOR', '*TOP'].filter(option => tokens.includes(option)).join(' ');
};

function buildKeywordText(options: string): string {
    return options ? `SFLRCDNBR(${options})` : 'SFLRCDNBR';
};

/** Why an existing field can't have SFLRCDNBR, or null when it can. */
function fieldProblem(field: FieldInfo): string | null {
    const usage = (field.usage || 'O').toUpperCase();
    const fits = !field.referenced
        && (field.type || '').toUpperCase() === 'S'
        && field.length <= 4
        && (field.decimals ?? 0) === 0
        && ['O', 'B', 'H'].includes(usage);
    if (!fits) {
        return `${field.name} is defined as ${describeFieldDefinition(field)}, but SFLRCDNBR needs a signed numeric (S) field of up to 4 digits with no decimals, used as output (O), both (B) or hidden (H).`;
    };
    if (field.attributes.some(a => /^SFLROLVAL(\(|$)/i.test(a.value.trim()))) {
        return `${field.name} has SFLROLVAL, which can't go on the same field as SFLRCDNBR.`;
    };
    return null;
};

/** Nudges the cursor so the tree and preview pick up the edit, as every command here does. */
async function nudgeCursor(): Promise<void> {
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');
};
