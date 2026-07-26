/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.move-fields.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fileSizeAttributes, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, findEndLineIndex, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';

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
 * Registers the move field left (1 position) command.
 * @param context - The VS Code extension context
 */
export function moveFieldLeft1(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.moveFieldLeft1", async (node: DdsNode) => {
            await handleMoveFieldCommand(node, -1);
        })
    );
}

/**
 * Registers the move field left (5 positions) command.
 * @param context - The VS Code extension context
 */
export function moveFieldLeft5(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.moveFieldLeft5", async (node: DdsNode) => {
            await handleMoveFieldCommand(node, -5);
        })
    );
}

/**
 * Registers the move field right (1 position) command.
 * @param context - The VS Code extension context
 */
export function moveFieldRight1(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.moveFieldRight1", async (node: DdsNode) => {
            await handleMoveFieldCommand(node, 1);
        })
    );
}

/**
 * Registers the move field right (5 positions) command.
 * @param context - The VS Code extension context
 */
export function moveFieldRight5(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.moveFieldRight5", async (node: DdsNode) => {
            await handleMoveFieldCommand(node, 5);
        })
    );
}

// COMMAND HANDLER

/**
 * Handles the move field command for an existing DDS field.
 * @param node - The DDS node containing the field to move
 * @param offset - The number of positions to move (negative for left, positive for right)
 */
async function handleMoveFieldCommand(node: DdsNode, offset: number): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        }

        const element = node.ddsElement;

        // Validate that the element is a field
        if (element.kind !== "field") {
            vscode.window.showWarningMessage("Only fields can be moved.");
            return;
        }

        // Check if the record is a subfile (SFL) - in subfiles, fields use row instead of column
        const isSflRecord = isSubfileRecord(element.recordname);

        // Calculate new position based on whether it's a subfile or not
        const currentPosition = isSflRecord ? element.row : element.column;
        
        if (!currentPosition) {
            vscode.window.showWarningMessage(`Cannot move field. No position information available.`);
            return;
        }

        const newPosition = currentPosition + offset;
        // This command only ever moves a field horizontally, so the bound is always the column
        // limit — regardless of record type. For a subfile, currentPosition already came from
        // element.row precisely because that's where the column value is stored for SFL records.
        const maxPosition = getMaxCols();

        // Validate new position
        if (newPosition < 1) {
            vscode.window.showWarningMessage(`Cannot move field. Minimum position is 1.`);
            return;
        }

        if (newPosition > maxPosition) {
            vscode.window.showWarningMessage(`Cannot move field. Maximum position is ${maxPosition}.`);
            return;
        }

        // Apply the field update with new position
        if (!(await moveFieldToNewPosition(editor, element, newPosition))) {
            return;
        };

        // Set focus on the editor and position cursor on the field
        await vscode.window.showTextDocument(editor.document, {
            viewColumn: editor.viewColumn,
            preserveFocus: false
        });

        // Position cursor at the beginning of the field name
        const fieldPosition = new vscode.Position(element.lineIndex, 18); // Start of field name
        editor.selection = new vscode.Selection(fieldPosition, fieldPosition);
        editor.revealRange(
            new vscode.Range(fieldPosition, fieldPosition),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

    } catch (error) {
        console.error('Error moving field:', error);
        vscode.window.showErrorMessage('An error occurred while moving the field.');
    }
}

// FIELD MOVEMENT FUNCTIONS

/**
 * Moves a field to a new column position by updating the column spec in the source line.
 * The raw source columns 38-41 (line/row spec) and 41-44 (position/col spec) always keep that
 * same meaning regardless of record type — a subfile only swaps which of those raw values ends up
 * labeled element.row vs element.column internally (see isSubfileRecord's caller), the physical
 * columns themselves never swap. Since this command always moves horizontally, it always writes
 * the new value to the column spec (41-44).
 * @param editor - The active text editor
 * @param element - The field element to move
 * @param newPosition - The new column value
 */
async function moveFieldToNewPosition(
    editor: vscode.TextEditor,
    element: any,
    newPosition: number
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

    return applyWorkspaceEdit(workspaceEdit, 'move the field');
}