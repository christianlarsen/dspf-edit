/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.set-reference-file.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute, attributesFileLevel } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument,
    findElementInsertionPointFileFirstLine,
    applyWorkspaceEdit
} from '../dspf-edit.utils/dspf-edit.helper';
import { validateLibraryFileName } from './dspf-edit.edit-field';
import { RefKeywordTarget, parseRefKeyword, clearResolvedRef } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';

/** Column (0-based) where a keyword starts: position 45. */
const KEYWORD_COLUMN = 44;
/** Last usable source position for a keyword: position 80. */
const LAST_COLUMN = 80;

// COMMAND REGISTRATION

/**
 * Registers the "Reference File" command for the file node: adds, changes or removes the
 * file-level REF keyword, which names the database file referenced fields (position 29 `R`) take
 * their definition from when their own REFFLD() doesn't name one. DDS allows it only once, and
 * only at file level.
 * @param context - The VS Code extension context
 */
export function setReferenceFile(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.set-reference-file", async (node: DdsNode) => {
            await handleSetReferenceFileCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the "Reference File" command for the file node.
 * @param node - The DDS node the command was invoked from
 */
async function handleSetReferenceFileCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        if (node?.ddsElement.kind !== 'file') {
            vscode.window.showWarningMessage('REF can only be set at file level.');
            return;
        };

        const existing = attributesFileLevel.find(attr => /^REF\(/i.test(attr.value.trim()));
        const current = existing ? parseRefKeyword(existing.value) : undefined;

        if (existing) {
            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(edit) Change REF', action: 'change' as const },
                    { label: '$(trash) Remove REF', action: 'remove' as const },
                    { label: 'Cancel', action: 'cancel' as const }
                ],
                {
                    title: `The file has ${existing.value.trim()}`,
                    placeHolder: 'Referenced fields with no file in their own REFFLD() take their definition from this file'
                }
            );
            if (!action || action.action === 'cancel') {
                return;
            };

            if (action.action === 'remove') {
                if (!(await replaceRefLines(editor, existing, undefined))) {
                    return;
                };
                clearResolvedRef(document.uri.toString());
                vscode.window.showInformationMessage('REF removed from the file.');
                return;
            };
        };

        const target = await collectRefTarget(current);
        if (!target) {
            return;
        };

        const newLines = createRefLines(target);
        const success = existing
            ? await replaceRefLines(editor, existing, newLines)
            : await insertRefLines(editor, newLines);
        if (!success) {
            return;
        };

        // Fields already resolved against the old REF file would otherwise keep showing its
        // definitions — dropping the document's cache makes them pending again.
        clearResolvedRef(document.uri.toString());
        vscode.window.showInformationMessage(`${formatRefKeyword(target)} set on the file.`);
    } catch (error) {
        console.error('Error managing REF:', error);
        vscode.window.showErrorMessage('An error occurred while managing REF.');
    };
};

// USER INTERACTION

/**
 * Asks for the REF keyword's library, file and record format, prefilled with the current values.
 * @param current - The file's current REF target, if any
 * @returns The new target, or undefined if cancelled
 */
async function collectRefTarget(current: RefKeywordTarget | undefined): Promise<RefKeywordTarget | undefined> {
    const library = await vscode.window.showInputBox({
        title: 'Reference file (REF) - Step 1/3',
        prompt: 'Enter library name (max 10 characters), *LIBL or *CURLIB, or leave empty to use the library list (*LIBL)',
        placeHolder: 'LIBRARY (optional)',
        value: current?.library ?? '',
        validateInput: value => ['*LIBL', '*CURLIB'].includes(value.trim().toUpperCase())
            ? null
            : validateLibraryFileName(value, 'Library', false)
    });
    if (library === undefined) {
        return undefined;
    };

    const file = await vscode.window.showInputBox({
        title: 'Reference file (REF) - Step 2/3',
        prompt: 'Enter the database file name (max 10 characters)',
        placeHolder: 'FILE',
        value: current?.file ?? '',
        validateInput: value => validateLibraryFileName(value, 'File')
    });
    if (!file) {
        return undefined;
    };

    const recordFormat = await vscode.window.showInputBox({
        title: 'Reference file (REF) - Step 3/3',
        prompt: 'Enter record format name (max 10 characters), or leave empty to search every record format of the file in order',
        placeHolder: 'RECORD FORMAT (optional)',
        value: current?.recordFormat ?? '',
        validateInput: value => validateLibraryFileName(value, 'Record format', false)
    });
    if (recordFormat === undefined) {
        return undefined;
    };

    return {
        library: library.trim() === '' ? undefined : library.trim().toUpperCase(),
        file: file.trim().toUpperCase(),
        recordFormat: recordFormat.trim() === '' ? undefined : recordFormat.trim().toUpperCase()
    };
};

// DDS MODIFICATION FUNCTIONS

/** Builds the REF keyword text: REF([library/]file [record-format]). */
function formatRefKeyword(target: RefKeywordTarget): string {
    const qualifiedFile = target.library ? `${target.library}/${target.file}` : target.file;
    return target.recordFormat ? `REF(${qualifiedFile} ${target.recordFormat})` : `REF(${qualifiedFile})`;
};

/**
 * Builds the REF keyword source line(s), keyword starting at position 45. Option indicators aren't
 * valid on REF, so columns 7-16 are left blank. A fully qualified REF with a record format can be
 * longer than positions 45-80 hold; the record format then goes on a continuation line.
 * @param target - The REF target to write
 */
function createRefLines(target: RefKeywordTarget): string[] {
    const prefix = '     A'.padEnd(KEYWORD_COLUMN, ' ');
    const keyword = formatRefKeyword(target);
    if (KEYWORD_COLUMN + keyword.length <= LAST_COLUMN) {
        return [prefix + keyword];
    };

    const qualifiedFile = target.library ? `${target.library}/${target.file}` : target.file;
    return [
        `${prefix}REF(${qualifiedFile} -`,
        `${prefix}${target.recordFormat})`
    ];
};

/**
 * Inserts the REF line(s) among the file-level keywords: right after DSPSIZ when the file has one,
 * before any CA/CF keys — where real STRSDA puts it — otherwise before the first file-level line.
 * @param editor - The active text editor
 * @param newLines - The REF source line(s)
 */
async function insertRefLines(editor: vscode.TextEditor, newLines: string[]): Promise<boolean> {
    const document = editor.document;
    const dspsiz = attributesFileLevel.find(attr => /^DSPSIZ\(/i.test(attr.value.trim()));
    const insertionPoint = dspsiz
        ? (dspsiz.lastLineIndex ?? dspsiz.lineIndex) + 1
        : findElementInsertionPointFileFirstLine(editor);
    if (insertionPoint < 0) {
        vscode.window.showErrorMessage('Could not find insertion point for REF.');
        return false;
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const text = newLines.join('\n');
    if (insertionPoint >= document.lineCount) {
        workspaceEdit.insert(document.uri, new vscode.Position(document.lineCount, 0), '\n' + text);
    } else {
        workspaceEdit.insert(document.uri, new vscode.Position(insertionPoint, 0), text + '\n');
    };

    return applyWorkspaceEdit(workspaceEdit, 'set REF');
};

/**
 * Replaces the existing REF line(s), including any continuation lines, with new ones — or removes
 * them entirely when no new lines are given.
 * @param editor - The active text editor
 * @param existing - The current REF attribute
 * @param newLines - The replacement source line(s), or undefined to remove REF
 */
async function replaceRefLines(editor: vscode.TextEditor, existing: DdsAttribute, newLines: string[] | undefined): Promise<boolean> {
    const document = editor.document;
    const lastLine = existing.lastLineIndex ?? existing.lineIndex;
    const workspaceEdit = new vscode.WorkspaceEdit();

    if (newLines) {
        const range = new vscode.Range(existing.lineIndex, 0, lastLine, document.lineAt(lastLine).text.length);
        workspaceEdit.replace(document.uri, range, newLines.join('\n'));
        return applyWorkspaceEdit(workspaceEdit, 'change REF');
    };

    if (lastLine === document.lineCount - 1 && existing.lineIndex > 0) {
        const prevLineEnd = document.lineAt(existing.lineIndex - 1).range.end;
        workspaceEdit.delete(document.uri, new vscode.Range(prevLineEnd, document.lineAt(lastLine).range.end));
    } else {
        workspaceEdit.delete(document.uri, new vscode.Range(existing.lineIndex, 0, lastLine + 1, 0));
    };
    return applyWorkspaceEdit(workspaceEdit, 'remove REF');
};
