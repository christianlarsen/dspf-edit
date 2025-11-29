/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.move-fields.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fileSizeAttributes, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, findEndLineIndex } from '../dspf-edit.utils/dspf-edit.helper';

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
        const maxCols = getMaxCols();

        // Validate new position
        if (newPosition < 1) {
            vscode.window.showWarningMessage(`Cannot move field. Minimum position is 1.`);
            return;
        }

        if (newPosition > maxCols) {
            vscode.window.showWarningMessage(`Cannot move field. Maximum position is ${maxCols}.`);
            return;
        }

        // Apply the field update with new position
        await moveFieldToNewPosition(editor, element, newPosition);

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
 * Moves a field to a new position by updating either the column or row field.
 * For subfile records, it updates the row position. For regular records, it updates the column position.
 * @param editor - The active text editor
 * @param element - The field element to move
 * @param newPosition - The new position value (column or row depending on record type)
 * @param isSubfileRecord - Whether the field belongs to a subfile record (SFL)
 */
async function moveFieldToNewPosition(
    editor: vscode.TextEditor,
    element: any,
    newPosition: number
): Promise<void> {
    const uri = editor.document.uri;
    const workspaceEdit = new vscode.WorkspaceEdit();

    // Format the new position value (3 characters, right-aligned)
    const formattedPos = String(newPosition).padStart(3, ' ');

    // Determine which field to update based on record type
    const startCol = 41;
    const endCol = 44;
    
    // Replace characters at the appropriate positions with new value
    const range = new vscode.Range(
        element.lineIndex, startCol,  // Start position
        element.lineIndex, endCol     // End position
    );

    workspaceEdit.replace(uri, range, formattedPos);

    await vscode.workspace.applyEdit(workspaceEdit);
}