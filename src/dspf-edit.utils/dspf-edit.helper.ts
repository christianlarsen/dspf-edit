/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.helper.ts
*/


import * as vscode from 'vscode';
import { DdsElement, DdsIndicator, DdsAttribute, records, FieldsPerRecord, ConstantInfo, FieldInfo, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { ExtensionState } from '../dspf-edit.states/state';


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
 * Determines if a line is a DDS attribute line.
 * @param line - The line text to check
 * @returns True if the line contains attribute definitions
 */
export function isAttributeLine(line: string): boolean {
    // If line is a "record", returns false
    if (line.length > 16 && line[16] === 'R') {
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
    const attributes = line.substring(44).trim();

    return trimmed.startsWith('A ') && attributes.length > 0;
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

    // Look for the last line that belongs to the field/constant
    // Skip commented lines
    let insertionPoint = elementLineIndex + 1;
    
    while (insertionPoint < editor.document.lineCount) {
        const line = editor.document.lineAt(insertionPoint).text;

        // Skip commented lines
        if (line.startsWith('     A*')) {
            continue;
        };
        // If the line is a new record, breaks
        if (line.charAt(16) === 'R') {
            break;
        }
        // If the line has a new field, breaks
        if (line.substring(18, 28).trim() !== '') {
            break;
        };
        // If the line has a constant, breaks
        if (line.charAt(40) !== ' ' && line.charAt(43) !== ' ') {
            break;
        };

        insertionPoint++;
    };
    
    return insertionPoint;
};

/**
 * Finds the insertion point after a DDS record for adding attributes (must be the first line after the
 * record declaration)
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Line index for insertion or -1 if not found
 */
export function findElementInsertionPointRecordFirstLine(editor: vscode.TextEditor, element: any): number {
    const elementLineIndex = element.lineIndex;
    
    // Look for the line after the element definition
    // Skip any existing attribute lines
    let insertionPoint = elementLineIndex + 1;
    
    // Skip existing attribute lines (lines that start with "     A" and have attributes)
    while (insertionPoint < editor.document.lineCount) {
        const line = editor.document.lineAt(insertionPoint).text;
        if (line.trim().startsWith('A*')) {
            insertionPoint ++;
            continue;
        };
        if (line.trim().startsWith('A ')) {
            break;
        };
    };
    
    return insertionPoint;
};

/**
 * Finds the insertion point in DDS file for adding attributes at file level
 * @param editor - The active text editor
 * @returns Line index for insertion or -1 if not found
 */
export function findElementInsertionPointFileFirstLine(editor: vscode.TextEditor): number {
    const elementLineIndex = 0;
    
    let insertionPoint = elementLineIndex;
    
    // Skip existing attribute lines (lines that start with "     A" and have attributes)
    while (insertionPoint < editor.document.lineCount) {
        const line = editor.document.lineAt(insertionPoint).text;
        if (line.trim().startsWith('A*')) {
            insertionPoint ++;
            continue;
        };
        if (line.trim().startsWith('A ')) {
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
        const hasAttribute = element.attributes?.some(attrObj => 
            {
                const attr = attrObj.value;
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

// DSPSIZ HELPER FUNCTIONS

/**
 * Available display sizes for DSPSIZ specification.
 */
export interface DisplaySize {
    rows: number;
    cols: number;
    name: string;
    description: string;
};

/**
 * DSPSIZ configuration for file-level specification.
 */
export interface DspsizConfig {
    sizes: DisplaySize[];
    needsDspsiz: boolean;
};

/**
 * Standard display size configurations according to IBM DDS manual.
 */
export const STANDARD_DISPLAY_SIZES: DisplaySize[] = [
    { rows: 24, cols: 80, name: '*DS3', description: 'Standard 24x80 display' },
    { rows: 27, cols: 132, name: '*DS4', description: 'Wide 27x132 display' }
];

/**
 * Checks if DSPSIZ specification is needed in the current document.
 * DSPSIZ is required when there are no existing records or DSPSIZ specifications.
 * @param editor - The active text editor
 * @returns True if DSPSIZ needs to be specified
 */
export async function checkIfDspsizNeeded(editor: vscode.TextEditor): Promise<boolean> {
    const documentText = editor.document.getText();
    
    // Check if DSPSIZ already exists
    const dspsizRegex = /^\s*A\s+.*DSPSIZ\s*\(/im;
    if (dspsizRegex.test(documentText)) {
        return false;
    };

    // Check if there are existing records (R specification)
    const recordRegex = /^\s*A\s+.*R\s+\w+/im;
    return !recordRegex.test(documentText);
};

/**
 * Collects DSPSIZ configuration from user.
 * @returns DSPSIZ configuration or null if cancelled
 */
export async function collectDspsizConfiguration(): Promise<DspsizConfig | null> {
    // Ask user which display sizes to support
    const sizeOptions = STANDARD_DISPLAY_SIZES.map(size => ({
        label: `${size.rows}x${size.cols} (${size.name})`,
        description: size.description,
        picked: size.rows === 24 && size.cols === 80 // Default to standard size
    }));

    const selectedSizes = await vscode.window.showQuickPick(sizeOptions, {
        title: 'DSPSIZ Configuration - Display Sizes',
        placeHolder: 'Select display size(s) to support',
        canPickMany: true,
        ignoreFocusOut: true
    });

    if (!selectedSizes || selectedSizes.length === 0) {
        return null;
    };

    // Map selected options back to DisplaySize objects
    const selectedDisplaySizes: DisplaySize[] = [];
    for (const option of selectedSizes) {
        const size = STANDARD_DISPLAY_SIZES.find(s => 
            option.label.includes(`${s.rows}x${s.cols}`)
        );
        if (size) {
            selectedDisplaySizes.push(size);
        };
    };

    // Sort by standard order (24x80 first, then 27x132)
    selectedDisplaySizes.sort((a, b) => {
        if (a.rows === 24 && a.cols === 80) return -1;
        if (b.rows === 24 && b.cols === 80) return 1;
        return a.rows - b.rows;
    });

    return {
        sizes: selectedDisplaySizes,
        needsDspsiz: true
    };
};

/**
 * Generates DSPSIZ specification lines according to IBM DDS manual.
 * @param dspsizConfig - DSPSIZ configuration
 * @returns Array of formatted DSPSIZ lines
 */
export function generateDspsizLines(dspsizConfig: DspsizConfig): string[] {
    if (!dspsizConfig.needsDspsiz || dspsizConfig.sizes.length === 0) {
        return [];
    };

    const basePrefix = '     A                                      ';
    const sizes = dspsizConfig.sizes;

    if (sizes.length === 1) {
        // Single size specification
        const size = sizes[0];
        return [`${basePrefix}DSPSIZ(${size.rows} ${size.cols} ${size.name})`];
    };

    // Multiple sizes specification
    const lines: string[] = [];
    const maxLineLength = 80;
    
    // Start building the DSPSIZ specification
    let currentLine = `${basePrefix}DSPSIZ(`;
    
    for (let i = 0; i < sizes.length; i++) {
        const size = sizes[i];
        const sizeSpec = `${size.rows} ${size.cols} ${size.name}`;
        const separator = i < sizes.length - 1 ? ' ' : ')';
        const fullSpec = sizeSpec + separator;

        // Check if adding this size would exceed line length
        if (currentLine.length + fullSpec.length > maxLineLength - 1) { // -1 for continuation character
            // Need to continue on next line
            lines.push(currentLine + '-');
            currentLine = `${basePrefix}       ${fullSpec}`;
        } else {
            currentLine += fullSpec;
        };
    };

    // Add the final line
    lines.push(currentLine);

    return lines;
};

/**
 * Inserts DSPSIZ lines at the beginning of the file (before any records).
 * @param editor - The active text editor
 * @param dspsizLines - Array of DSPSIZ lines to insert
 */
export async function insertDspsizLines(editor: vscode.TextEditor, dspsizLines: string[]): Promise<void> {
    if (dspsizLines.length === 0) return;

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    
    // Find the correct insertion point (before first record, after any existing file-level attributes)
    const insertionPoint = findDspsizInsertionPoint(editor);
    
    // Create the complete DSPSIZ text with proper line breaks
    const dspsizText = dspsizLines.join('\n') + '\n';
    
    workspaceEdit.insert(uri, new vscode.Position(insertionPoint, 0), dspsizText);
    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Finds the correct insertion point for DSPSIZ specification.
 * Should be after existing file-level attributes but before the first record.
 * @param editor - The active text editor
 * @returns Line number where DSPSIZ should be inserted
 */
function findDspsizInsertionPoint(editor: vscode.TextEditor): number {
    let insertionPoint = 0;
    let foundFileAttributes = false;

    for (let i = 0; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        const trimmedLine = lineText.trim();

        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('A*')) {
            continue;
        };

        // If this is a record definition (R in position 17), stop here
        if (lineText.length > 16 && lineText[16] === 'R') {
            return insertionPoint;
        };

        // If this is a file-level attribute line (starts with A and has content after position 44)
        if (trimmedLine.startsWith('A ') && lineText.length > 44) {
            foundFileAttributes = true;
            insertionPoint = i + 1;
        } else if (!foundFileAttributes && trimmedLine.startsWith('A ')) {
            // First A line found, but not clearly a file attribute
            insertionPoint = i;
        };
    };

    return insertionPoint;
};

/**
 * Handles the complete DSPSIZ workflow: check if needed, collect configuration, and insert.
 * This is a convenience function that combines all DSPSIZ operations.
 * @param editor - The active text editor
 * @param operationName - Name of the operation for user messages (e.g., "record creation", "key command addition")
 * @returns DSPSIZ configuration that was applied, or null if not needed/cancelled
 */
export async function handleDspsizWorkflow(editor: vscode.TextEditor, operationName: string): Promise<DspsizConfig | null> {
    // Check if DSPSIZ needs to be defined
    const needsDspsiz = await checkIfDspsizNeeded(editor);
    
    if (!needsDspsiz) {
        return null; // DSPSIZ not needed
    };

    // Collect DSPSIZ configuration from user
    const dspsizConfig = await collectDspsizConfiguration();
    if (!dspsizConfig) {
        return null; // User cancelled
    };

    // Generate and insert DSPSIZ lines
    const dspsizLines = generateDspsizLines(dspsizConfig);
    await insertDspsizLines(editor, dspsizLines);

    // Show informational message
    const sizesText = dspsizConfig.sizes.map(s => `${s.rows}x${s.cols}`).join(', ');
    vscode.window.showInformationMessage(
        `DSPSIZ specification added (${sizesText}) for ${operationName}.`
    );

    return dspsizConfig;
};

export function debounceUpdate(treeProvider: DdsTreeProvider, document?: vscode.TextDocument) {
    if (ExtensionState.updateTimeout) {
        clearTimeout(ExtensionState.updateTimeout);
    };
    ExtensionState.updateTimeout = setTimeout(() => {
        updateTreeProvider(treeProvider, document);
    }, 150);
};

export function generateIfDds(
    treeProvider: DdsTreeProvider,
    doc?: vscode.TextDocument,
    editor?: vscode.TextEditor
) {
    if (doc && doc.languageId === 'dds.dspf') {
        ExtensionState.lastDdsDocument = doc;
        ExtensionState.lastDdsEditor = editor;
        debounceUpdate(treeProvider, doc);
    } else if (ExtensionState.lastDdsDocument) {
        debounceUpdate(treeProvider, ExtensionState.lastDdsDocument);
    };
};

/**
 * Retrieves the current DDS editor and its associated document from extension state.
 * Validates that both are available before proceeding.
 * @returns An object containing the active DDS editor and document, or undefined if not found.
 */
export function checkForEditorAndDocument() : { editor : vscode.TextEditor | undefined, document :vscode.TextDocument | undefined } {

    const editor = ExtensionState.lastDdsEditor;
    const document = editor?.document ?? ExtensionState.lastDdsDocument;
    if (!document || !editor) {
        vscode.window.showErrorMessage('No DDS editor found.');
        return { editor: undefined, document: undefined};
    };

    return { editor, document };
};

/**
 * Parses indicators from a DDS line at positions 7-9, 10-12, 13-15.
 * @param lineText - The DDS line text
 * @returns Array of indicator codes found
 */
export function parseIndicatorsFromLine(lineText: string): string[] {
    const indicators: string[] = [];

    // Check positions 7-9, 10-12, 13-15 (0-based: 6-8, 9-11, 12-14)
    const positions = [6, 9, 12];

    for (const pos of positions) {
        if (lineText.length > pos + 2) {
            const indicator = lineText.substring(pos, pos + 3).trim();
            if (indicator && /^N?[0-9]{1,2}$/.test(indicator)) {
                indicators.push(indicator);
            };
        };
    };

    return indicators;
};

/**
 * Groups consecutive line numbers together for more efficient batch deletion.
 * @param lines - Array of line indices (should be sorted)
 * @returns Array of arrays, where each sub-array contains consecutive line numbers
 */
export function groupConsecutiveLines(lines: number[]): number[][] {
    if (lines.length === 0) return [];
    
    // Ensure lines are sorted
    const sortedLines = [...lines].sort((a, b) => a - b);
    const groups: number[][] = [];
    let currentGroup: number[] = [sortedLines[0]];
    
    for (let i = 1; i < sortedLines.length; i++) {
        const currentLine = sortedLines[i];
        const previousLine = sortedLines[i - 1];
        
        if (currentLine === previousLine + 1) {
            // Consecutive line - add to current group
            currentGroup.push(currentLine);
        } else {
            // Non-consecutive line - start new group
            groups.push(currentGroup);
            currentGroup = [currentLine];
        };
    };
    
    // Don't forget the last group
    groups.push(currentGroup);
    
    return groups;
};
