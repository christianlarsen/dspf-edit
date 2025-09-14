/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.copy-constant.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords, ConstantInfo, FieldsPerRecord, DdsConstant, AttributeWithIndicators } from '../dspf-edit.model/dspf-edit.model';
import { ExtensionState } from '../dspf-edit.states/state';

/**
 * Interface for constant copy configuration
 */
interface CopyConstantConfig {
    sourceConstant: ConstantInfo;
    sourceRecord: string;
    targetRecord: string;
    newName?: string; 
    targetPosition: ConstantPosition;
};

/**
 * Interface for constant position on screen
 */
interface ConstantPosition {
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
 * Constants for constant copying operations
 */
const COPY_CONSTANTS = {
    NAME_COLUMN_START: 44,
    NAME_COLUMN_END: 80,
    ROW_COLUMN_START: 39,
    ROW_COLUMN_END: 41,
    COLUMN_COLUMN_START: 42,
    COLUMN_COLUMN_END: 44
} as const;

// COMMAND REGISTRATION

/**
 * Registers the copy constant command for the VS Code extension
 * 
 * @param context The VS Code extension context for registering commands and subscriptions
 */
export function copyConstant(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.copy-constant", async (node: DdsNode) => {
            await handleCopyConstantCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Main command handler for copying DDS constants
 * 
 * @param node The selected DDS node from the tree view
 */
async function handleCopyConstantCommand(node: DdsNode): Promise<void> {
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

        if (node.ddsElement.kind !== "constant") {
            vscode.window.showWarningMessage("Only constants can be copied.");
            return;
        };
        
        const sourceElement = toConstantInfo(node.ddsElement as DdsConstant);
                
        // Find the source record
        const sourceRecord = findRecordContainingConstant(sourceElement.name, sourceElement.lineIndex);
        if (!sourceRecord) {
            vscode.window.showErrorMessage(`Could not determine source record for constant '${sourceElement.name}'.`);
            return;
        };

        // Collect copy configuration from user
        const copyConfig = await collectCopyConfiguration(editor, sourceElement, sourceRecord);
        if (!copyConfig) {
            return; // User cancelled
        };

        // Generate the copied constant lines (including all attributes and indicators)
        const copiedConstantLines = await generateCopiedConstantLines(editor, copyConfig);

        // Insert the copied constant into the target record
        await insertCopiedConstant(editor, copyConfig.targetRecord, copiedConstantLines);

        // Show success message
        vscode.window.showInformationMessage(
            `Constant successfully copied to record '${copyConfig.targetRecord}'.`
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to copy constant: ${errorMessage}`);
        console.error('Error in copyConstant command:', error);
    };
};

/**
 * Converts a parsed DDS constant element into an internal ConstantInfo structure.
 * 
 * This function maps the properties from the raw `DdsConstant` (produced by the DDS parser)
 * into the normalized `ConstantInfo` format used internally by the extension.
 * 
 * @param constant The DDS constant element to convert
 * @returns A `ConstantInfo` object containing the mapped properties
 */
function toConstantInfo(constant: DdsConstant): ConstantInfo {
    return {
        name: constant.name,
        row: constant.row,
        col: constant.column,
        length: calculateConstantLength(constant),
        attributes: constant.attributes?.map(attr => ({
            value: attr.value,
            indicators: attr.indicators,
            lineIndex: attr.lineIndex,
            lastLineIndex: attr.lastLineIndex ?? attr.lineIndex
        })) ?? [],
        lineIndex: constant.lineIndex,
        lastLineIndex: constant.lineIndex 
    };
};

/**
 * Calculates the display length of a constant based on its text content
 * For DDS constants, this is typically the length of the displayed text
 * 
 * @param constant The DDS constant to calculate length for
 * @returns The display width of the constant
 */
function calculateConstantLength(constant: DdsConstant): number {
    // For constants, the length is the display width of the text content
    // The 'name' field in DdsConstant actually contains the display text
    return constant.name ? constant.name.length : 1;
};

/**
 * Collects complete configuration for copying a constant
 * 
 * @param editor The active VS Code text editor
 * @param sourceConstant The source constant to copy
 * @param sourceRecord The record containing the source constant
 * @returns The copy configuration or null if cancelled
 */
async function collectCopyConfiguration(editor: vscode.TextEditor, sourceConstant: ConstantInfo, sourceRecord: string): Promise<CopyConstantConfig | null> {
    
    // Step 1: Ask for target record (default to same record)
    const targetRecord = await promptForTargetRecord(sourceRecord);
    if (!targetRecord) return null;

    // Step 2: Get constant content
    const newName = await promptForCopiedConstantContent(sourceConstant, targetRecord);
    if (newName === null) return null; // User cancelled

    // Step 3: Get target position
    const targetPosition = await collectTargetPosition(editor, sourceConstant, targetRecord, newName || 'constant');
    if (!targetPosition) return null;

    return {
        sourceConstant,
        sourceRecord,
        targetRecord,
        newName: newName || undefined,
        targetPosition
    };
};

/**
 * Prompts user to select target record
 * 
 * @param sourceRecord The source record name
 * @returns The selected target record name or null if cancelled
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
        placeHolder: `Choose record to copy constant to (default: ${sourceRecord})`,
        canPickMany: false,
        ignoreFocusOut: true
    });

    return selection ? selection.value : null;
};

/**
 * Prompts for the content of the copied constant
 * 
 * @param sourceConstant The source constant information
 * @param targetRecord The target record name
 * @returns The new constant content or null if cancelled
 */
async function promptForCopiedConstantContent(sourceConstant: ConstantInfo, targetRecord: string): Promise<string | null> {
    
    // Remove the apostrophes
    const defaultName = sourceConstant.name.slice(1, -1);

    const newName = await vscode.window.showInputBox({
        title: `Copy constant to record '${targetRecord}'`,
        prompt: "Enter the new constant content or leave it without changes",
        placeHolder: defaultName,
        value: defaultName,
        validateInput: (value: string) => validateCopiedConstantName(value)
    });

    // Return null if user cancelled, empty string for unnamed constant
    return newName === undefined ? null : newName;
};

/**
 * Validates the name for the copied constant
 * 
 * @param value The constant name to validate
 * @returns Error message if invalid, null if valid
 */
function validateCopiedConstantName(value: string): string | null {
    
    // Empty is not valid
    if (value === '') {
        return null;
    };
    return null;
};

/**
 * Collects target position for the copied constant
 * 
 * @param editor The active VS Code text editor
 * @param sourceConstant The source constant information
 * @param targetRecord The target record name
 * @param displayName The display name for prompts
 * @returns The target position or null if cancelled
 */
async function collectTargetPosition(editor: vscode.TextEditor, sourceConstant: ConstantInfo, targetRecord: string, displayName: string): Promise<ConstantPosition | null> {
    // Ask for positioning method
    const positioningType = await vscode.window.showQuickPick(
        [
            { 
                label: "Same position as source", 
                description: `Row: ${sourceConstant.row}, Column: ${sourceConstant.col}`,
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
            title: `Choose position for copied constant in record '${targetRecord}'`,
            placeHolder: "Select positioning method"
        }
    );

    if (!positioningType) return null;

    switch (positioningType.value) {
        case "same":
            // Verify the position is available
            if (await isPositionAvailable(editor, targetRecord, sourceConstant.row, sourceConstant.col, sourceConstant.length)) {
                return { row: sourceConstant.row, column: sourceConstant.col };
            } else {
                vscode.window.showWarningMessage('Source position is occupied in target record. Please choose a different position.');
                return await collectTargetPosition(editor, sourceConstant, targetRecord, displayName);
            }

        case "absolute":
            return await getAbsolutePosition(displayName);

        case "relative":
            return await getRelativePosition(editor, targetRecord, sourceConstant.length);

        default:
            return null;
    };
};

/**
 * Gets absolute position from user input
 * 
 * @param constantName The constant name for display purposes
 * @returns The absolute position or null if cancelled
 */
async function getAbsolutePosition(constantName: string): Promise<ConstantPosition | null> {
    // Get row position
    const row = await vscode.window.showInputBox({
        title: `Position for constant '${constantName}' - Row`,
        prompt: "Enter row position (1-24)",
        placeHolder: "10",
        validateInput: (value) => validateNumericRange(value, 1, 24, "Row")
    });
    if (!row) return null;

    // Get column position
    const column = await vscode.window.showInputBox({
        title: `Position for constant '${constantName}' - Column`,
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
 * @param editor The active VS Code text editor
 * @param targetRecord The target record name
 * @param constantLength The length of the constant to position
 * @returns The relative position or null if cancelled
 */
async function getRelativePosition(editor: vscode.TextEditor, targetRecord: string, constantLength: number): Promise<ConstantPosition | null> {
    // Get existing elements in the target record
    const existingElements = await getExistingElementsInRecord(editor, targetRecord);
    
    if (existingElements.length === 0) {
        vscode.window.showInformationMessage("No existing fields or constants found in target record. Using absolute positioning.");
        return await getAbsolutePosition("constant");
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
            placeHolder: "Where should the constant be positioned?"
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

    if (newColumn < 1 || newColumn + constantLength - 1 > 80) {
        vscode.window.showErrorMessage(`Invalid column position: ${newColumn}. Constant would extend beyond screen width.`);
        return null;
    };

    return {
        row: newRow,
        column: newColumn
    };
};

/**
 * Generates the DDS lines for the copied constant using model data
 * 
 * @param editor The active VS Code text editor
 * @param config The copy configuration
 * @returns Array of generated DDS lines
 */
async function generateCopiedConstantLines(editor: vscode.TextEditor, config: CopyConstantConfig): Promise<string[]> {
    const lines: string[] = [];

    // Generate the new constant content lines
    const newConstantValue = config.newName ? `'${config.newName}'` : `'${config.sourceConstant.name.slice(1, -1)}'`;
    const constantContentLines = generateConstantContentLines(config, newConstantValue);
    
    // Add the constant content lines
    lines.push(...constantContentLines);
    
    // Add attribute lines from the model
    for (const attribute of config.sourceConstant.attributes) {
        const attributeLines = await generateAttributeLines(editor, attribute, config.targetPosition);
        lines.push(...attributeLines);
    };

    return lines;
};

/**
 * Generates the content lines for the constant (main line + continuation lines if needed)
 * 
 * @param config The copy configuration
 * @param newConstantValue The new constant value to use
 * @returns Array of generated constant content lines
 */
function generateConstantContentLines(config: CopyConstantConfig, newConstantValue: string): string[] {
    const lines: string[] = [];
    
    // Create base line with position
    const rowStr = config.targetPosition.row.toString().padStart(2, ' ');
    const colStr = config.targetPosition.column.toString().padStart(2, ' ');
    const baseLine = `     A` + ' '.repeat(33) + `${rowStr} ${colStr}`;

    // Check if the new constant fits in a single line (36 characters or less)
    if (newConstantValue.length <= 36) {
        // Single line: just add the constant value
        const singleLine = baseLine + newConstantValue;
        lines.push(singleLine.trimEnd());

    } else {
        // Multi-line: split the constant across multiple lines
        let remainingText = newConstantValue;
        
        // First line: take first 35 characters and add continuation marker
        const firstChunk = remainingText.substring(0, 35);
        remainingText = remainingText.substring(35);
        const firstLine = baseLine + firstChunk.padEnd(35, ' ') + '-';
        lines.push(firstLine.trimEnd());

        // Continuation lines
        while (remainingText.length > 0) {
            const nextChunk = remainingText.substring(0, 35);
            remainingText = remainingText.substring(35);
            
            // Check if this is the last chunk
            const isLastChunk = remainingText.length === 0;
            const continuationChar = isLastChunk ? ' ' : '-';
            
            // Create continuation line: "     A" + spaces to position 44 + chunk + continuation marker
            const contLine = '     A' + ' '.repeat(38) + nextChunk.padEnd(35, ' ') + continuationChar;
            lines.push(contLine.trimEnd());
            
            if (isLastChunk) {
                break;
            };
        };
    };

    return lines;
};

/**
 * Generates attribute lines from the model data, handling long attribute values
 * 
 * @param editor The active VS Code text editor
 * @param attribute The attribute to generate lines for
 * @param targetPosition The target position for the attribute
 * @returns Array of generated attribute lines
 */
async function generateAttributeLines(editor: vscode.TextEditor, attribute: AttributeWithIndicators, targetPosition: { row: number; column: number}): Promise<string[]> {
    const lines: string[] = [];
    
    // Extract the attribute value from the original attribute
    const attributeValue = extractAttributeValue(editor, attribute);
    
    if (!attributeValue) {
        // If we can't extract the value, fall back to copying original lines
        return copyOriginalAttributeLines(editor, attribute);
    };

    // Generate new attribute lines with proper positioning
    const attributeLines = generateAttributeContentLines(attribute, attributeValue, targetPosition);
    lines.push(...attributeLines);

    return lines;
};

/**
 * Extracts the attribute value from the original attribute lines
 * 
 * @param editor The active VS Code text editor
 * @param attribute The attribute to extract value from
 * @returns The extracted attribute value or null if extraction fails
 */
function extractAttributeValue(editor: vscode.TextEditor, attribute: AttributeWithIndicators): string | null {
    const document = editor.document;
    let attributeValue = '';
    
    try {
        for (let lineIndex = attribute.lineIndex; lineIndex <= attribute.lastLineIndex; lineIndex++) {
            if (lineIndex >= document.lineCount) break;
            
            const line = document.lineAt(lineIndex).text;
            
            if (lineIndex === attribute.lineIndex) {
                // First line: extract everything after the keyword
                const keywordMatch = line.match(/\s+A\s+.*?\s+\d+\s+\d+(.+)/);
                if (keywordMatch) {
                    attributeValue += keywordMatch[1].replace(/\s*-\s*$/, ''); // Remove continuation marker
                };
            } else {
                // Continuation lines: extract content from position 44 onwards
                const continuationContent = line.substring(44).replace(/\s*-?\s*$/, ''); // Remove continuation marker and trailing spaces
                attributeValue += continuationContent;
            };
        };
        
        return attributeValue.trim();
    } catch (error) {
        console.error('Error extracting attribute value:', error);
        return null;
    };
};

/**
 * Generates the content lines for an attribute (main line + continuation lines if needed)
 * 
 * @param attribute The attribute information
 * @param attributeValue The attribute value to use
 * @param targetPosition The target position for the attribute
 * @returns Array of generated attribute content lines
 */
function generateAttributeContentLines(
    attribute: AttributeWithIndicators,
    attributeValue: string,
    targetPosition: { row: number; column: number }
): string[] {
    const lines: string[] = [];
    
    // Create base line with position for the attribute
    const rowStr = targetPosition.row.toString().padStart(2, ' ');
    const colStr = targetPosition.column.toString().padStart(2, ' ');
    
    const baseLine = `     A`+ ' '.repeat(33) + `${rowStr} ${colStr}`;

    // Check if the attribute value fits in a single line (36 characters or less)
    if (attributeValue.length <= 36) {
        // Single line: just add the attribute value
        const singleLine = baseLine + attributeValue;
        lines.push(singleLine.trimEnd());
    } else {
        // Multi-line: split the attribute value across multiple lines
        let remainingText = attributeValue;
        
        // First line: take first 35 characters and add continuation marker
        const firstChunk = remainingText.substring(0, 35);
        remainingText = remainingText.substring(35);
        const firstLine = baseLine + firstChunk.padEnd(35, ' ') + '-';
        lines.push(firstLine.trimEnd());

        // Continuation lines
        while (remainingText.length > 0) {
            const nextChunk = remainingText.substring(0, 35);
            remainingText = remainingText.substring(35);
            
            // Check if this is the last chunk
            const isLastChunk = remainingText.length === 0;
            const continuationChar = isLastChunk ? ' ' : '-';
            
            // Create continuation line: "     A" + spaces to position 44 + chunk + continuation marker
            const contLine = '     A' + ' '.repeat(38) + nextChunk.padEnd(35, ' ') + continuationChar;
            lines.push(contLine.trimEnd());
            
            if (isLastChunk) {
                break;
            };
        };
    };

    return lines;
};

/**
 * Fallback function to copy original attribute lines when value extraction fails
 * 
 * @param editor The active VS Code text editor
 * @param attribute The attribute to copy original lines from
 * @returns Array of original attribute lines
 */
function copyOriginalAttributeLines(editor: vscode.TextEditor, attribute: AttributeWithIndicators): string[] {
    const document = editor.document;
    const lines: string[] = [];

    // Get the original attribute lines from the document
    for (let lineIndex = attribute.lineIndex; lineIndex <= attribute.lastLineIndex; lineIndex++) {
        if (lineIndex >= document.lineCount) break;
        
        const originalLine = document.lineAt(lineIndex).text;
        lines.push(originalLine);
    };

    return lines;
};

/**
 * Inserts the copied constant into the target record
 * 
 * @param editor The active VS Code text editor
 * @param targetRecord The target record name
 * @param constantLines The generated constant lines to insert
 */
async function insertCopiedConstant(editor: vscode.TextEditor, targetRecord: string, constantLines: string[]): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Find insertion point in target record
    const insertLineIndex = findConstantInsertionPoint(targetRecord);
    
    // Build full block text with line breaks
    let blockText = constantLines.join('\n');

    // Ensure final newline if we're not at end of file
    if (insertLineIndex < editor.document.lineCount) {
        blockText += '\n';
    };

    // Create the insertion position
    const insertPosition = new vscode.Position(insertLineIndex, 0);

    // Insert cr if we're at the end of the document
    if (insertPosition.line >= editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPosition, '\n');
    };
    
    // Insert the block at once
    workspaceEdit.insert(uri, insertPosition, blockText);

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
        throw new Error("Failed to insert copied constant into the document.");
    };
};

// UTILITY FUNCTIONS

/**
 * Validates that the selected node is valid for copying
 * 
 * @param node The DDS node to validate
 * @returns Validation result with success status and optional error message
 */
function validateNodeForCopy(node: DdsNode): ValidationResult {
    if (!node?.ddsElement) {
        return {
            isValid: false,
            errorMessage: "Invalid node selected. Please select a valid DDS element."
        };
    };

    if (node.ddsElement.kind !== "constant") {
        return {
            isValid: false,
            errorMessage: "Only constants can be copied. Please select a constant element."
        };
    };

    return { isValid: true };
};

/**
 * Finds the record that contains a specific constant
 * 
 * @param constantName The name of the constant
 * @param lineIndex The line index where the constant is located
 * @returns The record name containing the constant or null if not found
 */
function findRecordContainingConstant(constantName: string, lineIndex: number): string | null {
    for (const record of fieldsPerRecords) {
        if (lineIndex >= record.startIndex && lineIndex <= record.endIndex) {
            return record.record;
        };
    };
    return null;
};

/**
 * Checks if a position is available
 * 
 * @param editor The active VS Code text editor
 * @param recordName The record name to check
 * @param row The row position to check
 * @param col The column position to check
 * @param length The length of the element to place
 * @returns True if position is available, false otherwise
 */
async function isPositionAvailable(editor: vscode.TextEditor, recordName: string, row: number, col: number, length: number): Promise<boolean> {
    const existingElements = await getExistingElementsInRecord(editor, recordName);
    
    // Check if any existing element overlaps with the proposed position
    for (const element of existingElements) {
        if (element.row === row) {
            // Same row - check for column overlap
            const elementEndCol = element.column + element.width - 1;
            const newConstantEndCol = col + length - 1;
            
            // Check for overlap
            if ((col >= element.column && col <= elementEndCol) ||
                (newConstantEndCol >= element.column && newConstantEndCol <= elementEndCol) ||
                (col <= element.column && newConstantEndCol >= elementEndCol)) {
                return false;
            };
        };
    };
    
    return true;
};

/**
 * Gets existing elements in a record
 * 
 * @param editor The active VS Code text editor
 * @param recordName The record name to get elements from
 * @returns Array of existing elements in the record
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

    // Sort by row/col
    elements.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.column - b.column;
    });

    return elements;
};

/**
 * Finds the insertion point for a new constant in a record
 * 
 * @param recordName The record name to find insertion point in
 * @returns The line index where the constant should be inserted
 */
function findConstantInsertionPoint(recordName: string): number {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    if (!record) return 0;
    
    // Constants are typically placed after fields, so insert at record end
    return record.endIndex + 1;
};

/**
 * Validates numeric input within range
 * 
 * @param value The value to validate
 * @param min The minimum allowed value
 * @param max The maximum allowed value
 * @param fieldName The field name for error messages
 * @returns Error message if invalid, null if valid
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
