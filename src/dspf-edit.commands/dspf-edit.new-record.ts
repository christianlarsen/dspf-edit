/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.new-record.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { recordExists, DspsizConfig,
    checkIfDspsizNeeded, collectDspsizConfiguration, generateDspsizLines, 
    checkForEditorAndDocument} from '../dspf-edit.utils/dspf-edit.helper';
import { fileSizeAttributes } from '../dspf-edit.model/dspf-edit.model';

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
 * Window configuration including title.
 */
interface WindowConfig {
    dimensions: WindowDimensions;
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
        await insertNewRecord(editor, recordLines);

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
function validateRecordName(value: string): string | null {
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

    // Calculate actual dimensions based on size and position
    const dimensions = calculateWindowDimensions(windowSize, position);
    if (!dimensions) {
        vscode.window.showErrorMessage("Cannot position window with these dimensions on the current screen size.");
        return null;
    };

    // Collect window title
    const title = await collectWindowTitle(dimensions.numCols);
    if (title === null) return null; // User cancelled

    return {
        dimensions,
        title: title || undefined
    };
};

/**
 * Collects window size (rows and columns).
 * @returns Window size or null if cancelled
 */
async function collectWindowSize(): Promise<WindowSize | null> {
    const maxRows = fileSizeAttributes.maxRow1 || 24;
    const maxCols = fileSizeAttributes.maxCol1 || 80;

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
 * Calculates actual window dimensions based on size and position preferences.
 * @param size Window size requirements
 * @param position Positioning preference
 * @returns Calculated dimensions or null if invalid
 */
function calculateWindowDimensions(size: WindowSize, position: WindowPosition): WindowDimensions | null {
    const maxRows = fileSizeAttributes.maxRow1 || 24;
    const maxCols = fileSizeAttributes.maxCol1 || 80;

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
                lines.push(generateWindowLine(config.windowConfig.dimensions));
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
                lines.push(generateWindowLine(config.windowConfig.dimensions));
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
 * Generates a window specification line.
 * @param dimensions - Window dimensions
 * @returns Formatted window line
 */
function generateWindowLine(dimensions: WindowDimensions): string {
    return ' '.repeat(5) + 'A' + ' '.repeat(38) + 'WINDOW(' + 
           dimensions.startRow + ' ' + 
           dimensions.startCol + ' ' + 
           dimensions.numRows + ' ' + 
           dimensions.numCols + ')';
};

/**
 * Generates window title lines, handling line wrapping if needed.
 * @param title - Window title text
 * @returns Array of formatted title lines
 */
function generateWindowTitleLines(title: string): string[] {
    const maxLineLength = 80;
    const basePrefix = ' '.repeat(5) + 'A' + ' '.repeat(38);
    
    const keyword = "WDWTITLE((*TEXT '";
    const suffix = "') *CENTER)";
    
    const lines: string[] = [];
    let remaining = title;
    let firstLine = true;
    
    while (remaining.length >= 0) {
        if (firstLine) {
            const available = maxLineLength - (basePrefix.length + keyword.length + suffix.length);
            
            if (remaining.length <= available) {
                lines.push(basePrefix + keyword + remaining + suffix);
                break;
            } else {
                // Para la primera línea con continuación, necesitamos espacio para el '-'
                const availableWithDash = maxLineLength - (basePrefix.length + keyword.length + 1); // +1 para el '-'
                const part = remaining.substring(0, availableWithDash);
                lines.push(basePrefix + keyword + part + '-');
                
                remaining = remaining.substring(availableWithDash);
                firstLine = false;
            };
        } else {
            const available = maxLineLength - (basePrefix.length + suffix.length);
            
            if (remaining.length <= available) {
                lines.push(basePrefix + remaining + suffix);
                break;
            } else {
                // Para líneas intermedias con continuación, necesitamos espacio para el '-'
                const availableWithDash = maxLineLength - (basePrefix.length + 1); // +1 para el '-'
                const part = remaining.substring(0, availableWithDash);
                lines.push(basePrefix + part + '-');
                remaining = remaining.substring(availableWithDash);
            };
        };
    };
    
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
async function insertNewRecord(editor: vscode.TextEditor, lines: string[]): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const insertPosition = new vscode.Position(editor.document.lineCount, 0);

    if (editor.document.lineCount > 1) {
        workspaceEdit.insert(uri, insertPosition, '\n');
    };
    // Create the complete record text with proper line breaks
    const recordText = lines.join('\n');
    
    workspaceEdit.insert(uri, insertPosition, recordText);
    await vscode.workspace.applyEdit(workspaceEdit);
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