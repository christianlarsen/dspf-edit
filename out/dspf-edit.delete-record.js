"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.delete-record.ts
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
exports.deleteRecord = deleteRecord;
const vscode = __importStar(require("vscode"));
// COMMAND REGISTRATION
/**
 * Registers the delete record command for DDS records.
 * Allows users to safely delete entire DDS records including all associated fields and constants.
 * @param context - The VS Code extension context
 */
function deleteRecord(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.delete-record", async (node) => {
        await handleDeleteRecordCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the delete record command for a DDS record.
 * Validates the element, prompts user for confirmation, and performs the deletion.
 * @param node - The DDS node containing the record to delete
 */
async function handleDeleteRecordCommand(node) {
    try {
        const element = node.ddsElement;
        // Validate element type
        if (element.kind !== "record") {
            vscode.window.showWarningMessage("Only records can be deleted.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
        }
        ;
        // Get record boundaries
        const recordBoundaries = findRecordBoundaries(editor, element);
        if (!recordBoundaries) {
            vscode.window.showErrorMessage("Could not determine record boundaries.");
            return;
        }
        ;
        // Show detailed confirmation dialog
        const recordInfo = getRecordDeletionInfo(editor, recordBoundaries);
        const confirmed = await showDeleteConfirmation(element.name, recordInfo);
        if (!confirmed) {
            return;
        }
        ;
        // Perform the deletion
        await deleteRecordLines(editor, recordBoundaries);
        vscode.window.showInformationMessage(`Record '${element.name}' has been successfully deleted.`);
    }
    catch (error) {
        console.error('Error deleting record:', error);
        vscode.window.showErrorMessage('An error occurred while deleting the record.');
    }
    ;
}
;
;
/**
 * Finds the start and end boundaries of a DDS record.
 * @param editor - The active text editor
 * @param element - The record element to find boundaries for
 * @returns Record boundaries or null if not found
 */
function findRecordBoundaries(editor, element) {
    const document = editor.document;
    const startLine = element.lineIndex;
    if (startLine < 0 || startLine >= document.lineCount) {
        return null;
    }
    ;
    let endLine = startLine;
    let isLastRecord = true;
    // Find the end of the current record by looking for the next record or end of file
    for (let i = startLine + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        // Check if we found the start of a new record
        if (isNewRecordLine(line)) {
            endLine = i - 1;
            isLastRecord = false;
            break;
        }
        ;
        endLine = i;
    }
    ;
    return {
        startLine,
        endLine,
        isLastRecord
    };
}
;
/**
 * Determines if a line represents the start of a new DDS record.
 * @param line - The line text to check
 * @returns True if the line starts a new record
 */
function isNewRecordLine(line) {
    // DDS record format: positions 1-5 are spaces, position 6 is 'A', position 17 is 'R'
    return line.startsWith("     A") && line.length > 16 && line.charAt(16) === "R";
}
;
;
/**
 * Gathers information about the record being deleted for user confirmation.
 * @param editor - The active text editor
 * @param boundaries - The record boundaries
 * @returns Information about the deletion
 */
function getRecordDeletionInfo(editor, boundaries) {
    const document = editor.document;
    const lineCount = boundaries.endLine - boundaries.startLine + 1;
    let hasFields = false;
    let hasConstants = false;
    let preview = "";
    // Analyze the record content
    for (let i = boundaries.startLine; i <= boundaries.endLine && i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        // Check for fields and constants
        if (i > boundaries.startLine) { // Skip the record definition line
            if (line.startsWith("     A") && line.length > 16) {
                const type = line.charAt(16);
                if (type === " " || type === "I" || type === "O" || type === "B") {
                    hasFields = true;
                }
                else if (line.includes("'")) {
                    hasConstants = true;
                }
                ;
            }
            ;
        }
        ;
        // Build preview (first few lines)
        if (preview.length < 200) {
            const trimmedLine = line.length > 50 ? line.substring(0, 47) + "..." : line;
            preview += (preview ? "\n" : "") + trimmedLine;
        }
        ;
    }
    ;
    return {
        lineCount,
        hasFields,
        hasConstants,
        preview
    };
}
;
/**
 * Shows a detailed confirmation dialog for record deletion.
 * @param recordName - The name of the record being deleted
 * @param info - Information about the record
 * @returns True if user confirmed the deletion
 */
async function showDeleteConfirmation(recordName, info) {
    const elements = [];
    if (info.hasFields)
        elements.push("fields");
    if (info.hasConstants)
        elements.push("constants");
    const elementsText = elements.length > 0 ? ` and all its ${elements.join(" and ")}` : "";
    const linesText = info.lineCount === 1 ? "1 line" : `${info.lineCount} lines`;
    const message = `Delete record '${recordName}'${elementsText}?\n\nThis will remove ${linesText} from the file.`;
    const result = await vscode.window.showWarningMessage(message, {
        modal: true,
        detail: info.preview ? `Preview:\n${info.preview}` : undefined
    }, "Delete Record", "Cancel");
    return result === "Delete Record";
}
;
// DELETION FUNCTIONS
/**
 * Deletes the specified record lines from the document.
 * @param editor - The active text editor
 * @param boundaries - The record boundaries to delete
 */
async function deleteRecordLines(editor, boundaries) {
    const document = editor.document;
    const { startOffset, endOffset } = calculateDeletionOffsets(document, boundaries);
    // Validate offsets
    if (startOffset >= endOffset || startOffset < 0 || endOffset > document.getText().length) {
        throw new Error('Invalid deletion range calculated');
    }
    ;
    // Create and apply the workspace edit
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;
    const startPos = document.positionAt(startOffset);
    const endPos = document.positionAt(endOffset);
    workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Calculates the precise character offsets for deletion to handle edge cases properly.
 * @param document - The text document
 * @param boundaries - The record boundaries
 * @returns Start and end offsets for deletion
 */
function calculateDeletionOffsets(document, boundaries) {
    const docText = document.getText();
    const docLength = docText.length;
    const { startLine, endLine, isLastRecord } = boundaries;
    let startOffset;
    let endOffset;
    if (isLastRecord && endLine === document.lineCount - 1) {
        // Deleting the last record in the file
        if (startLine === 0) {
            // Only record in file - delete everything
            startOffset = 0;
            endOffset = docLength;
        }
        else {
            // Delete from end of previous line to end of file
            const prevLineEndPos = document.lineAt(startLine - 1).range.end;
            startOffset = document.offsetAt(prevLineEndPos);
            endOffset = docLength;
        }
        ;
    }
    else {
        // Deleting a record in the middle or at the beginning
        startOffset = document.offsetAt(new vscode.Position(startLine, 0));
        // Include the line break after the last line of the record
        if (endLine < document.lineCount - 1) {
            const afterRecordPos = document.lineAt(endLine).rangeIncludingLineBreak.end;
            endOffset = document.offsetAt(afterRecordPos);
        }
        else {
            // Last line in document (but not last record - shouldn't happen)
            const lastLineEndPos = document.lineAt(endLine).range.end;
            endOffset = document.offsetAt(lastLineEndPos);
        }
        ;
    }
    ;
    return { startOffset, endOffset };
}
;
//# sourceMappingURL=dspf-edit.delete-record.js.map