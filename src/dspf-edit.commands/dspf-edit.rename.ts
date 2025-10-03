/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.rename.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';
import { fieldsPerRecords, records } from '../dspf-edit.model/dspf-edit.model';

// TYPE DEFINITIONS

/**
 * Information about a field rename operation.
 */
interface FieldRenameInfo {
    oldName: string;
    newName: string;
    recordName: string;
    lineIndex: number;
};

/**
 * Information about a record rename operation.
 */
interface RecordRenameInfo {
    oldName: string;
    newName: string;
    startIndex: number;
    endIndex: number;
};

/**
 * Validation result for rename operations.
 */
interface ValidationResult {
    isValid: boolean;
    errorMessage?: string;
};

// COMMAND REGISTRATION FUNCTIONS

/**
 * Registers the rename field command for DDS fields.
 * @param context - The VS Code extension context
 */
export function renameField(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.rename-field", async (node: DdsNode) => {
            await handleRenameFieldCommand(node);
        })
    );
};

/**
 * Registers the rename record command for DDS records.
 * @param context - The VS Code extension context
 */
export function renameRecord(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.rename-record", async (node: DdsNode) => {
            await handleRenameRecordCommand(node);
        })
    );
};

// COMMAND HANDLERS

/**
 * Handles the rename field command for an existing DDS field.
 * @param node - The DDS node containing the field to rename
 */
async function handleRenameFieldCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const element = node.ddsElement;

        // Validate that the element is a field
        if (element.kind !== 'field') {
            vscode.window.showWarningMessage(`Only fields can be renamed with this command.`);
            return;
        };

        const oldName = element.name;
        const recordName = element.recordname;
        const lineIndex = element.lineIndex;

        // Prompt user for new name
        const newName = await vscode.window.showInputBox({
            prompt: `Enter new name for field "${oldName}"`,
            value: oldName,
            validateInput: (value) => validateFieldName(value, recordName, oldName)
        });

        if (!newName || newName === oldName) {
            return; // User cancelled or entered same name
        };

        // Create rename info
        const renameInfo: FieldRenameInfo = {
            oldName,
            newName,
            recordName,
            lineIndex
        };

        // Show confirmation dialog
        const confirmed = await showFieldRenameConfirmation(renameInfo);
        if (!confirmed) {
            return;
        };

        // Execute the rename
        await executeFieldRename(editor, renameInfo);

        vscode.window.showInformationMessage(`Field "${oldName}" renamed to "${newName}" successfully.`);

    } catch (error) {
        console.error(`Error renaming field:`, error);
        vscode.window.showErrorMessage(`An error occurred while renaming the field.`);
    };
};

/**
 * Handles the rename record command for an existing DDS record.
 * @param node - The DDS node containing the record to rename
 */
async function handleRenameRecordCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const element = node.ddsElement;

        // Validate that the element is a record
        if (element.kind !== 'record') {
            vscode.window.showWarningMessage(`Only records can be renamed with this command.`);
            return;
        };

        const oldName = element.name;
        const lineIndex = element.lineIndex;

        // Find the record in fieldsPerRecords to get start and end indices
        const recordEntry = fieldsPerRecords.find(r => r.record === oldName);
        if (!recordEntry) {
            vscode.window.showWarningMessage(`Could not find record information for "${oldName}".`);
            return;
        };

        // Prompt user for new name
        const newName = await vscode.window.showInputBox({
            prompt: `Enter new name for record "${oldName}"`,
            value: oldName,
            validateInput: (value) => validateRecordName(value, oldName)
        });

        if (!newName || newName === oldName) {
            return; // User cancelled or entered same name
        };

        // Create rename info
        const renameInfo: RecordRenameInfo = {
            oldName,
            newName,
            startIndex: recordEntry.startIndex,
            endIndex: recordEntry.endIndex
        };

        // Show confirmation dialog
        const confirmed = await showRecordRenameConfirmation(renameInfo);
        if (!confirmed) {
            return;
        };

        // Execute the rename
        await executeRecordRename(editor, renameInfo);

        vscode.window.showInformationMessage(`Record "${oldName}" renamed to "${newName}" successfully.`);

    } catch (error) {
        console.error(`Error renaming record:`, error);
        vscode.window.showErrorMessage(`An error occurred while renaming the record.`);
    };
};

// VALIDATION FUNCTIONS

/**
 * Validates a field name according to DDS rules.
 * @param name - The name to validate
 * @param recordName - The record containing the field
 * @param oldName - The current name (to allow unchanged name)
 * @returns Error message if invalid, undefined if valid
 */
function validateFieldName(name: string, recordName: string, oldName: string): string | undefined {
    // Check if name is empty
    if (!name || name.trim().length === 0) {
        return 'Field name cannot be empty.';
    };

    // Trim the name
    name = name.trim();

    // Check maximum length (10 characters)
    if (name.length > 10) {
        return 'Field name cannot exceed 10 characters.';
    };

    // Check if starts with a number
    if (/^\d/.test(name)) {
        return 'Field name cannot start with a number.';
    };

    // Check for invalid characters (only alphanumeric, underscore, #, @, $ allowed)
    if (!/^[A-Za-z#@$_][A-Za-z0-9#@$_]*$/.test(name)) {
        return 'Field name contains invalid characters. Only letters, numbers, #, @, $, and _ are allowed.';
    };

    // Check for spaces
    if (/\s/.test(name)) {
        return 'Field name cannot contain spaces.';
    };

    // Check for same name
    if (name === oldName) {
        return 'Field name cannot be the same as before.';
    };

    // Check if name already exists in the same record
    const recordEntry = fieldsPerRecords.find(r => r.record === recordName);
    if (recordEntry) {
        const nameExists = recordEntry.fields.some(f => f.name.toUpperCase() === name.toUpperCase());
        if (nameExists) {
            return `Field "${name}" already exists in record "${recordName}".`;
        };
    };

    return undefined;
};

/**
 * Validates a record name according to DDS rules.
 * @param name - The name to validate
 * @param oldName - The current name (to allow unchanged name)
 * @returns Error message if invalid, undefined if valid
 */
function validateRecordName(name: string, oldName: string): string | undefined {
    // Check if name is empty
    if (!name || name.trim().length === 0) {
        return 'Record name cannot be empty.';
    };

    // Trim the name
    name = name.trim();

    // Check maximum length (10 characters)
    if (name.length > 10) {
        return 'Record name cannot exceed 10 characters.';
    };

    // Check if starts with a number
    if (/^\d/.test(name)) {
        return 'Record name cannot start with a number.';
    };

    // Check for invalid characters (only alphanumeric, underscore, #, @, $ allowed)
    if (!/^[A-Za-z#@$_][A-Za-z0-9#@$_]*$/.test(name)) {
        return 'Record name contains invalid characters. Only letters, numbers, #, @, $, and _ are allowed.';
    };

    // Check for spaces
    if (/\s/.test(name)) {
        return 'Record name cannot contain spaces.';
    };

    // Check for same same
    if (name === oldName) {
        return 'Field name cannot be the same as before.';
    };

    // Check if record name already exists
    const nameExists = records.some(r => r.toUpperCase() === name.toUpperCase());
    if (nameExists) {
        return `Record "${name}" already exists.`;
    };

    return undefined;
};

// CONFIRMATION DIALOGS

/**
 * Shows a confirmation dialog for field rename operation.
 * @param renameInfo - Information about the rename operation
 * @returns Promise that resolves to true if user confirms, false otherwise
 */
async function showFieldRenameConfirmation(renameInfo: FieldRenameInfo): Promise<boolean> {
    const message = `Rename field "${renameInfo.oldName}" to "${renameInfo.newName}" in record "${renameInfo.recordName}"?`;
    
    const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        "Rename",
        "Cancel"
    );

    return choice === "Rename";
};

/**
 * Shows a confirmation dialog for record rename operation.
 * @param renameInfo - Information about the rename operation
 * @returns Promise that resolves to true if user confirms, false otherwise
 */
async function showRecordRenameConfirmation(renameInfo: RecordRenameInfo): Promise<boolean> {
    const message = `Rename record "${renameInfo.oldName}" to "${renameInfo.newName}"?`;
    
    const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        "Rename",
        "Cancel"
    );

    return choice === "Rename";
};

// RENAME EXECUTION FUNCTIONS

/**
 * Executes the field rename operation by modifying the document.
 * @param editor - The active text editor
 * @param renameInfo - Information about the rename operation
 */
async function executeFieldRename(
    editor: vscode.TextEditor,
    renameInfo: FieldRenameInfo
): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const document = editor.document;

    // Get the line containing the field definition
    const line = document.lineAt(renameInfo.lineIndex);
    const lineText = line.text;

    const fieldNameStart = 18; 
    const fieldNameEnd = 28;   

    // Extract the current field name from the line (trim to handle padding)
    const currentFieldInLine = lineText.substring(fieldNameStart, fieldNameEnd).trim();

    // Verify that the field name matches (case-insensitive)
    if (currentFieldInLine.toUpperCase() !== renameInfo.oldName.toUpperCase()) {
        vscode.window.showWarningMessage(
            `Field name mismatch at line ${renameInfo.lineIndex + 1}. Expected "${renameInfo.oldName}", found "${currentFieldInLine}".`
        );
        return;
    };

    // Create the new field name, padded to 10 characters
    const newFieldNamePadded = renameInfo.newName.padEnd(10, ' ');

    // Build the new line with the renamed field
    const before = lineText.substring(0, fieldNameStart);
    const after = lineText.substring(fieldNameEnd);
    const newLine = before + newFieldNamePadded + after;

    // Replace the line
    workspaceEdit.replace(uri, line.range, newLine);

    // Apply the edit
    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Executes the record rename operation by modifying the document.
 * @param editor - The active text editor
 * @param renameInfo - Information about the rename operation
 */
async function executeRecordRename(
    editor: vscode.TextEditor,
    renameInfo: RecordRenameInfo
): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const document = editor.document;

    const recordNamePadded = renameInfo.newName.padEnd(10, ' ');

    // Process record line

    const line = document.lineAt(renameInfo.startIndex);
    const lineText = line.text;

    // Check if this line has the record name
    const recordNameStart = 18;
    const recordNameEnd = 28;

    if (lineText.length >= recordNameEnd) {
        const currentRecordInLine = lineText.substring(recordNameStart, recordNameEnd).trim();

        // If this line contains the record name, replace it
        if (currentRecordInLine.toUpperCase() === renameInfo.oldName.toUpperCase()) {
            const before = lineText.substring(0, recordNameStart);
            const after = lineText.substring(recordNameEnd);
            const newLine = before + recordNamePadded + after;

            workspaceEdit.replace(uri, line.range, newLine);
        };
    };

    // Apply all edits
    await vscode.workspace.applyEdit(workspaceEdit);
};