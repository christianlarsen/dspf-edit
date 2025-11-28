/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.move-constants.ts
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

        // Calculate new column position
        const newColumn = element.column + offset;
        const maxCols = getMaxCols();

        // Validate new position
        if (newColumn < 1) {
            vscode.window.showWarningMessage(`Cannot move constant. Minimum column is 1.`);
            return;
        }

        if (newColumn > maxCols) {
            vscode.window.showWarningMessage(`Cannot move constant. Maximum column is ${maxCols}.`);
            return;
        }

        // Apply the constant update with new position
        await moveConstantToNewColumn(editor, element, newColumn);

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
 * Moves a constant to a new column position by updating only the column field.
 * @param editor - The active text editor
 * @param element - The constant element to move
 * @param newColumn - The new column position
 */
async function moveConstantToNewColumn(
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
    // We need to update all lines of the constant (first line only, as column is only on first line)
    const firstLine = editor.document.lineAt(element.lineIndex);
    
    // Replace characters at positions 41-43 (0-indexed) with new column value
    const range = new vscode.Range(
        element.lineIndex, 41,  // Start at position 41 (column field start)
        element.lineIndex, 44   // End at position 44 (column field end)
    );

    workspaceEdit.replace(uri, range, formattedCol);

    await vscode.workspace.applyEdit(workspaceEdit);
}