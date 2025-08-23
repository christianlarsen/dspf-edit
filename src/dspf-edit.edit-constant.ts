/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.edit-constant.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fileSizeAttributes, fieldsPerRecords } from './dspf-edit.model';
import { findEndLineIndex } from './dspf-edit.helper';

// TYPE DEFINITIONS

/**
 * Information needed to create a new constant.
 */
interface NewConstantInfo {
    text: string;
    row: number;
    column: number;
    recordName: string;
};

/**
 * Position information for a constant.
 */
interface ConstantPosition {
    row: number;
    column: number;
    recordName: string;
};

/**
 * Information about an existing constant.
 */
interface ExistingConstantInfo {
    text: string;
    row: number;
    column: number;
    lineIndex: number;
};

// COMMAND REGISTRATION FUNCTIONS

/**
 * Registers the edit constant command for DDS constants.
 * Allows users to modify the content of existing constants.
 * @param context - The VS Code extension context
 */
export function editConstant(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.edit-constant", async (node: DdsNode) => {
            await handleEditConstantCommand(node);
        })
    );
};

/**
 * Registers the add constant command for DDS files.
 * Allows users to add new constants to the DDS file.
 * @param context - The VS Code extension context
 */
export function addConstant(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-constant", async (node?: DdsNode) => {
            await handleAddConstantCommand(node);
        })
    );
};

// COMMAND HANDLERS

/**
 * Handles the edit constant command for an existing DDS constant.
 * @param node - The DDS node containing the constant to edit
 */
async function handleEditConstantCommand(node: DdsNode): Promise<void> {
    try {
        const element = node.ddsElement;

        // Validate that the element is a constant
        if (element.kind !== "constant") {
            vscode.window.showWarningMessage("Only constants can be edited.");
            return;
        };

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        };

        // Get the current value without quotes for editing
        const currentValueNoQuotes = element.name.slice(1, -1);
        
        // Get new text from user
        const newText = await getConstantTextFromUser(
            `Set new text for ${element.name} (without quotes)`,
            currentValueNoQuotes,
            element.column
        );

        if (!newText) return;

        // Apply the constant update
        await updateExistingConstant(editor, element, newText);

    } catch (error) {
        console.error('Error editing constant:', error);
        vscode.window.showErrorMessage('An error occurred while editing the constant.');
    };
};

/**
 * Handles the add constant command to create a new DDS constant.
 * @param node - Optional DDS node for context (record or position reference)
 */
async function handleAddConstantCommand(node?: DdsNode): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        };

        // Get constant properties from user
        const constantInfo = await getNewConstantInfo(node);
        if (!constantInfo) return;

        // Apply the new constant
        await insertNewConstant(editor, constantInfo);

    } catch (error) {
        console.error('Error adding constant:', error);
        vscode.window.showErrorMessage('An error occurred while adding the constant.');
    };
};

// USER INPUT FUNCTIONS

/**
 * Gets constant text from user input with validation.
 * @param title - Title for the input dialog
 * @param defaultValue - Default value to show
 * @param column - Column position for length validation
 * @returns The entered text or null if cancelled
 */
async function getConstantTextFromUser(
    title: string, 
    defaultValue: string, 
    column?: number
): Promise<string | null> {
    const newText = await vscode.window.showInputBox({
        title: title,
        value: defaultValue,
        validateInput: value => validateConstantText(value, column)
    });

    return newText || null;
};

/**
 * Gets complete information for a new constant from the user.
 * @param contextNode - Optional node for context
 * @returns Complete constant information or null if cancelled
 */
async function getNewConstantInfo(contextNode?: DdsNode): Promise<NewConstantInfo | null> {
    // Get constant text
    const text = await getConstantTextFromUser(
        "Enter constant text (without quotes)",
        "",
        1 // Default column for validation
    );
    if (!text) return null;

    // Get position information
    const position = await getConstantPosition(contextNode);
    if (!position) return null;

    return {
        text: text,
        row: position.row,
        column: position.column,
        recordName: position.recordName
    };
};

/**
 * Gets position information for a new constant.
 * @param contextNode - Optional node for context
 * @returns Position information or null if cancelled
 */
async function getConstantPosition(contextNode?: DdsNode): Promise<ConstantPosition | null> {
    // If we have a record context, suggest positions within that record
    if (contextNode && contextNode.ddsElement.kind === 'record') {
        return await getPositionForRecord(contextNode.ddsElement);
    };

    // Otherwise, ask for manual position entry
    return await getManualPosition();
};

/**
 * Gets position information when adding to a specific record.
 * @param recordElement - The record element
 * @returns Position information or null if cancelled
 */
async function getPositionForRecord(recordElement: any): Promise<ConstantPosition | null> {
    // First ask if user wants relative or absolute positioning
    const positioningType = await vscode.window.showQuickPick(
        [
            { 
                label: "Absolute position", 
                description: "Enter specific row and column",
                value: "absolute" 
            },
            { 
                label: "Relative to existing constant", 
                description: "Position above or below an existing constant",
                value: "relative" 
            }
        ],
        {
            title: `Choose positioning method for record ${recordElement.name}`,
            placeHolder: "Select how to position the new constant"
        }
    );

    if (!positioningType) return null;

    if (positioningType.value === "relative") {
        return await getRelativePosition(recordElement);
    } else {
        return await getAbsolutePositionForRecord(recordElement);
    }
};

/**
 * Gets relative position information based on existing constants.
 * @param recordElement - The record element
 * @returns Position information or null if cancelled
 */
async function getRelativePosition(recordElement: any): Promise<ConstantPosition | null> {
    // Get existing constants in this record
    const existingConstants = await getExistingConstantsInRecord(recordElement.name);
    
    if (existingConstants.length === 0) {
        vscode.window.showInformationMessage("No existing constants found in this record. Using absolute positioning.");
        return await getAbsolutePositionForRecord(recordElement);
    };

    // Show constants for selection
    const selectedConstant = await vscode.window.showQuickPick(
        existingConstants.map(constant => ({
            label: `${constant.text}`,
            description: `Row: ${constant.row}, Column: ${constant.column}`,
            detail: `Line: ${constant.lineIndex + 1}`,
            constant: constant
        })),
        {
            title: "Select reference constant",
            placeHolder: "Choose the constant to position relative to"
        }
    );

    if (!selectedConstant) return null;

    // Ask for relative position (above or below)
    const relativePosition = await vscode.window.showQuickPick(
        [
            { 
                label: "Below", 
                description: "Position the new constant below the selected one",
                value: "below" 
            },
            { 
                label: "Above", 
                description: "Position the new constant above the selected one",
                value: "above" 
            }
        ],
        {
            title: "Relative position",
            placeHolder: "Where should the new constant be positioned?"
        }
    );

    if (!relativePosition) return null;

    // Calculate the new position
    const referenceConstant = selectedConstant.constant;
    const newRow = relativePosition.value === "above" 
        ? referenceConstant.row - 1 
        : referenceConstant.row + 1;

    // Validate the new row position
    if (newRow < 1 || newRow > 99) {
        vscode.window.showErrorMessage(`Cannot position constant at row ${newRow}. Row must be between 1 and 99.`);
        return null;
    };


    // Use the same column as the reference constant
    return {
        row: newRow,
        column: referenceConstant.column,
        recordName: recordElement.name
    };
};

/**
 * Gets absolute position information for a record.
 * @param recordElement - The record element
 * @returns Position information or null if cancelled
 */
async function getAbsolutePositionForRecord(recordElement: any): Promise<ConstantPosition | null> {
    const row = await vscode.window.showInputBox({
        title: `Enter row position for constant in record ${recordElement.name}`,
        validateInput: value => validateRowInput(value)
    });
    if (!row) return null;

    const column = await vscode.window.showInputBox({
        title: "Enter column position for constant",
        validateInput: value => validateColumnInput(value)
    });
    if (!column) return null;

    return {
        row: parseInt(row, 10),
        column: parseInt(column, 10),
        recordName: recordElement.name
    };
};

/**
 * Gets position information through manual entry.
 * @returns Position information or null if cancelled
 */
async function getManualPosition(): Promise<ConstantPosition | null> {
    const recordName = await vscode.window.showInputBox({
        title: "Enter record name for the constant",
        validateInput: value => value.trim() === '' ? "Record name cannot be empty" : null
    });
    if (!recordName) return null;

    const row = await vscode.window.showInputBox({
        title: "Enter row position for constant",
        validateInput: value => validateRowInput(value)
    });
    if (!row) return null;

    const column = await vscode.window.showInputBox({
        title: "Enter column position for constant",
        validateInput: value => validateColumnInput(value)
    });
    if (!column) return null;

    return {
        row: parseInt(row, 10),
        column: parseInt(column, 10),
        recordName: recordName.trim()
    };
};

/**
 * Gets existing constants in a specific record.
 * @param recordName - The record name to search in
 * @returns Array of existing constant information
 */
async function getExistingConstantsInRecord(recordName: string): Promise<ExistingConstantInfo[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return [];

    const constants: ExistingConstantInfo[] = [];
    const document = editor.document;
    
    // Find record boundaries
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) return [];

    // Scan through the record lines to find constants
    for (let lineIndex = recordInfo.startIndex; lineIndex <= recordInfo.endIndex; lineIndex++) {
        if (lineIndex >= document.lineCount) break;
        
        const line = document.lineAt(lineIndex);
        const constant = parseConstantFromLine(line.text, lineIndex);
        
        if (constant) {
            constants.push(constant);
        };
    };

    // Sort constants by row, then by column
    constants.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.column - b.column;
    });

    return constants;
};

/**
 * Parses a constant from a DDS line.
 * @param lineText - The line text to parse
 * @param lineIndex - The line index in the document
 * @returns Constant information or null if not a constant
 */
function parseConstantFromLine(lineText: string, lineIndex: number): ExistingConstantInfo | null {
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
        };
    };

    return {
        text: text || 'Constant',
        row: row,
        column: column,
        lineIndex: lineIndex
    };
};

// VALIDATION FUNCTIONS

/**
 * Validates constant text input.
 * @param value - The text value to validate
 * @param column - Optional column position for length validation
 * @returns Error message or null if valid
 */
function validateConstantText(value: string, column?: number): string | null {
    if (value === '') {
        return "The constant text cannot be empty.";
    };

    if (column) {
        const totalLength = value.length + 2; // +2 for quotes
        if (column + totalLength - 1 > fileSizeAttributes.maxCol1) {
            return "Text too long for the specified position.";
        };
    };

    return null;
};

/**
 * Validates row input.
 * @param value - The row value to validate
 * @returns Error message or null if valid
 */
function validateRowInput(value: string): string | null {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1 || num > 99) {
        return "Row must be a number between 1 and 99.";
    }
    return null;
};

/**
 * Validates column input.
 * @param value - The column value to validate
 * @returns Error message or null if valid
 */
function validateColumnInput(value: string): string | null {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1 || num > fileSizeAttributes.maxCol1) {
        return `Column must be a number between 1 and ${fileSizeAttributes.maxCol1}.`;
    }
    return null;
};

// CONSTANT UPDATE FUNCTIONS

/**
 * Updates an existing constant in the DDS file.
 * @param editor - The active text editor
 * @param element - The constant element to update
 * @param newText - The new text for the constant
 */
export async function updateExistingConstant(
    editor: vscode.TextEditor, 
    element: any, 
    newText: string
): Promise<void> {
    const newValue = `'${newText}'`;
    const uri = editor.document.uri;
    const workspaceEdit = new vscode.WorkspaceEdit();

    const endLineIndex = findEndLineIndex(editor.document, element.lineIndex);
    const fitsInSingleLine = newValue.length <= 36;

    if (fitsInSingleLine) {
        await updateConstantSingleLine(workspaceEdit, uri, element, newValue, endLineIndex);
    } else {
        await updateConstantMultiLine(workspaceEdit, uri, element, newValue, endLineIndex);
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Inserts a new constant into the DDS file.
 * @param editor - The active text editor
 * @param constantInfo - Information about the new constant
 */
async function insertNewConstant(editor: vscode.TextEditor, constantInfo: NewConstantInfo): Promise<void> {
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
    };
    workspaceEdit.insert(uri, new vscode.Position(insertionLine, 0), constantLines.join('\n'));
    if (insertionLine < editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(insertionLine, 0), '\n');        
    };

    await vscode.workspace.applyEdit(workspaceEdit);
    vscode.window.showInformationMessage(`Constant added successfully.`);
};

// LINE CREATION FUNCTIONS

/**
 * Updates a constant that fits in a single line.
 * @param workspaceEdit - The workspace edit to apply changes to
 * @param uri - The document URI
 * @param element - The constant element
 * @param newValue - The new constant value
 * @param endLineIndex - The end line index of the current constant
 */
async function updateConstantSingleLine(
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri,
    element: any,
    newValue: string,
    endLineIndex: number
): Promise<void> {
    const editor = vscode.window.activeTextEditor!;
    const firstLine = editor.document.lineAt(element.lineIndex).text;
    const updatedLine = firstLine.substring(0, 44) + newValue;

    workspaceEdit.delete(uri, new vscode.Range(
        element.lineIndex, 0, 
        element.lineIndex + endLineIndex - element.lineIndex + 1, 0
    ));

    if (element.lineIndex >= editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), '\n');        
    };
    workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), updatedLine);
    if (element.lineIndex < editor.document.lineCount - 1) {
        workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), '\n');        
    };

};

/**
 * Updates a constant that spans multiple lines.
 * @param workspaceEdit - The workspace edit to apply changes to
 * @param uri - The document URI
 * @param element - The constant element
 * @param newValue - The new constant value
 * @param endLineIndex - The end line index of the current constant
 */
async function updateConstantMultiLine(
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri,
    element: any,
    newValue: string,
    endLineIndex: number
): Promise<void> {
    const editor = vscode.window.activeTextEditor!;
    const firstLine = editor.document.lineAt(element.lineIndex).text;
    const updatedLines = createMultiLineConstantFromBase(firstLine, newValue);

    workspaceEdit.delete(uri, new vscode.Range(
        element.lineIndex, 0, 
        element.lineIndex + endLineIndex - element.lineIndex + 1, 0
    ));

    if (element.lineIndex >= editor.document.lineCount) {
        workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), '\n');        
    };
    workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), updatedLines.join('\n'));
    if (element.lineIndex < editor.document.lineCount - 1) {
        workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), '\n');        
    };
};

/**
 * Creates a single line constant definition.
 * @param constantInfo - Information about the constant
 * @param value - The constant value with quotes
 * @returns Array containing the single line
 */
function createSingleLineConstant(constantInfo: NewConstantInfo, value: string): string[] {
    const formattedRow = String(constantInfo.row).padStart(3, ' ');
    const formattedCol = String(constantInfo.column).padStart(3, ' ');
    const line = `     A` + ' '.repeat(32) + `${formattedRow}${formattedCol}${value}`;
    return [line];
};

/**
 * Creates a multi-line constant definition.
 * @param constantInfo - Information about the constant
 * @param value - The constant value with quotes
 * @returns Array containing all lines for the constant
 */
function createMultiLineConstant(constantInfo: NewConstantInfo, value: string): string[] {
    const formattedRow = String(constantInfo.row).padStart(3, ' ');
    const formattedCol = String(constantInfo.column).padStart(3, ' ');
    const baseLine = `     A` + ' '.repeat(32) + `${formattedRow}${formattedCol}`;
    
    return createMultiLineConstantFromBase(baseLine, value);
};

/**
 * Creates multi-line constant content from a base line and value.
 * @param baseLine - The base line format
 * @param value - The constant value
 * @returns Array of lines for the multi-line constant
 */
function createMultiLineConstantFromBase(baseLine: string, value: string): string[] {
    const lines: string[] = [];
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
        };
    };

    return lines;
};

// UTILITY FUNCTIONS

/**
 * Finds the appropriate insertion point for a new constant.
 * @param editor - The active text editor
 * @param recordName - The record name to insert the constant into
 * @returns The line number where the constant should be inserted
 */
function findConstantInsertionPoint(editor: vscode.TextEditor, recordName: string): number {
    // The constant must be inserted in the last line of the record (in the DDS source file)
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) {
        return 0;
    }
    const recordLineEnd = recordInfo.endIndex + 1;

    return recordLineEnd;
};
