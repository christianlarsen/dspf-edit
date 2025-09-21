/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.remove-element.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords, FieldInfo, ConstantInfo } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';

// TYPE DEFINITIONS

/**
 * Union type for elements that can be deleted (fields or constants).
 */
type DeletableElement = FieldInfo | ConstantInfo;

/**
 * Information about lines to be deleted for an element and its attributes.
 */
interface DeletionRange {
    startLine: number;
    endLine: number;
    description: string;
};

/**
 * Complete deletion plan for an element.
 */
interface ElementDeletionPlan {
    element: DeletableElement;
    elementType: 'field' | 'constant';
    ranges: DeletionRange[];
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
 * Registers the remove element command for DDS fields.
 * @param context - The VS Code extension context
 */
export function removeElement(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.remove-element", async (node: DdsNode) => {
            await handleRemoveElementCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the remove element command for an existing DDS field or constant.
 * @param node - The DDS node containing the element to delete
 */
async function handleRemoveElementCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const element = node.ddsElement;

        if (element.kind !== 'constant' && element.kind !== 'field') {
            vscode.window.showWarningMessage(`Element cannot be deleted with this command.`);
            return;
        };

        // Find the element in our model
        const elementInfo = findElementInModel(element.name, element.lineIndex, element.recordname, element.kind);
        if (!elementInfo) {
            vscode.window.showErrorMessage(`Could not find ${element.name} in the model.`);
            return;
        };

        // Create deletion plan
        const deletionPlan = createDeletionPlan(elementInfo, element.kind);

        // Show confirmation dialog with details
        const confirmed = await showDeletionConfirmation(deletionPlan);
        if (!confirmed) {
            return;
        };

        // Execute the deletion
        await executeElementDeletion(editor, deletionPlan);

        vscode.window.showInformationMessage(`${elementInfo.name} deleted successfully.`);

    } catch (error) {
        console.error(`Error deleting element:`, error);
        vscode.window.showErrorMessage(`An error occurred while deleting the element.`);
    };
};

// ELEMENT LOOKUP FUNCTIONS

/**
 * Finds an element in the model by name and line index within a specific record.
 * @param elementName - The name of the element to find
 * @param lineIndex - The line index where the element is located
 * @param recordName - The name of the record containing the element
 * @param elementType - The type of element to search for
 * @returns The element info or null if not found
 */
function findElementInModel(
    elementName: string, 
    lineIndex: number, 
    recordName: string, 
    elementType: 'field' | 'constant'
): DeletableElement | null {
    // Find the specific record
    const record = fieldsPerRecords.find(r => r.record === recordName);
    if (!record) {
        console.warn(`Record ${recordName} not found in model`);
        return null;
    };

    let searchName = elementName;
    let searchArray: DeletableElement[];

    if (elementType === 'constant') {
        // Remove quotes from constantName for comparison
        searchName = elementName.startsWith("'") && elementName.endsWith("'") 
            ? elementName.slice(1, -1) 
            : elementName;
        searchArray = record.constants;
    } else {
        // Fields don't need quote cleaning
        searchArray = record.fields;
    };

    // Search for the element in the appropriate array
    for (const element of searchArray) {
        if (element.name === searchName && element.lineIndex === lineIndex) {
            return element;
        };
    };
    
    console.warn(`${elementType} ${searchName} not found in record ${recordName} at line ${lineIndex}`);
    return null;
};

// DELETION PLANNING FUNCTIONS

/**
 * Creates a comprehensive deletion plan for an element and its attributes.
 * @param elementInfo - The element to be deleted
 * @param elementType - The type of element
 * @returns Complete deletion plan
 */
function createDeletionPlan(elementInfo: DeletableElement, elementType: 'field' | 'constant'): ElementDeletionPlan {
    const ranges: DeletionRange[] = [];

    // Add the main element range
    ranges.push({
        startLine: elementInfo.lineIndex,
        endLine: elementInfo.lastLineIndex,
        description: `${elementType.charAt(0).toUpperCase() + elementType.slice(1)} ${elementInfo.name}`
    });

    // Add ranges for all attributes
    elementInfo.attributes.forEach((attribute, index) => {
        ranges.push({
            startLine: attribute.lineIndex,
            endLine: attribute.lastLineIndex,
            description: `Attribute ${index + 1}: ${attribute.value}`
        });
    });

    // Sort ranges by line number (descending order for safe deletion)
    ranges.sort((a, b) => b.startLine - a.startLine);

    // Calculate total lines to be deleted
    const totalLines = ranges.reduce((total, range) => 
        total + (range.endLine - range.startLine + 1), 0);

    return {
        element: elementInfo,
        elementType: elementType,
        ranges: ranges,
        totalLines: totalLines
    };
};

/**
 * Shows a confirmation dialog with details about what will be deleted.
 * @param deletionPlan - The deletion plan to show
 * @returns True if user confirms deletion, false otherwise
 */
async function showDeletionConfirmation(deletionPlan: ElementDeletionPlan): Promise<boolean> {
    const { element, elementType, ranges, totalLines } = deletionPlan;
    
    let message = `Are you sure you want to delete ${elementType} ${element.name}?`;
    
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
 * Executes the deletion of an element and its attributes.
 * @param editor - The active text editor
 * @param deletionPlan - The plan for what to delete
 */
async function executeElementDeletion(
    editor: vscode.TextEditor, 
    deletionPlan: ElementDeletionPlan
): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Optimize ranges to handle overlapping or adjacent ranges
    const optimizedRanges = optimizeDeletionRanges(deletionPlan.ranges, editor.document);

    // Process each optimized range
    for (const range of optimizedRanges) {
        await addDeletionRange(workspaceEdit, uri, editor, range);
    };

    // Apply all deletions
    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Adds a deletion range to the workspace edit with proper handling of line breaks.
 * @param workspaceEdit - The workspace edit to modify
 * @param uri - The document URI
 * @param editor - The text editor
 * @param range - The range to delete
 */
async function addDeletionRange(
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri,
    editor: vscode.TextEditor,
    range: DeletionRange
): Promise<void> {
    const { startLine, endLine } = range;
    const document = editor.document;
    
    // Validate line indices
    if (startLine < 0 || endLine >= document.lineCount) {
        console.warn(`Invalid line range: ${startLine}-${endLine} for ${range.description}`);
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
 * Optimizes deletion ranges to handle overlapping, adjacent, or end-of-document cases.
 * @param ranges - The original deletion ranges
 * @param document - The text document
 * @returns Optimized deletion ranges
 */
function optimizeDeletionRanges(ranges: DeletionRange[], document: vscode.TextDocument): DeletionRange[] {
    if (ranges.length === 0) return [];

    // Sort ranges by start line (ascending order for merging)
    const sortedRanges = [...ranges].sort((a, b) => a.startLine - b.startLine);
    const optimized: DeletionRange[] = [];
    
    let currentRange = { ...sortedRanges[0] };

    for (let i = 1; i < sortedRanges.length; i++) {
        const nextRange = sortedRanges[i];
        
        // Check if ranges are adjacent or overlapping
        if (nextRange.startLine <= currentRange.endLine + 1) {
            // Merge ranges
            currentRange.endLine = Math.max(currentRange.endLine, nextRange.endLine);
            currentRange.description += ` + ${nextRange.description}`;
        } else {
            // Ranges are separate, add current and start new one
            optimized.push(currentRange);
            currentRange = { ...nextRange };
        };
    };
    
    // Add the last range
    optimized.push(currentRange);

    // Sort back to descending order for safe deletion and mark the last range
    const finalRanges = optimized.sort((a, b) => b.startLine - a.startLine);
    
    // Mark which range contains the actual last lines of the document
    finalRanges.forEach(range => {
        if (range.endLine === document.lineCount - 1) {
            range.description += " (end-of-document)";
        };
    });

    return finalRanges;
};

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
