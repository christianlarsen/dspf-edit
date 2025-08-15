"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.edit-constant.ts
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
exports.editConstant = editConstant;
exports.addConstant = addConstant;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
const dspf_edit_helper_1 = require("./dspf-edit.helper");
// COMMAND REGISTRATION FUNCTIONS
/**
 * Registers the edit constant command for DDS constants.
 * Allows users to modify the content of existing constants.
 * @param context - The VS Code extension context
 */
function editConstant(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.edit-constant", async (node) => {
        await handleEditConstantCommand(node);
    }));
}
;
/**
 * Registers the add constant command for DDS files.
 * Allows users to add new constants to the DDS file.
 * @param context - The VS Code extension context
 */
function addConstant(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.add-constant", async (node) => {
        await handleAddConstantCommand(node);
    }));
}
;
// COMMAND HANDLERS
/**
 * Handles the edit constant command for an existing DDS constant.
 * @param node - The DDS node containing the constant to edit
 */
async function handleEditConstantCommand(node) {
    try {
        const element = node.ddsElement;
        // Validate that the element is a constant
        if (element.kind !== "constant") {
            vscode.window.showWarningMessage("Only constants can be edited.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        // Get the current value without quotes for editing
        const currentValueNoQuotes = element.name.slice(1, -1);
        // Get new text from user
        const newText = await getConstantTextFromUser(`Set new text for ${element.name} (without quotes)`, currentValueNoQuotes, element.column);
        if (!newText)
            return;
        // Apply the constant update
        await updateExistingConstant(editor, element, newText);
    }
    catch (error) {
        console.error('Error editing constant:', error);
        vscode.window.showErrorMessage('An error occurred while editing the constant.');
    }
    ;
}
;
/**
 * Handles the add constant command to create a new DDS constant.
 * @param node - Optional DDS node for context (record or position reference)
 */
async function handleAddConstantCommand(node) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        // Get constant properties from user
        const constantInfo = await getNewConstantInfo(node);
        if (!constantInfo)
            return;
        // Apply the new constant
        await insertNewConstant(editor, constantInfo);
    }
    catch (error) {
        console.error('Error adding constant:', error);
        vscode.window.showErrorMessage('An error occurred while adding the constant.');
    }
    ;
}
;
// USER INPUT FUNCTIONS
/**
 * Gets constant text from user input with validation.
 * @param title - Title for the input dialog
 * @param defaultValue - Default value to show
 * @param column - Column position for length validation
 * @returns The entered text or null if cancelled
 */
async function getConstantTextFromUser(title, defaultValue, column) {
    const newText = await vscode.window.showInputBox({
        title: title,
        value: defaultValue,
        validateInput: value => validateConstantText(value, column)
    });
    return newText || null;
}
;
/**
 * Gets complete information for a new constant from the user.
 * @param contextNode - Optional node for context
 * @returns Complete constant information or null if cancelled
 */
async function getNewConstantInfo(contextNode) {
    // Get constant text
    const text = await getConstantTextFromUser("Enter constant text (without quotes)", "", 1 // Default column for validation
    );
    if (!text)
        return null;
    // Get position information
    const position = await getConstantPosition(contextNode);
    if (!position)
        return null;
    return {
        text: text,
        row: position.row,
        column: position.column,
        recordName: position.recordName
    };
}
;
/**
 * Gets position information for a new constant.
 * @param contextNode - Optional node for context
 * @returns Position information or null if cancelled
 */
async function getConstantPosition(contextNode) {
    // If we have a record context, suggest positions within that record
    if (contextNode && contextNode.ddsElement.kind === 'record') {
        return await getPositionForRecord(contextNode.ddsElement);
    }
    ;
    // Otherwise, ask for manual position entry
    return await getManualPosition();
}
;
/**
 * Gets position information when adding to a specific record.
 * @param recordElement - The record element
 * @returns Position information or null if cancelled
 */
async function getPositionForRecord(recordElement) {
    const row = await vscode.window.showInputBox({
        title: `Enter row position for constant in record ${recordElement.name}`,
        validateInput: value => validateRowInput(value)
    });
    if (!row)
        return null;
    const column = await vscode.window.showInputBox({
        title: "Enter column position for constant",
        validateInput: value => validateColumnInput(value)
    });
    if (!column)
        return null;
    return {
        row: parseInt(row, 10),
        column: parseInt(column, 10),
        recordName: recordElement.name
    };
}
;
/**
 * Gets position information through manual entry.
 * @returns Position information or null if cancelled
 */
async function getManualPosition() {
    const recordName = await vscode.window.showInputBox({
        title: "Enter record name for the constant",
        validateInput: value => value.trim() === '' ? "Record name cannot be empty" : null
    });
    if (!recordName)
        return null;
    const row = await vscode.window.showInputBox({
        title: "Enter row position for constant",
        validateInput: value => validateRowInput(value)
    });
    if (!row)
        return null;
    const column = await vscode.window.showInputBox({
        title: "Enter column position for constant",
        validateInput: value => validateColumnInput(value)
    });
    if (!column)
        return null;
    return {
        row: parseInt(row, 10),
        column: parseInt(column, 10),
        recordName: recordName.trim()
    };
}
;
// VALIDATION FUNCTIONS
/**
 * Validates constant text input.
 * @param value - The text value to validate
 * @param column - Optional column position for length validation
 * @returns Error message or null if valid
 */
function validateConstantText(value, column) {
    if (value === '') {
        return "The constant text cannot be empty.";
    }
    ;
    if (column) {
        const totalLength = value.length + 2; // +2 for quotes
        if (column + totalLength - 1 > dspf_edit_model_1.fileSizeAttributes.maxCol1) {
            return "Text too long for the specified position.";
        }
        ;
    }
    ;
    return null;
}
;
/**
 * Validates row input.
 * @param value - The row value to validate
 * @returns Error message or null if valid
 */
function validateRowInput(value) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1 || num > 99) {
        return "Row must be a number between 1 and 99.";
    }
    return null;
}
;
/**
 * Validates column input.
 * @param value - The column value to validate
 * @returns Error message or null if valid
 */
function validateColumnInput(value) {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1 || num > dspf_edit_model_1.fileSizeAttributes.maxCol1) {
        return `Column must be a number between 1 and ${dspf_edit_model_1.fileSizeAttributes.maxCol1}.`;
    }
    return null;
}
;
// CONSTANT UPDATE FUNCTIONS
/**
 * Updates an existing constant in the DDS file.
 * @param editor - The active text editor
 * @param element - The constant element to update
 * @param newText - The new text for the constant
 */
async function updateExistingConstant(editor, element, newText) {
    const newValue = `'${newText}'`;
    const uri = editor.document.uri;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const endLineIndex = (0, dspf_edit_helper_1.findEndLineIndex)(editor.document, element.lineIndex);
    const fitsInSingleLine = newValue.length <= 36;
    if (fitsInSingleLine) {
        await updateConstantSingleLine(workspaceEdit, uri, element, newValue, endLineIndex);
    }
    else {
        await updateConstantMultiLine(workspaceEdit, uri, element, newValue, endLineIndex);
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Inserts a new constant into the DDS file.
 * @param editor - The active text editor
 * @param constantInfo - Information about the new constant
 */
async function insertNewConstant(editor, constantInfo) {
    const newValue = `'${constantInfo.text}'`;
    const uri = editor.document.uri;
    const workspaceEdit = new vscode.WorkspaceEdit();
    // Find the appropriate insertion point (end of file or before next record)
    const insertionLine = findConstantInsertionPoint(editor, constantInfo.recordName);
    const fitsInSingleLine = newValue.length <= 36;
    const constantLines = fitsInSingleLine
        ? createSingleLineConstant(constantInfo, newValue)
        : createMultiLineConstant(constantInfo, newValue);
    if (insertionLine >= editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(insertionLine, 0), '\n');
    }
    ;
    workspaceEdit.insert(uri, new vscode.Position(insertionLine, 0), constantLines.join('\n'));
    if (insertionLine < editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(insertionLine, 0), '\n');
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
    vscode.window.showInformationMessage(`Constant added successfully.`);
}
;
// LINE CREATION FUNCTIONS
/**
 * Updates a constant that fits in a single line.
 * @param workspaceEdit - The workspace edit to apply changes to
 * @param uri - The document URI
 * @param element - The constant element
 * @param newValue - The new constant value
 * @param endLineIndex - The end line index of the current constant
 */
async function updateConstantSingleLine(workspaceEdit, uri, element, newValue, endLineIndex) {
    const editor = vscode.window.activeTextEditor;
    const firstLine = editor.document.lineAt(element.lineIndex).text;
    const updatedLine = firstLine.substring(0, 44) + newValue;
    workspaceEdit.delete(uri, new vscode.Range(element.lineIndex, 0, element.lineIndex + endLineIndex - element.lineIndex + 1, 0));
    workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), updatedLine + '\n');
}
;
/**
 * Updates a constant that spans multiple lines.
 * @param workspaceEdit - The workspace edit to apply changes to
 * @param uri - The document URI
 * @param element - The constant element
 * @param newValue - The new constant value
 * @param endLineIndex - The end line index of the current constant
 */
async function updateConstantMultiLine(workspaceEdit, uri, element, newValue, endLineIndex) {
    const editor = vscode.window.activeTextEditor;
    const firstLine = editor.document.lineAt(element.lineIndex).text;
    const updatedLines = createMultiLineConstantFromBase(firstLine, newValue);
    workspaceEdit.delete(uri, new vscode.Range(element.lineIndex, 0, element.lineIndex + endLineIndex - element.lineIndex + 1, 0));
    workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), updatedLines.join('\n') + '\n');
}
;
/**
 * Creates a single line constant definition.
 * @param constantInfo - Information about the constant
 * @param value - The constant value with quotes
 * @returns Array containing the single line
 */
function createSingleLineConstant(constantInfo, value) {
    const formattedRow = String(constantInfo.row).padStart(3, ' ');
    const formattedCol = String(constantInfo.column).padStart(3, ' ');
    const line = `     A` + ' '.repeat(32) + `${formattedRow}${formattedCol}${value}`;
    return [line];
}
;
/**
 * Creates a multi-line constant definition.
 * @param constantInfo - Information about the constant
 * @param value - The constant value with quotes
 * @returns Array containing all lines for the constant
 */
function createMultiLineConstant(constantInfo, value) {
    const formattedRow = String(constantInfo.row).padStart(3, ' ');
    const formattedCol = String(constantInfo.column).padStart(3, ' ');
    const baseLine = `     A` + ' '.repeat(32) + `${formattedRow}${formattedCol}`;
    return createMultiLineConstantFromBase(baseLine, value);
}
;
/**
 * Creates multi-line constant content from a base line and value.
 * @param baseLine - The base line format
 * @param value - The constant value
 * @returns Array of lines for the multi-line constant
 */
function createMultiLineConstantFromBase(baseLine, value) {
    const lines = [];
    let remainingText = value;
    // First line
    const firstChunk = remainingText.substring(0, 35);
    remainingText = remainingText.substring(35);
    const firstLine = baseLine.substring(0, 44) + firstChunk.padEnd(35, ' ') + '-';
    lines.push(firstLine);
    // Continuation lines
    while (remainingText.length > 0) {
        const nextChunk = remainingText.substring(0, 35);
        remainingText = remainingText.substring(35);
        const isLastChunk = remainingText.trim() === "'" || remainingText.length === 0;
        const continuationChar = isLastChunk ? ' ' : '-';
        const contLine = '     A' + ' '.repeat(38) + nextChunk.padEnd(35, ' ') + continuationChar;
        lines.push(contLine);
        if (isLastChunk) {
            break;
        }
        ;
    }
    ;
    return lines;
}
;
// UTILITY FUNCTIONS
/**
 * Finds the appropriate insertion point for a new constant.
 * @param editor - The active text editor
 * @param recordName - The record name to insert the constant into
 * @returns The line number where the constant should be inserted
 */
function findConstantInsertionPoint(editor, recordName) {
    // The constant must be inserted in the last line of the record (in the DDS source file)
    const recordInfo = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) {
        return 0;
    }
    const recordLineEnd = recordInfo.endIndex + 1;
    return recordLineEnd;
}
;
;
;
//# sourceMappingURL=dspf-edit.edit-constant.js.map