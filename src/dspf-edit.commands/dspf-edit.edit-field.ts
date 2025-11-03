/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.edit-field.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fileSizeAttributes, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, parseSize } from '../dspf-edit.utils/dspf-edit.helper';

/**
 * Interface defining the structure of a field's size properties
 */
interface FieldSize {
    length: number;
    decimals: number | undefined;
};

/**
 * Interface for field validation results
 */
interface ValidationResult {
    isValid: boolean;
    errorMessage?: string;
};

/**
 * Interface for field position on screen
 */
interface FieldPosition {
    row: number;
    column: number;
};

/**
 * Interface for field usage specification
 */
interface FieldUsage {
    type: 'I' | 'O' | 'B' | 'H' | 'M' | 'P';
    description: string;
};

/**
 * Available field usage types for DDS (position 38)
 */
const FIELD_USAGE_TYPES = {
    'I': { label: 'Input only', description: 'Field passes data from display to program' },
    'O': { label: 'Output only', description: 'Field passes data from program to display' },
    'B': { label: 'Both (Input/Output)', description: 'Field can pass data in both directions' },
    'H': { label: 'Hidden', description: 'Field exists but is not displayed' },
    'M': { label: 'Message', description: 'Special output field for messages' },
    'P': { label: 'Program-to-system', description: 'Special field for program-system communication' }
} as const;

/**
 * Interface for field reference information
 */
interface FieldReference {
    library: string;
    file: string;
    field: string;
};

/**
 * Interface for field type configuration
 */
interface FieldTypeConfig {
    type: string;
    size: FieldSize;
};

/**
 * Complete new field configuration
 */
interface NewFieldConfig {
    name: string;
    position: FieldPosition;
    usage: FieldUsage;
    isReferenced: boolean;
    reference?: FieldReference;
    typeConfig?: FieldTypeConfig;
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
 * Available field types for DDS based on IBM official documentation
 * Updated with correct length requirements based on IBM System i Programming DDS manual
 */
const FIELD_TYPES = {
    // Character data types - require length
    'A': { label: 'A - Alphanumeric shift', hasLength: true, hasDecimals: false, description: 'Character field with alphanumeric shift', keyboardShift: 'A' },
    'X': { label: 'X - Alphabetic only', hasLength: true, hasDecimals: false, description: 'Character field, only A-Z, comma, period, dash, space', keyboardShift: 'X' },
    'M': { label: 'M - Numeric only character', hasLength: true, hasDecimals: false, description: 'Character field allowing only digits and numeric symbols', keyboardShift: 'M' },
    
    // Numeric data types - require length
    'Y': { label: 'Y - Numeric only', hasLength: true, hasDecimals: true, description: 'Numeric field with editing support', keyboardShift: 'Y' },
    'S': { label: 'S - Signed numeric', hasLength: true, hasDecimals: true, description: 'Numeric field, digits 0-9 only, no editing', keyboardShift: 'S' },
    'N': { label: 'N - Numeric shift', hasLength: true, hasDecimals: true, description: 'Numeric field with numeric shift', keyboardShift: 'N' },
    'D': { label: 'D - Digits only', hasLength: true, hasDecimals: false, description: 'Character/numeric field, digits 0-9 only', keyboardShift: 'D' },
    'F': { label: 'F - Floating point', hasLength: true, hasDecimals: true, description: 'Floating point numeric field', keyboardShift: 'F' },
    
    // Fixed-length data types - NO length required (system defined)
    'L': { label: 'L - Date', hasLength: false, hasDecimals: false, description: 'Date field (length determined by DATFMT)', keyboardShift: 'L' },
    'T': { label: 'T - Time', hasLength: false, hasDecimals: false, description: 'Time field (length=8)', keyboardShift: 'T' },
    'Z': { label: 'Z - Timestamp', hasLength: false, hasDecimals: false, description: 'Timestamp field (length=26)', keyboardShift: 'Z' },
    
    // Special types - require length
    'I': { label: 'I - Inhibit keyboard entry', hasLength: true, hasDecimals: false, description: 'Field that does not accept keyboard input', keyboardShift: 'I' },
    'W': { label: 'W - Katakana', hasLength: true, hasDecimals: false, description: 'Katakana keyboard shift (Japan only)', keyboardShift: 'W' }
} as const;

/**
 * Constants for field editing operations
 */
const FIELD_CONSTANTS = {
    MAX_NAME_LENGTH: 10,
    NAME_COLUMN_START: 18,
    NAME_COLUMN_END: 28,
    SIZE_COLUMN_START: 32,
    SIZE_COLUMN_END: 34,
    TYPE_COLUMN: 34,
    DECIMAL_COLUMN_START: 35,
    DECIMAL_COLUMN_END: 37,
    ROW_COLUMN_START: 39,
    ROW_COLUMN_END: 41,
    COLUMN_COLUMN_START: 42,
    COLUMN_COLUMN_END: 44,
    NUMERIC_TYPES: ['Y', 'P', 'S', 'Z'] as const
} as const;

/**
 * Gets the maximum rows value from fileSizeAttributes
 */
function getMaxRows(): number {
    const maxRow1 = fileSizeAttributes.maxRow1 || 0;
    const maxRow2 = fileSizeAttributes.maxRow2 || 0;
    const maxRow = Math.max(maxRow1, maxRow2);
    return maxRow > 0 ? maxRow : 27;
}

/**
 * Gets the maximum columns value from fileSizeAttributes
 */
function getMaxCols(): number {
    const maxCol1 = fileSizeAttributes.maxCol1 || 0;
    const maxCol2 = fileSizeAttributes.maxCol2 || 0;
    const maxCol = Math.max(maxCol1, maxCol2);
    return maxCol > 0 ? maxCol : 132;
}

/**
 * Registers both field editing and adding commands for the VS Code extension
 * 
 * @param context - The VS Code extension context for registering commands and subscriptions
 */
export function registerFieldCommands(context: vscode.ExtensionContext): void {
    // Register edit field command
    const editDisposable = vscode.commands.registerCommand(
        "dspf-edit.edit-field", 
        handleEditFieldCommand
    );
    
    // Register add field command
    const addDisposable = vscode.commands.registerCommand(
        "dspf-edit.add-field", 
        handleAddFieldCommand
    );
    
    // Add both commands to the extension's disposables for proper cleanup
    context.subscriptions.push(editDisposable, addDisposable);
};

/**
 * Legacy function for backward compatibility
 */
export function editField(context: vscode.ExtensionContext): void {
    registerFieldCommands(context);
};

// EDIT FIELD FUNCTIONALITY 

/**
 * Main command handler for editing DDS fields
 * 
 * @param node - The selected DDS node from the tree view
 */
async function handleEditFieldCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate the selected node
        const validationResult = validateNodeForEdit(node);
        if (!validationResult.isValid) {
            vscode.window.showWarningMessage(validationResult.errorMessage!);
            return;
        };

        const element = node.ddsElement;

        // Get new field name from user
        const newName = await promptForFieldName(element);
        if (!newName) {
            return; // User cancelled
        };

        // Get new field size from user
        const newSize = await promptForFieldSize(element, newName);
        if (!newSize) {
            return; // User cancelled
        };

        // Apply the changes to the document
        await applyFieldChanges(editor, element, newName, newSize);
        
        if ('name' in element) {
            vscode.window.showInformationMessage(
                (newSize.decimals) ? `Field '${element.name}' successfully updated to '${newName}' with size ${newSize.length}${newSize.decimals > 0 ? `,${newSize.decimals}` : ''}` :
                `Field '${element.name}' successfully updated to '${newName}' with size ${newSize.length}`
            );
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to edit field: ${errorMessage}`);
        console.error('Error in editField command:', error);
    };
};

// ADD FIELD FUNCTIONALITY

/**
 * Main command handler for adding new DDS fields
 * 
 * @param node - The selected DDS node from the tree view
 */
async function handleAddFieldCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate the selected node
        const validationResult = validateNodeForAdd(node);
        if (!validationResult.isValid) {
            vscode.window.showWarningMessage(validationResult.errorMessage!);
            return;
        };

        const element = node.ddsElement;

        // Collect complete field configuration
        const fieldConfig = await collectNewFieldConfiguration(editor, element);
        if (!fieldConfig) {
            return; // User cancelled
        };

        // Generate the DDS line for the new field
        const newFieldLine = generateNewFieldLine(fieldConfig);

        // Insert the new field into the document
        await insertNewField(editor, element, newFieldLine);

        // Show success message
        if ('name' in element) {
            vscode.window.showInformationMessage(
                `Field '${fieldConfig.name}' successfully added to record '${element.name}'.`
            );
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to add field: ${errorMessage}`);
        console.error('Error in addField command:', error);
    };
};

/**
 * Collects complete configuration for a new field through user interaction
 * 
 * @param recordElement - The record element where the field will be added
 * @returns Complete field configuration or null if cancelled
 */
async function collectNewFieldConfiguration(editor: vscode.TextEditor, recordElement: any): Promise<NewFieldConfig | null> {
    // Step 1: Get field name
    const fieldName = await promptForNewFieldName(recordElement);
    if (!fieldName) return null;

    // Step 2: Get field usage (I/O/B/H/M/P)
    const usage = await collectFieldUsage(fieldName);
    if (!usage) return null;

    // Step 3: Check if field is referenced
    const isReferenced = await promptForFieldReference();
    if (isReferenced === null) return null;

    // Step 4: Get reference or type configuration
    let reference: FieldReference | undefined | null;
    let typeConfig: FieldTypeConfig | undefined | null;

    if (isReferenced) {
        reference = await collectFieldReference(fieldName);
        if (!reference) return null;
    } else {
        typeConfig = await collectFieldTypeConfiguration(fieldName);
        if (!typeConfig) return null;
    };

    // Step 5: Get field position (skip for Hidden, Message, and Program-to-system fields)
    let position: FieldPosition;
    if (usage.type === 'H' || usage.type === 'M' || usage.type === 'P') {
        // These field types don't have screen positions
        position = { row: 0, column: 0 };
    } else {
        const fieldPosition = await collectFieldPosition(editor, fieldName, recordElement, typeConfig?.size);
        if (!fieldPosition) return null;
        position = fieldPosition;
    };
    if (reference === null) reference = undefined;
    if (typeConfig === null) typeConfig = undefined;
    
    return {
        name: fieldName,
        position,
        usage,
        isReferenced,
        reference,
        typeConfig
    };
};

/**
 * Prompts for new field name with validation against existing fields
 */
async function promptForNewFieldName(recordElement: any): Promise<string | undefined> {
    const newName = await vscode.window.showInputBox({
        title: `Add new field to record '${recordElement.name}'`,
        prompt: "Enter the field name (max 10 characters, no spaces, cannot start with number)",
        placeHolder: "NEWFIELD",
        validateInput: (value: string) => validateNewFieldName(value, recordElement)
    });

    return newName?.trim().toUpperCase();
};

/**
 * Validates new field name ensuring it doesn't exist in the record
 */
function validateNewFieldName(value: string, recordElement: any): string | null {
    const basicValidation = validateFieldNameFormat(value);
    if (basicValidation) return basicValidation;

    const trimmedValue = value.trim().toUpperCase();

    // Check if field already exists in the record
    if (fieldExists(trimmedValue, recordElement.name)) {
        return `Field '${trimmedValue}' already exists in record '${recordElement.name}'.`;
    };

    return null;
};

/**
 * Prompts user to choose if field is referenced or not
 */
async function promptForFieldReference(): Promise<boolean | null> {
    const choice = await vscode.window.showQuickPick([
        { 
            label: "New Field", 
            description: "Define new field with type and size",
            detail: "Will prompt for field type, length, and decimals",
            value: false
        },
        { 
            label: "Referenced Field", 
            description: "Field references another file's field",
            detail: "Will prompt for library, file, and field names",
            value: true
        }
    ], {
        title: 'Field Definition Type',
        placeHolder: "Choose how to define the field",
        canPickMany: false,
        ignoreFocusOut: true
    });

    return choice ? choice.value : null;
};

/**
 * Collects field usage type (I/O/B/H/M/P)
 */
async function collectFieldUsage(fieldName: string): Promise<FieldUsage | null> {
    const usageOptions = Object.entries(FIELD_USAGE_TYPES).map(([key, config]) => ({
        label: `${key} - ${config.label}`,
        description: config.description,
        detail: key === 'O' ? 'Default if not specified' : '',
        value: key as 'I' | 'O' | 'B' | 'H' | 'M' | 'P'
    }));

    const selection = await vscode.window.showQuickPick(usageOptions, {
        title: `Field Usage for '${fieldName}'`,
        placeHolder: "Select how the field will be used",
        canPickMany: false,
        ignoreFocusOut: true
    });

    if (!selection) return null;

    return {
        type: selection.value,
        description: FIELD_USAGE_TYPES[selection.value].description
    };
};

async function collectFieldReference(fieldName: string): Promise<FieldReference | null> {
    // Get library name
    const library = await vscode.window.showInputBox({
        title: `Reference for field '${fieldName}' - Step 1/3`,
        prompt: "Enter library name (max 10 characters)",
        placeHolder: "LIBRARY",
        validateInput: (value) => validateLibraryFileName(value, "Library")
    });
    if (!library) return null;

    // Get file name
    const file = await vscode.window.showInputBox({
        title: `Reference for field '${fieldName}' - Step 2/3`,
        prompt: "Enter file name (max 10 characters)",
        placeHolder: "FILE",
        validateInput: (value) => validateLibraryFileName(value, "File")
    });
    if (!file) return null;

    // Get referenced field name
    const referencedField = await vscode.window.showInputBox({
        title: `Reference for field '${fieldName}' - Step 3/3`,
        prompt: "Enter referenced field name (max 10 characters)",
        placeHolder: fieldName,
        value: fieldName,
        validateInput: (value) => validateFieldNameFormat(value)
    });
    if (!referencedField) return null;

    return {
        library: library.toUpperCase(),
        file: file.toUpperCase(),
        field: referencedField.toUpperCase()
    };
};

/**
 * Validates library and file names
 */
function validateLibraryFileName(value: string, type: string): string | null {
    const trimmedValue = value.trim();
    
    if (trimmedValue === '') {
        return `${type} name cannot be empty.`;
    };
    
    if (trimmedValue.length > 10) {
        return `${type} name must be 10 characters or fewer.`;
    };
    
    if (/\s/.test(trimmedValue)) {
        return `${type} name cannot contain spaces.`;
    };
    
    if (!/^[A-Za-z][A-Za-z0-9@#$Ñ]*$/.test(trimmedValue)) {
        return `Invalid characters in ${type.toLowerCase()} name. Use letters, numbers, @, #, $, Ñ`;
    };
    
    return null;
};

/**
 * Collects field type configuration (type, size, decimals)
 * Updated to handle fixed-length fields correctly
 */
async function collectFieldTypeConfiguration(fieldName: string): Promise<FieldTypeConfig | null> {
    // Get field type
    const fieldType = await promptForFieldType(fieldName);
    if (!fieldType) return null;

    const typeConfig = FIELD_TYPES[fieldType as keyof typeof FIELD_TYPES];
    
    // Get field size based on type
    let fieldSize: FieldSize;
    
    if (typeConfig.hasLength) {
        // Field requires user-specified length
        fieldSize = await promptForNewFieldSize(fieldName, fieldType) || { length: 10, decimals: 0 };
        if (!fieldSize) return null;
    } else {
        // Fixed-length field - system determines length
        fieldSize = getSystemDefinedLength(fieldType);
    }

    return {
        type: fieldType,
        size: fieldSize
    };
};

/**
 * Gets system-defined lengths for fixed-length field types
 */
function getSystemDefinedLength(fieldType: string): FieldSize {
    switch (fieldType) {
        case 'L': // Date - length determined by DATFMT (default *ISO = 10)
            return { length: 10, decimals: 0 };
        case 'T': // Time - always length 8 
            return { length: 8, decimals: 0 };
        case 'Z': // Timestamp - always length 26
            return { length: 26, decimals: 0 };
        default:
            // This should not happen as we only call this for fixed-length types
            return { length: 10, decimals: 0 };
    }
};

/**
 * Prompts user to select field type
 */
async function promptForFieldType(fieldName: string): Promise<string | null> {
    const typeOptions = Object.entries(FIELD_TYPES).map(([key, config]) => ({
        label: key,
        description: config.label,
        detail: config.hasLength ? config.description : `${config.description} (Fixed length)`
    }));

    const selection = await vscode.window.showQuickPick(typeOptions, {
        title: `Field Type for '${fieldName}'`,
        placeHolder: "Select the field type",
        canPickMany: false,
        ignoreFocusOut: true
    });

    return selection?.label || null;
};

/**
 * Prompts for field size based on field type
 * Updated to only be called for variable-length fields
 */
async function promptForNewFieldSize(fieldName: string, fieldType: string): Promise<FieldSize | null> {
    const typeConfig = FIELD_TYPES[fieldType as keyof typeof FIELD_TYPES];
    
    if (typeConfig.hasDecimals) {
        // Numeric field - ask for total length and decimals
        const sizeInput = await vscode.window.showInputBox({
            title: `Size for ${typeConfig.label} field '${fieldName}'`,
            prompt: "Enter size as: N (for integer) or N,D (for decimal where N=total digits, D=decimal places)",
            placeHolder: "10,2",
            validateInput: validateFieldSize
        });
        
        if (!sizeInput) return null;
        return parseSize(sizeInput);
    } else {
        // Non-numeric field - ask for length only
        const lengthInput = await vscode.window.showInputBox({
            title: `Length for ${typeConfig.label} field '${fieldName}'`,
            prompt: "Enter field length (1-32766)",
            placeHolder: "10",
            validateInput: (value) => validateFieldLength(value)
        });
        
        if (!lengthInput) return null;
        return { length: Number(lengthInput), decimals: 0 };
    };
};

/**
 * Validates field length for non-decimal types
 */
function validateFieldLength(value: string): string | null {
    const trimmedValue = value.trim();
    
    if (trimmedValue === '') {
        return "Field length is required.";
    };

    const length = Number(trimmedValue);
    if (isNaN(length)) {
        return "Field length must be a valid number.";
    };

    if (length <= 0) {
        return "Field length must be greater than 0.";
    };

    if (length > 32766) {
        return "Field length cannot exceed 32766.";
    };

    return null;
};

/**
 * Collects field position information with relative positioning options
 */
async function collectFieldPosition(editor: vscode.TextEditor, fieldName: string, recordElement: any, fieldSize?: FieldSize): Promise<FieldPosition | null> {
    // First ask if user wants relative or absolute positioning
    const positioningType = await vscode.window.showQuickPick(
        [
            { 
                label: "Absolute position", 
                description: "Enter specific row and column",
                value: "absolute" 
            },
            { 
                label: "Relative to existing element", 
                description: "Position above, below, or to the right of an existing field or constant",
                value: "relative" 
            }
        ],
        {
            title: `Choose positioning method for field '${fieldName}' in record ${recordElement.name}`,
            placeHolder: "Select how to position the new field"
        }
    );

    if (!positioningType) return null;

    if (positioningType.value === "relative") {
        return await getRelativeFieldPosition(editor, recordElement, fieldSize);
    } else {
        return await getAbsoluteFieldPosition(fieldName);
    };
};

/**
 * Gets relative position information based on existing fields and constants
 */
async function getRelativeFieldPosition(editor: vscode.TextEditor, recordElement: any, fieldSize?: FieldSize): Promise<FieldPosition | null> {
    // Get existing elements (fields and constants) in this record
    const existingElements = await getExistingElementsInRecord(editor, recordElement.name);
    
    if (existingElements.length === 0) {
        vscode.window.showInformationMessage("No existing fields or constants found in this record. Using absolute positioning.");
        return await getAbsoluteFieldPosition("field");
    };

    // Show elements for selection
    const selectedElement = await vscode.window.showQuickPick(
        existingElements.map(element => ({
            label: `${element.name} (${element.type})`,
            description: `Row: ${element.row}, Col: ${element.column}, Width: ${element.width}`,
            detail: `Line: ${element.lineIndex + 1} - "${element.text}"`,
            element: element
        })),
        {
            title: "Select reference element",
            placeHolder: "Choose the field or constant to position relative to"
        }
    );

    if (!selectedElement) return null;

    // Ask for relative position (above, below, or right)
    const relativePosition = await vscode.window.showQuickPick(
        [
            { 
                label: "Above", 
                description: "Position the new field above the selected element",
                value: "above" 
            },
            { 
                label: "Below", 
                description: "Position the new field below the selected element",
                value: "below" 
            },
            { 
                label: "To the right", 
                description: "Position the new field to the right of the selected element",
                value: "right" 
            }
        ],
        {
            title: "Relative position",
            placeHolder: "Where should the new field be positioned?"
        }
    );

    if (!relativePosition) return null;

    // Calculate the new position
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
            switch(referenceElement.type) {
                case 'constant' :
                    newColumn = referenceElement.column + (referenceElement.width - 2) + 1; // +1 for spacing
                    break;
                case 'field' :
                    newColumn = referenceElement.column + referenceElement.width + 1; // +1 for spacing
                    break;
            }
            break;
        default:
            return null;
    };

    // Validate the new position
    const maxRows = getMaxRows();
    const maxCols = getMaxCols();

    if (newRow < 1 || newRow > maxRows) {
        vscode.window.showErrorMessage(`Cannot position field at row ${newRow}. Row must be between 1 and ${maxRows}.`);
        return null;
    };

    if (newColumn < 1 || newColumn > maxCols) {
        vscode.window.showErrorMessage(`Cannot position field at column ${newColumn}. Column must be between 1 and ${maxCols}.`);
        return null;
    };

    // Check if the new field would fit within screen bounds
    if (fieldSize && newColumn + fieldSize.length - 1 > maxCols) {
        vscode.window.showErrorMessage(`Field would extend beyond screen width (column ${newColumn + fieldSize.length - 1}). Maximum column is ${maxCols}.`);
        return null;
    };

    return {
        row: newRow,
        column: newColumn
    };
};

/**
 * Gets absolute position information for a field
 */
async function getAbsoluteFieldPosition(fieldName: string): Promise<FieldPosition | null> {
    const maxRows = getMaxRows();
    const maxCols = getMaxCols();

    // Get row position
    const row = await vscode.window.showInputBox({
        title: `Position for field '${fieldName}' - Row`,
        prompt: `Enter row position (1-${maxRows})`,
        placeHolder: "10",
        validateInput: (value) => validateNumericRange(value, 1, maxRows, "Row")
    });
    if (!row) return null;

    // Get column position
    const column = await vscode.window.showInputBox({
        title: `Position for field '${fieldName}' - Column`,
        prompt: `Enter column position (1-${maxCols})`,
        placeHolder: "20",
        validateInput: (value) => validateNumericRange(value, 1, maxCols, "Column")
    });
    if (!column) return null;

    return {
        row: Number(row),
        column: Number(column)
    };
};

/**
 * Gets existing elements (fields and constants) in a specific record
 */
async function getExistingElementsInRecord(editor: vscode.TextEditor, recordName: string): Promise<ExistingElementInfo[]> {
    if (!editor) return [];

    const elements: ExistingElementInfo[] = [];
    const document = editor.document;
    
    // Find record boundaries
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) return [];

    // Scan through the record lines to find fields and constants
    for (let lineIndex = recordInfo.startIndex; lineIndex <= recordInfo.endIndex; lineIndex++) {
        if (lineIndex >= document.lineCount) break;
        
        const line = document.lineAt(lineIndex);
        
        // Try to parse as a field first
        const field = parseFieldFromLine(line.text, lineIndex);
        if (field) {
            elements.push(field);
            continue;
        }
        
        // Try to parse as a constant
        const constant = parseConstantFromLine(line.text, lineIndex);
        if (constant) {
            elements.push(constant);
        }
    }

    // Sort elements by row, then by column
    elements.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.column - b.column;
    });

    return elements;
};

/**
 * Parses a field from a DDS line
 */
function parseFieldFromLine(lineText: string, lineIndex: number): ExistingElementInfo | null {
    // DDS field format: check if this looks like a field line
    if (lineText.length < 44) return null;
    if (!lineText.startsWith('     A')) return null;
    
    // Extract field name (positions 19-28)
    const nameArea = lineText.substring(18, 28).trim();
    if (!nameArea) return null;
    
    // Extract row and column (positions 40-41 and 43-44)
    const rowStr = lineText.substring(39, 41).trim();
    const colStr = lineText.substring(42, 44).trim();
    
    if (!rowStr || !colStr) return null;
    
    const row = parseInt(rowStr, 10);
    const column = parseInt(colStr, 10);
    
    if (isNaN(row) || isNaN(column)) return null;
    
    const lengthStr = lineText.substring(32, 33).trim();
    const length = parseInt(lengthStr, 10) || 10; // Default to 10 if can't parse
    
    return {
        name: nameArea,
        text: nameArea,
        row: row,
        column: column,
        width: length,
        lineIndex: lineIndex,
        type: 'field'
    };
};

/**
 * Parses a constant from a DDS line
 */
function parseConstantFromLine(lineText: string, lineIndex: number): ExistingElementInfo | null {
    // DDS constant format: positions 7-38 are name/blank, 39-41 is row, 42-44 is column, 45+ is constant value
    if (lineText.length < 45) return null;
    
    // Check if this is a constant line (starts with "     A" and has quotes in the constant area)
    if (!lineText.startsWith('     A')) return null;
    
    const constantArea = lineText.substring(44); // From position 45 onwards
    if (!constantArea.includes("'")) return null;
    
    // Extract row and column
    const rowStr = lineText.substring(38, 41).trim();
    const colStr = lineText.substring(41, 44).trim();
    
    if (!rowStr || !colStr) return null;
    
    const row = parseInt(rowStr, 10);
    const column = parseInt(colStr, 10);
    
    if (isNaN(row) || isNaN(column)) return null;
    
    // Extract the constant text (find the content between quotes)
    const quoteStart = constantArea.indexOf("'");
    if (quoteStart === -1) return null;
    
    let text = '';
    let i = quoteStart + 1;
    let inQuotes = true;
    
    // Handle multi-line constants by continuing to next lines if needed
    while (inQuotes && i < constantArea.length) {
        if (constantArea[i] === "'") {
            inQuotes = false;
        } else {
            text += constantArea[i];
        }
        i++;
    };
    
    // If we didn't find the closing quote, it might be a multi-line constant
    if (inQuotes) {
        text = constantArea.substring(quoteStart + 1);
        // For simplicity, we'll truncate multi-line constants in the display
        if (text.length > 20) {
            text = text.substring(0, 20) + '...';
        }
    };

    // Calculate width (including quotes)
    const displayText = text || 'Constant';
    const width = displayText.length + 2; // +2 for quotes

    return {
        name: displayText,
        text: displayText,
        row: row,
        column: column,
        width: width,
        lineIndex: lineIndex,
        type: 'constant'
    };
};

/**
 * Generates a DDS line for the new field
 * Updated to handle fixed-length fields correctly
 */
function generateNewFieldLine(config: NewFieldConfig): string {
    let line = ' '.repeat(80);
    line = replaceAt(line, 5, 'A');

    // Columns 19-28: Field name (padded to 10 characters)
    const paddedName = config.name.padEnd(10, ' ');
    line = replaceAt(line, 18, paddedName);

    if (config.isReferenced && config.reference) {
        // Referenced field - use R and reference specification
        line = replaceAt(line, 28, 'R');
        
        // Reference specification: REFFLD(library/file.field)
        const refSpec = `REFFLD(${config.reference.library}/${config.reference.file}.${config.reference.field})`;
        line = replaceAt(line, 44, refSpec);
    } else if (config.typeConfig) {
        // New field with type specification
        
        const fieldType = FIELD_TYPES[config.typeConfig.type as keyof typeof FIELD_TYPES];
        
        // Only specify length for fields that require it
        if (fieldType.hasLength) {
            const sizeStr = config.typeConfig.size.length.toString().padStart(2, ' ');
            line = replaceAt(line, 32, sizeStr);
        }
        
        line = replaceAt(line, 34, fieldType.keyboardShift);
        
        if (fieldType.hasDecimals && config.typeConfig.size.decimals !== undefined && config.typeConfig.size.decimals > 0) {
            const decStr = config.typeConfig.size.decimals.toString().padStart(2, ' ');
            line = replaceAt(line, 35, decStr);
        };
    };

    // Usage (position 38) - Only specify if not Output (default)
    if (config.usage.type !== 'O') {
        line = replaceAt(line, 37, config.usage.type);
    };

    // Position specification (columns 40-41 for row, 43-44 for column)
    // Only for fields that appear on display (not H, M, P)
    if (config.usage.type !== 'H' && config.usage.type !== 'M' && config.usage.type !== 'P') {
        const rowStr = config.position.row.toString().padStart(2, ' ');
        const colStr = config.position.column.toString().padStart(2, ' ');
        line = replaceAt(line, 39, rowStr);
        line = replaceAt(line, 41, colStr);
    };

    return line.trimEnd();
};

/**
 * Helper function to replace characters at specific position
 */
function replaceAt(str: string, index: number, replacement: string): string {
    return str.substring(0, index) + replacement + str.substring(index + replacement.length);
};

/**
 * Inserts the new field into the document
 */
async function insertNewField(editor: vscode.TextEditor, recordElement: any, fieldLine: string): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Find the appropriate insertion point (end of file or before next record)
    const insertLineIndex = findFieldInsertionPoint(editor, recordElement.name);
        
    if (insertLineIndex >= editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(insertLineIndex, 0), '\n');        
    };
    workspaceEdit.insert(uri, new vscode.Position(insertLineIndex, 0), fieldLine);
    if (insertLineIndex < editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(insertLineIndex, 0), '\n');        
    };
    
    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
        throw new Error("Failed to insert new field into the document.");
    };
};

/**
 * Finds the appropriate line to insert a new field
 */
function findFieldInsertionPoint(editor: vscode.TextEditor, recordName: string): number {
    // The field must be inserted in the last line of the record (in the DDS source file)
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) {
        return 0;
    }
    const recordLineEnd = recordInfo.endIndex + 1;

    return recordLineEnd;
};

// FIELD EXISTENCE CHECK FUNCTION

/**
 * Checks if a field already exists in the specified record using the parsed model data
 * 
 * @param fieldName - The field name to check (case-insensitive)
 * @param recordName - The record name to search in
 * @returns true if field exists, false otherwise
 */
function fieldExists(fieldName: string, recordName: string): boolean {
    // Find the record in the parsed data
    const record = fieldsPerRecords.find(r => 
        r.record.toUpperCase() === recordName.toUpperCase()
    );
    
    if (!record) {
        return false; // Record not found
    };
    
    // Check if field exists in this record's fields array
    return record.fields.some(field => 
        field.name.toUpperCase() === fieldName.toUpperCase()
    );
};

// SHARED VALIDATION AND UTILITY FUNCTIONS

/**
 * Validates that the selected node is a valid field for editing
 */
function validateNodeForEdit(node: DdsNode): ValidationResult {
    if (!node?.ddsElement) {
        return {
            isValid: false,
            errorMessage: "Invalid node selected. Please select a valid DDS element."
        };
    };

    if (node.ddsElement.kind !== "field") {
        return {
            isValid: false,
            errorMessage: "Only fields can be edited. Please select a field element."
        };
    };

    return { isValid: true };
};

/**
 * Validates that the selected node is valid for adding fields
 */
function validateNodeForAdd(node: DdsNode): ValidationResult {
    if (!node?.ddsElement) {
        return {
            isValid: false,
            errorMessage: "Invalid node selected. Please select a valid DDS element."
        };
    };

    if (node.ddsElement.kind !== "record") {
        return {
            isValid: false,
            errorMessage: "Fields can only be added to records. Please select a record element."
        };
    };

    return { isValid: true };
};

/**
 * Validates numeric input within a specified range
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

/**
 * Validates field name format (shared between edit and add)
 */
function validateFieldNameFormat(value: string): string | null {
    const trimmedValue = value.trim();
    
    if (trimmedValue === '') {
        return "The field name cannot be empty.";
    };
    
    if (trimmedValue.length > FIELD_CONSTANTS.MAX_NAME_LENGTH) {
        return `The name must be ${FIELD_CONSTANTS.MAX_NAME_LENGTH} characters or fewer.`;
    };
    
    if (/\s/.test(trimmedValue)) {
        return "The name cannot contain spaces.";
    };
    
    if (/^\d/.test(trimmedValue)) {
        return "The name cannot start with a number.";
    };
    
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmedValue)) {
        return "The name can only contain letters, numbers, underscores, and hyphens, and must start with a letter.";
    };
    
    return null;
};

// EDIT FIELD FUNCTIONS

/**
 * Prompts the user for a new field name with comprehensive validation
 */
async function promptForFieldName(element: any): Promise<string | undefined> {
    const newName = await vscode.window.showInputBox({
        title: `Set new name for field '${element.name}'`,
        value: element.name,
        prompt: "Enter the new field name (max 10 characters, no spaces, cannot start with number)",
        validateInput: (value: string) => validateFieldName(value, element)
    });

    return newName?.trim().toUpperCase();
};

/**
 * Validates a field name according to DDS naming rules (for editing)
 */
function validateFieldName(value: string, element: any): string | null {
    const basicValidation = validateFieldNameFormat(value);
    if (basicValidation) return basicValidation;
    
    // DDS field name cannot exceed 10 characters
    if (value.trim().length > 10) {
        return "Field name cannot exceed 10 characters.";
    };
    
    return null;
};

/**
 * Prompts the user for field size specification
 */
async function promptForFieldSize(element: any, fieldName: string): Promise<FieldSize | undefined> {
    const currentSizeDisplay = element.decimals && element.decimals > 0
        ? `${element.length},${element.decimals}`
        : `${element.length}`;

    const newSizeInput = await vscode.window.showInputBox({
        title: `Set size for field '${fieldName}'`,
        value: currentSizeDisplay,
        prompt: "Enter size as: N (for integer) or N,D (for decimal where N=total digits, D=decimal places)",
        validateInput: validateFieldSize
    });

    if (!newSizeInput) {
        return undefined;
    };

    return parseSize(newSizeInput);
};

/**
 * Validates field size input format and constraints
 */
function validateFieldSize(value: string): string | null {
    const trimmedValue = value.trim();
    
    if (trimmedValue === '') {
        return "Size is required.";
    };

    const match = trimmedValue.match(/^(\d+)(?:,(\d+))?$/);
    if (!match) {
        return "Size must be a number or in the format N,D (e.g., '10' or '10,2').";
    };

    const totalLength = parseInt(match[1], 10);
    const decimals = match[2] ? parseInt(match[2], 10) : 0;

    if (totalLength <= 0) {
        return "Total size must be greater than 0.";
    };

    if (totalLength > 999) {
        return "Total size cannot exceed 999.";
    };

    if (decimals < 0) {
        return "Decimal places cannot be negative.";
    };

    if (decimals >= totalLength) {
        return "Decimal places must be less than total size.";
    };

    return null;
};

/**
 * Applies the field changes to the active document
 */
async function applyFieldChanges(
    editor: vscode.TextEditor, 
    element: any, 
    newName: string, 
    newSize: FieldSize
): Promise<void> {
    const lineIndex = element.lineIndex;
    const originalLine = editor.document.lineAt(lineIndex).text;
    
    const updatedLine = buildUpdatedLine(originalLine, newName, newSize);
    
    const workspaceEdit = new vscode.WorkspaceEdit();
    const documentUri = editor.document.uri;
    const lineRange = new vscode.Range(lineIndex, 0, lineIndex, originalLine.length);
    
    workspaceEdit.replace(documentUri, lineRange, updatedLine);
    
    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
        throw new Error("Failed to apply changes to the document.");
    };
};

/**
 * Constructs the updated line with new field name and size
 */
function buildUpdatedLine(originalLine: string, newName: string, newSize: FieldSize): string {
    let line = originalLine.padEnd(50, ' ');
    
    const paddedName = newName.padEnd(FIELD_CONSTANTS.MAX_NAME_LENGTH, ' ')
                             .substring(0, FIELD_CONSTANTS.MAX_NAME_LENGTH);
    line = line.substring(0, FIELD_CONSTANTS.NAME_COLUMN_START) + 
           paddedName + 
           line.substring(FIELD_CONSTANTS.NAME_COLUMN_END);
    
    const sizeString = newSize.length.toString().padStart(2, ' ').substring(0, 2);
    line = line.substring(0, FIELD_CONSTANTS.SIZE_COLUMN_START) + 
           sizeString + 
           line.substring(FIELD_CONSTANTS.SIZE_COLUMN_END);
    
    const typeCharacter = line.substring(FIELD_CONSTANTS.TYPE_COLUMN, FIELD_CONSTANTS.TYPE_COLUMN + 1);
    const isNumericField = FIELD_CONSTANTS.NUMERIC_TYPES.includes(typeCharacter as any);
    
    if (isNumericField && newSize.decimals !== undefined) {
        const decimalString = newSize.decimals.toString().padStart(2, ' ').substring(0, 2);
        line = line.substring(0, FIELD_CONSTANTS.DECIMAL_COLUMN_START) + 
               decimalString + 
               line.substring(FIELD_CONSTANTS.DECIMAL_COLUMN_END);
    };
    
    return line;
};