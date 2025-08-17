"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.change-position.ts
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
exports.changePosition = changePosition;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
;
;
// COMMAND REGISTRATION
/**
 * Registers the change position command for DDS fields and constants.
 * Allows users to interactively change the position of elements on screen.
 * @param context - The VS Code extension context
 */
function changePosition(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.change-position", async (node) => {
        await handleChangePositionCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the change position command for a DDS field or constant.
 * Validates element type, collects new position, and updates the element.
 * @param node - The DDS node containing the field or constant
 */
async function handleChangePositionCommand(node) {
    try {
        const element = node.ddsElement;
        // Validate element type
        if (element.kind !== "field" && element.kind !== "constant") {
            vscode.window.showWarningMessage("Position can only be changed for fields and constants.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
        }
        ;
        // Get current position
        const currentPosition = {
            row: element.row || 1,
            column: element.column || 1
        };
        // Show current position and collect new position
        const newPosition = await collectNewPosition(element.name, currentPosition);
        if (!newPosition) {
            // User cancelled the operation
            return;
        }
        ;
        // Check if position actually changed
        if (newPosition.row === currentPosition.row && newPosition.column === currentPosition.column) {
            vscode.window.showInformationMessage(`Element ${element.name} is already at row ${newPosition.row}, column ${newPosition.column}.`);
            return;
        }
        ;
        // Update the element position in the document
        await updateElementPosition(editor, element, newPosition);
        // Show success message
        vscode.window.showInformationMessage(`Successfully moved ${element.name} from row ${currentPosition.row}, column ${currentPosition.column} to row ${newPosition.row}, column ${newPosition.column}.`);
    }
    catch (error) {
        console.error('Error changing element position:', error);
        vscode.window.showErrorMessage('An error occurred while changing the element position.');
    }
    ;
}
;
// USER INPUT COLLECTION FUNCTIONS
/**
 * Collects new position coordinates from user through interactive dialogs.
 * @param elementName - Name of the element being repositioned
 * @param currentPosition - Current position of the element
 * @returns New position coordinates or null if user cancelled
 */
async function collectNewPosition(elementName, currentPosition) {
    // Step 1: Get new row
    const newRow = await collectRowPosition(elementName, currentPosition.row);
    if (newRow === null)
        return null;
    // Step 2: Get new column
    const newColumn = await collectColumnPosition(elementName, currentPosition.column);
    if (newColumn === null)
        return null;
    return {
        row: newRow,
        column: newColumn
    };
}
;
/**
 * Collects and validates the new row position from user input.
 * @param elementName - Name of the element being repositioned
 * @param currentRow - Current row position
 * @returns Valid row number or null if cancelled
 */
async function collectRowPosition(elementName, currentRow) {
    const rowInput = await vscode.window.showInputBox({
        title: `Change Position - Step 1/2: Row for ${elementName}`,
        prompt: `Enter the new row position (1-${dspf_edit_model_1.fileSizeAttributes.maxRow1})`,
        value: String(currentRow),
        placeHolder: String(currentRow),
        validateInput: (value) => validateRowPosition(value)
    });
    if (rowInput === undefined)
        return null; // User cancelled
    return Number(rowInput);
}
;
/**
 * Collects and validates the new column position from user input.
 * @param elementName - Name of the element being repositioned
 * @param currentColumn - Current column position
 * @returns Valid column number or null if cancelled
 */
async function collectColumnPosition(elementName, currentColumn) {
    const columnInput = await vscode.window.showInputBox({
        title: `Change Position - Step 2/2: Column for ${elementName}`,
        prompt: `Enter the new column position (1-${dspf_edit_model_1.fileSizeAttributes.maxCol1})`,
        value: String(currentColumn),
        placeHolder: String(currentColumn),
        validateInput: (value) => validateColumnPosition(value)
    });
    if (columnInput === undefined)
        return null; // User cancelled
    return Number(columnInput);
}
;
// VALIDATION FUNCTIONS
/**
 * Validates row position input according to DDS rules.
 * @param value - The row position to validate
 * @returns Error message or null if valid
 */
function validateRowPosition(value) {
    const validation = validatePositionInput(value, 1, dspf_edit_model_1.fileSizeAttributes.maxRow1, "Row");
    return validation.isValid ? null : validation.errorMessage;
}
;
/**
 * Validates column position input according to DDS rules.
 * @param value - The column position to validate
 * @returns Error message or null if valid
 */
function validateColumnPosition(value) {
    const validation = validatePositionInput(value, 1, dspf_edit_model_1.fileSizeAttributes.maxCol1, "Column");
    return validation.isValid ? null : validation.errorMessage;
}
;
/**
 * Validates position input (row or column) within specified bounds.
 * @param value - The position value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fieldName - Field name for error messages
 * @returns Validation result with error message if invalid
 */
function validatePositionInput(value, min, max, fieldName) {
    if (!value || value.trim() === '') {
        return {
            isValid: false,
            errorMessage: `${fieldName} cannot be empty.`
        };
    }
    ;
    const trimmedValue = value.trim();
    if (!/^\d+$/.test(trimmedValue)) {
        return {
            isValid: false,
            errorMessage: `${fieldName} must be a valid number.`
        };
    }
    ;
    const num = Number(trimmedValue);
    if (num < min || num > max) {
        return {
            isValid: false,
            errorMessage: `${fieldName} must be between ${min} and ${max}.`
        };
    }
    ;
    return { isValid: true };
}
;
/**
 * Validates that a position is within the display file boundaries.
 * @param position - Position to validate
 * @returns Validation result with error message if invalid
 */
function validatePositionBounds(position) {
    const rowValidation = validatePositionInput(String(position.row), 1, dspf_edit_model_1.fileSizeAttributes.maxRow1, "Row");
    if (!rowValidation.isValid) {
        return rowValidation;
    }
    ;
    const columnValidation = validatePositionInput(String(position.column), 1, dspf_edit_model_1.fileSizeAttributes.maxCol1, "Column");
    return columnValidation;
}
;
// DOCUMENT MODIFICATION FUNCTIONS
/**
 * Updates the position of an element in the DDS document.
 * @param editor - The active text editor
 * @param element - The DDS element to reposition
 * @param newPosition - New position coordinates
 */
async function updateElementPosition(editor, element, newPosition) {
    // Validate the new position
    const positionValidation = validatePositionBounds(newPosition);
    if (!positionValidation.isValid) {
        throw new Error(`Invalid position: ${positionValidation.errorMessage}`);
    }
    ;
    const lineIndex = element.lineIndex;
    if (lineIndex < 0 || lineIndex >= editor.document.lineCount) {
        throw new Error(`Invalid line index: ${lineIndex}`);
    }
    ;
    const currentLine = editor.document.lineAt(lineIndex);
    const lineText = currentLine.text;
    // Validate line format
    if (lineText.length < 44) {
        throw new Error(`Line is too short to contain position information: ${lineText.length} characters`);
    }
    ;
    // Create updated line with new position
    const updatedLine = createUpdatedLineWithPosition(lineText, newPosition);
    // Apply the change
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    workspaceEdit.replace(uri, currentLine.range, updatedLine);
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Creates an updated DDS line with new position coordinates.
 * @param originalLine - The original line text
 * @param newPosition - New position coordinates
 * @returns Updated line with new position
 */
function createUpdatedLineWithPosition(originalLine, newPosition) {
    // DDS position format: positions 39-41 for row, 42-44 for column (1-based)
    // In 0-based indexing: 38-40 for row, 41-43 for column
    const formattedRow = String(newPosition.row).padStart(3, ' ');
    const formattedColumn = String(newPosition.column).padStart(3, ' ');
    // Build updated line: prefix + row + column + suffix
    const prefix = originalLine.substring(0, 38);
    const suffix = originalLine.substring(44);
    return prefix + formattedRow + formattedColumn + suffix;
}
;
// UTILITY FUNCTIONS
/**
 * Gets display-friendly element type label.
 * @param elementKind - Element kind from DDS
 * @returns Human-readable element type
 */
function getElementTypeLabel(elementKind) {
    const labels = {
        'field': 'field',
        'constant': 'constant'
    };
    return labels[elementKind] || 'element';
}
;
/**
 * Formats position for display purposes.
 * @param position - Position coordinates
 * @returns Formatted position string
 */
function formatPositionForDisplay(position) {
    return `row ${position.row}, column ${position.column}`;
}
;
//# sourceMappingURL=dspf-edit.change-position.js.map