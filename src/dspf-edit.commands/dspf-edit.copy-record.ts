/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.copy-record.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { checkForEditorAndDocument, recordExists } from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

/**
 * Record copy configuration.
 */
interface RecordCopyConfig {
    originalName: string;
    newName: string;
    startLineIndex: number;
    endLineIndex: number;
};

/**
 * Record boundary detection result.
 */
interface RecordBoundary {
    startLineIndex: number;
    endLineIndex: number;
    totalLines: number;
};

// COMMAND REGISTRATION

/**
 * Registers the copy record command for DDS records.
 * Allows users to create a duplicate of an existing record with a new name.
 * @param context - The VS Code extension context
 */
export function copyRecord(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.copy-record", async (node: DdsNode) => {
            await handleCopyRecordCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the copy record command for a DDS record.
 * Validates element type, collects new name, detects record boundaries, and creates the copy.
 * @param node - The DDS node containing the record to copy
 */
async function handleCopyRecordCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const element = node.ddsElement;

        // Validate element type
        if (element.kind !== "record") {
            vscode.window.showWarningMessage("Records can only be copied from record elements.");
            return;
        };

        // Detect record boundaries
        const recordBoundary = detectRecordBoundaries(editor, element);
        if (recordBoundary.totalLines === 0) {
            vscode.window.showWarningMessage(`No content found for record ${element.name}.`);
            return;
        };

        // Collect new record name from user
        const newRecordName = await collectNewRecordName(element.name);
        if (!newRecordName) {
            // User cancelled the operation
            return;
        };

        // Create copy configuration
        const copyConfig: RecordCopyConfig = {
            originalName: element.name,
            newName: newRecordName,
            startLineIndex: recordBoundary.startLineIndex,
            endLineIndex: recordBoundary.endLineIndex
        };

        // Extract and modify record lines
        const recordLines = extractRecordLines(editor, copyConfig);
        const modifiedLines = modifyRecordLines(recordLines, copyConfig);

        // Insert the copied record into the document
        await insertCopiedRecord(editor, modifiedLines);

        // Show success message
        vscode.window.showInformationMessage(
            `Successfully copied record '${element.name}' to '${newRecordName}' (${recordBoundary.totalLines} lines copied).`
        );

    } catch (error) {
        console.error('Error copying record:', error);
        vscode.window.showErrorMessage('An error occurred while copying the record.');
    };
};

// USER INPUT COLLECTION FUNCTIONS

/**
 * Collects and validates the new record name from user input.
 * @param originalName - Name of the record being copied
 * @returns Valid new record name or null if cancelled
 */
async function collectNewRecordName(originalName: string): Promise<string | null> {
    const newName = await vscode.window.showInputBox({
        title: 'Copy Record - New Record Name',
        prompt: 'Enter the name for the new record',
        placeHolder: `${originalName}_COPY`,
        validateInput: (value: string) => validateNewRecordName(value, originalName)
    });

    return newName?.toUpperCase().trim() || null;
};

// VALIDATION FUNCTIONS

/**
 * Validates the new record name according to DDS rules.
 * @param value - The new record name to validate
 * @param originalName - The original record name being copied
 * @returns Error message or null if valid
 */
function validateNewRecordName(value: string, originalName: string): string | null {
    if (!value || value.trim() === '') {
        return "The record name cannot be empty.";
    };

    const trimmedValue = value.trim();

    if (trimmedValue.length > 10) {
        return "The record name must be 10 characters or fewer.";
    };

    if (/\s/.test(trimmedValue)) {
        return "The record name cannot contain spaces.";
    };

    if (/^\d/.test(trimmedValue)) {
        return "The record name cannot start with a number.";
    };

    if (!/^[A-Za-z][A-Za-z0-9@#$]*$/.test(trimmedValue)) {
        return "Invalid characters in record name. Use letters, numbers, @, #, $.";
    };

    if (trimmedValue.toUpperCase() === originalName.toUpperCase()) {
        return "The new record name cannot be the same as the original.";
    };

    if (recordExists(trimmedValue.toUpperCase())) {
        return "A record with this name already exists.";
    };

    return null;
};

// RECORD BOUNDARY DETECTION FUNCTIONS

/**
 * Detects the start and end boundaries of a record in the document.
 * @param editor - The active text editor
 * @param element - The record element
 * @returns Record boundary information
 */
function detectRecordBoundaries(editor: vscode.TextEditor, element: any): RecordBoundary {
    const document = editor.document;
    const startLineIndex = element.lineIndex;
    
    if (startLineIndex < 0 || startLineIndex >= document.lineCount) {
        return { startLineIndex: -1, endLineIndex: -1, totalLines: 0 };
    };

    // Find the end of the record
    const endLineIndex = findRecordEndLine(editor, startLineIndex);
    const totalLines = Math.max(0, endLineIndex - startLineIndex);

    return {
        startLineIndex,
        endLineIndex,
        totalLines
    };
};

/**
 * Finds the last line of a record by looking for the next record or end of file.
 * @param editor - The active text editor
 * @param startLineIndex - Starting line index of the current record
 * @returns End line index (exclusive)
 */
function findRecordEndLine(editor: vscode.TextEditor, startLineIndex: number): number {
    const document = editor.document;
    let endLineIndex = startLineIndex + 1;

    // Look for the next record definition or end of file
    for (let i = startLineIndex + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        
        if (isRecordDefinitionLine(line)) {
            // Found next record, current record ends here
            break;
        };
        
        endLineIndex = i + 1;
    };

    return endLineIndex;
};

/**
 * Determines if a line is a record definition line.
 * @param lineText - The line text to check
 * @returns True if the line defines a new record
 */
function isRecordDefinitionLine(lineText: string): boolean {
    // Record definition: starts with "     A", has "R" at position 17 (0-based: 16)
    return lineText.startsWith("     A") && 
           lineText.length > 16 && 
           lineText.charAt(16) === "R";
};

// RECORD EXTRACTION AND MODIFICATION FUNCTIONS

/**
 * Extracts all lines belonging to a record from the document.
 * @param editor - The active text editor
 * @param copyConfig - Copy configuration with boundary information
 * @returns Array of record lines
 */
function extractRecordLines(editor: vscode.TextEditor, copyConfig: RecordCopyConfig): string[] {
    const lines: string[] = [];
    
    for (let i = copyConfig.startLineIndex; i < copyConfig.endLineIndex; i++) {
        if (i < editor.document.lineCount) {
            const lineText = editor.document.lineAt(i).text;
            lines.push(lineText);
        };
    };

    return lines;
};

/**
 * Modifies the extracted record lines to use the new record name.
 * @param recordLines - Original record lines
 * @param copyConfig - Copy configuration with names
 * @returns Modified record lines with new name
 */
function modifyRecordLines(recordLines: string[], copyConfig: RecordCopyConfig): string[] {
    if (recordLines.length === 0) {
        return recordLines;
    }

    const modifiedLines = [...recordLines];
    
    // Modify the first line (record definition) to use the new name
    const firstLine = modifiedLines[0];
    if (firstLine && isRecordDefinitionLine(firstLine)) {
        modifiedLines[0] = replaceRecordNameInLine(firstLine, copyConfig.newName);
    };

    // Look for any other references to the original record name and replace them
    for (let i = 1; i < modifiedLines.length; i++) {
        modifiedLines[i] = replaceRecordReferences(modifiedLines[i], copyConfig.originalName, copyConfig.newName);
    };

    return modifiedLines;
};

/**
 * Replaces the record name in a record definition line.
 * @param line - The record definition line
 * @param newName - New record name
 * @returns Line with updated record name
 */
function replaceRecordNameInLine(line: string, newName: string): string {
    // It returns a new "record name line"
    const prefix = line.substring(0, 18); 
    const paddedName = newName.padEnd(10, ' ');

    return prefix + paddedName;
};

/**
 * Replaces references to the original record name in other lines.
 * @param line - Line text to process
 * @param originalName - Original record name
 * @param newName - New record name
 * @returns Line with updated references
 */
function replaceRecordReferences(line: string, originalName: string, newName: string): string {
    // Replace whole word occurrences of the original record name
    const regex = new RegExp(`\\b${originalName}\\b`, 'gi');
    return line.replace(regex, newName);
};

// DOCUMENT INSERTION FUNCTIONS

/**
 * Inserts the copied record lines into the document at the end.
 * @param editor - The active text editor
 * @param recordLines - Array of record lines to insert
 */
async function insertCopiedRecord(editor: vscode.TextEditor, recordLines: string[]): Promise<void> {
    if (recordLines.length === 0) {
        throw new Error('No record lines to insert');
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const insertPosition = new vscode.Position(editor.document.lineCount, 0);
    
    // Create the complete record text with proper line breaks
    const recordText = '\n' + recordLines.join('\n');
    
    workspaceEdit.insert(uri, insertPosition, recordText);
    await vscode.workspace.applyEdit(workspaceEdit);
};
