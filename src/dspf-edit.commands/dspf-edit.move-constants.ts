/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.move-constants.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fileSizeAttributes, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, findEndLineIndex, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';
import { RecordPreviewPanel } from '../dspf-edit.webview/dspf-edit.record-preview-panel';

/**
 * Gets the maximum columns value from fileSizeAttributes
 */
function getMaxCols(): number {
    const maxCol1 = fileSizeAttributes.maxCol1 || 0;
    const maxCol2 = fileSizeAttributes.maxCol2 || 0;
    const maxCol = Math.max(maxCol1, maxCol2);
    return maxCol > 0 ? maxCol : 132;
}

/**
 * Checks if a record is a subfile record by looking for the SFL attribute
 * @param recordName - The name of the record to check
 * @returns True if the record has the SFL attribute
 */
function isSubfileRecord(recordName: string): boolean {
    const record = fieldsPerRecords.find(r => r.record === recordName);

    if (!record || !record.attributes) {
        return false;
    }

    return record.attributes.some(attr => attr.value === 'SFL');
}

// COMMAND REGISTRATION FUNCTIONS

/**
 * Registers the move constant left (1 position) command.
 * @param context - The VS Code extension context
 */
export function moveConstantLeft1(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.moveConstantLeft1", async (node: DdsNode) => {
            await handleMoveConstantCommand(node, -1);
        })
    );
}

/**
 * Registers the move constant left (5 positions) command.
 * @param context - The VS Code extension context
 */
export function moveConstantLeft5(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.moveConstantLeft5", async (node: DdsNode) => {
            await handleMoveConstantCommand(node, -5);
        })
    );
}

/**
 * Registers the move constant right (1 position) command.
 * @param context - The VS Code extension context
 */
export function moveConstantRight1(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.moveConstantRight1", async (node: DdsNode) => {
            await handleMoveConstantCommand(node, 1);
        })
    );
}

/**
 * Registers the move constant right (5 positions) command.
 * @param context - The VS Code extension context
 */
export function moveConstantRight5(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.moveConstantRight5", async (node: DdsNode) => {
            await handleMoveConstantCommand(node, 5);
        })
    );
}

// COMMAND HANDLER

/**
 * Handles the move constant command for an existing DDS constant.
 * @param node - The DDS node containing the constant to move
 * @param offset - The number of positions to move (negative for left, positive for right)
 */
async function handleMoveConstantCommand(node: DdsNode, offset: number): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        }

        const element = node.ddsElement;

        // Validate that the element is a constant
        if (element.kind !== "constant") {
            vscode.window.showWarningMessage("Only constants can be moved.");
            return;
        }

        // Check if the record is a subfile (SFL) - in subfiles, constants use row instead of column
        const isSflRecord = isSubfileRecord(element.recordname);

        // Calculate new position based on whether it's a subfile or not
        const currentPosition = isSflRecord ? element.row : element.column;
        
        if (!currentPosition) {
            vscode.window.showWarningMessage(`Cannot move constant. No position information available.`);
            return;
        }

        const newPosition = currentPosition + offset;
        // This command only ever moves a constant horizontally, so the bound is always the column
        // limit — regardless of record type. For a subfile, currentPosition already came from
        // element.row precisely because that's where the column value is stored for SFL records.
        const maxPosition = getMaxCols();

        // Validate new position
        if (newPosition < 1) {
            vscode.window.showWarningMessage(`Cannot move constant. Minimum position is 1.`);
            return;
        }

        if (newPosition > maxPosition) {
            vscode.window.showWarningMessage(`Cannot move constant. Maximum position is ${maxPosition}.`);
            return;
        }

        // The row spec (raw source columns 38-41) is written alongside the column move even though
        // this command never changes it. Under DDS's relative record format that spec can be blank
        // in the source (row inherited from the preceding field/constant) — leaving it blank here
        // would be fine positionally (the parser re-derives the same inherited row on reparse), but
        // it also means the tree can show a stale/empty row until that reparse lands, and it silently
        // drops the relative-format hint. Materializing it as an explicit number keeps the source
        // and the tree in sync immediately and matches what dragging in the preview panel already does.
        const rawRow = isSflRecord ? element.column : element.row;

        // Apply the constant update with new position
        if (!(await moveConstantToNewPosition(editor, element, newPosition, rawRow))) {
            return;
        };

        // Reveal the constant's new position in the source editor (skips stealing focus if the
        // preview panel's focus mode is on, so it doesn't undo the maximized preview).
        const constantPosition = new vscode.Position(element.lineIndex, 44); // Start of constant value
        await RecordPreviewPanel.revealInSourceEditor(editor, constantPosition);

    } catch (error) {
        console.error('Error moving constant:', error);
        vscode.window.showErrorMessage('An error occurred while moving the constant.');
    }
}

// CONSTANT MOVEMENT FUNCTIONS

/**
 * Moves a constant to a new column position by updating the column spec in the source line, and
 * materializes the row spec alongside it (see the call site's comment on rawRow) so a row left
 * blank under the DDS relative record format becomes an explicit number.
 * The raw source columns 38-41 (line/row spec) and 41-44 (position/col spec) always keep that
 * same meaning regardless of record type — a subfile only swaps which of those raw values ends up
 * labeled element.row vs element.column internally (see isSubfileRecord's caller), the physical
 * columns themselves never swap. Since this command always moves horizontally, it always writes
 * the new value to the column spec (41-44).
 * @param editor - The active text editor
 * @param element - The constant element to move
 * @param newPosition - The new column value
 * @param rawRow - The row spec value to (re)write at columns 38-41, undefined to leave it as-is
 */
async function moveConstantToNewPosition(
    editor: vscode.TextEditor,
    element: any,
    newPosition: number,
    rawRow: number | undefined
): Promise<boolean> {
    const uri = editor.document.uri;
    const workspaceEdit = new vscode.WorkspaceEdit();

    // Format the new position value (3 characters, right-aligned)
    const formattedPos = String(newPosition).padStart(3, ' ');

    // Replace characters at the appropriate positions with new value
    const range = new vscode.Range(
        element.lineIndex, 41,  // Start position
        element.lineIndex, 44   // End position
    );

    workspaceEdit.replace(uri, range, formattedPos);

    if (rawRow !== undefined) {
        const formattedRow = String(rawRow).padStart(3, ' ');
        workspaceEdit.replace(uri, new vscode.Range(element.lineIndex, 38, element.lineIndex, 41), formattedRow);
    };

    return applyWorkspaceEdit(workspaceEdit, 'move the constant');
}