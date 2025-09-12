/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.copy-field.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords, FieldInfo, FieldsPerRecord, DdsField } from '../dspf-edit.model/dspf-edit.model';
import { ExtensionState } from '../dspf-edit.states/state';

/**
 * Interface for field copy configuration
 */
interface CopyFieldConfig {
    sourceField: FieldInfo;
    sourceRecord: string;
    targetRecord: string;
    newName: string;
    targetPosition: FieldPosition;
};

/**
 * Interface for field position on screen
 */
interface FieldPosition {
    row: number;
    column: number;
};

/**
 * Interface for existing element information (fields and constants)
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
 */
interface ValidationResult {
    isValid: boolean;
    errorMessage?: string;
};

/**
 * Constants for field copying operations
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
 * @param node - The selected DDS node from the tree view
 */
async function handleCopyFieldCommand(node: DdsNode): Promise<void> {
    try {
        // Validate the selected node
        const validationResult = validateNodeForCopy(node);
        if (!validationResult.isValid) {
            vscode.window.showWarningMessage(validationResult.errorMessage!);
            return;
        };

        const editor = ExtensionState.lastDdsEditor;
        const document = editor?.document ?? ExtensionState.lastDdsDocument;
        if (!document || !editor) {
            vscode.window.showErrorMessage('No DDS editor found.');
            return;
        };

        if (node.ddsElement.kind !== "field") {
            vscode.window.showWarningMessage("Only fields can be copied.");
            return;
        };
        
        const sourceElement = toFieldInfo(node.ddsElement as DdsField);
                
        // Find the source record
        const sourceRecord = findRecordContainingField(sourceElement.name, sourceElement.lineIndex);
        if (!sourceRecord) {
            vscode.window.showErrorMessage(`Could not determine source record for field '${sourceElement.name}'.`);
            return;
        };

        // Collect copy configuration from user
        const copyConfig = await collectCopyConfiguration(editor, sourceElement, sourceRecord);
        if (!copyConfig) {
            return; // User cancelled
        };

        // Generate the copied field lines (including all attributes and indicators)
        const copiedFieldLines = await generateCopiedFieldLines(editor, copyConfig);

        // Insert the copied field into the target record
        await insertCopiedField(editor, copyConfig.targetRecord, copiedFieldLines);

        // Show success message
        vscode.window.showInformationMessage(
            `Field '${copyConfig.sourceField.name}' successfully copied to '${copyConfig.newName}' in record '${copyConfig.targetRecord}'.`
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to copy field: ${errorMessage}`);
        console.error('Error in copyField command:', error);
    };
};

/**
 * Converts a parsed DDS field element into an internal FieldInfo structure.
 * 
 * This function maps the properties from the raw `DdsField` (produced by the DDS parser)
 * into the normalized `FieldInfo` format used internally by the extension.
 * 
 * @param field - The DDS field element to convert.
 * @returns A `FieldInfo` object containing the mapped properties.
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
 * Collects complete configuration for copying a field
 */
async function collectCopyConfiguration(editor: vscode.TextEditor, sourceField: FieldInfo, sourceRecord: string): Promise<CopyFieldConfig | null> {
    
    // Step 1: Ask for target record (default to same record)
    const targetRecord = await promptForTargetRecord(sourceRecord);
    if (!targetRecord) return null;

    // Step 2: Get new field name
    const newName = await promptForCopiedFieldName(sourceField, targetRecord);
    if (!newName) return null;

    // Step 3: Get target position
    const targetPosition = await collectTargetPosition(editor, sourceField, targetRecord, newName);
    if (!targetPosition) return null;

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
 */
async function promptForTargetRecord(sourceRecord: string): Promise<string | null> {
    // Get all available records
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
        placeHolder: `Choose record to copy field to (default: ${sourceRecord})`,
        canPickMany: false,
        ignoreFocusOut: true
    });

    return selection ? selection.value : null;
};

/**
 * Prompts for the name of the copied field
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

    // Calculate new position
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
            newColumn = referenceElement.column + referenceElement.width + 1; // +1 for spacing
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
 */
async function generateCopiedFieldLines(editor: vscode.TextEditor, config: CopyFieldConfig): Promise<string[]> {
    const document = editor.document;
    const lines: string[] = [];

    // Get all lines for the source field (main line + continuation lines)
    const startLine = config.sourceField.lineIndex;
    let endLine = config.sourceField.lastLineIndex;
    // Add field attributes lines
    for (let i = 0; i < config.sourceField.attributes.length; i++) {
        if (config.sourceField.attributes[i].lastLineIndex > endLine) {
            endLine = config.sourceField.attributes[i].lastLineIndex;
        };
    };

    for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
        if (lineIndex >= document.lineCount) break;

        const originalLine = document.lineAt(lineIndex).text;
        let copiedLine = originalLine;

        // For the first line, update name and position
        if (lineIndex === startLine) {
            copiedLine = updateMainFieldLine(originalLine, config);
        };
        // For continuation lines, just copy as-is (they contain attributes/indicators)
        
        lines.push(copiedLine);
    };

    return lines;
};

/**
 * Updates the main field line with new name and position
 */
function updateMainFieldLine(originalLine: string, config: CopyFieldConfig): string {
    let line = originalLine.padEnd(80, ' ');

    // Update field name (columns 19-28)
    const paddedName = config.newName.padEnd(10, ' ');
    line = replaceAt(line, COPY_CONSTANTS.NAME_COLUMN_START, paddedName);

    // Update position (columns 40-41 for row, 43-44 for column)
    const rowStr = config.targetPosition.row.toString().padStart(2, ' ');
    const colStr = config.targetPosition.column.toString().padStart(2, ' ');
    line = replaceAt(line, COPY_CONSTANTS.ROW_COLUMN_START, rowStr);
    line = replaceAt(line, COPY_CONSTANTS.COLUMN_COLUMN_START, colStr);

    return line.trimEnd();
};

/**
 * Helper function to replace characters at specific position
 */
function replaceAt(str: string, index: number, replacement: string): string {
    return str.substring(0, index) + replacement + str.substring(index + replacement.length);
};

/**
 * Inserts the copied field into the target record
 */
async function insertCopiedField(editor: vscode.TextEditor, targetRecord: string, fieldLines: string[]): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Find insertion point in target record
    const insertLineIndex = findFieldInsertionPoint(targetRecord);
    
    // Insert all lines for the copied field

    // Build full block text with line breaks
    let blockText = fieldLines.join('\n');

    // Ensure final newline if we're not at end of file
    if (insertLineIndex < editor.document.lineCount) {
        blockText += '\n';
    };

    // Create the insertion position
    const insertPosition = new vscode.Position(insertLineIndex, 0);

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
 */
async function getExistingElementsInRecord(editor: vscode.TextEditor, recordName: string): Promise<ExistingElementInfo[]> {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    if (!record) return [];

    const elements: ExistingElementInfo[] = [];

    // Add fields
    for (const field of record.fields) {
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

    // Sort by row, then by column
    elements.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.column - b.column;
    });

    return elements;
};

/**
 * Finds the insertion point for a new field in a record
 */
function findFieldInsertionPoint(recordName: string): number {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    if (!record) return 0;
    
    return record.endIndex + 1;
};

/**
 * Validates numeric input within range
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
