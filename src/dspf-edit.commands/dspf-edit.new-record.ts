/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.new-record.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { recordExists, DspsizConfig,
    checkIfDspsizNeeded, collectDspsizConfiguration, generateDspsizLines,
    checkForEditorAndDocument, applyWorkspaceEdit, writeDisplayFormatCondition} from '../dspf-edit.utils/dspf-edit.helper';
import { fileSizeAttributes, getAvailableDisplayFormats } from '../dspf-edit.model/dspf-edit.model';

// INTERFACES AND TYPES

/**
 * Available record types for DDS creation.
 */
type RecordType = 'RECORD' | 'WINDOW' | 'SFL' | 'SFLWDW';

/**
 * Window size configuration (before positioning).
 */
interface WindowSize {
    numRows: number;
    numCols: number;
};

/**
 * Window positioning options.
 */
type WindowPosition = 'CENTERED' | 'BOTTOM_CENTERED' | 'TOP_LEFT';

/**
 * Window/Subfile window dimensions configuration.
 */
interface WindowDimensions {
    startRow: number;
    startCol: number;
    numRows: number;
    numCols: number;
};

/**
 * A window's dimensions as they apply under one declared DSPSIZ display format. `format` is
 * undefined when the file has at most one declared format (or the computed dimensions happen to be
 * identical across every declared format) — in that case a single unconditioned WINDOW() line covers
 * every format, matching pre-multi-size behavior exactly.
 */
interface FormatDimensions {
    format?: string;
    dimensions: WindowDimensions;
};

/**
 * Window configuration including title.
 */
interface WindowConfig {
    dimensionsByFormat: FormatDimensions[];
    title?: string;
};

/**
 * Subfile configuration parameters.
 */
interface SubfileConfig {
    controlRecordName: string;
    size: number;
    page: number;
};

/**
 * Complete record configuration for creation.
 */
interface NewRecordConfig {
    name: string;
    type: RecordType;
    windowConfig?: WindowConfig;
    subfileConfig?: SubfileConfig;
    dspsizConfig?: DspsizConfig;
};

// COMMAND REGISTRATION

/**
 * Registers the new record command for DDS files.
 * Allows users to create new records with various types and configurations.
 * @param context - The VS Code extension context
 */
export function newRecord(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.new-record", async (node: DdsNode) => {
            await handleNewRecordCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the new record command creation workflow.
 * Validates context, collects user input, and creates the appropriate record type.
 * @param node - The DDS node from which to create the new record
 */
async function handleNewRecordCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };
        
        // Check if DSPSIZ needs to be defined
        const needsDspsiz = await checkIfDspsizNeeded(editor);

        // Collect record configuration from user
        const recordConfig = await collectRecordConfiguration(needsDspsiz);
        if (!recordConfig) {
            // User cancelled the operation
            return;
        };

        // Generate DDS lines for the new record
        const recordLines = generateRecordLines(recordConfig);

        // Insert the new record into the document
        if (!(await insertNewRecord(editor, recordLines))) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        // Show success message
        const recordTypeLabel = getRecordTypeLabel(recordConfig.type);
        const dspsizMessage = recordConfig.dspsizConfig?.needsDspsiz ? ' with DSPSIZ specification' : '';
        vscode.window.showInformationMessage(
            `Successfully created ${recordTypeLabel} record '${recordConfig.name}'${dspsizMessage}.`
        );

    } catch (error) {
        console.error('Error creating new record:', error);
        vscode.window.showErrorMessage('An error occurred while creating the new record.');
    };
};

// USER INPUT COLLECTION FUNCTIONS

/**
 * Collects complete record configuration from user through interactive dialogs.
 * @param needsDspsiz - Whether DSPSIZ configuration is needed
 * @returns Complete record configuration or null if user cancelled
 */
async function collectRecordConfiguration(needsDspsiz: boolean): Promise<NewRecordConfig | null> {
    // Step 0: Collect DSPSIZ configuration if needed
    let dspsizConfig: DspsizConfig | undefined | null;
    if (needsDspsiz) {
        dspsizConfig = await collectDspsizConfiguration();
        if (!dspsizConfig) return null;
    };

    // Step 1: Get record name
    const recordName = await collectRecordName();
    if (!recordName) return null;

    // Step 2: Get record type
    const recordType = await collectRecordType();
    if (!recordType) return null;

    // Step 3: Collect type-specific configuration
    let windowConfig: WindowConfig | undefined | null;
    let subfileConfig: SubfileConfig | undefined | null;

    if (recordType === 'WINDOW' || recordType === 'SFLWDW') {
        windowConfig = await collectWindowConfiguration();
        if (!windowConfig) return null;
    };

    if (recordType === 'SFL' || recordType === 'SFLWDW') {
        subfileConfig = await collectSubfileConfiguration();
        if (!subfileConfig) return null;
    };

    if (windowConfig === null) windowConfig = undefined;
    if (subfileConfig === null) subfileConfig = undefined;
    if (dspsizConfig === null) dspsizConfig = undefined;

    return {
        name: recordName,
        type: recordType,
        windowConfig,
        subfileConfig,
        dspsizConfig
    };
};

/**
 * Collects and validates the new record name from user input.
 * @returns Valid record name or null if cancelled
 */
async function collectRecordName(): Promise<string | null> {
    const stepNumber = '1/4'; // Will be adjusted based on whether DSPSIZ is needed
    const recordName = await vscode.window.showInputBox({
        title: `Create New Record - Step ${stepNumber}`,
        prompt: 'Enter the new record name (In case of subfile, this is the subfile detail record name)',
        placeHolder: 'RECORD',
        validateInput: validateRecordName
    });

    return recordName?.toUpperCase() || null;
};

/**
 * Validates record name according to DDS rules.
 * @param value - The record name to validate
 * @returns Error message or null if valid
 */
export function validateRecordName(value: string): string | null {
    if (!value || value.trim() === '') {
        return "The record name cannot be empty.";
    };

    const trimmedValue = value.trim();

    if (trimmedValue.length > 10) {
        return "The record name must be 10 characters or fewer.";
    };

    if (/\s/.test(trimmedValue)) {
        return "The record name cannot contain spaces.";
    };

    if (/^\d/.test(trimmedValue)) {
        return "The record name cannot start with a number.";
    };

    if (!/^[A-Za-z][A-Za-z0-9@#$]*$/.test(trimmedValue)) {
        return "Invalid characters in record name. Use letters, numbers, @, #, $.";
    };

    if (recordExists(trimmedValue.toUpperCase())) {
        return "Record name already exists.";
    };

    return null;
};

/**
 * Collects record type selection from user.
 * @returns Selected record type or null if cancelled
 */
async function collectRecordType(): Promise<RecordType | null> {
    const recordTypes: vscode.QuickPickItem[] = [
        { 
            label: "RECORD", 
            description: "Standard DDS record format",
            detail: "Basic record for data display and input"
        },
        { 
            label: "WINDOW", 
            description: "Window overlay record",
            detail: "Creates a window with specified position and size"
        },
        { 
            label: "SFL", 
            description: "Subfile record",
            detail: "Creates subfile with control record for list processing"
        },
        { 
            label: "SFLWDW", 
            description: "Subfile window record",
            detail: "Creates subfile within a window overlay"
        }
    ];

    const selection = await vscode.window.showQuickPick(recordTypes, {
        title: 'Create New Record - Step 2/4',
        placeHolder: "Select the record type",
        canPickMany: false,
        ignoreFocusOut: true
    });

    return (selection?.label as RecordType) || null;
};

/**
 * Collects complete window configuration including size and position.
 * @returns Window configuration or null if cancelled
 */
async function collectWindowConfiguration(): Promise<WindowConfig | null> {
    // First, collect window size
    const windowSize = await collectWindowSize();
    if (!windowSize) return null;

    // Then, collect positioning preference
    const position = await collectWindowPosition();
    if (!position) return null;

    // Calculate actual dimensions for every declared display size (DSPSIZ format); when the file
    // declares more than one, the window keeps the same rows/cols in each but gets its own
    // position, appropriate to that format's screen size.
    const dimensionsByFormat = calculateWindowDimensionsForAllFormats(windowSize, position);
    if (!dimensionsByFormat) {
        vscode.window.showErrorMessage("Cannot position window with these dimensions on the current screen size(s).");
        return null;
    };

    // Collect window title (width is the same across every format, since only position varies)
    const title = await collectWindowTitle(dimensionsByFormat[0].dimensions.numCols);
    if (title === null) return null; // User cancelled

    return {
        dimensionsByFormat,
        title: title || undefined
    };
};

/**
 * Collects window size (rows and columns). Bounded by the smallest declared display size (DSPSIZ
 * format), when the file declares more than one, so the same rows/cols fit on every screen the
 * window will need a line for.
 * @returns Window size or null if cancelled
 */
async function collectWindowSize(): Promise<WindowSize | null> {
    const declaredFormats = getAvailableDisplayFormats();
    const maxRows = declaredFormats.length > 0
        ? Math.min(...declaredFormats.map(f => f.rows))
        : (fileSizeAttributes.maxRow1 || 24);
    const maxCols = declaredFormats.length > 0
        ? Math.min(...declaredFormats.map(f => f.cols))
        : (fileSizeAttributes.maxCol1 || 80);

    const numRows = await vscode.window.showInputBox({
        title: 'Window Configuration - Size',
        prompt: `Enter number of rows (1-${maxRows})`,
        placeHolder: "7",
        validateInput: (value) => validateNumericRange(value, 1, maxRows, "Number of rows")
    });
    if (!numRows) return null;

    const numCols = await vscode.window.showInputBox({
        title: 'Window Configuration - Size',
        prompt: `Enter number of columns (1-${maxCols})`,
        placeHolder: "40", 
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
        },
        { 
            label: "TOP_LEFT", 
            description: "Position at top-left corner",
            detail: "Window will be positioned at row 1, column 1"
        }
    ];

    const selection = await vscode.window.showQuickPick(positionOptions, {
        title: 'Window Configuration - Position',
        placeHolder: "Select window position",
        canPickMany: false,
        ignoreFocusOut: true
    });

    return (selection?.label as WindowPosition) || null;
};

/**
 * Calculates actual window dimensions based on size and position preferences, for a single screen
 * size (rows/cols). Called once per declared display format by `calculateWindowDimensionsForAllFormats`.
 * @param size Window size requirements
 * @param position Positioning preference
 * @param maxRows Screen rows to position within
 * @param maxCols Screen columns to position within
 * @returns Calculated dimensions or null if invalid
 */
function calculateWindowDimensions(size: WindowSize, position: WindowPosition, maxRows: number, maxCols: number): WindowDimensions | null {
    // Validate that window fits on screen
    if (size.numRows > maxRows || size.numCols > maxCols) {
        return null;
    };

    let startRow: number;
    let startCol: number;

    switch (position) {
        case 'TOP_LEFT':
            startRow = 1;
            startCol = 1;
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
        numCols: size.numCols
    };
};

/**
 * Calculates window dimensions for every display size (DSPSIZ format) the file declares — same
 * rows/cols in each, position recalculated per format so the window is actually correctly placed
 * (e.g. centered) on every screen it can appear on, not just the first. Falls back to a single,
 * unconditioned entry when the file declares at most one format, or when the computed dimensions
 * turn out identical across every declared format (e.g. TOP_LEFT positioning) — same source output
 * as before multi-size support existed.
 * @param size Window size requirements
 * @param position Positioning preference
 * @returns One entry per declared format (or a single unconditioned entry), or null if the window
 * doesn't fit on at least one declared screen
 */
function calculateWindowDimensionsForAllFormats(size: WindowSize, position: WindowPosition): FormatDimensions[] | null {
    const declaredFormats = getAvailableDisplayFormats();

    if (declaredFormats.length <= 1) {
        const maxRows = declaredFormats[0]?.rows ?? (fileSizeAttributes.maxRow1 || 24);
        const maxCols = declaredFormats[0]?.cols ?? (fileSizeAttributes.maxCol1 || 80);
        const dimensions = calculateWindowDimensions(size, position, maxRows, maxCols);
        return dimensions ? [{ dimensions }] : null;
    };

    const perFormat: FormatDimensions[] = [];
    for (const format of declaredFormats) {
        const dimensions = calculateWindowDimensions(size, position, format.rows, format.cols);
        if (!dimensions) {
            return null;
        };
        perFormat.push({ format: format.name, dimensions });
    };

    // Collapse to a single unconditioned line when every format landed on the same geometry
    // (e.g. TOP_LEFT is the same regardless of screen size) — avoids redundant identical lines.
    const first = perFormat[0].dimensions;
    const allIdentical = perFormat.every(f =>
        f.dimensions.startRow === first.startRow &&
        f.dimensions.startCol === first.startCol &&
        f.dimensions.numRows === first.numRows &&
        f.dimensions.numCols === first.numCols
    );

    return allIdentical ? [{ dimensions: first }] : perFormat;
};

/**
 * Collects window title with validation against window width.
 * @param windowWidth - Maximum allowed title length
 * @returns Window title or null if cancelled, empty string if no title
 */
async function collectWindowTitle(windowWidth: number): Promise<string | null> {
    const title = await vscode.window.showInputBox({
        title: 'Window Configuration - Title',
        prompt: `Enter window title (max ${windowWidth} characters, leave empty for no title)`,
        placeHolder: 'Window Title',
        validateInput: (value) => validateWindowTitle(value, windowWidth)
    });

    if (title === undefined) return null; // User cancelled
    return title.trim();
};

/**
 * Validates window title length against window width.
 * @param value - Title to validate
 * @param maxLength - Maximum allowed length
 * @returns Error message or null if valid
 */
function validateWindowTitle(value: string, maxLength: number): string | null {
    if (!value || value.trim() === '') {
        return null; // Empty title is valid
    };

    const trimmedValue = value.trim();
    if (trimmedValue.length > maxLength) {
        return `Title cannot exceed ${maxLength} characters (window width).`;
    };

    return null;
};

/**
 * Collects subfile configuration for SFL and SFLWDW record types.
 * @returns Subfile configuration or null if cancelled
 */
async function collectSubfileConfiguration(): Promise<SubfileConfig | null> {
    const controlRecordName = await vscode.window.showInputBox({
        title: 'Subfile Configuration - Control Record',
        prompt: 'Enter the subfile control record name (This is the subfile header record name)',
        placeHolder: 'SFLCTL',
        validateInput: validateRecordName
    });
    if (!controlRecordName) return null;

    const size = await vscode.window.showInputBox({
        title: 'Subfile Configuration - Size',
        prompt: 'Enter total records in subfile (1-9999)',
        placeHolder: '10',
        validateInput: (value) => validateNumericRange(value, 1, 9999, "Subfile size")
    });
    if (!size) return null;

    const page = await vscode.window.showInputBox({
        title: 'Subfile Configuration - Page Size',
        prompt: 'Enter records per page (1-9999)',
        placeHolder: '9',
        validateInput: (value) => validateNumericRange(value, 1, 9999, "Page size")
    });
    if (!page) return null;

    return {
        controlRecordName: controlRecordName.toUpperCase(),
        size: Number(size),
        page: Number(page)
    };
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

// RECORD GENERATION FUNCTIONS

/**
 * Generates DDS lines for the specified record configuration.
 * @param config - Complete record configuration
 * @returns Array of formatted DDS lines
 */
function generateRecordLines(config: NewRecordConfig): string[] {
    const lines: string[] = [];
    
    // Generate DSPSIZ specification if needed (must come first)
    if (config.dspsizConfig?.needsDspsiz) {
        lines.push(...generateDspsizLines(config.dspsizConfig));
    };

    // Generate main record line
    lines.push(generateMainRecordLine(config));

    // Generate type-specific lines
    switch (config.type) {
        case 'WINDOW':
            if (config.windowConfig) {
                lines.push(...generateWindowLines(config.windowConfig.dimensionsByFormat));
                if (config.windowConfig.title) {
                    lines.push(...generateWindowTitleLines(config.windowConfig.title));
                }
                lines.push(...generateWindowBorderLines());
            }
            break;

        case 'SFL':
            if (config.subfileConfig) {
                lines.push(generateSubfileControlLine(config.name, config.subfileConfig));
                lines.push(generateSubfileSizeLine(config.subfileConfig.size));
                lines.push(generateSubfilePageLine(config.subfileConfig.page));
                lines.push(...generateSubfileOtherLines());
            }
            break;

        case 'SFLWDW':
            if (config.subfileConfig && config.windowConfig) {
                lines.push(generateSubfileControlLine(config.name, config.subfileConfig));
                lines.push(...generateWindowLines(config.windowConfig.dimensionsByFormat));
                if (config.windowConfig.title) {
                    lines.push(...generateWindowTitleLines(config.windowConfig.title));
                }
                lines.push(...generateWindowBorderLines());
                lines.push(generateSubfileSizeLine(config.subfileConfig.size));
                lines.push(generateSubfilePageLine(config.subfileConfig.page));
                lines.push(...generateSubfileOtherLines());
            }
            break;
    };

    return lines;
};

/**
 * Generates the main record definition line.
 * @param config - Record configuration
 * @returns Formatted main record line
 */
function generateMainRecordLine(config: NewRecordConfig): string {
    let line = ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R ' + config.name.padEnd(10, ' ');
    
    // Add SFL keyword for subfile records
    if (config.type === 'SFL' || config.type === 'SFLWDW') {
        line += ' '.repeat(16) + 'SFL';
    }
    
    return line;
};

/**
 * Generates one WINDOW() specification line per entry — one per declared display format when the
 * file declares more than one (see `calculateWindowDimensionsForAllFormats`), each conditioned on
 * its format name, or a single unconditioned line otherwise (unchanged pre-multi-size output).
 * @param dimensionsByFormat - Window dimensions, one entry per format (or a single entry)
 * @returns Formatted WINDOW() lines
 */
function generateWindowLines(dimensionsByFormat: FormatDimensions[]): string[] {
    return dimensionsByFormat.map(({ format, dimensions }) => {
        const line = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'WINDOW(' +
            dimensions.startRow + ' ' +
            dimensions.startCol + ' ' +
            dimensions.numRows + ' ' +
            dimensions.numCols + ')';
        return writeDisplayFormatCondition(line, format);
    });
};

/**
 * Generates window title lines, handling line wrapping if needed. The whole keyword value (the
 * quoted text plus the trailing *ALIGN/*BOTTOM) is treated as one continuous sequence and filled
 * line by line up to column 80 — a continuation dash goes there whenever more content remains,
 * splitting wherever that boundary happens to fall (including in the middle of *ALIGN/*BOTTOM),
 * since DDS reconstructs a continued value by plain concatenation. Only the one separator space
 * between the quoted text and *ALIGN is dropped when a wrap lands right on it, since it's just a
 * token separator, not part of the title.
 * @param title - Window title text
 * @param align - Horizontal alignment of the title within the window's top/bottom border
 * @param position - Whether the title sits on the window's top or bottom border
 * @returns Array of formatted title lines
 */
export function generateWindowTitleLines(
    title: string,
    align: 'LEFT' | 'CENTER' | 'RIGHT' = 'CENTER',
    position: 'TOP' | 'BOTTOM' = 'TOP'
): string[] {
    const maxLineLength = 80;
    const basePrefix = ' '.repeat(5) + 'A' + ' '.repeat(38);
    const contentWidth = maxLineLength - basePrefix.length; // Max chars on a line that needs no continuation dash.
    const contentWidthWithDash = contentWidth - 1; // Max chars before the dash, on a continued line.

    const textUnit = "WDWTITLE((*TEXT '" + title + "')";
    const tail = position === 'BOTTOM' ? `*${align} *BOTTOM)` : `*${align})`;
    const fullValue = textUnit + ' ' + tail;

    const lines: string[] = [];
    let remaining = fullValue;
    let consumed = 0;

    while (remaining.length > contentWidth) {
        const part = remaining.substring(0, contentWidthWithDash);
        lines.push(basePrefix + part + '-');
        consumed += contentWidthWithDash;
        remaining = remaining.substring(contentWidthWithDash);

        if (consumed >= textUnit.length && remaining.startsWith(' ')) {
            remaining = remaining.slice(1);
        };
    };

    lines.push(basePrefix + remaining);
    return lines;
};

/**
 * Generates window border specification lines.
 * @returns Array of formatted window border lines
 */
function generateWindowBorderLines(): string[] {
    const baseLine = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'WDWBORDER((*COLOR BLU) (*DSPATR RI)-';
    const continuationLine = ' '.repeat(5) + 'A' + ' '.repeat(39) + "(*CHAR '" + ' '.repeat(8) + "')) ";
    return [baseLine, continuationLine];
};

/**
 * Generates a subfile control record line.
 * @param subfileName - Name of the subfile record
 * @param config - Subfile configuration
 * @returns Formatted subfile control line
 */
function generateSubfileControlLine(subfileName: string, config: SubfileConfig): string {
    return ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R ' + config.controlRecordName.padEnd(10, ' ') + 
           ' '.repeat(16) + 'SFLCTL(' + subfileName.trim() + ')';
};

/**
 * Generates a subfile size specification line.
 * @param size - Subfile size
 * @returns Formatted SFLSIZ line
 */
function generateSubfileSizeLine(size: number): string {
    return ' '.repeat(5) + 'A' + ' '.repeat(38) + 'SFLSIZ(' + String(size).padStart(4, '0') + ')';
};

/**
 * Generates a subfile page specification line.
 * @param page - Page size
 * @returns Formatted SFLPAG line
 */
function generateSubfilePageLine(page: number): string {
    return ' '.repeat(5) + 'A' + ' '.repeat(38) + 'SFLPAG(' + String(page).padStart(4, '0') + ')';
};

/**
 * Generates rest of subfile control lines.
 * @returns Formatted lines with RTVCSRLOC, OVERLAY, SFLCSRRRN, SFLDSP, SFLDSPCTL, SFLCLR, SLFEND(*MORE)
 */
function generateSubfileOtherLines(): string[] {
    let lines : string[] = [];
    const lineStart = ' '.repeat(5) + 'A' + ' '.repeat(38);
    const lineStartField = ' '.repeat(5) + 'A' + ' '.repeat(12);

    // Define lines
    lines[0] = lineStart + 'OVERLAY';
    lines[1] = lineStart + 'RTNCSRLOC(&WSRECNAM &WSFLDNAM)';
    lines[2] = lineStart + 'SFLCSRRRN(&WSFLRRN)';
    lines[3] = lineStart + 'SFLDSP';
    lines[4] = lineStart + 'SFLDSPCTL';
    lines[5] = lineStart + 'SFLCLR';
    lines[6] = lineStart + 'SFLEND(*MORE)';
    // Add indicators to SFLDSP, SFLDSPCTL, SFLCLR, SFLEND
    lines[3] = lines[3].substring(0, 7) + 'N80' + lines[3].substring(10);
    lines[4] = lines[4].substring(0, 7) + 'N80' + lines[4].substring(10);
    lines[6] = lines[6].substring(0, 7) + 'N80' + lines[6].substring(10);
    lines[5] = lines[5].substring(0, 8) + '80' + lines[5].substring(10);
    // Add lines with hidden fields
    lines[7] = lineStartField + 'NRR' + ' '.repeat(12) + '4S 0H';
    lines[8] = lineStartField + 'NBR' + ' '.repeat(12) + '4S 0H';
    lines[9] = lineStartField + 'WSRECNAM' + ' '.repeat(6) + '10A  H';
    lines[10] = lineStartField + 'WSFLDNAM' + ' '.repeat(6) + '10A  H';
    lines[11] = lineStartField + 'WSFLRRN' + ' '.repeat(8) + '5S 0H';

    return lines;
};

// DOCUMENT INSERTION FUNCTIONS

/**
 * Inserts the new record lines into the document at the end.
 * @param editor - The active text editor
 * @param lines - Array of DDS lines to insert
 */
async function insertNewRecord(editor: vscode.TextEditor, lines: string[]): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const insertPosition = new vscode.Position(editor.document.lineCount, 0);

    if (editor.document.lineCount > 1) {
        workspaceEdit.insert(uri, insertPosition, '\n');
    };
    // Create the complete record text with proper line breaks
    const recordText = lines.join('\n');

    workspaceEdit.insert(uri, insertPosition, recordText);
    return applyWorkspaceEdit(workspaceEdit, 'create the new record');
};

// UTILITY FUNCTIONS

/**
 * Gets user-friendly label for record type.
 * @param type - Record type
 * @returns Human-readable record type label
 */
function getRecordTypeLabel(type: RecordType): string {
    const labels: Record<RecordType, string> = {
        'RECORD': 'standard',
        'WINDOW': 'window',
        'SFL': 'subfile',
        'SFLWDW': 'subfile window'
    };
    
    return labels[type] || 'unknown';
};