/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.sort-elements.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords, FieldInfo, ConstantInfo, DdsRecord } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

interface ElementWithAttributes {
    element: FieldInfo | ConstantInfo;
    kind: 'field' | 'constant';
    lineIndex: number;
    lastLineIndex: number;
    attributeLines: number[];
    attributeRanges: Array<{ start: number , end: number}>,
    row: number;
    column: number;
    originalOrder: number;
};

interface SortCriteria {
    sortBy: 'row' | 'column' | 'rowColumn';
    direction: 'asc' | 'desc';
};

// COMMAND REGISTRATION

/**
 * Registers the sort elements command for DDS records.
 * Allows users to sort fields and constants by row/column position.
 * @param context - The VS Code extension context
 */
export function sortElements(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.sort-elements", async (node: DdsNode) => {
            await handleSortElementsCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the sort elements command for a DDS record.
 * Sorts fields and constants by their row/column position while preserving attributes.
 * @param node - The DDS node containing the record
 */
async function handleSortElementsCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate that we're working with a record
        if (node.ddsElement.kind !== 'record') {
            vscode.window.showWarningMessage('Elements can only be sorted within a record.');
            return;
        };

        // Get all elements (fields and constants) for this record
        const elementsWithAttributes = getElementsWithAttributesForRecord(editor, node.ddsElement);

        if (elementsWithAttributes.length === 0) {
            vscode.window.showInformationMessage('No sortable elements found in this record.');
            return;
        };

        // Show current elements summary
        const elementsSummary = elementsWithAttributes.map(e => 
            `${e.element.name}`
        ).join(', ');

        // Get sort criteria from user
        const sortCriteria = await getSortCriteriaFromUser(elementsSummary);
        if (!sortCriteria) return;

        // Sort elements according to criteria
        const sortedElements = sortElementsByCriteria(elementsWithAttributes, sortCriteria);

        // Apply the sort to the document
        await applySortToDocument(editor, sortedElements);
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        const sortDescription = getSortDescription(sortCriteria);
        vscode.window.showInformationMessage(
            `Elements sorted by ${sortDescription} in record ${node.ddsElement.name}.`
        );

    } catch (error) {
        console.error('Error sorting elements:', error);
        vscode.window.showErrorMessage('An error occurred while sorting elements.');
    };
};

// ELEMENT EXTRACTION FUNCTIONS

/**
 * Gets all elements (fields and constants) with their attributes for a specific record.
 * Uses the model's lineIndex/lastLineIndex directly from FieldInfo/ConstantInfo.
 * @param editor - The active text editor
 * @param record - The DDS record
 * @returns Array of elements with their attributes and position info
 */
function getElementsWithAttributesForRecord(editor: vscode.TextEditor, record: DdsRecord): ElementWithAttributes[] {
    const elements: ElementWithAttributes[] = [];
    
    // Find the record in fieldsPerRecords to get its elements
    const recordEntry = fieldsPerRecords.find(r => r.record === record.name);
    if (!recordEntry) {
        return elements;
    };

    // Process fields - now using lineIndex directly from the model
    recordEntry.fields.forEach((field, index) => {
        const elementWithAttrs = createElementWithAttributesFromModel(
            editor, 
            field, 
            'field', 
            index,
            recordEntry.endIndex
        );
        if (elementWithAttrs) {
            elements.push(elementWithAttrs);
        };
    });

    // Process constants - now using lineIndex directly from the model
    recordEntry.constants.forEach((constant, index) => {
        const elementWithAttrs = createElementWithAttributesFromModel(
            editor, 
            constant, 
            'constant', 
            index + recordEntry.fields.length,
            recordEntry.endIndex
        );
        if (elementWithAttrs) {
            elements.push(elementWithAttrs);
        };
    });

    return elements;
};

/**
 * Creates an ElementWithAttributes object using ranges from the model
 * @param editor - The active text editor
 * @param element - The field or constant from the model
 * @param kind - Whether it's a 'field' or 'constant'
 * @param originalOrder - Original order index for stable sorting
 * @param recordEndIndex - End index of the record
 * @returns ElementWithAttributes object or null if not found
 */
function createElementWithAttributesFromModel(
    editor: vscode.TextEditor, 
    element: FieldInfo | ConstantInfo, 
    kind: 'field' | 'constant',
    originalOrder: number,
    recordEndIndex: number
): ElementWithAttributes | null {
    
    // Get range from the model
    const elementLineIndex = element.lineIndex;
    const elementLastLineIndex = element.lastLineIndex ?? element.lineIndex;
    
    // Validate that the line index is within document bounds
    if (elementLineIndex >= editor.document.lineCount || elementLineIndex < 0) {
        return null;
    };

    // Get attribute information from the model
    const { attributeLines, attributeRanges } = extractAttributeRangesFromModel(element, recordEndIndex);

    return {
        element: element,
        kind: kind,
        lineIndex: elementLineIndex,
        lastLineIndex: elementLastLineIndex,
        attributeLines,
        attributeRanges,
        row: element.row,
        column: element.col, // Note: model uses 'col', not 'column'
        originalOrder
    };
};

/**
 * Extracts attribute line indices and ranges from the model data.
 * @param element - The field or constant from the model
 * @param recordEndIndex - End index of the record to validate boundaries
 * @returns Object with attribute lines and ranges
 */
function extractAttributeRangesFromModel(
    element: FieldInfo | ConstantInfo,
    recordEndIndex: number
): { attributeLines: number[]; attributeRanges: Array<{start: number, end: number}> } {
    const attributeLines: number[] = [];
    const attributeRanges: Array<{start: number, end: number}> = [];
    
    // Get attribute ranges from the model
    if (element.attributes && element.attributes.length > 0) {
        element.attributes.forEach(attr => {
            const startLine = attr.lineIndex;
            const endLine = attr.lastLineIndex ?? attr.lineIndex;
            
            // Validate that the attribute range is within record boundaries
            if (startLine <= recordEndIndex && startLine > element.lineIndex) {
                // Add all lines in the range to attributeLines
                for (let line = startLine; line <= endLine; line++) {
                    if (line <= recordEndIndex && !attributeLines.includes(line)) {
                        attributeLines.push(line);
                    };
                };
                
                // Add the range information
                attributeRanges.push({
                    start: startLine,
                    end: endLine
                });
            };
        });
    };
    
    // Sort attribute lines to maintain proper order
    attributeLines.sort((a, b) => a - b);
    attributeRanges.sort((a, b) => a.start - b.start);
    
    return { attributeLines, attributeRanges };
};

// USER INTERACTION FUNCTIONS

/**
 * Gets sort criteria from the user through interactive selection.
 * @param elementsSummary - Summary of current elements for display
 * @returns Sort criteria or null if cancelled
 */
async function getSortCriteriaFromUser(elementsSummary: string): Promise<SortCriteria | null> {
    // First, choose what to sort by
    const sortBy = await vscode.window.showQuickPick(
        [
            { label: 'Row/Column', value: 'rowColumn', description: 'Sort by row first, then by column' },
            { label: 'Row', value: 'row', description: 'Sort by row position only' },
            { label: 'Column', value: 'column', description: 'Sort by column position only' }
        ],
        {
            title: `Elements to sort: ${elementsSummary}`,
            placeHolder: 'Choose sort criteria'
        }
    );

    if (!sortBy) return null;

    // Then, choose sort direction
    const direction = await vscode.window.showQuickPick(
        [
            { label: 'Ascending', value: 'asc', description: 'Sort from lowest to highest' },
            { label: 'Descending', value: 'desc', description: 'Sort from highest to lowest' }
        ],
        {
            title: `Sorting by ${sortBy.label}`,
            placeHolder: 'Choose sort direction'
        }
    );

    if (!direction) return null;

    return {
        sortBy: sortBy.value as 'row' | 'column' | 'rowColumn',
        direction: direction.value as 'asc' | 'desc'
    };
};

/**
 * Gets a human-readable description of the sort criteria.
 * @param criteria - The sort criteria
 * @returns Descriptive string
 */
function getSortDescription(criteria: SortCriteria): string {
    const directionText = criteria.direction === 'asc' ? 'ascending' : 'descending';
    
    switch (criteria.sortBy) {
        case 'row':
            return `row (${directionText})`;
        case 'column':
            return `column (${directionText})`;
        case 'rowColumn':
            return `row then column (${directionText})`;
        default:
            return 'unknown criteria';
    };
};

// SORTING FUNCTIONS

/**
 * Sorts elements according to the specified criteria.
 * Hidden elements (row <= 0 or column <= 0) are always placed first,
 * then visible elements are sorted by the specified criteria.
 * @param elements - Array of elements to sort
 * @param criteria - Sort criteria
 * @returns Sorted array of elements with hidden elements first
 */
function sortElementsByCriteria(elements: ElementWithAttributes[], criteria: SortCriteria): ElementWithAttributes[] {
    // Separate hidden and visible elements
    const hiddenElements = elements.filter(element => element.row <= 0 || element.column <= 0);
    const visibleElements = elements.filter(element => element.row > 0 && element.column > 0);
    
    // Sort hidden elements by their original order (document order)
    hiddenElements.sort((a, b) => a.originalOrder - b.originalOrder);
    
    // Sort visible elements according to criteria
    const sortedVisibleElements = visibleElements.sort((a, b) => {
        let comparison = 0;
        
        switch (criteria.sortBy) {
            case 'row':
                comparison = a.row - b.row;
                break;
            case 'column':
                comparison = a.column - b.column;
                break;
            case 'rowColumn':
                comparison = a.row - b.row;
                if (comparison === 0) {
                    comparison = a.column - b.column;
                };
                break;
        };
        
        // If positions are equal, maintain original order for stability
        if (comparison === 0) {
            comparison = a.originalOrder - b.originalOrder;
        };
        
        // Apply direction
        return criteria.direction === 'desc' ? -comparison : comparison;
    });
    
    // Return hidden elements first, then sorted visible elements
    return [...hiddenElements, ...sortedVisibleElements];
};

// DOCUMENT MODIFICATION FUNCTIONS

/**
 * Applies the sorted order to the document by moving elements and their attributes.
 * Uses complete line ranges for each element.
 * @param editor - The active text editor
 * @param sortedElements - Array of elements in the desired order
 */
async function applySortToDocument(editor: vscode.TextEditor, sortedElements: ElementWithAttributes[]): Promise<void> {
    if (sortedElements.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;

    try {
        // Extract all element blocks (element + its attributes) as text
        const elementBlocks = extractElementBlocks(document, sortedElements);
        
        // Validate that we have content to work with
        if (elementBlocks.length === 0 || elementBlocks.every(block => !block.trim())) {
            throw new Error('No valid element blocks found for sorting');
        };
        
        const allLineIndices = getAllLineIndicesFromElements(sortedElements);
        if (allLineIndices.length === 0) {
            throw new Error('No line indices found for elements');
        };
        
        const minLine = Math.min(...allLineIndices);
        const maxLine = Math.max(...allLineIndices);
        
        // Validate line indices
        if (minLine < 0 || maxLine >= document.lineCount) {
            throw new Error(`Invalid line range: ${minLine}-${maxLine} (document has ${document.lineCount} lines)`);
        };
        
        // Create the sorted content
        const sortedContent = elementBlocks.join('\n');
        
        // Replace the entire range with sorted content
        const startPosition = new vscode.Position(minLine, 0);
        const endPosition = new vscode.Position(maxLine, document.lineAt(maxLine).text.length);
        const rangeToReplace = new vscode.Range(startPosition, endPosition);
        
        workspaceEdit.replace(uri, rangeToReplace, sortedContent);
        
        await vscode.workspace.applyEdit(workspaceEdit);
        
    } catch (error) {
        console.error('Error in applySortToDocument:', error);
        throw error;
    };
};

/**
 * Gets all line indices from elements, considering their complete ranges.
 * @param elements - Array of elements
 * @returns Array of all line indices used by the elements
 */
function getAllLineIndicesFromElements(elements: ElementWithAttributes[]): number[] {
    const allLines: number[] = [];
    
    elements.forEach(element => {
        // Add all lines from the element itself (lineIndex to lastLineIndex)
        for (let line = element.lineIndex; line <= element.lastLineIndex; line++) {
            if (!allLines.includes(line)) {
                allLines.push(line);
            };
        };
        
        // Add all attribute lines
        element.attributeLines.forEach(line => {
            if (!allLines.includes(line)) {
                allLines.push(line);
            }
        });
    });
    
    return allLines.sort((a, b) => a - b);
};

/**
 * Extracts text blocks for elements and their attributes in the sorted order.
 * @param document - The text document
 * @param sortedElements - Elements in the desired sorted order
 * @returns Array of text blocks (each block contains element + attributes)
 */
function extractElementBlocks(document: vscode.TextDocument, sortedElements: ElementWithAttributes[]): string[] {
    return sortedElements.map(element => {
        const lines: string[] = [];
        
        // Add all lines from the main element (lineIndex to lastLineIndex)
        for (let line = element.lineIndex; line <= element.lastLineIndex; line ++) {
            if (line < document.lineCount) {
                lines.push(document.lineAt(line).text);
            };
        };

        // Add all attribute lines from the model data
        // The attributeLines array is already sorted from extractAttributeLinesFromModel
        element.attributeLines.forEach(lineIndex => {
            if (lineIndex < document.lineCount) {
                lines.push(document.lineAt(lineIndex).text);
            }
        });
        
        return lines.join('\n');
    });
};