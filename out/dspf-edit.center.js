"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.center.ts
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
exports.centerPosition = centerPosition;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
// POSITION CENTERING FUNCTIONALITY
/**
 * Registers the center position command for DDS fields and constants.
 * This command centers elements horizontally within their record's window size.
 * @param context - The VS Code extension context
 */
function centerPosition(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.center", async (node) => {
        await handleCenterCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the center position command for a given DDS node.
 * Validates the element, calculates the center position, and applies the changes.
 * @param node - The DDS node to center
 */
async function handleCenterCommand(node) {
    try {
        const element = node.ddsElement;
        // Validate element type and properties
        const validationResult = validateElementForCentering(element);
        if (!validationResult.isValid) {
            vscode.window.showWarningMessage(validationResult.message);
            return;
        }
        ;
        // Get active editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        // Get record window size
        if (!('recordname' in element)) {
            return;
        }
        ;
        const windowSize = (0, dspf_edit_model_1.getRecordSize)(element.recordname);
        if (!windowSize) {
            vscode.window.showWarningMessage("Unable to retrieve window size.");
            return;
        }
        ;
        // Calculate new center position
        const newPosition = calculateCenterPosition(element, windowSize.cols);
        if (!newPosition) {
            vscode.window.showWarningMessage("Unable to calculate center position.");
            return;
        }
        ;
        // Apply the position change
        await applyPositionChange(editor, element, newPosition);
        // Show success message
        vscode.window.showInformationMessage(`${element.name} centered in ${windowSize.cols} columns`);
    }
    catch (error) {
        console.error('Error centering element:', error);
        vscode.window.showErrorMessage('An error occurred while centering the element.');
    }
    ;
}
;
// VALIDATION FUNCTIONS
/**
 * Validates if an element can be centered.
 * @param element - The DDS element to validate
 * @returns Validation result with success status and error message if applicable
 */
function validateElementForCentering(element) {
    // Check if element is a field or constant
    if (element.kind !== "field" && element.kind !== "constant") {
        return {
            isValid: false,
            message: "Only fields and constants can be centered."
        };
    }
    ;
    // Check if field is referenced (referenced fields cannot be centered)
    if (element.kind === "field" && element.referenced === true) {
        return {
            isValid: false,
            message: "Referenced fields cannot be centered."
        };
    }
    ;
    return { isValid: true, message: "" };
}
;
// POSITION CALCULATION FUNCTIONS
/**
 * Calculates the center position for a DDS element within the given column width.
 * @param element - The DDS element to center
 * @param maxCols - Maximum number of columns available
 * @returns Object containing the new row and column positions, or null if calculation fails
 */
function calculateCenterPosition(element, maxCols) {
    const newRow = element.row;
    let newCol;
    switch (element.kind) {
        case 'constant':
            newCol = calculateConstantCenterPosition(element, maxCols);
            break;
        case 'field':
            newCol = calculateFieldCenterPosition(element, maxCols);
            break;
        default:
            return null;
    }
    ;
    // Validate calculated column position
    if (!newCol || newCol < 1) {
        return null;
    }
    ;
    return { row: newRow, col: newCol };
}
;
/**
 * Calculates the center position for a constant element.
 * @param element - The constant element
 * @param maxCols - Maximum number of columns available
 * @returns The calculated center column position
 */
function calculateConstantCenterPosition(element, maxCols) {
    // For constants, use the name length minus 2 (for quotes)
    const contentLength = element.name.length - 2;
    return Math.floor((maxCols - contentLength) / 2) + 1;
}
;
/**
 * Calculates the center position for a field element.
 * @param element - The field element
 * @param maxCols - Maximum number of columns available
 * @returns The calculated center column position
 */
function calculateFieldCenterPosition(element, maxCols) {
    if (element.length) {
        return Math.floor((maxCols - element.length) / 2) + 1;
    }
    else {
        // If no length is available, keep the current column position
        return element.column;
    }
    ;
}
;
// FILE MODIFICATION FUNCTIONS
/**
 * Applies the calculated position change to the document.
 * @param editor - The active text editor
 * @param element - The DDS element being moved
 * @param newPosition - The new position coordinates
 */
async function applyPositionChange(editor, element, newPosition) {
    const lineIndex = element.lineIndex;
    const line = editor.document.lineAt(lineIndex).text;
    // Create the updated line with new position
    const updatedLine = createUpdatedLine(line, newPosition.row, newPosition.col);
    // Apply the workspace edit
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    workspaceEdit.replace(uri, new vscode.Range(lineIndex, 0, lineIndex, line.length), updatedLine);
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Creates an updated line with the new row and column positions.
 * Updates positions 38-40 (row) and 41-43 (column) in the DDS line format.
 * @param originalLine - The original line text
 * @param newRow - The new row position
 * @param newCol - The new column position
 * @returns The updated line with new positions
 */
function createUpdatedLine(originalLine, newRow, newCol) {
    // Format row and column with proper padding
    const formattedRow = String(newRow).padStart(3, ' ');
    const formattedCol = String(newCol).padStart(3, ' ');
    // DDS format: positions 38-40 for row, 41-43 for column
    // Replace the position section (characters 38-43) with new values
    return originalLine.substring(0, 38) + formattedRow + formattedCol + originalLine.substring(44);
}
;
//# sourceMappingURL=dspf-edit.center.js.map