/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.center.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { getRecordSize, SYSTEM_FIELD_PLACEHOLDER } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';

// POSITION CENTERING FUNCTIONALITY

/**
 * Registers the center position command for DDS fields and constants.
 * This command centers elements horizontally within their record's window size.
 * @param context - The VS Code extension context
 */
export function centerPosition(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.center", async (node: DdsNode) => {
            await handleCenterCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the center position command for a given DDS node.
 * Validates the element, calculates the center position, and applies the changes.
 * @param node - The DDS node to center
 */
async function handleCenterCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const element = node.ddsElement;
        // Validate element type and properties
        const validationResult = validateElementForCentering(element);
        if (!validationResult.isValid) {
            vscode.window.showWarningMessage(validationResult.message);
            return;
        };

        // Get record window size
        if (!('recordname' in element)) {
            return;
        };
        const windowSize = getRecordSize(element.recordname);
        if (!windowSize) {
            vscode.window.showWarningMessage("Unable to retrieve window size.");
            return;
        };

        // Calculate new center position
        const newPosition = calculateCenterPosition(element, windowSize.cols);
        if (!newPosition) {
            vscode.window.showWarningMessage("Unable to calculate center position.");
            return;
        };

        // Apply the position change
        if (!(await applyPositionChange(editor, element, newPosition))) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');
        
        // Show success message
        vscode.window.showInformationMessage(
            `${element.name} centered in ${windowSize.cols} columns`
        );

    } catch (error) {
        console.error('Error centering element:', error);
        vscode.window.showErrorMessage('An error occurred while centering the element.');
    };
};

// VALIDATION FUNCTIONS

/**
 * Validates if an element can be centered.
 * @param element - The DDS element to validate
 * @returns Validation result with success status and error message if applicable
 */
function validateElementForCentering(element: any): { isValid: boolean; message: string } {
    // Check if element is a field or constant
    if (element.kind !== "field" && element.kind !== "constant") {
        return {
            isValid: false,
            message: "Only fields and constants can be centered."
        };
    };

    // Check if field is referenced (referenced fields cannot be centered)
    if (element.kind === "field" && element.referenced === true) {
        return {
            isValid: false,
            message: "Referenced fields cannot be centered."
        };
    };

    return { isValid: true, message: "" };
};

// POSITION CALCULATION FUNCTIONS

/**
 * Calculates the center position for a DDS element within the given column width.
 * @param element - The DDS element to center
 * @param maxCols - Maximum number of columns available
 * @returns Object containing the new row and column positions, or null if calculation fails
 */
function calculateCenterPosition(element: any, maxCols: number): { row: number; col: number } | null {
    const newRow = element.row;
    let newCol: number;

    switch (element.kind) {
        case 'constant':
            newCol = calculateConstantCenterPosition(element, maxCols);
            break;
        case 'field':
            newCol = calculateFieldCenterPosition(element, maxCols);
            break;
        default:
            return null;
    };

    // Validate calculated column position
    if (!newCol || newCol < 1) {
        return null;
    };

    return { row: newRow, col: newCol };
};

/**
 * Calculates the center position for a constant element.
 * @param element - The constant element
 * @param maxCols - Maximum number of columns available
 * @returns The calculated center column position
 */
function calculateConstantCenterPosition(element: any, maxCols: number): number {
    const contentLength = getElementDisplayWidth(element.name);
    return Math.floor((maxCols - contentLength) / 2) + 1;
};

/**
 * Calculates the center position for a field element.
 * @param element - The field element
 * @param maxCols - Maximum number of columns available
 * @returns The calculated center column position
 */
function calculateFieldCenterPosition(element: any, maxCols: number): number {
    // A system keyword field (DATE, USER...) always displays at its own fixed width, regardless
    // of whatever the source's own length column holds (typically blank/0 for these).
    const systemWidth = SYSTEM_FIELD_PLACEHOLDER[String(element.name).trim().toUpperCase()]?.length;
    // A CNTFLD(n)-wrapped field displays only n characters per line (wrapping onto further rows
    // below, all at this same column) — centering must use that per-line width, not the field's
    // full declared length, or it lands miles off-screen for a long wrapped field.
    const continuedWidth = getContinuedFieldWidth(element.attributes);
    const width = systemWidth ?? (continuedWidth && element.length > continuedWidth ? continuedWidth : element.length);

    if (width) {
        return Math.floor((maxCols - width) / 2) + 1;
    } else {
        // If no length is available, keep the current column position
        return element.column;
    };
};

/**
 * Extracts a field's CNTFLD() continuation width, if it carries one — the number of characters
 * shown per line before wrapping to the next row (same column) for a field too long to fit on one line.
 * @param attributes - The field's DDS attributes
 */
function getContinuedFieldWidth(attributes: any[] | undefined): number | undefined {
    const attr = attributes?.find((a: any) => /^CNTFLD\(/i.test(a.value));
    const width = attr?.value.match(/^CNTFLD\(\s*(\d+)\s*\)$/i)?.[1];
    return width ? Number(width) : undefined;
};

/**
 * Resolves how wide a constant actually displays: a system keyword (DATE, USER...) coded bare, at
 * its own fixed width; a quoted literal ('...'), its text without the surrounding quotes; anything
 * else, as-is (defensive fallback — the parser always keeps constants in one of the first two forms).
 * @param name - The constant's raw source name (as parsed, before any quote-stripping)
 */
function getElementDisplayWidth(name: string): number {
    const systemPlaceholder = SYSTEM_FIELD_PLACEHOLDER[name.trim().toUpperCase()];
    if (systemPlaceholder) {
        return systemPlaceholder.length;
    };

    return name.length >= 2 && name.startsWith("'") && name.endsWith("'") ? name.length - 2 : name.length;
};

// FILE MODIFICATION FUNCTIONS

/**
 * Applies the calculated position change to the document.
 * @param editor - The active text editor
 * @param element - The DDS element being moved
 * @param newPosition - The new position coordinates
 */
async function applyPositionChange(
    editor: vscode.TextEditor,
    element: any,
    newPosition: { row: number; col: number }
): Promise<boolean> {
    const lineIndex = element.lineIndex;
    const line = editor.document.lineAt(lineIndex).text;

    // Create the updated line with new position
    const updatedLine = createUpdatedLine(line, newPosition.row, newPosition.col);

    // Apply the workspace edit
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    workspaceEdit.replace(
        uri, 
        new vscode.Range(lineIndex, 0, lineIndex, line.length), 
        updatedLine
    );

    return applyWorkspaceEdit(workspaceEdit, 'center the element');
};

/**
 * Creates an updated line with the new row and column positions.
 * Updates positions 38-40 (row) and 41-43 (column) in the DDS line format.
 * @param originalLine - The original line text
 * @param newRow - The new row position
 * @param newCol - The new column position
 * @returns The updated line with new positions
 */
function createUpdatedLine(originalLine: string, newRow: number, newCol: number): string {
    // Format row and column with proper padding
    const formattedRow = String(newRow).padStart(3, ' ');
    const formattedCol = String(newCol).padStart(3, ' ');

    // DDS format: positions 38-40 for row, 41-43 for column
    // Replace the position section (characters 38-43) with new values
    return originalLine.substring(0, 38) + formattedRow + formattedCol + originalLine.substring(44);
};

