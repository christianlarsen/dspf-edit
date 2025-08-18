"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.edit-field.ts
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFieldCommands = registerFieldCommands;
exports.editField = editField;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
const dspf_edit_helper_1 = require("./dspf-edit.helper");
;
;
;
;
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
};
;
;
;
/**
 * Available field types for DDS based on IBM official documentation
 * Note: For display files, only certain data types are valid in position 35
 */
const FIELD_TYPES = {
    // Character data types
    'A': { label: 'A - Alphanumeric shift', hasDecimals: false, description: 'Character field with alphanumeric shift', keyboardShift: 'A' },
    'X': { label: 'X - Alphabetic only', hasDecimals: false, description: 'Character field, only A-Z, comma, period, dash, space', keyboardShift: 'X' },
    'M': { label: 'M - Numeric only character', hasDecimals: false, description: 'Character field allowing only digits and numeric symbols', keyboardShift: 'M' },
    // Numeric data types  
    'Y': { label: 'Y - Numeric only', hasDecimals: true, description: 'Numeric field with editing support', keyboardShift: 'Y' },
    'S': { label: 'S - Signed numeric', hasDecimals: true, description: 'Numeric field, digits 0-9 only, no editing', keyboardShift: 'S' },
    'N': { label: 'N - Numeric shift', hasDecimals: true, description: 'Numeric field with numeric shift', keyboardShift: 'N' },
    'D': { label: 'D - Digits only', hasDecimals: false, description: 'Character/numeric field, digits 0-9 only', keyboardShift: 'D' },
    // Special data types
    'F': { label: 'F - Floating point', hasDecimals: true, description: 'Floating point numeric field', keyboardShift: 'F' },
    'L': { label: 'L - Date', hasDecimals: false, description: 'Date field', keyboardShift: 'L' },
    'T': { label: 'T - Time', hasDecimals: false, description: 'Time field', keyboardShift: 'T' },
    'Z': { label: 'Z - Timestamp', hasDecimals: false, description: 'Timestamp field', keyboardShift: 'Z' },
    // Other types
    'I': { label: 'I - Inhibit keyboard entry', hasDecimals: false, description: 'Field that does not accept keyboard input', keyboardShift: 'I' },
    'W': { label: 'W - Katakana', hasDecimals: false, description: 'Katakana keyboard shift (Japan only)', keyboardShift: 'W' }
};
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
    NUMERIC_TYPES: ['Y', 'P', 'S', 'Z']
};
/**
 * Registers both field editing and adding commands for the VS Code extension
 *
 * @param context - The VS Code extension context for registering commands and subscriptions
 */
function registerFieldCommands(context) {
    // Register edit field command
    const editDisposable = vscode.commands.registerCommand("dspf-edit.edit-field", handleEditFieldCommand);
    // Register add field command
    const addDisposable = vscode.commands.registerCommand("dspf-edit.add-field", handleAddFieldCommand);
    // Add both commands to the extension's disposables for proper cleanup
    context.subscriptions.push(editDisposable, addDisposable);
}
;
/**
 * Legacy function for backward compatibility
 */
function editField(context) {
    registerFieldCommands(context);
}
;
// ============================================================================
// EDIT FIELD FUNCTIONALITY (EXISTING)
// ============================================================================
/**
 * Main command handler for editing DDS fields
 *
 * @param node - The selected DDS node from the tree view
 */
async function handleEditFieldCommand(node) {
    try {
        // Validate the selected node
        const validationResult = validateNodeForEdit(node);
        if (!validationResult.isValid) {
            vscode.window.showWarningMessage(validationResult.errorMessage);
            return;
        }
        ;
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found. Please open a file to edit.");
            return;
        }
        ;
        const element = node.ddsElement;
        // Get new field name from user
        const newName = await promptForFieldName(element);
        if (!newName) {
            return; // User cancelled
        }
        ;
        // Get new field size from user
        const newSize = await promptForFieldSize(element, newName);
        if (!newSize) {
            return; // User cancelled
        }
        ;
        // Apply the changes to the document
        await applyFieldChanges(editor, element, newName, newSize);
        if ('name' in element) {
            vscode.window.showInformationMessage((newSize.decimals) ? `Field '${element.name}' successfully updated to '${newName}' with size ${newSize.length}${newSize.decimals > 0 ? `,${newSize.decimals}` : ''}` :
                `Field '${element.name}' successfully updated to '${newName}' with size ${newSize.length}`);
        }
        ;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to edit field: ${errorMessage}`);
        console.error('Error in editField command:', error);
    }
    ;
}
;
// ============================================================================
// ADD FIELD FUNCTIONALITY (NEW)
// ============================================================================
/**
 * Main command handler for adding new DDS fields
 *
 * @param node - The selected DDS node from the tree view
 */
async function handleAddFieldCommand(node) {
    try {
        // Validate the selected node
        const validationResult = validateNodeForAdd(node);
        if (!validationResult.isValid) {
            vscode.window.showWarningMessage(validationResult.errorMessage);
            return;
        }
        ;
        // Get the active text editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found. Please open a file to edit.");
            return;
        }
        ;
        const element = node.ddsElement;
        // Collect complete field configuration
        const fieldConfig = await collectNewFieldConfiguration(element);
        if (!fieldConfig) {
            return; // User cancelled
        }
        ;
        // Generate the DDS line for the new field
        const newFieldLine = generateNewFieldLine(fieldConfig);
        // Insert the new field into the document
        await insertNewField(editor, element, newFieldLine);
        // Show success message
        if ('name' in element) {
            vscode.window.showInformationMessage(`Field '${fieldConfig.name}' successfully added to record '${element.name}'.`);
        }
        ;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        vscode.window.showErrorMessage(`Failed to add field: ${errorMessage}`);
        console.error('Error in addField command:', error);
    }
    ;
}
;
/**
 * Collects complete configuration for a new field through user interaction
 *
 * @param recordElement - The record element where the field will be added
 * @returns Complete field configuration or null if cancelled
 */
async function collectNewFieldConfiguration(recordElement) {
    // Step 1: Get field name
    const fieldName = await promptForNewFieldName(recordElement);
    if (!fieldName)
        return null;
    // Step 2: Get field usage (I/O/B/H/M/P)
    const usage = await collectFieldUsage(fieldName);
    if (!usage)
        return null;
    // Step 3: Check if field is referenced
    const isReferenced = await promptForFieldReference();
    if (isReferenced === null)
        return null;
    // Step 4: Get reference or type configuration
    let reference;
    let typeConfig;
    if (isReferenced) {
        reference = await collectFieldReference(fieldName);
        if (!reference)
            return null;
    }
    else {
        typeConfig = await collectFieldTypeConfiguration(fieldName);
        if (!typeConfig)
            return null;
    }
    ;
    // Step 5: Get field position (skip for Hidden, Message, and Program-to-system fields)
    let position;
    if (usage.type === 'H' || usage.type === 'M' || usage.type === 'P') {
        // These field types don't have screen positions
        position = { row: 0, column: 0 };
    }
    else {
        const fieldPosition = await collectFieldPosition(fieldName);
        if (!fieldPosition)
            return null;
        position = fieldPosition;
    }
    ;
    if (reference === null)
        reference = undefined;
    if (typeConfig === null)
        typeConfig = undefined;
    return {
        name: fieldName,
        position,
        usage,
        isReferenced,
        reference,
        typeConfig
    };
}
;
/**
 * Prompts for new field name with validation against existing fields
 */
async function promptForNewFieldName(recordElement) {
    const newName = await vscode.window.showInputBox({
        title: `Add new field to record '${recordElement.name}'`,
        prompt: "Enter the field name (max 10 characters, no spaces, cannot start with number)",
        placeHolder: "NEWFIELD",
        validateInput: (value) => validateNewFieldName(value, recordElement)
    });
    return newName?.trim().toUpperCase();
}
;
/**
 * Validates new field name ensuring it doesn't exist in the record
 */
function validateNewFieldName(value, recordElement) {
    const basicValidation = validateFieldNameFormat(value);
    if (basicValidation)
        return basicValidation;
    const trimmedValue = value.trim().toUpperCase();
    // Check if field already exists in the record
    if (fieldExists(trimmedValue, recordElement.name)) {
        return `Field '${trimmedValue}' already exists in record '${recordElement.name}'.`;
    }
    ;
    return null;
}
;
/**
 * Prompts user to choose if field is referenced or not
 */
async function promptForFieldReference() {
    const choice = await vscode.window.showQuickPick([
        {
            label: "Referenced Field",
            description: "Field references another file's field",
            detail: "Will prompt for library, file, and field names",
            value: true
        },
        {
            label: "New Field",
            description: "Define new field with type and size",
            detail: "Will prompt for field type, length, and decimals",
            value: false
        }
    ], {
        title: 'Field Definition Type',
        placeHolder: "Choose how to define the field",
        canPickMany: false,
        ignoreFocusOut: true
    });
    return choice ? choice.value : null;
}
;
/**
 * Collects field usage type (I/O/B/H/M/P)
 */
async function collectFieldUsage(fieldName) {
    const usageOptions = Object.entries(FIELD_USAGE_TYPES).map(([key, config]) => ({
        label: `${key} - ${config.label}`,
        description: config.description,
        detail: key === 'O' ? 'Default if not specified' : '',
        value: key
    }));
    const selection = await vscode.window.showQuickPick(usageOptions, {
        title: `Field Usage for '${fieldName}'`,
        placeHolder: "Select how the field will be used",
        canPickMany: false,
        ignoreFocusOut: true
    });
    if (!selection)
        return null;
    return {
        type: selection.value,
        description: FIELD_USAGE_TYPES[selection.value].description
    };
}
;
async function collectFieldReference(fieldName) {
    // Get library name
    const library = await vscode.window.showInputBox({
        title: `Reference for field '${fieldName}' - Step 1/3`,
        prompt: "Enter library name (max 10 characters)",
        placeHolder: "MYLIB",
        validateInput: (value) => validateLibraryFileName(value, "Library")
    });
    if (!library)
        return null;
    // Get file name
    const file = await vscode.window.showInputBox({
        title: `Reference for field '${fieldName}' - Step 2/3`,
        prompt: "Enter file name (max 10 characters)",
        placeHolder: "MYFILE",
        validateInput: (value) => validateLibraryFileName(value, "File")
    });
    if (!file)
        return null;
    // Get referenced field name
    const referencedField = await vscode.window.showInputBox({
        title: `Reference for field '${fieldName}' - Step 3/3`,
        prompt: "Enter referenced field name (max 10 characters)",
        placeHolder: fieldName,
        value: fieldName,
        validateInput: (value) => validateFieldNameFormat(value)
    });
    if (!referencedField)
        return null;
    return {
        library: library.toUpperCase(),
        file: file.toUpperCase(),
        field: referencedField.toUpperCase()
    };
}
;
/**
 * Validates library and file names
 */
function validateLibraryFileName(value, type) {
    const trimmedValue = value.trim();
    if (trimmedValue === '') {
        return `${type} name cannot be empty.`;
    }
    ;
    if (trimmedValue.length > 10) {
        return `${type} name must be 10 characters or fewer.`;
    }
    ;
    if (/\s/.test(trimmedValue)) {
        return `${type} name cannot contain spaces.`;
    }
    ;
    if (!/^[A-Za-z][A-Za-z0-9@#$]*$/.test(trimmedValue)) {
        return `Invalid characters in ${type.toLowerCase()} name. Use letters, numbers, @, #, $.`;
    }
    ;
    return null;
}
;
/**
 * Collects field type configuration (type, size, decimals)
 */
async function collectFieldTypeConfiguration(fieldName) {
    // Get field type
    const fieldType = await promptForFieldType(fieldName);
    if (!fieldType)
        return null;
    // Get field size
    const fieldSize = await promptForNewFieldSize(fieldName, fieldType);
    if (!fieldSize)
        return null;
    return {
        type: fieldType,
        size: fieldSize
    };
}
;
/**
 * Prompts user to select field type
 */
async function promptForFieldType(fieldName) {
    const typeOptions = Object.entries(FIELD_TYPES).map(([key, config]) => ({
        label: key,
        description: config.label,
        detail: config.description
    }));
    const selection = await vscode.window.showQuickPick(typeOptions, {
        title: `Field Type for '${fieldName}'`,
        placeHolder: "Select the field type",
        canPickMany: false,
        ignoreFocusOut: true
    });
    return selection?.label || null;
}
;
/**
 * Prompts for field size based on field type
 */
async function promptForNewFieldSize(fieldName, fieldType) {
    const typeConfig = FIELD_TYPES[fieldType];
    if (typeConfig.hasDecimals) {
        // Numeric field - ask for total length and decimals
        const sizeInput = await vscode.window.showInputBox({
            title: `Size for ${typeConfig.label} field '${fieldName}'`,
            prompt: "Enter size as: N (for integer) or N,D (for decimal where N=total digits, D=decimal places)",
            placeHolder: "10,2",
            validateInput: validateFieldSize
        });
        if (!sizeInput)
            return null;
        return (0, dspf_edit_helper_1.parseSize)(sizeInput);
    }
    else {
        // Non-numeric field - ask for length only
        const lengthInput = await vscode.window.showInputBox({
            title: `Length for ${typeConfig.label} field '${fieldName}'`,
            prompt: "Enter field length (1-32766)",
            placeHolder: "10",
            validateInput: (value) => validateFieldLength(value)
        });
        if (!lengthInput)
            return null;
        return { length: Number(lengthInput), decimals: 0 };
    }
    ;
}
;
/**
 * Validates field length for non-decimal types
 */
function validateFieldLength(value) {
    const trimmedValue = value.trim();
    if (trimmedValue === '') {
        return "Field length is required.";
    }
    ;
    const length = Number(trimmedValue);
    if (isNaN(length)) {
        return "Field length must be a valid number.";
    }
    ;
    if (length <= 0) {
        return "Field length must be greater than 0.";
    }
    ;
    if (length > 32766) {
        return "Field length cannot exceed 32766.";
    }
    ;
    return null;
}
;
/**
 * Collects field reference information (library, file, field)
 */
async function collectFieldPosition(fieldName) {
    const maxRows = dspf_edit_model_1.fileSizeAttributes.maxRow1 || 24;
    const maxCols = dspf_edit_model_1.fileSizeAttributes.maxCol1 || 80;
    // Get row position
    const row = await vscode.window.showInputBox({
        title: `Position for field '${fieldName}' - Row`,
        prompt: `Enter row position (1-${maxRows})`,
        placeHolder: "10",
        validateInput: (value) => validateNumericRange(value, 1, maxRows, "Row")
    });
    if (!row)
        return null;
    // Get column position
    const column = await vscode.window.showInputBox({
        title: `Position for field '${fieldName}' - Column`,
        prompt: `Enter column position (1-${maxCols})`,
        placeHolder: "20",
        validateInput: (value) => validateNumericRange(value, 1, maxCols, "Column")
    });
    if (!column)
        return null;
    return {
        row: Number(row),
        column: Number(column)
    };
}
;
/**
 * Generates a DDS line for the new field
 */
function generateNewFieldLine(config) {
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
    }
    else if (config.typeConfig) {
        // New field with type specification
        const sizeStr = config.typeConfig.size.length.toString().padStart(2, ' ');
        line = replaceAt(line, 32, sizeStr);
        const fieldType = FIELD_TYPES[config.typeConfig.type];
        line = replaceAt(line, 34, fieldType.keyboardShift);
        if (fieldType.hasDecimals && config.typeConfig.size.decimals != undefined) {
            const decStr = config.typeConfig.size.decimals.toString().padStart(2, ' ');
            line = replaceAt(line, 35, decStr);
        }
        ;
    }
    ;
    // Usage (position 38) - Only specify if not Output (default)
    if (config.usage.type !== 'O') {
        line = replaceAt(line, 37, config.usage.type);
    }
    ;
    // Position specification (columns 40-41 for row, 43-44 for column)
    // Only for fields that appear on display (not H, M, P)
    if (config.usage.type !== 'H' && config.usage.type !== 'M' && config.usage.type !== 'P') {
        const rowStr = config.position.row.toString().padStart(2, ' ');
        const colStr = config.position.column.toString().padStart(2, ' ');
        line = replaceAt(line, 39, rowStr);
        line = replaceAt(line, 42, colStr);
    }
    ;
    return line.trimEnd();
}
;
/**
 * Helper function to replace characters at specific position
 */
function replaceAt(str, index, replacement) {
    return str.substring(0, index) + replacement + str.substring(index + replacement.length);
}
;
/**
 * Inserts the new field into the document
 */
async function insertNewField(editor, recordElement, fieldLine) {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    // Find the appropriate insertion point (end of file or before next record)
    const insertLineIndex = findFieldInsertionPoint(editor, recordElement.name);
    if (insertLineIndex >= editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(insertLineIndex, 0), '\n');
    }
    ;
    workspaceEdit.insert(uri, new vscode.Position(insertLineIndex, 0), fieldLine);
    if (insertLineIndex < editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(insertLineIndex, 0), '\n');
    }
    ;
    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
        throw new Error("Failed to insert new field into the document.");
    }
    ;
}
;
/**
 * Finds the appropriate line to insert a new field
 */
function findFieldInsertionPoint(editor, recordName) {
    // The field must be inserted in the last line of the record (in the DDS source file)
    const recordInfo = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) {
        return 0;
    }
    const recordLineEnd = recordInfo.endIndex + 1;
    return recordLineEnd;
}
;
// FIELD EXISTENCE CHECK FUNCTION
/**
 * Checks if a field already exists in the specified record using the parsed model data
 *
 * @param fieldName - The field name to check (case-insensitive)
 * @param recordName - The record name to search in
 * @returns true if field exists, false otherwise
 */
function fieldExists(fieldName, recordName) {
    // Find the record in the parsed data
    const record = dspf_edit_model_1.fieldsPerRecords.find(r => r.record.toUpperCase() === recordName.toUpperCase());
    if (!record) {
        return false; // Record not found
    }
    ;
    // Check if field exists in this record's fields array
    return record.fields.some(field => field.name.toUpperCase() === fieldName.toUpperCase());
}
;
// SHARED VALIDATION AND UTILITY FUNCTIONS
/**
 * Validates that the selected node is a valid field for editing
 */
function validateNodeForEdit(node) {
    if (!node?.ddsElement) {
        return {
            isValid: false,
            errorMessage: "Invalid node selected. Please select a valid DDS element."
        };
    }
    ;
    if (node.ddsElement.kind !== "field") {
        return {
            isValid: false,
            errorMessage: "Only fields can be edited. Please select a field element."
        };
    }
    ;
    return { isValid: true };
}
;
/**
 * Validates that the selected node is valid for adding fields
 */
function validateNodeForAdd(node) {
    if (!node?.ddsElement) {
        return {
            isValid: false,
            errorMessage: "Invalid node selected. Please select a valid DDS element."
        };
    }
    ;
    if (node.ddsElement.kind !== "record") {
        return {
            isValid: false,
            errorMessage: "Fields can only be added to records. Please select a record element."
        };
    }
    ;
    return { isValid: true };
}
;
/**
 * Validates numeric input within a specified range
 */
function validateNumericRange(value, min, max, fieldName) {
    if (!value || value.trim() === '') {
        return `${fieldName} cannot be empty.`;
    }
    ;
    const num = Number(value.trim());
    if (isNaN(num)) {
        return `${fieldName} must be a valid number.`;
    }
    ;
    if (num < min || num > max) {
        return `${fieldName} must be between ${min} and ${max}.`;
    }
    ;
    return null;
}
;
/**
 * Validates field name format (shared between edit and add)
 */
function validateFieldNameFormat(value) {
    const trimmedValue = value.trim();
    if (trimmedValue === '') {
        return "The field name cannot be empty.";
    }
    ;
    if (trimmedValue.length > FIELD_CONSTANTS.MAX_NAME_LENGTH) {
        return `The name must be ${FIELD_CONSTANTS.MAX_NAME_LENGTH} characters or fewer.`;
    }
    ;
    if (/\s/.test(trimmedValue)) {
        return "The name cannot contain spaces.";
    }
    ;
    if (/^\d/.test(trimmedValue)) {
        return "The name cannot start with a number.";
    }
    ;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmedValue)) {
        return "The name can only contain letters, numbers, underscores, and hyphens, and must start with a letter.";
    }
    ;
    return null;
}
;
// EDIT FIELD FUNCTIONS
/**
 * Prompts the user for a new field name with comprehensive validation
 */
async function promptForFieldName(element) {
    const newName = await vscode.window.showInputBox({
        title: `Set new name for field '${element.name}'`,
        value: element.name,
        prompt: "Enter the new field name (max 10 characters, no spaces, cannot start with number)",
        validateInput: (value) => validateFieldName(value, element)
    });
    return newName?.trim().toUpperCase();
}
;
/**
 * Validates a field name according to DDS naming rules (for editing)
 */
function validateFieldName(value, element) {
    const basicValidation = validateFieldNameFormat(value);
    if (basicValidation)
        return basicValidation;
    // Check screen size constraints
    const column = element.column ?? 1;
    const totalLength = value.trim().length + 2; // Account for padding
    if (column + totalLength - 1 > dspf_edit_model_1.fileSizeAttributes.maxCol1) {
        return "Text too long for screen size. Please choose a shorter name.";
    }
    ;
    return null;
}
;
/**
 * Prompts the user for field size specification
 */
async function promptForFieldSize(element, fieldName) {
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
    }
    ;
    return (0, dspf_edit_helper_1.parseSize)(newSizeInput);
}
;
/**
 * Validates field size input format and constraints
 */
function validateFieldSize(value) {
    const trimmedValue = value.trim();
    if (trimmedValue === '') {
        return "Size is required.";
    }
    ;
    const match = trimmedValue.match(/^(\d+)(?:,(\d+))?$/);
    if (!match) {
        return "Size must be a number or in the format N,D (e.g., '10' or '10,2').";
    }
    ;
    const totalLength = parseInt(match[1], 10);
    const decimals = match[2] ? parseInt(match[2], 10) : 0;
    if (totalLength <= 0) {
        return "Total size must be greater than 0.";
    }
    ;
    if (totalLength > 999) {
        return "Total size cannot exceed 999.";
    }
    ;
    if (decimals < 0) {
        return "Decimal places cannot be negative.";
    }
    ;
    if (decimals >= totalLength) {
        return "Decimal places must be less than total size.";
    }
    ;
    return null;
}
;
/**
 * Applies the field changes to the active document
 */
async function applyFieldChanges(editor, element, newName, newSize) {
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
    }
    ;
}
;
/**
 * Constructs the updated line with new field name and size
 */
function buildUpdatedLine(originalLine, newName, newSize) {
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
    const isNumericField = FIELD_CONSTANTS.NUMERIC_TYPES.includes(typeCharacter);
    if (isNumericField && newSize.decimals != undefined) {
        const decimalString = newSize.decimals.toString().padStart(2, ' ').substring(0, 2);
        line = line.substring(0, FIELD_CONSTANTS.DECIMAL_COLUMN_START) +
            decimalString +
            line.substring(FIELD_CONSTANTS.DECIMAL_COLUMN_END);
    }
    ;
    return line;
}
;
//# sourceMappingURL=dspf-edit.edit-field.js.map