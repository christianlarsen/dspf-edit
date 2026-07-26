/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.add-commands-record.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';
import { validateRecordName } from './dspf-edit.new-record';
import { findRecordInsertionPoint } from './dspf-edit.add-buttons';

// COMMAND REGISTRATION

/**
 * Registers the "Add Commands Record" command: given a subfile control (SFLCTL) record, creates a
 * new, empty record right after it meant to hold the subfile's function-key legend (e.g.
 * "F3=Exit", "F12=Cancel"), which is conventionally kept on a separate record from the SFLCTL
 * itself.
 *
 * When the SFLCTL declares its own WINDOW(startRow startCol rows cols) directly, that window (and
 * any WDWTITLE()/WDWBORDER() that go with it — both only take effect on whichever record actually
 * owns the window) is moved onto the new record instead (one set per display format, if
 * conditioned by more than one), and the SFLCTL is left with a WINDOW(newRecordName) reference —
 * the same "commands record owns the shared window, SFLCTL borrows it" pattern real-world DDS
 * commonly uses, since the legend text then lives in the same window as the subfile it describes.
 * @param context - The VS Code extension context
 */
export function addCommandsRecord(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-commands-record", async (node: DdsNode) => {
            await handleAddCommandsRecordCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the "Add Commands Record" command for a subfile control (SFLCTL) record.
 * @param node - The DDS node the command was invoked from
 */
async function handleAddCommandsRecordCommand(node: DdsNode): Promise<void> {
    const { editor, document } = checkForEditorAndDocument();
    if (!document || !editor) {
        return;
    };

    if (node.ddsElement.kind !== 'record') {
        vscode.window.showWarningMessage('A commands record can only be added from a record.');
        return;
    };
    const sflCtlRecordName = node.ddsElement.name;

    const recordInfo = fieldsPerRecords.find(r => r.record === sflCtlRecordName);
    const isSflCtl = recordInfo?.attributes?.some(attr => attr.value.toUpperCase().startsWith('SFLCTL(')) ?? false;
    if (!isSflCtl) {
        vscode.window.showWarningMessage('A commands record can only be added from a subfile control (SFLCTL) record.');
        return;
    };

    // A reference-form WINDOW(otherRecordName) means this subfile's window is already owned by
    // another record — nothing to move, and creating a second commands record wouldn't have a
    // window to draw in. Only a direct, numeric WINDOW() can be moved onto the new record.
    const windowAttrs = recordInfo?.attributes?.filter(attr => attr.value.toUpperCase().startsWith('WINDOW(')) ?? [];
    const numericWindowAttrs = windowAttrs.filter(attr => /^WINDOW\(\s*\d+\s+\d+\s+\d+\s+\d+(?:\s+[^)]*)?\s*\)$/i.test(attr.value));
    if (windowAttrs.length > 0 && numericWindowAttrs.length === 0) {
        vscode.window.showWarningMessage(`This subfile's window is already owned by another record (${windowAttrs[0].value}).`);
        return;
    };

    // WDWTITLE()/WDWBORDER() only have any effect on the record that owns the real window, so they
    // move along with it — left behind on the SFLCTL they'd just be dead keywords once it's turned
    // into a reference.
    const titleAttrs = numericWindowAttrs.length > 0
        ? (recordInfo?.attributes?.filter(attr => attr.value.toUpperCase().startsWith('WDWTITLE(')) ?? [])
        : [];
    const borderAttrs = numericWindowAttrs.length > 0
        ? (recordInfo?.attributes?.filter(attr => attr.value.toUpperCase().startsWith('WDWBORDER(')) ?? [])
        : [];

    const recordName = await vscode.window.showInputBox({
        title: 'Add Commands Record',
        prompt: 'Enter the name for the new commands record',
        placeHolder: 'FOOTER',
        validateInput: validateRecordName
    });
    if (!recordName) {
        return;
    };
    const newRecordName = recordName.toUpperCase();

    const insertionLine = findRecordInsertionPoint(sflCtlRecordName);
    if (insertionLine === null) {
        vscode.window.showErrorMessage('Could not determine where to insert the new record.');
        return;
    };

    if (!(await insertCommandsRecord(document, insertionLine, newRecordName, numericWindowAttrs, titleAttrs, borderAttrs))) {
        return;
    };

    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');

    vscode.window.showInformationMessage(`Commands record '${newRecordName}' added. Use "Add Constant" on it to add the function-key texts.`);
};

/**
 * All source lines an attribute spans, verbatim — more than one when it was written across
 * continuation lines (e.g. a wrapped WDWTITLE()/WDWBORDER()).
 * @param document - The DDS source document
 * @param attr - The attribute to read
 */
function fullAttributeLines(document: vscode.TextDocument, attr: DdsAttribute): string[] {
    const lastLine = attr.lastLineIndex ?? attr.lineIndex;
    const lines: string[] = [];
    for (let i = attr.lineIndex; i <= lastLine; i++) {
        lines.push(document.lineAt(i).text);
    };
    return lines;
};

/**
 * Inserts the new commands record right after the SFLCTL record it documents (whether or not
 * that's the end of the document), carrying over the SFLCTL's own WINDOW()/WDWTITLE()/WDWBORDER()
 * lines verbatim (one set per display format, if more than one) — and, in the same edit, rewrites
 * the WINDOW() lines on the SFLCTL into a WINDOW(newRecordName) reference and removes its
 * WDWTITLE()/WDWBORDER() lines entirely (they moved with the window).
 * @param document - The DDS source document
 * @param insertionLine - Line index to insert the new record at
 * @param recordName - Name of the new record
 * @param windowAttrsToMove - The SFLCTL's own numeric WINDOW() attributes, if any, to move over
 * @param titleAttrsToMove - The SFLCTL's own WDWTITLE() attributes, if any, to move over
 * @param borderAttrsToMove - The SFLCTL's own WDWBORDER() attributes, if any, to move over
 */
async function insertCommandsRecord(
    document: vscode.TextDocument,
    insertionLine: number,
    recordName: string,
    windowAttrsToMove: DdsAttribute[],
    titleAttrsToMove: DdsAttribute[],
    borderAttrsToMove: DdsAttribute[]
): Promise<boolean> {
    const bodyLines = [
        ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R ' + recordName.padEnd(10, ' '),
        ' '.repeat(5) + 'A' + ' '.repeat(38) + 'OVERLAY',
        ...windowAttrsToMove.flatMap(attr => fullAttributeLines(document, attr)),
        ...titleAttrsToMove.flatMap(attr => fullAttributeLines(document, attr)),
        ...borderAttrsToMove.flatMap(attr => fullAttributeLines(document, attr))
    ];

    const workspaceEdit = new vscode.WorkspaceEdit();
    const insertPos = new vscode.Position(insertionLine, 0);

    if (insertPos.line >= document.lineCount) {
        workspaceEdit.insert(document.uri, insertPos, '\n' + bodyLines.join('\n'));
    } else {
        workspaceEdit.insert(document.uri, insertPos, bodyLines.join('\n') + '\n');
    };

    for (const attr of windowAttrsToMove) {
        const line = document.lineAt(attr.lineIndex);
        const updatedLine = line.text.replace(
            /WINDOW\(\s*\d+\s+\d+\s+\d+\s+\d+(?:\s+[^)]*)?\s*\)/i,
            `WINDOW(${recordName})`
        );
        workspaceEdit.replace(document.uri, line.range, updatedLine);
    };

    for (const attr of [...titleAttrsToMove, ...borderAttrsToMove]) {
        const lastLine = attr.lastLineIndex ?? attr.lineIndex;
        workspaceEdit.delete(document.uri, new vscode.Range(attr.lineIndex, 0, lastLine + 1, 0));
    };

    return applyWorkspaceEdit(workspaceEdit, 'add the commands record');
};
