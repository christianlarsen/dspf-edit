/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.remove-attribute.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';

// TYPE DEFINITIONS

/**
 * Information about lines to be deleted for an element and its attributes.
 */
interface DeletionRange {
    startLine: number;
    endLine: number;
    startLineWithField: boolean
};

/**
 * Complete deletion plan for an element.
 */
interface ElementDeletionPlan {
    range: DeletionRange;
    totalLines: number;
};

/**
 * Boundaries information for calculating deletion offsets.
 */
interface DeletionBoundaries {
    startLine: number;
    endLine: number;
    isLastInDocument: boolean;
};

// COMMAND REGISTRATION FUNCTIONS

/**
 * Registers the remove attribute command for DDS fields.
 * @param context - The VS Code extension context
 */
export function removeAttribute(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.remove-attribute", async (node: DdsNode) => {
            await handleRemoveAttributeCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the remove attribute command for an existing DDS field or constant.
 * @param node - The DDS node containing the attribute to delete
 */
async function handleRemoveAttributeCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const element = node.ddsElement;

        // Validate that the element is a deletable attribute type
        if (element.kind !== 'constantAttribute' && element.kind !== 'fieldAttribute') {
            vscode.window.showWarningMessage(`Attribute cannot be deleted with this command.`);
            return;
        };

        // Get the line range for the attribute
        const startLine = element.lineIndex;
        const endLine = element.lastLineIndex;

        // Find the parent field or constant information
        const parentInfo = findAttributeParentFromFieldsPerRecords(startLine);

        if (!parentInfo.parentName || !parentInfo.recordName) {
            vscode.window.showWarningMessage(`Could not determine parent field/constant or record for this attribute.`);
            return;
        };
        
        // Check if the start line contains a field definition
        let startLineWithField = false;
        if (parentInfo.parentType === 'field' && parentInfo.parentDetails.lineIndex === startLine) {
            startLineWithField = true;
        };

        // Create deletion plan
        const deletionPlan : ElementDeletionPlan = {
            range: {
                startLine,
                endLine,
                startLineWithField
            },
            totalLines: (endLine - startLine + 1)
        };

        // Show confirmation dialog with details
        const confirmed = await showDeletionConfirmation();
        if (!confirmed) {
            return;
        };

        // Execute the deletion
        await executeElementDeletion(editor, deletionPlan);

        vscode.window.showInformationMessage(`Attribute deleted successfully.`);

    } catch (error) {
        console.error(`Error deleting attribute:`, error);
        vscode.window.showErrorMessage(`An error occurred while deleting the attribute.`);
    };
};

/**
 * Shows a confirmation dialog asking the user to confirm attribute deletion.
 * @returns Promise that resolves to true if user confirms deletion, false otherwise
 */
async function showDeletionConfirmation(): Promise<boolean> {
    
    let message = `Are you sure you want to delete attribute?`;
    
    // Show confirmation dialog
    const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        "Delete",
        "Cancel"
    );

    return choice === "Delete";
};

// DELETION EXECUTION FUNCTIONS

/**
 * Executes the deletion of an element and its attributes by applying workspace edits.
 * Handles special case where the first line contains a field definition that should be preserved.
 * @param editor - The active text editor
 * @param deletionPlan - The plan containing details about what lines to delete
 */
async function executeElementDeletion(
    editor: vscode.TextEditor, 
    deletionPlan: ElementDeletionPlan
): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Handle special case: first line has a field definition
    if (deletionPlan.range.startLineWithField) {
        // Remove only the "attributes" part of the line (columns 45-80)
        let line = editor.document.lineAt(deletionPlan.range.startLine);
        let lineText = line.text;
        let before = lineText.substring(0,44); // Keep field definition part
        let after = lineText.length > 80 ? lineText.substring(80) : ""; // Keep any text after position 80
        let middle = " ".repeat(80 - 44); // Clear the attributes section with spaces
        let newLine = before + middle + after;
        
        // Replace the entire line in the document
        workspaceEdit.replace(
            uri,
            line.range,
            newLine
        );
        await vscode.workspace.applyEdit(workspaceEdit);
        
        // If there are additional lines to delete, update the plan to start from next line
        if (deletionPlan.range.endLine > deletionPlan.range.startLine) {
            deletionPlan.range.startLine ++;
            
            // Process remaining lines in the range
            await addDeletionRange(workspaceEdit, uri, editor, deletionPlan.range);
            // Apply all deletions
            await vscode.workspace.applyEdit(workspaceEdit);

        } else {
            // Only one line to process, and we've already handled it
            return;
        };
    } else {
        // Standard case: delete entire lines
        // Process range
        await addDeletionRange(workspaceEdit, uri, editor, deletionPlan.range);
        // Apply all deletions
        await vscode.workspace.applyEdit(workspaceEdit);
    };
};

/**
 * Adds a deletion range to the workspace edit with proper handling of line breaks and edge cases.
 * Calculates precise character offsets to ensure proper deletion without leaving orphaned line breaks.
 * @param workspaceEdit - The workspace edit to modify
 * @param uri - The document URI
 * @param editor - The text editor containing the document
 * @param range - The range of lines to delete
 */
async function addDeletionRange(
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri,
    editor: vscode.TextEditor,
    range: DeletionRange
): Promise<void> {
    const { startLine, endLine } = range;
    const document = editor.document;
    
    // Validate line indices to prevent out-of-bounds errors
    if (startLine < 0 || endLine >= document.lineCount) {
        console.warn(`Invalid line range: ${startLine}-${endLine} for attribute`);
        return;
    };

    // Calculate precise deletion offsets to handle edge cases
    const { startOffset, endOffset } = calculateDeletionOffsets(document, {
        startLine,
        endLine,
        isLastInDocument: endLine === document.lineCount - 1
    });

    // Convert offsets back to positions for the deletion range
    const deleteRange = new vscode.Range(
        document.positionAt(startOffset),
        document.positionAt(endOffset)
    );

    workspaceEdit.delete(uri, deleteRange);
};

// UTILITY FUNCTIONS

/**
 * Calculates the precise character offsets for deletion to handle edge cases properly.
 * @param document - The text document
 * @param boundaries - The deletion boundaries
 * @returns Start and end offsets for deletion
 */
function calculateDeletionOffsets(
    document: vscode.TextDocument, 
    boundaries: DeletionBoundaries
): { startOffset: number, endOffset: number } {
    const docText = document.getText();
    const docLength = docText.length;
    const { startLine, endLine, isLastInDocument } = boundaries;

    let startOffset: number;
    let endOffset: number;

    if (isLastInDocument && endLine === document.lineCount - 1) {
        // Deleting the last lines in the file
        if (startLine === 0) {
            // Only lines in file - delete everything
            startOffset = 0;
            endOffset = docLength;
        } else {
            // Delete from end of previous line to end of file
            const prevLineEndPos = document.lineAt(startLine - 1).range.end;
            startOffset = document.offsetAt(prevLineEndPos);
            endOffset = docLength;
        };
    } else {
        // Deleting lines in the middle or at the beginning
        startOffset = document.offsetAt(new vscode.Position(startLine, 0));
        
        // Include the line break after the last line of the range
        if (endLine < document.lineCount - 1) {
            const afterRangePos = document.lineAt(endLine).rangeIncludingLineBreak.end;
            endOffset = document.offsetAt(afterRangePos);
        } else {
            // Last line in document (but not the only lines - shouldn't happen in this case)
            const lastLineEndPos = document.lineAt(endLine).range.end;
            endOffset = document.offsetAt(lastLineEndPos);
        };
    };

    return { startOffset, endOffset };
};

/**
 * Searches the fieldsPerRecords structure to find parent information for a given attribute.
 * Determines whether the attribute belongs to a field or constant and provides parent details.
 * @param attributeLineIndex - The line number where the attribute is located
 * @returns Object containing record name, parent type, parent name, and parent details
 */
function findAttributeParentFromFieldsPerRecords(attributeLineIndex: number): {
    recordName: string | null;
    parentType: 'field' | 'constant' | null;
    parentName: string | null;
    parentDetails: any;
} {
    // Iterate through all records in the fieldsPerRecords structure
    for (const recordEntry of fieldsPerRecords) {
        // Search within fields of the current record
        for (const field of recordEntry.fields) {
            // Check if the attribute is within the field's line range
            const fieldEndLine = field.lastLineIndex || field.lineIndex;
            if (attributeLineIndex > field.lineIndex && attributeLineIndex <= fieldEndLine) {
                return {
                    recordName: recordEntry.record,
                    parentType: 'field',
                    parentName: field.name,
                    parentDetails: field
                };
            };
            
            // Check if the attribute belongs to this field based on field's attributes
            for (const attr of field.attributes || []) {
                if (attr.lineIndex <= attributeLineIndex && 
                    (attr.lastLineIndex || attr.lineIndex) >= attributeLineIndex) {
                    return {
                        recordName: recordEntry.record,
                        parentType: 'field',
                        parentName: field.name,
                        parentDetails: field
                    };
                };
            };
        };
        
        // Search within constants of the current record
        for (const constant of recordEntry.constants) {
            // Check if the attribute is within the constant's line range
            const constantEndLine = constant.lastLineIndex || constant.lineIndex;
            if (attributeLineIndex > constant.lineIndex && attributeLineIndex <= constantEndLine) {
                return {
                    recordName: recordEntry.record,
                    parentType: 'constant',
                    parentName: constant.name,
                    parentDetails: constant
                };
            };
            
            // Check if the attribute belongs to this constant based on constant's attributes
            for (const attr of constant.attributes || []) {
                if (attr.lineIndex <= attributeLineIndex && 
                    (attr.lastLineIndex || attr.lineIndex) >= attributeLineIndex) {
                    return {
                        recordName: recordEntry.record,
                        parentType: 'constant',
                        parentName: constant.name,
                        parentDetails: constant
                    };
                };
            };
        };
    };
    
    // Return null values if no parent is found
    return {
        recordName: null,
        parentType: null,
        parentName: null,
        parentDetails: null
    };
};
