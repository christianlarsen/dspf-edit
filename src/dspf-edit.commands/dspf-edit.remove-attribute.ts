/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.remove-attribute.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { checkForEditorAndDocument, removeKeywordTextFromLines } from '../dspf-edit.utils/dspf-edit.helper';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';

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

        // Check if the start line contains a field definition — its columns 1-44 must survive even
        // if this attribute turns out to be the only thing in its keyword area.
        const startLineWithField = parentInfo.parentType === 'field' && parentInfo.parentDetails.lineIndex === startLine;

        const confirmed = await showDeletionConfirmation();
        if (!confirmed) {
            return;
        };

        // DDS allows several keywords to share one physical line (e.g. "EDTCDE(3) DSPATR(HI)
        // COLOR(RED)"), and a keyword's own text can itself continue onto the next line via a
        // trailing hyphen — removeKeywordTextFromLines reconstructs the joined keyword text across
        // the attribute's own line range, removes just this attribute's text, and re-paginates
        // whatever remains, rather than deleting whole lines that might hold sibling keywords too.
        if (!(await removeKeywordTextFromLines(editor, startLine, endLine, element.value, startLineWithField))) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

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
