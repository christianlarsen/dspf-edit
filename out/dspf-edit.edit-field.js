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
exports.editField = editField;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
const dspf_edit_helper_1 = require("./dspf-edit.helper");
;
;
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
    NUMERIC_TYPES: ['Y', 'P', 'S', 'Z']
};
/**
 * Registers the field editing command for the VS Code extension
 *
 * This function sets up the command handler that allows users to edit DDS field properties
 * including field name and size/decimal specifications through interactive input boxes.
 *
 * @param context - The VS Code extension context for registering commands and subscriptions
 */
function editField(context) {
    // Register the command with VS Code's command system
    const disposable = vscode.commands.registerCommand("dspf-edit.edit-field", handleEditFieldCommand);
    // Add the command to the extension's disposables for proper cleanup
    context.subscriptions.push(disposable);
}
;
/**
 * Main command handler for editing DDS fields
 *
 * @param node - The selected DDS node from the tree view
 */
async function handleEditFieldCommand(node) {
    try {
        // Validate the selected node
        const validationResult = validateNode(node);
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
            vscode.window.showInformationMessage(`Field '${element.name}' successfully updated to '${newName}' with size ${newSize.length}${newSize.decimals > 0 ? `,${newSize.decimals}` : ''}`);
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
/**
 * Validates that the selected node is a valid field for editing
 *
 * @param node - The DDS node to validate
 * @returns Validation result indicating if the node is valid
 */
function validateNode(node) {
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
 * Prompts the user for a new field name with comprehensive validation
 *
 * @param element - The current DDS element being edited
 * @returns The new field name in uppercase, or undefined if cancelled
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
 * Validates a field name according to DDS naming rules
 *
 * @param value - The field name to validate
 * @param element - The current DDS element (for position validation)
 * @returns Error message if invalid, null if valid
 */
function validateFieldName(value, element) {
    const trimmedValue = value.trim();
    // Check for empty name
    if (trimmedValue === '') {
        return "The field name cannot be empty.";
    }
    ;
    // Check length constraint
    if (trimmedValue.length > FIELD_CONSTANTS.MAX_NAME_LENGTH) {
        return `The name must be ${FIELD_CONSTANTS.MAX_NAME_LENGTH} characters or fewer.`;
    }
    ;
    // Check for spaces
    if (/\s/.test(trimmedValue)) {
        return "The name cannot contain spaces.";
    }
    ;
    // Check if starts with number
    if (/^\d/.test(trimmedValue)) {
        return "The name cannot start with a number.";
    }
    ;
    // Check for valid characters (letters, numbers, underscore, hyphen)
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmedValue)) {
        return "The name can only contain letters, numbers, underscores, and hyphens, and must start with a letter.";
    }
    ;
    // Check screen size constraints
    const column = element.column ?? 1;
    const totalLength = trimmedValue.length + 2; // Account for padding
    if (column + totalLength - 1 > dspf_edit_model_1.fileSizeAttributes.maxCol1) {
        return "Text too long for screen size. Please choose a shorter name.";
    }
    ;
    return null;
}
;
/**
 * Prompts the user for field size specification
 *
 * @param element - The current DDS element
 * @param fieldName - The new field name (for display purposes)
 * @returns The parsed field size, or undefined if cancelled
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
 *
 * @param value - The size input to validate
 * @returns Error message if invalid, null if valid
 */
function validateFieldSize(value) {
    const trimmedValue = value.trim();
    if (trimmedValue === '') {
        return "Size is required.";
    }
    ;
    // Match pattern: digits optionally followed by comma and more digits
    const match = trimmedValue.match(/^(\d+)(?:,(\d+))?$/);
    if (!match) {
        return "Size must be a number or in the format N,D (e.g., '10' or '10,2').";
    }
    ;
    const totalLength = parseInt(match[1], 10);
    const decimals = match[2] ? parseInt(match[2], 10) : 0;
    // Validate total length
    if (totalLength <= 0) {
        return "Total size must be greater than 0.";
    }
    ;
    if (totalLength > 999) {
        return "Total size cannot exceed 999.";
    }
    ;
    // Validate decimals
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
 *
 * @param editor - The active VS Code text editor
 * @param element - The DDS element being modified
 * @param newName - The new field name
 * @param newSize - The new field size specification
 */
async function applyFieldChanges(editor, element, newName, newSize) {
    const lineIndex = element.lineIndex;
    const originalLine = editor.document.lineAt(lineIndex).text;
    // Build the updated line with new field properties
    const updatedLine = buildUpdatedLine(originalLine, newName, newSize);
    // Create and apply the workspace edit
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
 *
 * @param originalLine - The original line text
 * @param newName - The new field name
 * @param newSize - The new field size
 * @returns The updated line text
 */
function buildUpdatedLine(originalLine, newName, newSize) {
    // Ensure the line is long enough for all operations
    let line = originalLine.padEnd(50, ' ');
    // Update the field name (columns 19-28, padded to 10 characters)
    const paddedName = newName.padEnd(FIELD_CONSTANTS.MAX_NAME_LENGTH, ' ')
        .substring(0, FIELD_CONSTANTS.MAX_NAME_LENGTH);
    line = line.substring(0, FIELD_CONSTANTS.NAME_COLUMN_START) +
        paddedName +
        line.substring(FIELD_CONSTANTS.NAME_COLUMN_END);
    // Update the size (columns 33-34, right-aligned, 2 digits)
    const sizeString = newSize.length.toString().padStart(2, ' ').substring(0, 2);
    line = line.substring(0, FIELD_CONSTANTS.SIZE_COLUMN_START) +
        sizeString +
        line.substring(FIELD_CONSTANTS.SIZE_COLUMN_END);
    // Update decimals if this is a numeric field type
    const typeCharacter = line.substring(FIELD_CONSTANTS.TYPE_COLUMN, FIELD_CONSTANTS.TYPE_COLUMN + 1);
    const isNumericField = FIELD_CONSTANTS.NUMERIC_TYPES.includes(typeCharacter);
    if (isNumericField) {
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