/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.window-resize.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fileSizeAttributes, fieldsPerRecords, getAvailableDisplayFormats, getSizeForFormat } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';

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
 * Current window dimensions from a WINDOW keyword.
 */
interface CurrentWindowDimensions {
    startRow: number;
    startCol: number;
    numRows: number;
    numCols: number;
    windowLine : number;
    /** Display format (e.g. "*DS3") this line is conditioned on, or undefined if unconditioned
     * (applies to every declared format). */
    format?: string;
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
 * Validates that the record has WINDOW keyword and provides resize options. When the record has more
 * than one WINDOW() line (one per declared DSPSIZ display format), all of them are resized together:
 * the user picks one size/position preference, and it's applied to every declared format, each
 * repositioned according to its own screen size — mirroring how a new window is created (see
 * `dspf-edit.new-record.ts`'s `calculateWindowDimensionsForAllFormats`).
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

        // Check if record has one or more WINDOW keyword lines (one per declared display format)
        const currentWindows = findCurrentWindowDimensions(editor, element);
        if (currentWindows.length === 0) {
            vscode.window.showWarningMessage(`Record '${element.name}' does not have a WINDOW keyword.`);
            return;
        };

        // Show current window information
        const currentInfo = currentWindows.length === 1
            ? `Current: ${currentWindows[0].numRows}x${currentWindows[0].numCols} at (${currentWindows[0].startRow},${currentWindows[0].startCol})`
            : `Current: ${currentWindows[0].numRows}x${currentWindows[0].numCols} (${currentWindows.length} display sizes declared)`;

        // Collect resize configuration from user
        const resizeConfig = await collectWindowResizeConfiguration(currentInfo, element);
        if (!resizeConfig) {
            // User cancelled the operation
            return;
        };

        // Calculate new dimensions for every existing WINDOW line, each positioned according to its
        // own declared format's screen size (or the file default, when unconditioned).
        const newDimensionsList: CurrentWindowDimensions[] = [];
        for (const currentWindow of currentWindows) {
            const newDimensions = await calculateNewDimensionsForWindow(resizeConfig, currentWindow, editor, element);
            if (!newDimensions) {
                vscode.window.showErrorMessage("Unable to calculate new window dimensions.");
                return;
            };
            newDimensionsList.push(newDimensions);
        };

        // Apply the window resize
        if (!(await applyWindowResize(editor, newDimensionsList))) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        // Show success message
        const operationLabel = resizeConfig.operation === 'CHANGE_SIZE' ? 'resized' : 'auto-adjusted';
        const dimensionsSummary = newDimensionsList.length === 1
            ? `${newDimensionsList[0].numRows}x${newDimensionsList[0].numCols} at (${newDimensionsList[0].startRow},${newDimensionsList[0].startCol})`
            : newDimensionsList.map(d => `${d.format ?? 'default'}: ${d.numRows}x${d.numCols} at (${d.startRow},${d.startCol})`).join(', ');
        vscode.window.showInformationMessage(
            `Successfully ${operationLabel} window '${element.name}' — ${dimensionsSummary}.`
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
 * Collects new window size when changing size manually. Bounded by the smallest declared display
 * size (DSPSIZ format), when the file declares more than one, so the same rows/cols fit on every
 * screen a WINDOW() line will be written for.
 * @returns New window size or null if cancelled
 */
async function collectNewWindowSize(): Promise<{ numRows: number; numCols: number } | null> {
    const declaredFormats = getAvailableDisplayFormats();
    const maxRows = declaredFormats.length > 0
        ? Math.min(...declaredFormats.map(f => f.rows))
        : (fileSizeAttributes.maxRow1 || 24);
    const maxCols = declaredFormats.length > 0
        ? Math.min(...declaredFormats.map(f => f.cols))
        : (fileSizeAttributes.maxCol1 || 80);

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
 * Resolves the screen bounds (rows/cols) a WINDOW() line should be positioned within: the declared
 * display format's own size when the line is conditioned on one, else the file's default size.
 * @param format - Display format name (e.g. "*DS3") the line is conditioned on, or undefined
 */
function getScreenBoundsForFormat(format?: string): { maxRows: number; maxCols: number } {
    if (format) {
        const size = getSizeForFormat(format);
        if (size) {
            return { maxRows: size.rows, maxCols: size.cols };
        };
    };

    return {
        maxRows: fileSizeAttributes.maxRow1 || 24,
        maxCols: fileSizeAttributes.maxCol1 || 80
    };
};

/**
 * Finds current window dimensions from every WINDOW keyword line in the record — normally one, but
 * two when the file declares more than one DSPSIZ display format and the window was created/split
 * per-format (see `dspf-edit.new-record.ts` and the preview's split-on-edit logic).
 * @param editor - The text editor
 * @param element - The record element
 * @returns Current window dimensions for each WINDOW() line found, in source order
 */
function findCurrentWindowDimensions(editor: vscode.TextEditor, element: any): CurrentWindowDimensions[] {
    const currentRecord = fieldsPerRecords.find(record =>
        element.lineIndex >= record.startIndex && element.lineIndex <= record.endIndex
    );

    if (!currentRecord?.attributes) {
        return [];
    }

    const windowAttributes = currentRecord.attributes.filter(attr =>
        attr.value.startsWith('WINDOW(')
    );

    const results: CurrentWindowDimensions[] = [];
    for (const windowAttribute of windowAttributes) {
        // WINDOW(startRow startCol numRows numCols)
        const match = windowAttribute.value.match(/WINDOW\((\d+) (\d+) (\d+) (\d+)(?: [^)]*)?\)/);
        if (match) {
            results.push({
                startRow: parseInt(match[1]),
                startCol: parseInt(match[2]),
                numRows: parseInt(match[3]),
                numCols: parseInt(match[4]),
                windowLine: windowAttribute.lineIndex,
                format: windowAttribute.displayFormat
            });
        };
    };

    return results;
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
 * @param maxRows - Screen rows to clamp the result within
 * @param maxCols - Screen columns to clamp the result within
 * @returns Optimal dimensions based on content
 */
function analyzeRecordContent(editor: vscode.TextEditor, element: any, maxRows: number, maxCols: number): { numRows: number; numCols: number } {
    const positions: FieldPosition[] = [];

    // Get field and constant positions from the model
    const recordInfo = fieldsPerRecords.find(r => r.record === element.name);
    if (!recordInfo) {
        // If no record info found, return minimum dimensions
        return {
            numRows: Math.min(5, maxRows - 2),
            numCols: Math.min(20, maxCols - 2)
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
            numRows: Math.min(5, maxRows - 2),
            numCols: Math.min(20, maxCols - 2)
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
    return {
        numRows: Math.min(numRows, maxRows - 2), // Leave space for positioning
        numCols: Math.min(numCols, maxCols - 2)
    };
};

// DIMENSION CALCULATION FUNCTIONS

/**
 * Calculates new dimensions for a single existing WINDOW() line, positioned within its own declared
 * format's screen bounds (or the file default, when unconditioned).
 * @param config - The resize configuration
 * @param currentWindow - The existing WINDOW() line being resized
 * @param editor - The text editor
 * @param element - The record element
 * @returns New window dimensions (carrying the same line/format as `currentWindow`) or null if invalid
 */
async function calculateNewDimensionsForWindow(
    config: WindowResizeConfig,
    currentWindow: CurrentWindowDimensions,
    editor: vscode.TextEditor,
    element: any
): Promise<CurrentWindowDimensions | null> {
    const { maxRows, maxCols } = getScreenBoundsForFormat(currentWindow.format);
    let targetSize: { numRows: number; numCols: number };

    if (config.operation === 'CHANGE_SIZE' && config.newDimensions) {
        targetSize = {
            numRows: config.newDimensions.numRows,
            numCols: config.newDimensions.numCols
        };
    } else if (config.operation === 'AUTO_ADJUST' && config.autoAdjustConfig) {
        targetSize = analyzeRecordContent(editor, element, maxRows, maxCols);
    } else {
        return null;
    };

    // Calculate new position based on size and position preference
    const position = config.operation === 'CHANGE_SIZE'
        ? config.newDimensions!.position
        : config.autoAdjustConfig!.position;

    const positioned = calculateWindowPosition(targetSize, position, maxRows, maxCols);
    if (!positioned) {
        return null;
    };

    return {
        ...positioned,
        windowLine: currentWindow.windowLine,
        format: currentWindow.format
    };
};

/**
 * Calculates window position based on size and position preference, within the given screen bounds.
 * @param size - Target window size
 * @param position - Position preference
 * @param maxRows - Screen rows to position within
 * @param maxCols - Screen columns to position within
 * @returns Calculated window dimensions or null if invalid
 */
function calculateWindowPosition(
    size: { numRows: number; numCols: number },
    position: WindowPosition,
    maxRows: number,
    maxCols: number
): CurrentWindowDimensions | null {
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
 * Applies the window resize by updating every WINDOW() line's keyword parameters, one edit per
 * line, applied together as a single workspace edit.
 * @param editor - The text editor
 * @param newDimensionsList - New dimensions for each existing WINDOW() line (same order/count as
 * the `currentWindows` they were computed from)
 */
async function applyWindowResize(
    editor: vscode.TextEditor,
    newDimensionsList: CurrentWindowDimensions[]
): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Replace the WINDOW keyword parameters, preserving any trailing suffix (e.g. *NOMSGLIN)
    const oldWindowPattern = /WINDOW\(\d+\s+\d+\s+\d+\s+\d+(\s+[^)]*)?\)/;

    for (const newDimensions of newDimensionsList) {
        const line = editor.document.lineAt(newDimensions.windowLine);
        const updatedLine = line.text.replace(
            oldWindowPattern,
            (_match, suffix) => `WINDOW(${newDimensions.startRow} ${newDimensions.startCol} ${newDimensions.numRows} ${newDimensions.numCols}${suffix ?? ''})`
        );
        workspaceEdit.replace(uri, line.range, updatedLine);
    };

    return applyWorkspaceEdit(workspaceEdit, 'resize the window');
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
