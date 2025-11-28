/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.window-resize.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fileSizeAttributes, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

/**
 * Window positioning options.
 */
type WindowPosition = 'CENTERED' | 'BOTTOM_CENTERED';

/**
 * Window resize operation types.
 */
type ResizeOperation = 'CHANGE_SIZE' | 'AUTO_ADJUST';

/**
 * Current window dimensions from WINDOW keyword.
 */
interface CurrentWindowDimensions {
    startRow: number;
    startCol: number;
    numRows: number;
    numCols: number;
    windowLine : number;
};

/**
 * Window resize configuration.
 */
interface WindowResizeConfig {
    operation: ResizeOperation;
    newDimensions?: {
        numRows: number;
        numCols: number;
        position: WindowPosition;
    };
    autoAdjustConfig?: {
        position: WindowPosition;
    };
};

/**
 * Field/constant positioning information for auto-adjust calculation.
 */
interface FieldPosition {
    name?: string;
    row: number;
    col: number;
    length: number;
    isConstant: boolean;
};

// COMMAND REGISTRATION

/**
 * Registers the window resize command for DDS window records.
 * Allows users to resize existing windows with WINDOW keyword.
 * @param context - The VS Code extension context
 */
export function windowResize(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.window-resize", async (node: DdsNode) => {
            await handleWindowResizeCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the window resize command workflow.
 * Validates that the record has WINDOW keyword and provides resize options.
 * @param node - The DDS node containing the window record
 */
async function handleWindowResizeCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };
        
        const element = node.ddsElement;

        // Validate element type - only records can have windows
        if (element.kind !== "record") {
            vscode.window.showWarningMessage("Window resize can only be applied to record formats.");
            return;
        };

        // Check if record has WINDOW keyword
        const currentWindow = findCurrentWindowDimensions(editor, element);
        if (!currentWindow) {
            vscode.window.showWarningMessage(`Record '${element.name}' does not have a WINDOW keyword.`);
            return;
        };

        // Show current window information
        const currentInfo = `Current: ${currentWindow.numRows}x${currentWindow.numCols} at (${currentWindow.startRow},${currentWindow.startCol})`;
        const windowLine = currentWindow.windowLine;

        // Collect resize configuration from user
        const resizeConfig = await collectWindowResizeConfiguration(currentInfo, element);
        if (!resizeConfig) {
            // User cancelled the operation
            return;
        };

        // Calculate new dimensions based on operation
        const newDimensions = await calculateNewDimensions(resizeConfig, currentWindow, editor, element);
        if (!newDimensions) {
            vscode.window.showErrorMessage("Unable to calculate new window dimensions.");
            return;
        };

        // Apply the window resize
        await applyWindowResize(editor, element, windowLine, newDimensions);
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        // Show success message
        const operationLabel = resizeConfig.operation === 'CHANGE_SIZE' ? 'resized' : 'auto-adjusted';
        vscode.window.showInformationMessage(
            `Successfully ${operationLabel} window '${element.name}' to ${newDimensions.numRows}x${newDimensions.numCols} at (${newDimensions.startRow},${newDimensions.startCol}).`
        );

    } catch (error) {
        console.error('Error resizing window:', error);
        vscode.window.showErrorMessage('An error occurred while resizing the window.');
    };
};

// USER INPUT COLLECTION FUNCTIONS

/**
 * Collects window resize configuration from user through interactive dialogs.
 * @param currentInfo - Current window information string
 * @param element - The record element for context
 * @returns Window resize configuration or null if user cancelled
 */
async function collectWindowResizeConfiguration(currentInfo: string, element: any): Promise<WindowResizeConfig | null> {
    // Step 1: Choose resize operation
    const operation = await collectResizeOperation(currentInfo);
    if (!operation) return null;

    if (operation === 'CHANGE_SIZE') {
        // Step 2a: Collect new size and position
        const newSize = await collectNewWindowSize();
        if (!newSize) return null;

        const position = await collectWindowPosition();
        if (!position) return null;

        return {
            operation: 'CHANGE_SIZE',
            newDimensions: {
                numRows: newSize.numRows,
                numCols: newSize.numCols,
                position
            }
        };
    } else {
        // Step 2b: Collect position for auto-adjust
        const position = await collectWindowPosition();
        if (!position) return null;

        return {
            operation: 'AUTO_ADJUST',
            autoAdjustConfig: {
                position
            }
        };
    };
};

/**
 * Collects resize operation type from user.
 * @param currentInfo - Current window information for display
 * @returns Selected resize operation or null if cancelled
 */
async function collectResizeOperation(currentInfo: string): Promise<ResizeOperation | null> {
    const operationOptions: vscode.QuickPickItem[] = [
        { 
            label: "CHANGE_SIZE", 
            description: "Specify new window size",
            detail: "Enter custom width and height for the window"
        },
        { 
            label: "AUTO_ADJUST", 
            description: "Auto-adjust to fit content",
            detail: "Calculate optimal size based on fields and constants"
        }
    ];

    const selection = await vscode.window.showQuickPick(operationOptions, {
        title: `Resize Window - ${currentInfo}`,
        placeHolder: "Select resize operation",
        canPickMany: false,
        ignoreFocusOut: true
    });

    return (selection?.label as ResizeOperation) || null;
};

/**
 * Collects new window size when changing size manually.
 * @returns New window size or null if cancelled
 */
async function collectNewWindowSize(): Promise<{ numRows: number; numCols: number } | null> {
    const maxRows = fileSizeAttributes.maxRow1 || 24;
    const maxCols = fileSizeAttributes.maxCol1 || 80;

    const numRows = await vscode.window.showInputBox({
        title: 'Window Resize - New Size',
        prompt: `Enter number of rows (1-${maxRows})`,
        placeHolder: "10",
        validateInput: (value) => validateNumericRange(value, 1, maxRows, "Number of rows")
    });
    if (!numRows) return null;

    const numCols = await vscode.window.showInputBox({
        title: 'Window Resize - New Size',
        prompt: `Enter number of columns (1-${maxCols})`,
        placeHolder: "50", 
        validateInput: (value) => validateNumericRange(value, 1, maxCols, "Number of columns")
    });
    if (!numCols) return null;

    return {
        numRows: Number(numRows),
        numCols: Number(numCols)
    };
};

/**
 * Collects window positioning preference.
 * @returns Window position or null if cancelled
 */
async function collectWindowPosition(): Promise<WindowPosition | null> {
    const positionOptions: vscode.QuickPickItem[] = [
        { 
            label: "CENTERED", 
            description: "Center the window on screen",
            detail: "Window will be positioned in the center of the display"
        },
        { 
            label: "BOTTOM_CENTERED", 
            description: "Center horizontally, position at bottom",
            detail: "Window will be centered horizontally and positioned at the bottom"
        }
    ];

    const selection = await vscode.window.showQuickPick(positionOptions, {
        title: 'Window Resize - Position',
        placeHolder: "Select window position",
        canPickMany: false,
        ignoreFocusOut: true
    });

    return (selection?.label as WindowPosition) || null;
};

// WINDOW ANALYSIS FUNCTIONS

/**
 * Finds current window dimensions from WINDOW keyword in the record.
 * @param editor - The text editor
 * @param element - The record element
 * @returns Current window dimensions or null if not found
 */
function findCurrentWindowDimensions(editor: vscode.TextEditor, element: any): CurrentWindowDimensions | null {
    const currentRecord = fieldsPerRecords.find(record => 
        element.lineIndex >= record.startIndex && element.lineIndex <= record.endIndex
    );
    
    if (!currentRecord?.attributes) {
        return null;
    }

    const windowAttribute = currentRecord.attributes.find(attr => 
        attr.value.startsWith('WINDOW(')
    );

    if (windowAttribute) {
        // WINDOW(startRow startCol numRows numCols)
        const match = windowAttribute.value.match(/WINDOW\((\d+) (\d+) (\d+) (\d+)\)/);
        if (match) {
            return {
                startRow: parseInt(match[1]),
                startCol: parseInt(match[2]),
                numRows: parseInt(match[3]),
                numCols: parseInt(match[4]),
                windowLine : windowAttribute.lineIndex
            };
        };
    };

    return null;
};

/**
 * Checks if a line represents the start of a new record.
 * @param lineText - The line text to check
 * @returns true if this is a new record line
 */
function isNextRecord(lineText: string): boolean {
    // Check if this is a record definition line (has 'R' in position 17)
    return lineText.length > 17 && lineText.charAt(16) === 'R';
};

/**
 * Analyzes fields and constants in the record to determine optimal window size.
 * @param editor - The text editor
 * @param element - The record element
 * @returns Optimal dimensions based on content
 */
function analyzeRecordContent(editor: vscode.TextEditor, element: any): { numRows: number; numCols: number } {
    const positions: FieldPosition[] = [];
    
    // Get field and constant positions from the model
    const recordInfo = fieldsPerRecords.find(r => r.record === element.name);
    if (!recordInfo) {
        // If no record info found, return minimum dimensions
        return {
            numRows: Math.min(5, (fileSizeAttributes.maxRow1 || 24) - 2),
            numCols: Math.min(20, (fileSizeAttributes.maxCol1 || 80) - 2)
        };
    };

    // Process fields from the model
    recordInfo.fields.forEach(field => {
        if (field.row && field.col && field.length) {
            positions.push({
                name: field.name,
                row: field.row,
                col: field.col,
                length: field.length,
                isConstant: false
            });
        };
    });

    // Process constants from the model (this was missing!)
    recordInfo.constants.forEach(constant => {
        if (constant.row && constant.col && constant.length) {
            positions.push({
                name: constant.name,
                row: constant.row,
                col: constant.col,
                length: constant.length,
                isConstant: true
            });
        };
    });

    // If no positions found, return minimum dimensions
    if (positions.length === 0) {
        return {
            numRows: Math.min(5, (fileSizeAttributes.maxRow1 || 24) - 2),
            numCols: Math.min(20, (fileSizeAttributes.maxCol1 || 80) - 2)
        };
    };

    // Calculate minimum window size needed
    let maxRow = 1;
    let maxCol = 1;

    positions.forEach(pos => {
        maxRow = Math.max(maxRow, pos.row);
        maxCol = Math.max(maxCol, pos.col + pos.length - 1);
    });

    // Add padding for usability
    const numRows = Math.max(5, maxRow) + 1;        // Minimum 5 rows, +1 for padding
    const numCols = Math.max(20, maxCol + 4);       // Minimum 20 columns, +4 for padding

    // Ensure we don't exceed screen limits
    const maxRows = fileSizeAttributes.maxRow1 || 24;
    const maxCols = fileSizeAttributes.maxCol1 || 80;

    return {
        numRows: Math.min(numRows, maxRows - 2), // Leave space for positioning
        numCols: Math.min(numCols, maxCols - 2)
    };
};

// DIMENSION CALCULATION FUNCTIONS

/**
 * Calculates new window dimensions based on resize configuration.
 * @param config - The resize configuration
 * @param currentWindow - Current window dimensions
 * @param editor - The text editor
 * @param element - The record element
 * @returns New window dimensions or null if invalid
 */
async function calculateNewDimensions(
    config: WindowResizeConfig, 
    currentWindow: CurrentWindowDimensions,
    editor: vscode.TextEditor,
    element: any
): Promise<CurrentWindowDimensions | null> {
    let targetSize: { numRows: number; numCols: number };

    if (config.operation === 'CHANGE_SIZE' && config.newDimensions) {
        targetSize = {
            numRows: config.newDimensions.numRows,
            numCols: config.newDimensions.numCols
        };
    } else if (config.operation === 'AUTO_ADJUST' && config.autoAdjustConfig) {
        targetSize = analyzeRecordContent(editor, element);
    } else {
        return null;
    };

    // Calculate new position based on size and position preference
    const position = config.operation === 'CHANGE_SIZE' 
        ? config.newDimensions!.position 
        : config.autoAdjustConfig!.position;

    return calculateWindowPosition(targetSize, position);
};

/**
 * Calculates window position based on size and position preference.
 * @param size - Target window size
 * @param position - Position preference
 * @returns Calculated window dimensions or null if invalid
 */
function calculateWindowPosition(
    size: { numRows: number; numCols: number }, 
    position: WindowPosition
): CurrentWindowDimensions | null {
    const maxRows = fileSizeAttributes.maxRow1 || 24;
    const maxCols = fileSizeAttributes.maxCol1 || 80;

    // Validate that window fits on screen
    if (size.numRows > maxRows || size.numCols > maxCols) {
        return null;
    };

    let startRow: number;
    let startCol: number;

    switch (position) {
        case 'CENTERED':
            startRow = Math.floor((maxRows - size.numRows) / 2) + 1;
            startCol = Math.floor((maxCols - size.numCols) / 2) + 1;
            break;

        case 'BOTTOM_CENTERED':
            const startRowCalculated = maxRows - size.numRows - 2;
            startRow = (startRowCalculated > 0) ? startRowCalculated : 1;
            startCol = Math.floor((maxCols - size.numCols) / 2) + 1;
            break;

        default:
            return null;
    };

    // Final validation - ensure window doesn't go off screen
    if (startRow < 1 || startCol < 1 || 
        startRow + size.numRows - 1 > maxRows || 
        startCol + size.numCols - 1 > maxCols) {
        return null;
    };

    return {
        startRow,
        startCol,
        numRows: size.numRows,
        numCols: size.numCols,
        windowLine : 0
    };
};

// WINDOW UPDATE FUNCTIONS

/**
 * Applies the window resize by updating the WINDOW keyword line.
 * @param editor - The text editor
 * @param element - The record element
 * @param windowLine - Window line
 * @param newDimensions - New window dimensions
 */
async function applyWindowResize(
    editor: vscode.TextEditor,
    element: any,
    windowLine : number,
    newDimensions: CurrentWindowDimensions
): Promise<void> {

/*    const windowLine = findWindowKeywordLine(editor, element);
    if (windowLine === -1) {
        throw new Error('Could not find WINDOW keyword line to update');
    };
*/
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const line = editor.document.lineAt(windowLine);
    const lineText = line.text;

    // Replace the WINDOW keyword parameters
    const oldWindowPattern = /WINDOW\(\d+\s+\d+\s+\d+\s+\d+\)/;
    const newWindowKeyword = `WINDOW(${newDimensions.startRow} ${newDimensions.startCol} ${newDimensions.numRows} ${newDimensions.numCols})`;
    
    const updatedLine = lineText.replace(oldWindowPattern, newWindowKeyword);
    workspaceEdit.replace(uri, line.range, updatedLine);

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Finds the line number containing the WINDOW keyword for the record.
 * @param editor - The text editor
 * @param element - The record element
 * @returns Line number or -1 if not found
 */
function findWindowKeywordLine(editor: vscode.TextEditor, element: any): number {
    const startLine = element.lineIndex;

    // Search for WINDOW keyword in record and its attribute lines
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;

        // Stop searching when we reach the next record or non-attribute line
        if (i > startLine && (!lineText.trim().startsWith('A ') || isNextRecord(lineText))) {
            break;
        };

        // Look for WINDOW keyword
        if (lineText.includes('WINDOW(')) {
            return i;
        };
    };

    return -1;
};

// VALIDATION HELPER FUNCTIONS

/**
 * Validates numeric input within a specified range.
 * @param value - Input value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fieldName - Field name for error messages
 * @returns Error message or null if valid
 */
function validateNumericRange(value: string, min: number, max: number, fieldName: string): string | null {
    if (!value || value.trim() === '') {
        return `${fieldName} cannot be empty.`;
    };

    const num = Number(value.trim());
    if (isNaN(num)) {
        return `${fieldName} must be a valid number.`;
    };

    if (num < min || num > max) {
        return `${fieldName} must be between ${min} and ${max}.`;
    };

    return null;
};