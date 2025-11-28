/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.move-fields.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fileSizeAttributes } from '../dspf-edit.model/dspf-edit.model';
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

        // Calculate new column position
        const newColumn = (element.column) ? element.column + offset : element.column;
        const maxCols = getMaxCols();

        // Validate new position
        if (!newColumn || newColumn < 1) {
            vscode.window.showWarningMessage(`Cannot move field.`);
            return;
        }

        if (newColumn > maxCols) {
            vscode.window.showWarningMessage(`Cannot move field. Maximum column is ${maxCols}.`);
            return;
        }

        // Apply the field update with new position
        await moveFieldToNewColumn(editor, element, newColumn);

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
 * Moves a field to a new column position by updating only the column field.
 * @param editor - The active text editor
 * @param element - The field element to move
 * @param newColumn - The new column position
 */
async function moveFieldToNewColumn(
    editor: vscode.TextEditor,
    element: any,
    newColumn: number
): Promise<void> {
    const uri = editor.document.uri;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const endLineIndex = findEndLineIndex(editor.document, element.lineIndex);

    // Format the new column value (3 characters, right-aligned)
    const formattedCol = String(newColumn).padStart(3, ' ');

    // Update only the column positions (characters 42-44, 0-indexed: 41-43)
    // We need to update all lines of the field (first line only, as column is only on first line)
    const firstLine = editor.document.lineAt(element.lineIndex);
    
    // Replace characters at positions 41-43 (0-indexed) with new column value
    const range = new vscode.Range(
        element.lineIndex, 41,  // Start at position 41 (column field start)
        element.lineIndex, 44   // End at position 44 (column field end)
    );

    workspaceEdit.replace(uri, range, formattedCol);

    await vscode.workspace.applyEdit(workspaceEdit);
}