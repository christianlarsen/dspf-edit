/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.move-constants.ts
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
    
    return record.attributes.some(attr => attr.attribute === 'SFL');
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
        const maxCols = getMaxCols();

        // Validate new position
        if (newPosition < 1) {
            vscode.window.showWarningMessage(`Cannot move constant. Minimum position is 1.`);
            return;
        }

        if (newPosition > maxCols) {
            vscode.window.showWarningMessage(`Cannot move constant. Maximum position is ${maxCols}.`);
            return;
        }

        // Apply the constant update with new position
        await moveConstantToNewPosition(editor, element, newPosition, isSflRecord);

        // Set focus on the editor and position cursor on the constant
        await vscode.window.showTextDocument(editor.document, {
            viewColumn: editor.viewColumn,
            preserveFocus: false
        });

        // Position cursor at the beginning of the constant
        const constantPosition = new vscode.Position(element.lineIndex, 44); // Start of constant value
        editor.selection = new vscode.Selection(constantPosition, constantPosition);
        editor.revealRange(
            new vscode.Range(constantPosition, constantPosition),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

    } catch (error) {
        console.error('Error moving constant:', error);
        vscode.window.showErrorMessage('An error occurred while moving the constant.');
    }
}

// CONSTANT MOVEMENT FUNCTIONS

/**
 * Moves a constant to a new position by updating either the column or row field.
 * For subfile records, it updates the row position. For regular records, it updates the column position.
 * @param editor - The active text editor
 * @param element - The constant element to move
 * @param newPosition - The new position value (column or row depending on record type)
 * @param isSubfileRecord - Whether the constant belongs to a subfile record (SFL)
 */
async function moveConstantToNewPosition(
    editor: vscode.TextEditor,
    element: any,
    newPosition: number,
    isSubfileRecord: boolean
): Promise<void> {
    const uri = editor.document.uri;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const endLineIndex = findEndLineIndex(editor.document, element.lineIndex);

    // Format the new position value (3 characters, right-aligned)
    const formattedPos = String(newPosition).padStart(3, ' ');

    // Determine which field to update based on record type
    // Subfile records: Column field at characters 42-44 (0-indexed: 41-43)
    // Normal records: Row field at characters 39-41 (0-indexed: 38-40)
    const startCol = isSubfileRecord ? 41 : 38;
    const endCol = isSubfileRecord ? 44 : 41;
    
    // Replace characters at the appropriate positions with new value
    const range = new vscode.Range(
        element.lineIndex, startCol,  // Start position
        element.lineIndex, endCol     // End position
    );

    workspaceEdit.replace(uri, range, formattedPos);

    await vscode.workspace.applyEdit(workspaceEdit);
}