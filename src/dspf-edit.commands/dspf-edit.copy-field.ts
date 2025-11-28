/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.copy-field.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords, FieldInfo, DdsField } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';

/**
 * Interface for field copy configuration
 * Contains all necessary information to copy a field from source to target
 */
interface CopyFieldConfig {
    sourceField: FieldInfo;
    sourceRecord: string;
    targetRecord: string;
    newName: string;
    targetPosition: FieldPosition | null;
};

/**
 * Interface for field position on screen
 * Represents row and column coordinates for field placement
 */
interface FieldPosition {
    row: number;
    column: number;
};

/**
 * Interface for existing element information (fields and constants)
 * Used to track existing elements when positioning new fields
 */
interface ExistingElementInfo {
    name: string;
    text: string;
    row: number;
    column: number;
    width: number;
    lineIndex: number;
    type: 'field' | 'constant';
};

/**
 * Interface for validation results
 * Standard result structure for validation operations
 */
interface ValidationResult {
    isValid: boolean;
    errorMessage?: string;
};

/**
 * Constants for field copying operations
 * Defines column positions and limits for DDS field formatting
 */
const COPY_CONSTANTS = {
    MAX_NAME_LENGTH: 10,
    NAME_COLUMN_START: 18,
    NAME_COLUMN_END: 28,
    ROW_COLUMN_START: 39,
    ROW_COLUMN_END: 41,
    COLUMN_COLUMN_START: 42,
    COLUMN_COLUMN_END: 44
} as const;

// COMMAND REGISTRATION

/**
 * Registers the copy field command for the VS Code extension
 * 
 * This function sets up the command handler that will be called when users
 * invoke the copy field command from the tree view context menu or command palette.
 * 
 * @param context - The VS Code extension context for registering commands and subscriptions
 */
export function copyField(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.copy-field", async (node: DdsNode) => {
            await handleCopyFieldCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Main command handler for copying DDS fields
 * 
 * This function orchestrates the entire field copying process:
 * 1. Validates the selected node
 * 2. Collects configuration from the user
 * 3. Generates the copied field lines
 * 4. Inserts the field into the target record
 * 
 * @param node - The selected DDS node from the tree view
 */
async function handleCopyFieldCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate the selected node
        const validationResult = validateNodeForCopy(node);
        if (!validationResult.isValid) {
            vscode.window.showWarningMessage(validationResult.errorMessage!);
            return;
        };

        // Ensure we're working with a field
        if (node.ddsElement.kind !== "field") {
            vscode.window.showWarningMessage("Only fields can be copied.");
            return;
        };
        
        // Convert the DDS element to internal FieldInfo format
        const sourceElement = toFieldInfo(node.ddsElement as DdsField);
                
        // Find the record containing the source field
        const sourceRecord = findRecordContainingField(sourceElement.name, sourceElement.lineIndex);
        if (!sourceRecord) {
            vscode.window.showErrorMessage(`Could not determine source record for field '${sourceElement.name}'.`);
            return;
        };

        // Check if the field is hidden (no screen position)
        const isHidden = isFieldHidden(node.ddsElement as DdsField);

        // Collect copy configuration from user
        const copyConfig = await collectCopyConfiguration(editor, sourceElement, sourceRecord, isHidden);
        if (!copyConfig) {
            return; // User cancelled
        };

        // Generate the copied field lines (including all attributes and indicators)
        const copiedFieldLines = await generateCopiedFieldLines(editor, copyConfig, isHidden);

        // Insert the copied field into the target record
        await insertCopiedField(editor, copyConfig.targetRecord, copiedFieldLines);
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        // Show success message
        const positionInfo = isHidden ? "(hidden field)" : `at position ${copyConfig.targetPosition!.row}, ${copyConfig.targetPosition!.column}`;
        vscode.window.showInformationMessage(
            `Field '${copyConfig.sourceField.name}' successfully copied to '${copyConfig.newName}' in record '${copyConfig.targetRecord}' ${positionInfo}.`
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to copy field: ${errorMessage}`);
        console.error('Error in copyField command:', error);
    };
};

/**
 * Converts a parsed DDS field element into an internal FieldInfo structure
 * 
 * This function maps the properties from the raw `DdsField` (produced by the DDS parser)
 * into the normalized `FieldInfo` format used internally by the extension.
 * It handles optional properties and provides sensible defaults.
 * 
 * @param field - The DDS field element to convert
 * @returns A `FieldInfo` object containing the mapped properties
 */
function toFieldInfo(field: DdsField): FieldInfo {
    return {
        name: field.name,
        type: field.type,
        row: field.row ?? 0,
        col: field.column ?? 0,
        length: field.length ?? 1,
        attributes: field.attributes?.map(attr => ({
            value: attr.value,
            indicators: attr.indicators,
            lineIndex: attr.lineIndex,
            lastLineIndex: attr.lastLineIndex ?? attr.lineIndex
        })) ?? [],
        indicators: field.indicators,
        lineIndex: field.lineIndex,
        lastLineIndex: field.lineIndex 
    };
};

/**
 * Checks if a field is hidden based on the DDS field definition
 * 
 * Hidden fields are those that don't appear on the screen but are used
 * for data processing purposes.
 * 
 * @param field - The DDS field element to check
 * @returns True if field is hidden, false if it's visible on screen
 */
function isFieldHidden(field: DdsField): boolean {
    return field.hidden === true;
};

/**
 * Collects complete configuration for copying a field
 * 
 * This function guides the user through the process of configuring
 * how the field should be copied, including target record, new name,
 * and positioning (for visible fields).
 * 
 * @param editor - The VS Code text editor instance
 * @param sourceField - Information about the source field
 * @param sourceRecord - Name of the source record
 * @param isHidden - Whether the field is hidden (no screen position)
 * @returns Complete copy configuration or null if user cancelled
 */
async function collectCopyConfiguration(editor: vscode.TextEditor, sourceField: FieldInfo, sourceRecord: string, isHidden: boolean): Promise<CopyFieldConfig | null> {
    
    // Step 1: Ask for target record (default to same record)
    const targetRecord = await promptForTargetRecord(sourceRecord);
    if (!targetRecord) return null;

    // Step 2: Get new field name
    const newName = await promptForCopiedFieldName(sourceField, targetRecord);
    if (!newName) return null;

    // Step 3: Get target position (only if field is not hidden)
    let targetPosition : FieldPosition | null = null;

    if (!isHidden) {
        targetPosition = await collectTargetPosition(editor, sourceField, targetRecord, newName);
        if (!targetPosition) return null;
    };

    return {
        sourceField,
        sourceRecord,
        targetRecord,
        newName,
        targetPosition
    };
};

/**
 * Prompts user to select target record
 * 
 * Presents a quick pick list of available records, with the source record
 * shown first as the default option.
 * 
 * @param sourceRecord - Name of the source record (shown as default)
 * @returns Selected target record name or null if cancelled
 */
async function promptForTargetRecord(sourceRecord: string): Promise<string | null> {
    // Get all available records from the global state
    const availableRecords = fieldsPerRecords.map(r => r.record);
    
    if (availableRecords.length === 0) {
        vscode.window.showErrorMessage('No records found in the current file.');
        return null;
    };

    // Put source record first, keep the rest in their original order
    const recordOptions = [
        {
            label: sourceRecord,
            description: '(Source record)',
            detail: 'Copy to same record',
            value: sourceRecord
        },
        ...availableRecords
            .filter(record => record !== sourceRecord)
            .map(record => ({
                label: record,
                description: '',
                detail: `Copy to different record: ${record}`,
                value: record
        }))
    ];

    const selection = await vscode.window.showQuickPick(recordOptions, {
        title: 'Select target record',
        placeHolder: `Choose record to copy field to.`,
        canPickMany: false,
        ignoreFocusOut: true
    });

    return selection ? selection.value : null;
};

/**
 * Prompts for the name of the copied field
 * 
 * Shows an input box with a suggested default name and validates
 * the input according to DDS field naming rules.
 * 
 * @param sourceField - Information about the source field
 * @param targetRecord - Name of the target record
 * @returns New field name or null if cancelled
 */
async function promptForCopiedFieldName(sourceField: FieldInfo, targetRecord: string): Promise<string | null> {
    // Suggest a default name (original name + copy suffix or increment)
    const defaultName = generateDefaultCopyName(sourceField.name, targetRecord);

    const newName = await vscode.window.showInputBox({
        title: `Copy field '${sourceField.name}' to record '${targetRecord}'`,
        prompt: "Enter the new field name (max 10 characters, no spaces, cannot start with number)",
        placeHolder: defaultName,
        value: defaultName,
        validateInput: (value: string) => validateCopiedFieldName(value, targetRecord)
    });

    return newName?.trim().toUpperCase() || null;
};

/**
 * Generates a default name for the copied field
 * 
 * Tries to create a unique name by:
 * 1. Using the original name if available
 * 2. Adding numeric suffixes (01, 02, etc.)
 * 3. Shortening the base name if needed
 * 4. Falling back to 'NEWFIELD' as last resort
 * 
 * @param originalName - The original field name
 * @param targetRecord - The target record name
 * @returns A suggested unique field name
 */
function generateDefaultCopyName(originalName: string, targetRecord: string): string {
    let baseName = originalName;
    let counter = 1;
    let suggestedName = baseName;

    // Try with original name first
    if (!fieldExistsInRecord(suggestedName, targetRecord)) {
        return suggestedName;
    };

    // Try with numeric suffix
    while (counter <= 99) {
        const suffix = counter.toString().padStart(2, '0');
        const nameWithoutSuffix = baseName.substring(0, Math.min(baseName.length, 8)); // Leave room for suffix
        suggestedName = `${nameWithoutSuffix}${suffix}`;
        
        if (suggestedName.length <= 10 && !fieldExistsInRecord(suggestedName, targetRecord)) {
            return suggestedName;
        };
        counter++;
    };

    // Fallback: try shortening the base name
    for (let i = baseName.length - 1; i >= 1; i--) {
        const shortName = baseName.substring(0, i);
        if (!fieldExistsInRecord(shortName, targetRecord)) {
            return shortName;
        };
    };

    return 'NEWFIELD';
};

/**
 * Validates the name for the copied field
 * 
 * Ensures the field name follows DDS naming conventions:
 * - Not empty
 * - Maximum 10 characters
 * - No spaces
 * - Cannot start with a number
 * - Only valid characters (letters, numbers, @, #, $, _, -)
 * - Must be unique in the target record
 * 
 * @param value - The field name to validate
 * @param targetRecord - The target record name
 * @returns Validation error message or null if valid
 */
function validateCopiedFieldName(value: string, targetRecord: string): string | null {
    const trimmedValue = value.trim();
    
    if (trimmedValue === '') {
        return "Field name cannot be empty.";
    };
    
    if (trimmedValue.length > COPY_CONSTANTS.MAX_NAME_LENGTH) {
        return `Field name must be ${COPY_CONSTANTS.MAX_NAME_LENGTH} characters or fewer.`;
    };
    
    if (/\s/.test(trimmedValue)) {
        return "Field name cannot contain spaces.";
    };
    
    if (/^\d/.test(trimmedValue)) {
        return "Field name cannot start with a number.";
    };
    
    if (!/^[A-Za-z][A-Za-z0-9@#$_-]*$/.test(trimmedValue)) {
        return "Field name can only contain letters, numbers, @, #, $, _, and -, and must start with a letter.";
    };

    // Check if field already exists in target record
    if (fieldExistsInRecord(trimmedValue.toUpperCase(), targetRecord)) {
        return `Field '${trimmedValue.toUpperCase()}' already exists in record '${targetRecord}'.`;
    };
    
    return null;
};

/**
 * Collects target position for the copied field
 * 
 * Offers three positioning methods:
 * 1. Same position as source
 * 2. Absolute position (user enters row/column)
 * 3. Relative to existing element
 * 
 * @param editor - The VS Code text editor instance
 * @param sourceField - Information about the source field
 * @param targetRecord - Name of the target record
 * @param newName - New name for the copied field
 * @returns Target position or null if cancelled
 */
async function collectTargetPosition(editor: vscode.TextEditor, sourceField: FieldInfo, targetRecord: string, newName: string): Promise<FieldPosition | null> {
    // Ask for positioning method
    const positioningType = await vscode.window.showQuickPick(
        [
            { 
                label: "Same position as source", 
                description: `Row: ${sourceField.row}, Column: ${sourceField.col}`,
                value: "same" 
            },
            { 
                label: "Absolute position", 
                description: "Enter specific row and column",
                value: "absolute" 
            },
            { 
                label: "Relative to existing element", 
                description: "Position relative to an existing field or constant",
                value: "relative" 
            }
        ],
        {
            title: `Choose position for copied field '${newName}' in record '${targetRecord}'`,
            placeHolder: "Select positioning method"
        }
    );

    if (!positioningType) return null;

    switch (positioningType.value) {
        case "same":
            // Verify the position is available
            if (await isPositionAvailable(editor, targetRecord, sourceField.row, sourceField.col, sourceField.length)) {
                return { row: sourceField.row, column: sourceField.col };
            } else {
                vscode.window.showWarningMessage('Source position is occupied in target record. Please choose a different position.');
                return await collectTargetPosition(editor, sourceField, targetRecord, newName);
            };

        case "absolute":
            return await getAbsolutePosition(newName);

        case "relative":
            return await getRelativePosition(editor, targetRecord, sourceField.length);

        default:
            return null;
    };
};

/**
 * Gets absolute position from user input
 * 
 * Prompts the user for specific row and column coordinates
 * and validates them against screen boundaries.
 * 
 * @param fieldName - Name of the field being positioned
 * @returns Absolute position or null if cancelled
 */
async function getAbsolutePosition(fieldName: string): Promise<FieldPosition | null> {
    // Get row position
    const row = await vscode.window.showInputBox({
        title: `Position for field '${fieldName}' - Row`,
        prompt: "Enter row position (1-24)",
        placeHolder: "10",
        validateInput: (value) => validateNumericRange(value, 1, 24, "Row")
    });
    if (!row) return null;

    // Get column position
    const column = await vscode.window.showInputBox({
        title: `Position for field '${fieldName}' - Column`,
        prompt: "Enter column position (1-80)",
        placeHolder: "20",
        validateInput: (value) => validateNumericRange(value, 1, 80, "Column")
    });
    if (!column) return null;

    return {
        row: Number(row),
        column: Number(column)
    };
};

/**
 * Gets relative position based on existing elements
 * 
 * Allows the user to position the new field relative to an existing
 * field or constant in the target record.
 * 
 * @param editor - The VS Code text editor instance
 * @param targetRecord - Name of the target record
 * @param fieldLength - Length of the field being positioned
 * @returns Relative position or null if cancelled
 */
async function getRelativePosition(editor: vscode.TextEditor, targetRecord: string, fieldLength: number): Promise<FieldPosition | null> {
    // Get existing elements in the target record
    const existingElements = await getExistingElementsInRecord(editor, targetRecord);
    
    if (existingElements.length === 0) {
        vscode.window.showInformationMessage("No existing fields or constants found in target record. Using absolute positioning.");
        return await getAbsolutePosition("field");
    };

    // Show elements for selection
    const selectedElement = await vscode.window.showQuickPick(
        existingElements.map(element => ({
            label: `${element.name} (${element.type})`,
            description: `Row: ${element.row}, Col: ${element.column}, Width: ${element.width}`,
            detail: `Line: ${element.lineIndex + 1}`,
            element: element
        })),
        {
            title: "Select reference element",
            placeHolder: "Choose the field or constant to position relative to"
        }
    );

    if (!selectedElement) return null;

    // Ask for relative position
    const relativePosition = await vscode.window.showQuickPick(
        [
            { 
                label: "Above", 
                description: "Position above the selected element",
                value: "above" 
            },
            { 
                label: "Below", 
                description: "Position below the selected element",
                value: "below" 
            },
            { 
                label: "To the right", 
                description: "Position to the right of the selected element",
                value: "right" 
            }
        ],
        {
            title: "Relative position",
            placeHolder: "Where should the field be positioned?"
        }
    );

    if (!relativePosition) return null;

    // Calculate new position based on reference element
    const referenceElement = selectedElement.element;
    let newRow: number;
    let newColumn: number;

    switch (relativePosition.value) {
        case "above":
            newRow = referenceElement.row - 1;
            newColumn = referenceElement.column;
            break;
        case "below":
            newRow = referenceElement.row + 1;
            newColumn = referenceElement.column;
            break;
        case "right":
            newRow = referenceElement.row;
            newColumn = referenceElement.column + referenceElement.width + 1;
            break;
        default:
            return null;
    };

    // Validate position bounds
    if (newRow < 1 || newRow > 24) {
        vscode.window.showErrorMessage(`Invalid row position: ${newRow}. Must be between 1 and 24.`);
        return null;
    };

    if (newColumn < 1 || newColumn + fieldLength - 1 > 80) {
        vscode.window.showErrorMessage(`Invalid column position: ${newColumn}. Field would extend beyond screen width.`);
        return null;
    };

    return {
        row: newRow,
        column: newColumn
    };
};

/**
 * Generates the DDS lines for the copied field (including all attributes and indicators)
 * 
 * Creates all the DDS source lines needed for the copied field, including:
 * - Main field definition line
 * - Continuation lines for attributes
 * - Indicator specifications
 * 
 * @param editor - The VS Code text editor instance
 * @param config - Complete copy configuration
 * @param isHidden - Whether the field is hidden (no screen position)
 * @returns Array of DDS source lines for the copied field
 */
async function generateCopiedFieldLines(editor: vscode.TextEditor, config: CopyFieldConfig, isHidden: boolean): Promise<string[]> {
    const document = editor.document;
    const lines: string[] = [];

    // Get all lines for the source field (main line + continuation lines)
    const startLine = config.sourceField.lineIndex;
    let endLine = config.sourceField.lastLineIndex;
    
    // Add field attributes lines to determine the full range
    for (let i = 0; i < config.sourceField.attributes.length; i++) {
        if (config.sourceField.attributes[i].lastLineIndex > endLine) {
            endLine = config.sourceField.attributes[i].lastLineIndex;
        };
    };

    // Copy all lines from source field
    for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
        if (lineIndex >= document.lineCount) break;

        const originalLine = document.lineAt(lineIndex).text;
        let copiedLine = originalLine;

        // For the first line, update name and position
        if (lineIndex === startLine) {
            copiedLine = updateMainFieldLine(originalLine, config, isHidden);
        };
        // For continuation lines, just copy as-is (they contain attributes/indicators)
        
        lines.push(copiedLine);
    };

    return lines;
};

/**
 * Updates the main field line with new name and position
 * 
 * Modifies the DDS source line to use the new field name and position
 * while preserving all other field attributes.
 * 
 * @param originalLine - The original DDS source line
 * @param config - Complete copy configuration
 * @param isHidden - Whether the field is hidden (no screen position)
 * @returns Updated DDS source line
 */
function updateMainFieldLine(originalLine: string, config: CopyFieldConfig, isHidden: boolean): string {
    let line = originalLine.padEnd(80, ' ');

    // Update field name (columns 19-28, 0-based: 18-27)
    const paddedName = config.newName.padEnd(10, ' ');
    line = replaceAt(line, COPY_CONSTANTS.NAME_COLUMN_START, paddedName);

    // Update position only for visible fields
    if (!isHidden && config.targetPosition) {
        // Update position (columns 40-41 row, 43-44 col, 0-based: 39-40, 42-43)
        const rowStr = config.targetPosition.row.toString().padStart(2, ' ');
        const colStr = config.targetPosition.column.toString().padStart(2, ' ');
        line = replaceAt(line, COPY_CONSTANTS.ROW_COLUMN_START, rowStr);
        line = replaceAt(line, COPY_CONSTANTS.COLUMN_COLUMN_START, colStr);
    } else if (isHidden) {
        // For hidden fields, clear the position columns
        line = replaceAt(line, COPY_CONSTANTS.ROW_COLUMN_START, '  ');
        line = replaceAt(line, COPY_CONSTANTS.COLUMN_COLUMN_START, '  ');
    };

    return line.trimEnd();
};

/**
 * Helper function to replace characters at specific position
 * 
 * Replaces a substring in a string starting at the specified index
 * with the replacement text.
 * 
 * @param str - The original string
 * @param index - Starting index for replacement (0-based)
 * @param replacement - The replacement text
 * @returns Modified string with replacement applied
 */
function replaceAt(str: string, index: number, replacement: string): string {
    return str.substring(0, index) + replacement + str.substring(index + replacement.length);
};

/**
 * Inserts the copied field into the target record
 * 
 * Uses VS Code's WorkspaceEdit API to insert all the generated
 * DDS lines for the copied field at the appropriate location.
 * 
 * @param editor - The VS Code text editor instance
 * @param targetRecord - Name of the target record
 * @param fieldLines - Array of DDS source lines to insert
 */
async function insertCopiedField(editor: vscode.TextEditor, targetRecord: string, fieldLines: string[]): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Find insertion point in target record
    const insertLineIndex = findFieldInsertionPoint(targetRecord);
    
    // Build full block text with line breaks
    let blockText = fieldLines.join('\n');

    // Ensure final newline if we're not at end of file
    if (insertLineIndex < editor.document.lineCount) {
        blockText += '\n';
    };

    // Create the insertion position
    const insertPosition = new vscode.Position(insertLineIndex, 0);

    // Insert newline if we're at the end of the document
    if (insertPosition.line >= editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPosition, '\n');
    };

    // Insert the block at once
    workspaceEdit.insert(uri, insertPosition, blockText);

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
        throw new Error("Failed to insert copied field into the document.");
    };
};

// UTILITY FUNCTIONS

/**
 * Validates that the selected node is valid for copying
 * 
 * Checks if the provided node contains a valid DDS element
 * and specifically if it's a field (the only copyable element type).
 * 
 * @param node - The DDS node to validate
 * @returns Validation result with success status and optional error message
 */
function validateNodeForCopy(node: DdsNode): ValidationResult {
    if (!node?.ddsElement) {
        return {
            isValid: false,
            errorMessage: "Invalid node selected. Please select a valid DDS element."
        };
    };

    if (node.ddsElement.kind !== "field") {
        return {
            isValid: false,
            errorMessage: "Only fields can be copied. Please select a field element."
        };
    };

    return { isValid: true };
};

/**
 * Finds the record that contains a specific field
 * 
 * Searches through all records to find which one contains
 * the field at the specified line index.
 * 
 * @param fieldName - Name of the field to find
 * @param lineIndex - Line index where the field is defined
 * @returns Record name or null if not found
 */
function findRecordContainingField(fieldName: string, lineIndex: number): string | null {
    for (const record of fieldsPerRecords) {
        if (lineIndex >= record.startIndex && lineIndex <= record.endIndex) {
            return record.record;
        };
    };
    return null;
};

/**
 * Checks if a field exists in a specific record
 * 
 * Searches the specified record to see if a field with
 * the given name already exists.
 * 
 * @param fieldName - Name of the field to check
 * @param recordName - Name of the record to search in
 * @returns True if field exists, false otherwise
 */
function fieldExistsInRecord(fieldName: string, recordName: string): boolean {
    const record = fieldsPerRecords.find(r => 
        r.record.toUpperCase() === recordName.toUpperCase()
    );
    
    if (!record) return false;
    
    return record.fields.some(field => 
        field.name.toUpperCase() === fieldName.toUpperCase()
    );
};

/**
 * Checks if a position is available (not occupied by another element)
 * 
 * Verifies that the proposed position doesn't overlap with
 * any existing fields or constants in the target record.
 * 
 * @param editor - The VS Code text editor instance
 * @param recordName - Name of the record to check
 * @param row - Row position to check
 * @param col - Column position to check
 * @param length - Length of the field to place
 * @returns True if position is available, false if occupied
 */
async function isPositionAvailable(editor: vscode.TextEditor, recordName: string, row: number, col: number, length: number): Promise<boolean> {
    const existingElements = await getExistingElementsInRecord(editor, recordName);
    
    // Check if any existing element overlaps with the proposed position
    for (const element of existingElements) {
        if (element.row === row) {
            // Same row - check for column overlap
            const elementEndCol = element.column + element.width - 1;
            const newFieldEndCol = col + length - 1;
            
            // Check for overlap
            if ((col >= element.column && col <= elementEndCol) ||
                (newFieldEndCol >= element.column && newFieldEndCol <= elementEndCol) ||
                (col <= element.column && newFieldEndCol >= elementEndCol)) {
                return false;
            };
        };
    };
    
    return true;
};

/**
 * Gets existing elements in a record
 * 
 * Retrieves all fields and constants in the specified record,
 * sorted by position for easy reference during positioning.
 * 
 * @param editor - The VS Code text editor instance
 * @param recordName - Name of the record to analyze
 * @returns Array of existing elements with position information
 */
async function getExistingElementsInRecord(editor: vscode.TextEditor, recordName: string): Promise<ExistingElementInfo[]> {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    if (!record) return [];

    const elements: ExistingElementInfo[] = [];

    // Add fields that have screen positions
    for (const field of record.fields) {
        if (field.row > 0 && field.col > 0) {
            elements.push({
                name: field.name,
                text: field.name,
                row: field.row,
                column: field.col,
                width: field.length,
                lineIndex: field.lineIndex,
                type: 'field'
            });
        };
    };

    // Add constants
    for (const constant of record.constants) {
        elements.push({
            name: constant.name || 'Constant',
            text: constant.name || 'Constant',
            row: constant.row,
            column: constant.col,
            width: constant.length,
            lineIndex: constant.lineIndex,
            type: 'constant'
        });
    };

    // Sort by row first, then column
    elements.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.column - b.column;
    });

    return elements;
};

/**
 * Finds the insertion point for a new field in a record
 * 
 * Determines the line index where a new field should be inserted
 * within the target record (typically at the end of the record).
 * 
 * @param recordName - Name of the record where field will be inserted
 * @returns Line index for insertion
 */
function findFieldInsertionPoint(recordName: string): number {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    if (!record) return 0;
    
    // Insert at the end of the record
    return record.endIndex + 1;
};

/**
 * Validates numeric input within range
 * 
 * Ensures that user input is a valid number within the specified range.
 * Used for validating row and column positions.
 * 
 * @param value - The input value to validate
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)  
 * @param fieldName - Name of the field being validated (for error messages)
 * @returns Validation error message or null if valid
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
