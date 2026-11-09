/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.window-resize.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fileSizeAttributes, fieldsPerRecords, getAvailableDisplayFormats, getSizeForFormat } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';
import { parseWindowDefinition, rewriteWindowDefinition, describeRuntimeWindowPlacement, windowPositionFieldNames, RUNTIME_WINDOW_ORIGIN, WindowDefinition } from '../dspf-edit.parser/dspf-edit.parser';
import { WindowPositionFields, collectWindowPositionFields, createMissingWindowPositionFields, deleteUnusedWindowPositionFields, windowStartFieldNames, windowStartText } from './dspf-edit.window-position-fields';

// INTERFACES AND TYPES

/**
 * Window positioning options: a fixed line and position (CENTERED, BOTTOM_CENTERED, or as typed,
 * FIXED — offered only by Change Window Position), relative to the cursor (CURSOR, WINDOW(*DFT ...)),
 * at the line and/or position the program sets in P fields (FIELDS, WINDOW(&LIN &POS ...), or one
 * of them a number), or as it is now (KEEP, only for a window placed at run time).
 */
type WindowPosition = 'CENTERED' | 'BOTTOM_CENTERED' | 'FIXED' | 'CURSOR' | 'FIELDS' | 'KEEP';

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
    /** How the start is written: as given (fixed), *DFT (cursor), P fields (fields), or left as coded (keep) */
    start?: 'fixed' | 'cursor' | 'fields' | 'keep';
    /** The P fields the start is written with, when `start` is 'fields' */
    fields?: WindowPositionFields;
    /** The WINDOW keyword as it is now, when this is an existing one */
    definition?: WindowDefinition;
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
    /** The P fields holding the line and position, when the position chosen is FIELDS */
    positionFields?: WindowPositionFields;
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
            ? `Current: ${currentWindows[0].numRows}x${currentWindows[0].numCols} ${describeWindowPlace(currentWindows[0])}`
            : `Current: ${currentWindows[0].numRows}x${currentWindows[0].numCols} (${currentWindows.length} display sizes declared)`;

        // Collect resize configuration from user. A window placed at run time (*DFT, or P fields)
        // can stay that way.
        const runtimePlacement = currentWindows.map(w => w.definition && describeRuntimeWindowPlacement(w.definition)).find(Boolean);
        const resizeConfig = await collectWindowResizeConfiguration(currentInfo, element, runtimePlacement, currentWindows[0]);
        if (!resizeConfig) {
            // User cancelled the operation
            return;
        };

        // At the line and/or position in P fields: which ones, offering what the window uses now
        // (its fields, or its numbers).
        const position = resizeConfig.newDimensions?.position ?? resizeConfig.autoAdjustConfig?.position;
        if (position === 'FIELDS') {
            const fields = await collectStartForWindows(element.name, currentWindows, 'FIELDS');
            if (!fields) {
                return;
            };
            resizeConfig.positionFields = fields;
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

        // The P fields: the new ones created when missing, the old ones no longer used offered for deletion.
        const created = await updateWindowPositionFields(editor, element.name, currentWindows, resizeConfig.positionFields, position === 'KEEP');
        if (created === undefined) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        // Show success message
        const operationLabel = resizeConfig.operation === 'CHANGE_SIZE' ? 'resized' : 'auto-adjusted';
        const dimensionsSummary = newDimensionsList.length === 1
            ? `${newDimensionsList[0].numRows}x${newDimensionsList[0].numCols} ${describeWindowPlace(newDimensionsList[0])}`
            : newDimensionsList.map(d => `${d.format ?? 'default'}: ${d.numRows}x${d.numCols} ${describeWindowPlace(d)}`).join(', ');
        vscode.window.showInformationMessage(
            `Successfully ${operationLabel} window '${element.name}' — ${dimensionsSummary}${created.length > 0 ? `; created ${created.join(', ')}` : ''}.`
        );

    } catch (error) {
        console.error('Error resizing window:', error);
        vscode.window.showErrorMessage('An error occurred while resizing the window.');
    };
};

/**
 * Registers the "Change Window Position" command for DDS window records: moves the window — fixed,
 * relative to the cursor (*DFT), or where the program says (P fields) — keeping its size.
 * @param context - The VS Code extension context
 */
export function windowPosition(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.window-position", async (node: DdsNode) => {
            const element = node.ddsElement;
            if (element.kind !== "record") {
                vscode.window.showWarningMessage("Window position can only be changed on record formats.");
                return;
            };
            await changeWindowPositionForRecord(element.name);
        })
    );
};

/**
 * Changes where a window record's window goes, keeping its size: centered, centered at the bottom,
 * at a line and position typed, relative to the cursor (*DFT), or at the line and/or position the
 * program sets in P fields. Every WINDOW() line of the record (one per declared display size) is
 * changed, each checked against its own screen. Shared by the tree's context menu and the preview's
 * window Actions.
 * @param recordName - The window record (the one with the WINDOW definition, not a WINDOW(record) reference)
 */
export async function changeWindowPositionForRecord(recordName: string): Promise<void> {
    try {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const currentWindows = findWindowDimensionsOfRecord(recordName);
        if (currentWindows.length === 0) {
            const owner = fieldsPerRecords.find(r => r.record === recordName)?.attributes
                ?.map(attr => attr.value.match(/^WINDOW\(\s*([A-Za-z@#$][A-Za-z0-9@#$_]*)\s*\)$/i)?.[1])
                .find(Boolean);
            vscode.window.showWarningMessage(owner
                ? `Record '${recordName}' is shown in the window of ${owner.toUpperCase()}; change the position there.`
                : `Record '${recordName}' does not have a WINDOW keyword.`);
            return;
        };

        const position = await collectWindowPosition(undefined, `Window Position - ${recordName}, now ${describeWindowPlace(currentWindows[0])}`, true);
        if (!position) {
            return;
        };
        let start: WindowPositionFields | undefined;
        if (position === 'FIELDS' || position === 'FIXED') {
            start = await collectStartForWindows(recordName, currentWindows, position);
            if (!start) {
                return;
            };
        };

        const newDimensionsList: CurrentWindowDimensions[] = [];
        for (const currentWindow of currentWindows) {
            const { maxRows, maxCols } = getScreenBoundsForFormat(currentWindow.format);
            const positioned = calculateWindowPosition(currentWindow, position, maxRows, maxCols, start);
            if (!positioned) {
                vscode.window.showErrorMessage(`The window (${currentWindow.numRows}x${currentWindow.numCols}) doesn't fit on the ${maxRows}x${maxCols} screen${currentWindow.format ? ` of ${currentWindow.format}` : ''} at that position.`);
                return;
            };
            newDimensionsList.push({
                ...positioned,
                windowLine: currentWindow.windowLine,
                format: currentWindow.format,
                definition: currentWindow.definition,
                fields: position === 'FIELDS' ? start : undefined
            });
        };

        if (!(await applyWindowResize(editor, newDimensionsList))) {
            return;
        };
        const created = await updateWindowPositionFields(editor, recordName, currentWindows, position === 'FIELDS' ? start : undefined);
        if (created === undefined) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        const summary = newDimensionsList.length === 1
            ? describeWindowPlace(newDimensionsList[0])
            : newDimensionsList.map(d => `${d.format ?? 'default'}: ${describeWindowPlace(d)}`).join(', ');
        vscode.window.showInformationMessage(
            `Window '${recordName}' is now ${summary}${created.length > 0 ? `; created ${created.join(', ')}` : ''}.`
        );
    } catch (error) {
        console.error('Error changing window position:', error);
        vscode.window.showErrorMessage('An error occurred while changing the window position.');
    };
};

/**
 * Asks for a window's start, offering what it has now: with FIELDS, which of the line and position
 * the program sets and in which fields (see collectWindowPositionFields); with FIXED, the line and
 * position. A fixed part has to fit the smallest display size the window is on.
 * @param recordName - The window record
 * @param currentWindows - Its WINDOW() lines
 * @param mode - FIELDS or FIXED
 * @returns The start, or undefined if cancelled
 */
async function collectStartForWindows(recordName: string, currentWindows: CurrentWindowDimensions[], mode: 'FIELDS' | 'FIXED'): Promise<WindowPositionFields | undefined> {
    const bounds = currentWindows.map(w => getScreenBoundsForFormat(w.format));
    const screen = { rows: Math.min(...bounds.map(b => b.maxRows)), cols: Math.min(...bounds.map(b => b.maxCols)) };
    const currentDefinition = currentWindows[0].definition;
    const currentNames = currentDefinition ? windowPositionFieldNames(currentDefinition) : {};
    const isCursor = currentDefinition?.placement === 'cursor';

    if (mode === 'FIELDS') {
        const currentStart: Partial<WindowPositionFields> = isCursor ? currentNames : {
            row: currentNames.row ?? currentWindows[0].startRow,
            col: currentNames.col ?? currentWindows[0].startCol
        };
        return collectWindowPositionFields(recordName, currentStart, [], screen);
    };

    // FIXED: the line, then the position; never both 1, which the screen doesn't allow.
    const ask = (what: string, max: number, now: number, extra?: (n: number) => string | null) => vscode.window.showInputBox({
        title: `Window Position - ${recordName}`,
        prompt: `The ${what} of the window's top-left corner (1-${max})`,
        value: String(now),
        ignoreFocusOut: true,
        validateInput: value => validateNumericRange(value, 1, max, what === 'line' ? 'Line' : 'Position') ?? extra?.(Number(value)) ?? null
    });
    // Offered: the fixed line or position the window has now, else where the preview draws it.
    const fixedNow = (part: string | undefined, value: number, origin: number) => isCursor || part ? origin : value;
    const row = await ask('line', screen.rows, fixedNow(currentNames.row, currentWindows[0].startRow, RUNTIME_WINDOW_ORIGIN.row));
    if (row === undefined) {
        return undefined;
    };
    const col = await ask('position', screen.cols, fixedNow(currentNames.col, currentWindows[0].startCol, RUNTIME_WINDOW_ORIGIN.col),
        n => Number(row) === 1 && n === 1 ? 'A window can\'t start at line 1 and position 1 at the same time.' : null);
    if (col === undefined) {
        return undefined;
    };
    return { row: Number(row), col: Number(col) };
};

/**
 * After a window's start changed: creates the P fields the new start uses that the record doesn't
 * have yet, and offers to delete those the old start used and the new one doesn't.
 * @param recordName - The window record
 * @param previousWindows - Its WINDOW() lines before the change
 * @param newStart - The new start, when it may name P fields
 * @param kept - True when the start was left as coded, so nothing changes
 * @returns The fields created, or undefined if an edit failed
 */
async function updateWindowPositionFields(
    editor: vscode.TextEditor,
    recordName: string,
    previousWindows: CurrentWindowDimensions[],
    newStart: WindowPositionFields | undefined,
    kept = false
): Promise<string[] | undefined> {
    if (kept) {
        return [];
    };
    const created = newStart ? await createMissingWindowPositionFields(editor, recordName, newStart) : [];
    if (created === undefined) {
        return undefined;
    };
    const oldNames = previousWindows.flatMap(w => {
        const fields = w.definition ? windowPositionFieldNames(w.definition) : {};
        return [fields.row, fields.col].filter((name): name is string => !!name);
    });
    const newNames = newStart ? windowStartFieldNames(newStart) : [];
    const noLongerUsed = [...new Set(oldNames)].filter(name => !newNames.includes(name));
    if ((await deleteUnusedWindowPositionFields(editor, recordName, noLongerUsed)) === undefined) {
        return undefined;
    };
    return created;
};

// USER INPUT COLLECTION FUNCTIONS

/**
 * Collects window resize configuration from user through interactive dialogs.
 * @param currentInfo - Current window information string
 * @param element - The record element for context
 * @returns Window resize configuration or null if user cancelled
 */
async function collectWindowResizeConfiguration(currentInfo: string, element: any, runtimePlacement?: string, currentSize?: { numRows: number; numCols: number }): Promise<WindowResizeConfig | null> {
    // Step 1: Choose resize operation
    const operation = await collectResizeOperation(currentInfo);
    if (!operation) return null;

    if (operation === 'CHANGE_SIZE') {
        // Step 2a: Collect new size and position
        const newSize = await collectNewWindowSize(currentSize);
        if (!newSize) return null;

        const position = await collectWindowPosition(runtimePlacement);
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
        const position = await collectWindowPosition(runtimePlacement);
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
 * @param current - The size the window has now, offered as it is
 * @returns New window size or null if cancelled
 */
async function collectNewWindowSize(current?: { numRows: number; numCols: number }): Promise<{ numRows: number; numCols: number } | null> {
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
        value: current ? String(current.numRows) : undefined,
        ignoreFocusOut: true,
        validateInput: (value) => validateNumericRange(value, 1, maxRows, "Number of rows")
    });
    if (!numRows) return null;

    const numCols = await vscode.window.showInputBox({
        title: 'Window Resize - New Size',
        prompt: `Enter number of columns (1-${maxCols})`,
        placeHolder: "50",
        value: current ? String(current.numCols) : undefined,
        ignoreFocusOut: true,
        validateInput: (value) => validateNumericRange(value, 1, maxCols, "Number of columns")
    });
    if (!numCols) return null;

    return {
        numRows: Number(numRows),
        numCols: Number(numCols)
    };
};

/**
 * Collects window positioning preference: a fixed line and position, or relative to the cursor
 * (*DFT); and, for a window placed at run time already, keeping it as it is.
 * @param runtimePlacement - How the window is placed at run time now (see
 * describeRuntimeWindowPlacement); undefined when it has a fixed position
 * @returns Window position or null if cancelled
 */
async function collectWindowPosition(runtimePlacement?: string, title = 'Window Resize - Position', offerFixed = false): Promise<WindowPosition | null> {
    const positionOptions: vscode.QuickPickItem[] = [
        ...(runtimePlacement ? [{
            label: "KEEP",
            description: "Keep it where it is",
            detail: `The window stays placed at run time, ${runtimePlacement}`
        }] : []),
        {
            label: "CENTERED",
            description: "Center the window on screen",
            detail: "Window will be positioned in the center of the display"
        },
        {
            label: "BOTTOM_CENTERED",
            description: "Center horizontally, position at bottom",
            detail: "Window will be centered horizontally and positioned at the bottom"
        },
        ...(offerFixed ? [{
            label: "FIXED",
            description: "At a line and position you type",
            detail: "The window's top-left corner goes where you say"
        }] : []),
        {
            label: "CURSOR",
            description: "Relative to the cursor (*DFT)",
            detail: "The system places the window near the cursor when it's shown, so it doesn't hide that part of the screen"
        },
        {
            label: "FIELDS",
            description: "At the line and/or position in fields (&LIN &POS)",
            detail: "The program sets the window's line, its position, or both, in P fields of the record, created if missing"
        }
    ];

    const selection = await vscode.window.showQuickPick(positionOptions, {
        title,
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
    return currentRecord ? findWindowDimensionsOfRecord(currentRecord.record) : [];
};

/**
 * The window definitions (WINDOW() lines with a start and a size) of a record, by name.
 * @param recordName - The record's name
 */
function findWindowDimensionsOfRecord(recordName: string): CurrentWindowDimensions[] {
    const currentRecord = fieldsPerRecords.find(record => record.record === recordName);

    if (!currentRecord?.attributes) {
        return [];
    }

    const windowAttributes = currentRecord.attributes.filter(attr =>
        attr.value.startsWith('WINDOW(')
    );

    const results: CurrentWindowDimensions[] = [];
    for (const windowAttribute of windowAttributes) {
        // WINDOW(startRow startCol numRows numCols), with *DFT or P fields for the start
        const definition = parseWindowDefinition(windowAttribute.value);
        if (definition) {
            results.push({
                startRow: definition.startRow,
                startCol: definition.startCol,
                numRows: definition.numRows,
                numCols: definition.numCols,
                windowLine: windowAttribute.lineIndex,
                format: windowAttribute.displayFormat,
                definition
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

/** Where a window goes, for messages: 'at (4,20)', or how it's placed at run time. */
function describeWindowPlace(window: CurrentWindowDimensions): string {
    if (window.start === 'cursor') {
        return 'relative to the cursor (*DFT)';
    };
    if (window.start === 'fields' && window.fields) {
        return `at ${windowStartText(window.fields)}`;
    };
    const keptDefinition = window.start === 'fixed' ? undefined : window.definition;
    return (keptDefinition && describeRuntimeWindowPlacement(keptDefinition)) || `at (${window.startRow},${window.startCol})`;
};

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

    const positioned = calculateWindowPosition(targetSize, position, maxRows, maxCols, config.positionFields);
    if (!positioned) {
        return null;
    };

    return {
        ...positioned,
        windowLine: currentWindow.windowLine,
        format: currentWindow.format,
        definition: currentWindow.definition,
        fields: config.positionFields
    };
};

/**
 * Calculates window position based on size and position preference, within the given screen bounds.
 * @param size - Target window size
 * @param position - Position preference
 * @param maxRows - Screen rows to position within
 * @param maxCols - Screen columns to position within
 * @param positionFields - With FIELDS, the start: a part that isn't a field is checked where it's coded;
 * with FIXED, the line and position typed
 * @returns Calculated window dimensions or null if invalid
 */
function calculateWindowPosition(
    size: { numRows: number; numCols: number },
    position: WindowPosition,
    maxRows: number,
    maxCols: number,
    positionFields?: WindowPositionFields
): CurrentWindowDimensions | null {
    // Validate that window fits on screen
    if (size.numRows > maxRows || size.numCols > maxCols) {
        return null;
    };

    let startRow: number;
    let startCol: number;
    let start: CurrentWindowDimensions['start'] = 'fixed';

    switch (position) {
        case 'CURSOR':
        case 'FIELDS':
        case 'KEEP':
            // Placed at run time: checked where STRSDA (and the preview) draw it.
            startRow = RUNTIME_WINDOW_ORIGIN.row;
            startCol = RUNTIME_WINDOW_ORIGIN.col;
            start = position === 'CURSOR' ? 'cursor' : position === 'FIELDS' ? 'fields' : 'keep';
            if (position === 'FIELDS') {
                if (typeof positionFields?.row === 'number') { startRow = positionFields.row; };
                if (typeof positionFields?.col === 'number') { startCol = positionFields.col; };
            };
            break;

        case 'FIXED':
            // As typed: both parts are numbers then.
            if (typeof positionFields?.row !== 'number' || typeof positionFields?.col !== 'number') {
                return null;
            };
            startRow = positionFields.row;
            startCol = positionFields.col;
            break;

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

    // STRSDA never allows a window at row 1 and column 1 at the same time - nudge off the corner.
    if (startRow === 1 && startCol === 1) {
        if (startCol + size.numCols <= maxCols) {
            startCol = 2;
        } else if (startRow + size.numRows <= maxRows) {
            startRow = 2;
        } else {
            return null;
        };
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
        windowLine : 0,
        start
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
    // (a start placed at run time is left as coded when kept).
    for (const newDimensions of newDimensionsList) {
        const line = editor.document.lineAt(newDimensions.windowLine);
        const updatedLine = rewriteWindowDefinition(line.text, {
            numRows: newDimensions.numRows,
            numCols: newDimensions.numCols,
            start: newDimensions.start === 'keep' ? undefined
                : newDimensions.start === 'cursor' ? 'cursor'
                : newDimensions.start === 'fields' && newDimensions.fields ? { fields: newDimensions.fields }
                : { row: newDimensions.startRow, col: newDimensions.startCol }
        });
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
