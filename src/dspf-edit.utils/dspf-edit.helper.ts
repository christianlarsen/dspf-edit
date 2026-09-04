/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.helper.ts
*/


import * as vscode from 'vscode';
import * as fs from 'fs';
import { DdsElement, DdsIndicator, DdsAttribute, records, FieldsPerRecord, ConstantInfo, FieldInfo, fieldsPerRecords, attributesFileLevel, groupIndicatorsByCondition } from '../dspf-edit.model/dspf-edit.model';
import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { parseDocument, pickForActiveFormat } from '../dspf-edit.parser/dspf-edit.parser';
import { ExtensionState } from '../dspf-edit.states/state';
import { getResolvedRef } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';


// FIELD DESCRIPTION FUNCTIONS

/**
 * Describes a DDS field element, returning its size, type, and position information.
 * @param field - The DDS element to describe
 * @returns A formatted string describing the field's properties
 */
function formatFieldSize(length?: number, decimals?: number): string {
    return decimals && decimals > 0 ? `(${length}:${decimals})` : `(${length})`;
};

export function describeDdsField(field: DdsElement): string {
    if (field.kind !== 'field') return 'Not a field.';

    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';

    if (field.hidden) {
        return `${formatFieldSize(field.length, field.decimals)}${field.type} (Hidden)`;
    };

    if (field.referenced) {
        const documentUri = ExtensionState.lastDdsDocument?.uri.toString();
        const resolved = documentUri ? getResolvedRef(documentUri, field.recordname, field.name) : undefined;

        if (resolved) {
            return `${formatFieldSize(resolved.length, resolved.decimals)}${resolved.type} [${col},${row}] (Ref)`;
        };
        return `⏳ Referenced, pending [${col},${row}]`;
    };

    return `${formatFieldSize(field.length, field.decimals)}${field.type} [${col},${row}]`;
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
 * Formats DDS indicators into a readable string representation. Indicators sharing the same
 * `group` (ANDed together, e.g. via an 'A'-continuation line) are shown side by side; different
 * groups (ORed, started by an 'O'-continuation line) are separated by " OR ". Indicators with no
 * `group` (the common case) are all treated as a single group, so this is identical to before for
 * every non-continued element.
 * @param indicators - Array of DDS indicators to format
 * @returns A formatted string showing indicators with their active/inactive status
 */
export function formatDdsIndicators(indicators?: DdsIndicator[]): string {
    if (!indicators || indicators.length === 0) return '';

    const formatGroup = (group: DdsIndicator[]) => group.map(ind => {
        const status = ind.active ? ' ' : 'N';
        const number = ind.number.toString().padStart(2, '0');
        return `${status}${number}`;
    }).join('');

    const indicatorStr = `[${groupIndicatorsByCondition(indicators).map(formatGroup).join(' OR ')}]`;

    return indicatorStr;
};

/**
 * Spells out a full indicator condition as a human-readable boolean expression, e.g.
 * "51 AND NOT 61 AND 53  OR  52  OR  81 AND 82" — the same AND/OR structure formatDdsIndicators
 * encodes compactly, for use in tooltips.
 * @param indicators - Array of DDS indicators to describe
 * @returns A human-readable condition string, or '' when unconditioned
 */
export function formatIndicatorCondition(indicators?: DdsIndicator[]): string {
    if (!indicators || indicators.length === 0) return '';

    const describeIndicator = (ind: DdsIndicator) => `${ind.active ? '' : 'NOT '}${ind.number.toString().padStart(2, '0')}`;
    const describeGroup = (group: DdsIndicator[]) => group.map(describeIndicator).join(' AND ');

    return groupIndicatorsByCondition(indicators).map(describeGroup).join('  OR  ');
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
    if (fieldName !== '') {
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

        // Skip commented lines (column 7 = '*', regardless of column 6 being 'A' or blank)
        if (line.length > 6 && line.charAt(6) === '*') {
            insertionPoint++;
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
        if (line.length > 6 && line.charAt(6) === '*') {
            insertionPoint ++;
            continue;
        };
        if (line.trim().startsWith('A ')) {
            break;
        };
        insertionPoint++;
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
        if (line.length > 6 && line.charAt(6) === '*') {
            insertionPoint ++;
            continue;
        };
        if (line.trim().startsWith('A ')) {
            break;
        };
        insertionPoint++;
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
 * @param existingSizes - Sizes the file already declares, when adding to an existing DSPSIZ (e.g.
 * the "Add Display Size" command) rather than declaring one from scratch — pre-checked in the
 * picker so the user adds to them instead of starting over. Empty (the default) for the from-scratch
 * case, which pre-checks the standard 24x80 size instead.
 * @returns DSPSIZ configuration or null if cancelled
 */
export async function collectDspsizConfiguration(existingSizes: DisplaySize[] = []): Promise<DspsizConfig | null> {
    // Ask user which display sizes to support
    const existingNames = new Set(existingSizes.map(s => s.name));
    const sizeOptions = STANDARD_DISPLAY_SIZES.map(size => ({
        label: `${size.rows}x${size.cols} (${size.name})`,
        description: size.description,
        picked: existingSizes.length > 0
            ? existingNames.has(size.name)
            : (size.rows === 24 && size.cols === 80) // Default to standard size, from scratch
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
export async function insertDspsizLines(editor: vscode.TextEditor, dspsizLines: string[]): Promise<boolean> {
    if (dspsizLines.length === 0) return true;

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Find the correct insertion point (before first record, after any existing file-level attributes)
    const insertionPoint = findDspsizInsertionPoint(editor);

    // Create the complete DSPSIZ text with proper line breaks
    const dspsizText = dspsizLines.join('\n') + '\n';

    workspaceEdit.insert(uri, new vscode.Position(insertionPoint, 0), dspsizText);
    return applyWorkspaceEdit(workspaceEdit, 'add the DSPSIZ specification');
};

/**
 * Updates the file's DSPSIZ specification to declare the given complete set of sizes — used by the
 * "Add Display Size" command, as opposed to `insertDspsizLines`, which only covers declaring DSPSIZ
 * from scratch when the file has none yet. When an existing DSPSIZ attribute is found (via
 * `attributesFileLevel`, already parsed), its line range — including any wrapped continuation lines
 * — is replaced wholesale with the freshly generated lines; otherwise falls back to inserting a new
 * DSPSIZ specification, same as the from-scratch case.
 * @param editor - The active text editor
 * @param sizes - The complete set of sizes the file should declare afterward (existing + newly added)
 */
export async function updateDspsizLines(editor: vscode.TextEditor, sizes: DisplaySize[]): Promise<boolean> {
    const dspsizLines = generateDspsizLines({ sizes, needsDspsiz: true });
    if (dspsizLines.length === 0) {
        return true;
    };

    const existingAttr = attributesFileLevel.find(attr => attr.value.toUpperCase().includes('DSPSIZ('));
    if (!existingAttr) {
        return insertDspsizLines(editor, dspsizLines);
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const lastLineIndex = existingAttr.lastLineIndex ?? existingAttr.lineIndex;
    const range = new vscode.Range(
        existingAttr.lineIndex, 0,
        lastLineIndex, editor.document.lineAt(lastLineIndex).text.length
    );
    workspaceEdit.replace(uri, range, dspsizLines.join('\n'));
    return applyWorkspaceEdit(workspaceEdit, 'update the DSPSIZ specification');
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

        // Skip empty lines and comments (column 7 = '*', regardless of column 6 being 'A' or blank)
        if (!trimmedLine || (lineText.length > 6 && lineText.charAt(6) === '*')) {
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
 * Asks which declared display format (e.g. *DS3/*DS4) an operation should use, for a command with
 * no display format of its own to go by (i.e. invoked from the tree rather than the preview panel,
 * which always has one active). Only meant to be called once the caller has already confirmed the
 * file declares more than one format — with just one, there's nothing to ask.
 * @param declaredFormats - The file's declared DSPSIZ formats (from `getAvailableDisplayFormats`)
 */
export async function pickDisplayFormat(declaredFormats: Array<{ name: string; rows: number; cols: number }>): Promise<string | undefined> {
    const picked = await vscode.window.showQuickPick(
        declaredFormats.map(f => ({ label: f.name, description: `${f.rows}x${f.cols}` })),
        { placeHolder: 'This file declares more than one display size — which one should this use?' }
    );
    return picked?.label;
};

/**
 * Stamps (or clears) a display-format condition (e.g. "*DS3") onto a DDS line, in the same 9-character
 * zone (columns 8-16, 0-based 7-15) that normally holds indicators — see `parseDisplayFormatCondition`
 * in the parser for the read side of this convention, and `setIndicatorsOnLine` in
 * dspf-edit.add-indicators.ts for the equivalent indicator-writing convention this mirrors. Per the DDS
 * reference ("Condition for display files"), the format name itself must start in column 9, not 8 —
 * column 8 (0-based index 7) is reserved for an optional 'N' (NOT) prefix, which this writer never
 * produces, so it's always left blank.
 * @param lineText - The line to stamp (must already have its keyword text in place)
 * @param formatName - Display format name (e.g. "*DS3") to condition the line on, or undefined to
 * leave the line unconditioned (returned unchanged)
 */
export function writeDisplayFormatCondition(lineText: string, formatName?: string): string {
    if (!formatName) {
        return lineText;
    };

    const line = lineText.padEnd(80, ' ');
    const formatZone = ' ' + formatName.padEnd(8, ' ').substring(0, 8);
    return (line.substring(0, 7) + formatZone + line.substring(16)).trimEnd();
};

/**
 * A single existing line of a keyword that can be conditioned per DSPSIZ display format (WINDOW,
 * WDWTITLE, SFLPAG, SFLSIZ, ...) — the minimal shape `applyDisplayFormatSplitEdit` needs to pick the
 * right candidate and locate it in the document.
 */
export interface DisplayFormatConditionable {
    lineIndex: number;
    displayFormat?: string;
};

/**
 * Applies the "split on edit" rule to a workspace edit for a keyword that may be conditioned per
 * display format, so that editing it while previewing one format never silently changes another.
 *
 * Rule: resolve which existing line is actually in effect for `activeFormat` the same way the
 * preview already resolves it for reading (`pickForActiveFormat`: a line explicitly conditioned for
 * it, else the shared unconditioned line, else the first candidate). If there's already more than
 * one candidate line for this keyword (the file declares at most one format, or this keyword was
 * already split before), just rewrite the effective one in place with the new value — already
 * correctly scoped, no change in behavior. Otherwise (exactly one shared line, and the file declares
 * more than one format), every other declared format currently falling back to that same line gets
 * its own new line inserted right after, preserving the line's OLD value; the original line is then
 * rewritten in place with the NEW value — so afterward every declared format has its own line and
 * none are left relying on a fallback that just changed under them.
 *
 * Per the DDS reference (see `writeDisplayFormatCondition`), only the *non-primary* (secondary)
 * display size may ever carry an explicit condition — conditioning a line on the primary size's own
 * name is a compile error, so the primary format's line (`declaredFormats[0]`) is always written
 * unconditioned instead, standing in as the default/fallback line the secondary's condition overrides.
 * @param workspaceEdit - Edit to add the replace/insert operations to
 * @param document - The document being edited (for reading each candidate line's current text/range)
 * @param candidates - This keyword's existing lines on the record, in source order
 * @param activeFormat - Display format (e.g. "*DS3") currently being previewed/edited, or undefined
 * @param declaredFormats - Every display format the file declares (from `getAvailableDisplayFormats`),
 * primary first — DDS allows at most one primary and one secondary size.
 * @param generateLine - Produces the full line text to write, given the resolved line's current text
 * and the format it should end up conditioned on (undefined for the rewritten/active line only when
 * no split occurs). Called once per line written (1 rewrite, plus 1 insert per other format on split).
 */
export function applyDisplayFormatSplitEdit<T extends DisplayFormatConditionable>(
    workspaceEdit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    candidates: T[],
    activeFormat: string | undefined,
    declaredFormats: string[],
    generateLine: (existingLineText: string, format?: string) => string
): void {
    if (candidates.length === 0) {
        return;
    };

    const effective = pickForActiveFormat(candidates, activeFormat);
    if (!effective) {
        return;
    };

    const uri = document.uri;
    const effectiveLine = document.lineAt(effective.lineIndex);

    // No-op guard: if the edit wouldn't actually change this line's content (e.g. a drag that ends
    // back where it started), skip entirely — including the split, which should never fire for a
    // change that isn't really happening.
    const proposedLine = generateLine(effectiveLine.text, effective.displayFormat);
    if (proposedLine === effectiveLine.text) {
        return;
    };

    // Whether this keyword still has just one shared line is what decides whether a split is
    // needed — not whether the *effective* line happens to be unconditioned, since the primary
    // format's line is deliberately always unconditioned (see above) even once already split.
    const needsSplit = !!activeFormat && candidates.length === 1 && declaredFormats.length > 1;

    if (!needsSplit) {
        workspaceEdit.replace(uri, effectiveLine.range, proposedLine);
        return;
    };

    const primaryFormat = declaredFormats[0];

    // Preserve the OLD value for every other declared format that would otherwise keep silently
    // falling back to this same shared line once it's rewritten.
    const otherFormats = declaredFormats.filter(f => f !== activeFormat);
    for (const format of otherFormats) {
        const oldLine = format === primaryFormat
            ? effectiveLine.text
            : writeDisplayFormatCondition(effectiveLine.text, format);
        workspaceEdit.insert(uri, effectiveLine.range.end, '\n' + oldLine);
    };

    // Rewrite the original line in place: now conditioned for the active format (unconditioned
    // instead, if it's the primary), with the new value.
    const rewrittenText = generateLine(effectiveLine.text, activeFormat);
    const newLine = activeFormat === primaryFormat
        ? rewrittenText
        : writeDisplayFormatCondition(rewrittenText, activeFormat);
    workspaceEdit.replace(uri, effectiveLine.range, newLine);
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
    if (!(await insertDspsizLines(editor, dspsizLines))) {
        return null;
    };

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
 * Per-document cache of the remote (non-`file:`) read-only stat — e.g. an IBM i source member
 * opened through Code for IBM i, where `vscode.workspace.fs.stat()` means a live round-trip over
 * the connection. Without this, every single edit (each field move/drop, etc.) pays that round-trip
 * again via `isReadOnlyFile()`/`applyWorkspaceEdit()` below, which is fine for a local `file:` (an
 * instant OS call) but was a real, repeated source of latency while connected. Cleared when the
 * document closes, so a freshly (re)opened document always re-checks.
 */
const remoteReadOnlyCache: Map<string, boolean> = new Map();

/** Clears a document's cached remote read-only status (e.g. when it's closed). */
export function clearReadOnlyCache(documentUri: string): void {
    remoteReadOnlyCache.delete(documentUri);
};

/**
 * Whether a URI points at a file the current user can't write to. `vscode.workspace.fs.stat()`'s
 * `permissions` field is unreliable for this: local disk providers commonly leave it unset even
 * for an OS-level read-only file (confirmed — VS Code doesn't even show its own lock icon on such
 * a file's tab), since it's only *required* to be populated by providers that want to opt into
 * VS Code's read-only UI, not a live reflection of OS permission bits. For a `file:` URI, checking
 * the OS permission bits directly via Node's `fs` is the only reliable signal. For anything else
 * (a virtual filesystem provider — e.g. an IBM i source member opened through Code for IBM i),
 * `stat()` is the only option available, so it's used as a best-effort fallback — and cached per
 * document (see `remoteReadOnlyCache` above), since it's the one that's actually expensive.
 * @param uri - The document URI to check
 */
async function isReadOnlyFile(uri: vscode.Uri): Promise<boolean> {
    if (uri.scheme === 'file') {
        try {
            await fs.promises.access(uri.fsPath, fs.constants.W_OK);
            return false;
        } catch {
            return true;
        };
    };

    const cacheKey = uri.toString();
    const cached = remoteReadOnlyCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    };

    let isReadOnly: boolean;
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        isReadOnly = Boolean((stat.permissions ?? 0) & vscode.FilePermission.Readonly);
    } catch {
        isReadOnly = false;
    };

    remoteReadOnlyCache.set(cacheKey, isReadOnly);
    return isReadOnly;
};

/**
 * Applies a WorkspaceEdit and reports whether it actually succeeded. Checked in two layers:
 *
 * 1. Proactively, via `isReadOnlyFile()`: a file that's read-only still lets VS Code apply the
 *    edit to the in-memory buffer — it only fails later, silently from this extension's point of
 *    view, when the user tries to save and gets VS Code's own permission-denied error. Catching it
 *    here means the user finds out immediately, from the edit they just made, instead of
 *    discovering it minutes later at save time.
 * 2. Reactively, via `applyEdit`'s own return value: VS Code returns `false` (rather than
 *    throwing) when it rejects an edit for any other reason, which a caller that just `await`s the
 *    call and moves on would otherwise miss entirely.
 *
 * Callers should check the returned boolean and skip their own follow-up (success toast,
 * forceReparse, etc.) when it's `false`.
 * @param workspaceEdit - The edit to apply
 * @param context - Short description of what was being done, used in the failure message (e.g. "add the field")
 */
export async function applyWorkspaceEdit(workspaceEdit: vscode.WorkspaceEdit, context: string): Promise<boolean> {
    const [uri] = workspaceEdit.entries()[0] ?? [];
    if (uri && (await isReadOnlyFile(uri))) {
        vscode.window.showErrorMessage(`Could not ${context} — the document is read-only.`);
        return false;
    };

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    if (!success) {
        vscode.window.showErrorMessage(`Could not ${context} — the document may be read-only.`);
    };
    return success;
};

/**
 * Finds the last physical line a keyword area starting at `startLine` continues onto, by following
 * its trailing continuation hyphen(s) — the same rule the parser itself uses (see extractAttributes
 * in dspf-edit.parser.ts). Pass the result as removeKeywordTextFromLines's `lastLineIndex` so it can
 * see (and, once a keyword is removed, re-flow) the whole keyword area rather than just its own
 * first line.
 * @param document - The text document
 * @param startLine - The keyword area's first line
 */
export function findKeywordContinuationEndLine(document: vscode.TextDocument, startLine: number): number {
    let endLine = startLine;
    while (endLine < document.lineCount - 1) {
        const part = document.lineAt(endLine).text.substring(44, 80);
        if (!part.trim().endsWith('-')) {
            break;
        };
        endLine++;
    };
    return endLine;
};

/**
 * Removes one keyword's own text (e.g. "COLOR(RED)") from the DDS keyword area (columns 45-80) of
 * the line(s) it occupies. Handles two things a naive "delete the whole line range" approach gets
 * wrong: the range may span more than one physical line via a trailing continuation hyphen (e.g.
 * "EDTCDE(3) DSPATR(HI) COLOR(RED) DSP-" continuing onto "ATR(RI)" below), and those line(s) may be
 * shared with sibling keywords that must survive. Reconstructs the joined logical keyword text
 * across the range, removes `value` from it, and re-paginates whatever remains back across the same
 * starting line(s) — re-inserting a continuation hyphen only where content still doesn't fit on one
 * line, and deleting any line(s) left over once the remainder needs fewer lines than before.
 * @param editor - The active text editor
 * @param lineIndex - The keyword's own first line
 * @param lastLineIndex - The keyword's own last line (equal to lineIndex when it doesn't continue)
 * @param value - The keyword's own text, exactly as parsed (e.g. "COLOR(RED)")
 * @param preserveFirstLine - True when `lineIndex` is a field/constant's own definition line (whose
 * columns 1-44 must survive even when nothing else is left in its keyword area) rather than a
 * standalone attribute line (which can be deleted outright in that case)
 */
export async function removeKeywordTextFromLines(
    editor: vscode.TextEditor,
    lineIndex: number,
    lastLineIndex: number,
    value: string,
    preserveFirstLine: boolean = false
): Promise<boolean> {
    return rewriteKeywordArea(editor, lineIndex, lastLineIndex, preserveFirstLine, joined => {
        let start = joined.indexOf(value);
        if (start === -1) {
            vscode.window.showErrorMessage(`Could not locate the attribute's text on its source line(s).`);
            return null;
        };
        let end = start + value.length;
        if (joined[start - 1] === ' ') {
            start -= 1;
        } else if (joined[end] === ' ') {
            end += 1;
        };
        return (joined.slice(0, start) + joined.slice(end)).replace(/\s+$/, '');
    });
};

/**
 * Removes every match of any of `patterns` (e.g. EDTCDE()/EDTWRD()/EDTMSK() at once) from the DDS
 * keyword area of the line(s) it occupies, with the same continuation-aware, sibling-preserving
 * re-pagination as removeKeywordTextFromLines — used where several *kinds* of keyword need removing
 * together rather than one specific keyword's exact text.
 * @param editor - The active text editor
 * @param lineIndex - The keyword area's first line
 * @param lastLineIndex - The keyword area's last line (equal to lineIndex when it doesn't continue)
 * @param patterns - Regexes to remove (each applied with a global flag's worth of repeats via `replace`)
 * @param preserveFirstLine - See removeKeywordTextFromLines
 */
export async function removeKeywordPatternsFromLines(
    editor: vscode.TextEditor,
    lineIndex: number,
    lastLineIndex: number,
    patterns: RegExp[],
    preserveFirstLine: boolean = false
): Promise<boolean> {
    return rewriteKeywordArea(editor, lineIndex, lastLineIndex, preserveFirstLine, joined => {
        let result = joined;
        for (const pattern of patterns) {
            result = result.replace(pattern, '');
        };
        return result.replace(/\s{2,}/g, ' ').trim();
    });
};

/**
 * Shared plumbing for removeKeywordTextFromLines/removeKeywordPatternsFromLines: reconstructs the
 * joined logical keyword text across `[lineIndex, lastLineIndex]` (stripping each non-final line's
 * continuation hyphen, matching how the parser itself reconstructs a continued value), hands it to
 * `computeRemaining`, and re-paginates whatever comes back across the same starting line(s) —
 * re-inserting a continuation hyphen only where content still doesn't fit on one line, and deleting
 * any line(s) left over once the remainder needs fewer lines than before.
 * @param computeRemaining - Returns the new joined keyword text, or null to abort (already reported
 * to the user) when it couldn't find what it was looking for
 */
async function rewriteKeywordArea(
    editor: vscode.TextEditor,
    lineIndex: number,
    lastLineIndex: number,
    preserveFirstLine: boolean,
    computeRemaining: (joined: string) => string | null
): Promise<boolean> {
    const document = editor.document;
    const uri = document.uri;

    const lineCount = lastLineIndex - lineIndex + 1;
    const rawParts: string[] = [];
    for (let i = lineIndex; i <= lastLineIndex; i++) {
        rawParts.push(document.lineAt(i).text.substring(44, 80));
    };

    const joined = rawParts.map((part, i) => i === rawParts.length - 1 ? part : part.replace(/-$/, '')).join('');
    const remaining = computeRemaining(joined);
    if (remaining === null) {
        return false;
    };

    const workspaceEdit = new vscode.WorkspaceEdit();

    if (remaining.trim().length === 0) {
        if (preserveFirstLine) {
            const line = document.lineAt(lineIndex);
            workspaceEdit.replace(uri, line.range, line.text.substring(0, 44).replace(/\s+$/, ''));
            if (lastLineIndex > lineIndex) {
                deleteLineRange(workspaceEdit, document, uri, lineIndex + 1, lastLineIndex);
            };
        } else {
            deleteLineRange(workspaceEdit, document, uri, lineIndex, lastLineIndex);
        };
        return applyWorkspaceEdit(workspaceEdit, 'delete the attribute');
    };

    // Re-paginate the remaining text: up to 35 characters per continued line (leaving room for a
    // trailing '-'), and up to 36 on the final line (no continuation needed).
    const chunks: string[] = [];
    let rest = remaining;
    while (rest.length > 36) {
        chunks.push(rest.substring(0, 35) + '-');
        rest = rest.substring(35);
    };
    chunks.push(rest);

    const prefix = document.lineAt(lineIndex).text.substring(0, 44);
    for (let i = 0; i < chunks.length; i++) {
        const newText = (prefix + chunks[i]).replace(/\s+$/, '');
        workspaceEdit.replace(uri, document.lineAt(lineIndex + i).range, newText);
    };

    if (chunks.length < lineCount) {
        deleteLineRange(workspaceEdit, document, uri, lineIndex + chunks.length, lastLineIndex);
    };

    return applyWorkspaceEdit(workspaceEdit, 'delete the attribute');
};

/** Deletes a contiguous range of whole lines (inclusive), handling end-of-document edge cases. */
function deleteLineRange(
    workspaceEdit: vscode.WorkspaceEdit,
    document: vscode.TextDocument,
    uri: vscode.Uri,
    startLine: number,
    endLine: number
): void {
    const docLength = document.getText().length;
    let startOffset: number;
    let endOffset: number;

    if (endLine === document.lineCount - 1) {
        if (startLine === 0) {
            startOffset = 0;
            endOffset = docLength;
        } else {
            startOffset = document.offsetAt(document.lineAt(startLine - 1).range.end);
            endOffset = docLength;
        };
    } else {
        startOffset = document.offsetAt(new vscode.Position(startLine, 0));
        endOffset = document.offsetAt(document.lineAt(endLine).rangeIncludingLineBreak.end);
    };

    workspaceEdit.delete(uri, new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset)));
};

/**
 * Parses indicators from a DDS line at positions 8-10, 11-13, 14-16.
 * @param lineText - The DDS line text
 * @returns Array of indicator codes found
 */
export function parseIndicatorsFromLine(lineText: string): string[] {
    const indicators: string[] = [];

    // Check positions 8-10, 11-13, 14-16 (0-based: 7-9, 10-12, 13-15) — column 7 (0-based 6) is
    // the condition marker (blank/'A'/'O'), not part of any indicator slot; see
    // dspf-edit.add-indicators.ts's setIndicatorsOnLine/createIndicatorContinuationLine, which
    // write indicators at this same offset.
    const positions = [7, 10, 13];

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
