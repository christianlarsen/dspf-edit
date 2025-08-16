/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.helper.ts
*/


import * as vscode from 'vscode';
import { DdsElement, DdsIndicator, DdsAttribute, records, FieldsPerRecord, ConstantInfo, FieldInfo, fieldsPerRecords } from './dspf-edit.model';
import { DdsTreeProvider } from './dspf-edit.providers';
import { parseDocument } from './dspf-edit.parser';

// FIELD DESCRIPTION FUNCTIONS

/**
 * Describes a DDS field element, returning its size, type, and position information.
 * @param field - The DDS element to describe
 * @returns A formatted string describing the field's properties
 */
export function describeDdsField(field: DdsElement): string {
    if (field.kind !== 'field') return 'Not a field.';

    const length = field.length;
    const decimals = field.decimals;

    // Format size string with decimals if present
    const sizeText = decimals && decimals > 0 ? `(${length}:${decimals})` : `(${length})`;
    const type = field.type;

    if (field.hidden) {
        return `${sizeText}${type} (Hidden)`;
    } else if (field.referenced) {
        const row = field.row?.toString().padStart(2, '0') ?? '--';
        const col = field.column?.toString().padStart(2, '0') ?? '--';
        return `(Referenced) [${col},${row}]`;
    } else {
        const row = field.row?.toString().padStart(2, '0') ?? '--';
        const col = field.column?.toString().padStart(2, '0') ?? '--';
        return `${sizeText}${type} [${col},${row}]`;
    };
};

/**
 * Describes a DDS constant element, returning its position information.
 * @param field - The DDS element to describe (should be a constant)
 * @returns A formatted string with the constant's row and column position
 */
export function describeDdsConstant(field: DdsElement): string {
    if (field.kind !== 'constant') return 'Not a constant.';

    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `[${row},${col}]`;
};

/**
 * Describes a DDS record element.
 * @param field - The DDS element to describe (should be a record)
 * @returns Currently returns an empty string (placeholder for future implementation)
 */
export function describeDdsRecord(field: DdsElement): string {
    if (field.kind !== 'record') return 'Not a record.';
    return '';
};

/**
 * Describes a DDS file element.
 * @param field - The DDS element to describe (should be a file)
 * @returns Currently returns an empty string (placeholder for future implementation)
 */
export function describeDdsFile(field: DdsElement): string {
    if (field.kind !== 'file') return 'Not a file.';
    return '';
};

// FORMATTING FUNCTIONS

/**
 * Formats DDS indicators into a readable string representation.
 * @param indicators - Array of DDS indicators to format
 * @returns A formatted string showing indicators with their active/inactive status
 */
export function formatDdsIndicators(indicators?: DdsIndicator[]): string {
    if (!indicators || indicators.length === 0) return '';

    const indicatorStr = `[${indicators.map(ind => {
        const status = ind.active ? ' ' : 'N';
        const number = ind.number.toString().padStart(2, '0');
        return `${status}${number}`;
    }).join('')}]`;

    return indicatorStr;
};

/**
 * Formats DDS attributes into a readable string representation.
 * @param attributes - Array of DDS attributes to format
 * @returns A comma-separated string of formatted attributes with their indicators
 */
export function formatDdsAttributes(attributes?: DdsAttribute[]): string {
    if (!attributes || attributes.length === 0) return '';

    return attributes.map(attr => {
        const indicators = attr.indicators ? formatDdsIndicators(attr.indicators).trim() : '';
        return (indicators ? indicators + ' ' : '') + attr.value;
    }).join(', ');
};

// DOCUMENT ANALYSIS FUNCTIONS

/**
 * Finds the end line index for a multi-line DDS constant that spans multiple lines.
 * @param document - The VS Code text document
 * @param startLineIndex - The starting line index to search from
 * @returns The index of the last line that belongs to the continued constant
 */
export function findEndLineIndex(document: vscode.TextDocument, startLineIndex: number): number {
    let endLineIndex = startLineIndex;

    for (let i = startLineIndex; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;

        // Check if this is a continued constant line
        // DDS constants that continue have "     A" at the start and "-" at position 79
        const isContinuedConstant =
            line.startsWith("     A") &&
            line.charAt(79) === "-";

        if (isContinuedConstant) {
            endLineIndex = i + 1;
        } else {
            break;
        };
    };

    return endLineIndex;
};

/**
 * Determines if a document is a DDS file based on its extension.
 * @param document - The VS Code text document to check
 * @returns True if the document has a DDS file extension
 */
export function isDdsFile(document: vscode.TextDocument): boolean {
    const ddsExtensions = ['.dspf'];
    return ddsExtensions.some(ext => document.fileName.toLowerCase().endsWith(ext));
};

// UTILITY FUNCTIONS

/**
 * Parses a size string into length and decimal components.
 * @param newSize - Size string in format "length" or "length,decimals"
 * @returns Object containing parsed length and decimals values
 */
export function parseSize(newSize: string): { length: number, decimals: number } {
    const [intPart, decPart] = newSize.split(',');

    const length = parseInt(intPart, 10);
    const decimals = decPart ? parseInt(decPart, 10) : 0;

    return { length, decimals };
};

/**
 * Checks if a record with the given name exists in the records array.
 * @param recordName - The name of the record to check
 * @returns True if the record exists (case-insensitive comparison)
 */
export function recordExists(recordName: string): boolean {
    return records.includes(recordName.toUpperCase());
};

// OVERLAP DETECTION FUNCTIONS

/**
 * Finds overlapping fields and constants within a record.
 * Two elements overlap if they are on the same row and their column ranges intersect.
 * @param record - The record to analyze for overlaps
 * @returns Array of overlap pairs containing the overlapping elements
 */
export function findOverlapsInRecord(record: FieldsPerRecord) {
    const overlaps: { a: FieldInfo | ConstantInfo, b: FieldInfo | ConstantInfo }[] = [];

    // Combine fields and constants into a single array for comparison
    const elements = [
        ...record.fields.map(f => ({ ...f, kind: "field" as const })),
        ...record.constants.map(c => ({ ...c, kind: "constant" as const }))
    ];

    // Compare each pair of elements
    for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
            const e1 = elements[i];
            const e2 = elements[j];

            // Only check elements on the same row
            if (e1.row === e2.row) {
                const e1End = e1.col + e1.length - 1;
                const e2End = e2.col + e2.length - 1;

                // Check if column ranges overlap
                if (e1.col <= e2End && e2.col <= e1End) {
                    overlaps.push({ a: e1, b: e2 });
                };
            };
        };
    };

    return overlaps;
};

// VS CODE INTEGRATION FUNCTIONS

/**
 * Updates the DDS tree provider with parsed elements from the current document.
 * Handles errors gracefully by showing error messages and clearing the tree.
 * @param treeProvider - The DDS tree provider to update
 * @param document - Optional VS Code document to parse (uses active editor if not provided)
 */
export function updateTreeProvider(treeProvider: DdsTreeProvider, document?: vscode.TextDocument) {
    try {
        if (document && isDdsFile(document)) {
            const text = document.getText();
            const elements = parseDocument(text);
            treeProvider.setElements(elements);
        } else {
            treeProvider.setElements([]);
        };
        treeProvider.refresh();
    } catch (error) {
        console.error('Error updating DDS tree:', error);
        vscode.window.showErrorMessage('Error parsing DDS file');
        treeProvider.setElements([]);
        treeProvider.refresh();
    };
};

/**
 * Navigates to a specific line number in the active text editor.
 * Centers the view on the target line and positions the cursor at the beginning.
 * @param lineNumber - The line number to navigate to (1-based)
 */
export function goToLine(lineNumber: number): void {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage('No active editor.');
        return;
    };

    // Convert to 0-based line number for VS Code API
    const position = new vscode.Position(lineNumber - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
};

/**
 * Determines if a line is a DDS attribute line.
 * @param line - The line text to check
 * @returns True if the line contains attribute definitions
 */
export function isAttributeLine(line: string): boolean {
    // If line is a "record", returns false
    if (line.length > 15 && line[15] === 'R') {
        return false;
    };
    // If there is a field, returns false    
    const fieldName = line.substring(18, 27).trim();
    if (fieldName != '') {
        return false;
    };

    // Rest of cases
    // Checks for COLOR, DSPATR, EDTCDE... ???
    const trimmed = line.trim();
    return trimmed.startsWith('A ') && (
        trimmed.includes('COLOR(') ||
        trimmed.includes('DSPATR(') ||
        trimmed.includes('EDTCDE(') ||
        trimmed.includes('EDTWD(') ||
        trimmed.includes('REFFLD(') ||
        trimmed.includes('ERRMSG(') ||
        trimmed.includes('CF') ||
        trimmed.includes('CA') ||
        trimmed.includes('VALUES') ||
        trimmed.includes('SFLRCDNBR') ||
        // Add other attribute patterns as needed
        /[A-Z]+\(/.test(trimmed)
    );
};

/**
 * Creates DDS attribute lines for attribute specifications.
 * @param attributeCode - Attribute code
 * @param attributes - Array of attribute codes
 * @returns Array of formatted DDS lines
 */
export function createAttributeLines(attributeCode: string, attributes: string[]): string[] {
    return attributes.map(attribute => {
        return `     A` + ' '.repeat(38) + `${attributeCode}(${attribute})`;
    });
};

/**
 * Finds the insertion point after a DDS element for adding attributes.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Line index for insertion or -1 if not found
 */
export function findElementInsertionPoint(editor: vscode.TextEditor, element: any): number {
    const elementLineIndex = element.lineIndex;
    
    // Look for the line after the element definition
    // Skip any existing attribute lines
    let insertionPoint = elementLineIndex + 1;
    
    // Skip existing attribute lines (lines that start with "     A" and have attributes)
    while (insertionPoint < editor.document.lineCount) {
        const line = editor.document.lineAt(insertionPoint).text;
        if (line.trim().startsWith('A ') && isAttributeLine(line)) {
            insertionPoint++;
        } else {
            break;
        };
    };
    
    return insertionPoint;
};

/**
 * Gets the record name for a given element.
 * This is a utility function that could be moved to a shared utilities module.
 * @param element - The DDS element
 * @returns The record name or empty string if not found
 */
export function getElementRecordName(element: any): string {
    return element.recordname || '';
};

/**
 * Finds all elements in a record that have an attribute code.
 * This could be useful for reporting or bulk operations.
 * @param recordName - The name of the record
 * @param attributeCode - Attribute code
 * @returns Array of element names that have attributes
 */
export function findElementsWithAttribute(recordName: string, attributeCode: string): string[] {
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) return [];

    const elementsWithAttributes: string[] = [];
    
    [...recordInfo.fields, ...recordInfo.constants].forEach(element => {
        const hasAttribute = element.attributes?.some(attr => 
            {
                const matchStr = `/^${attributeCode}\([A-Z]{3}\)$/`;
                attr.match(matchStr);
            }
        );
        
        if (hasAttribute) {
            elementsWithAttributes.push(element.name);
        };
    });

    return elementsWithAttributes;
};