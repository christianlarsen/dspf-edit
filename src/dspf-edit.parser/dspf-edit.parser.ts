/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.parser.ts
*/

import {
    DdsElement,
    DdsRecord,
    DdsIndicator,
    DdsFile,
    DdsAttribute,
    DdsSize,
    fileSizeAttributes,
    records,
    fieldsPerRecords,
    getDefaultSize,
    attributesFileLevel
} from '../dspf-edit.model/dspf-edit.model';


// Global state to store current parsed DDS elements
export let currentDdsElements: DdsElement[] = [];

/**
 * Main parser function that processes DDS document text and returns structured elements
 * @param text - Raw DDS document text to parse
 * @returns Array of parsed DDS elements
 */
export function parseDocument(text: string): DdsElement[] {
    const lines = text.split(/\r?\n/);
    const ddsElements: DdsElement[] = [];

    // Clear global state
    clearGlobalState();

    // Initialize with root file element
    const rootFile = createRootFileElement();
    ddsElements.push(rootFile);

    // Parse all lines sequentially
    const parsedElements = parseAllLines(lines);
    ddsElements.push(...parsedElements);

    // Post-processing: establish parent-child relationships
    linkAttributesToParents(ddsElements);
    linkFieldsAndConstantsToRecords(ddsElements);

    // Process file-level attributes if they exist
    processFileAttributes(rootFile, ddsElements);

    // Process record sizes after all parsing is complete
    processRecordSizes(ddsElements);

    // Compute end line for each record
    assignRecordEndIndices(ddsElements, lines.length);

    // Sync record attributes into fieldsPerRecords
    syncRecordAttributes(ddsElements);

    // Store globally and return filtered elements
    currentDdsElements = ddsElements;
    return ddsElements.filter(el => el.kind !== 'attribute');
};

/**
 * Clears global state arrays used during parsing
 */
function clearGlobalState(): void {
    records.length = 0;
    fieldsPerRecords.length = 0;
    attributesFileLevel.length = 0;
};

/**
 * Creates the root file element that serves as the document container
 * @returns DdsFile element representing the root
 */
function createRootFileElement(): DdsFile {
    return {
        kind: 'file',
        lineIndex: 0,
        attributes: []
    };
};

/**
 * Parses all lines in the document and returns the resulting elements
 * @param lines - Array of document lines to parse
 * @returns Array of parsed DDS elements
 */
function parseAllLines(lines: string[]): DdsElement[] {
    const elements: DdsElement[] = [];
    let currentRecord = '';
    let lineIndex = 0;

    while (lineIndex < lines.length) {
        const parseResult = parseSingleDdsLine(lines, lineIndex, currentRecord);

        if (parseResult.element) {
            elements.push(parseResult.element);
        };

        currentRecord = parseResult.lastRecord;
        lineIndex = parseResult.nextIndex + 1;
    };

    return elements;
};

/**
 * Parses a single DDS line and returns the resulting element and parsing state
 * @param lines - All document lines (for multi-line parsing)
 * @param lineIndex - Current line being parsed
 * @param lastRecord - Name of the last record processed
 * @returns Parsing result with element, next index, and current record
 */
function parseSingleDdsLine(
    lines: string[],
    lineIndex: number,
    lastRecord: string
): { element: DdsElement | undefined; nextIndex: number; lastRecord: string } {

    const line = lines[lineIndex];
    const trimmedLine = line.substring(5); // Skip sequence number area

    // Skip comment lines
    if (trimmedLine.startsWith('A*')) {
        return { element: undefined, nextIndex: lineIndex, lastRecord };
    };

    // Extract common line components
    const lineComponents = extractLineComponents(trimmedLine);

    // Determine element type and parse accordingly
    if (isRecordLine(trimmedLine)) {
        return parseRecordElement(lines, lineIndex, trimmedLine, lastRecord);
    };

    if (isFieldLine(lineComponents.fieldName)) {
        return parseFieldElement(lines, lineIndex, trimmedLine, lineComponents, lastRecord);
    };

    if (isConstantLine(lineComponents)) {
        return parseConstantElement(lines, lineIndex, trimmedLine, lineComponents, lastRecord);
    };

    // Default to attribute parsing
    return parseAttributeElement(lines, lineIndex, trimmedLine, lineComponents, lastRecord);
};

/**
 * Extracts common components from a DDS line
 * @param trimmedLine - Line with sequence number area removed
 * @returns Object containing parsed line components
 */
function extractLineComponents(trimmedLine: string) {
    const indicators = parseDdsIndicators(trimmedLine.substring(2, 11));
    const fieldName = trimmedLine.substring(13, 23).trim();
    const rowText = trimmedLine.substring(33, 36).trim();
    const colText = trimmedLine.substring(36, 39).trim();
    const row = rowText ? Number(rowText) : undefined;
    const col = colText ? Number(colText) : undefined;

    return { indicators, fieldName, row, col };
};

/**
 * Checks if the line represents a record definition
 * @param trimmedLine - Line to check
 * @returns True if line is a record definition
 */
function isRecordLine(trimmedLine: string): boolean {
    return trimmedLine[11] === 'R';
};

/**
 * Checks if the line represents a field definition
 * @param fieldName - Extracted field name from line
 * @returns True if line is a field definition
 */
function isFieldLine(fieldName: string): boolean {
    return Boolean(fieldName);
};

/**
 * Checks if the line represents a constant definition
 * @param components - Extracted line components
 * @returns True if line is a constant definition
 */
function isConstantLine(components: { fieldName: string; row?: number; col?: number }): boolean {
    return !components.fieldName && Boolean(components.row) && Boolean(components.col);
};

/**
 * Parses a record element from the current line
 * @param lines - All document lines
 * @param lineIndex - Current line index
 * @param trimmedLine - Current line content
 * @param lastRecord - Previous record name
 * @returns Parsing result with record element
 */
function parseRecordElement(
    lines: string[],
    lineIndex: number,
    trimmedLine: string,
    lastRecord: string
) {
    const name = trimmedLine.substring(13, 23).trim();
    const { attributes, nextIndex } = extractAttributes('R', lines, lineIndex, false);

    // Update global state
    records.push(name);
    fieldsPerRecords.push({
        record: name,
        attributes: attributes,
        fields: [],
        constants: [],
        startIndex: lineIndex,
        endIndex: 0
    });

    const element: DdsRecord = {
        kind: 'record',
        lineIndex,
        name,
        attributes
    };

    return { element, nextIndex, lastRecord: name };
};

/**
 * Checks if a record is a subfile by examining its attributes
 * @param attributes - Array of DDS attributes
 * @returns True if the record has SFL attribute
 */
function isSubfileRecord(attributes?: DdsAttribute[]): boolean {
    if (!attributes) return false;
    
    return attributes.some(attr => 
        attr.value.toUpperCase() === 'SFL'
    );
};

/**
 * Parses a field element from the current line
 * @param lines - All document lines
 * @param lineIndex - Current line index
 * @param trimmedLine - Current line content
 * @param components - Extracted line components
 * @param lastRecord - Current record name
 * @returns Parsing result with field element
 */
function parseFieldElement(
    lines: string[],
    lineIndex: number,
    trimmedLine: string,
    components: any,
    lastRecord: string
) {
    const type = trimmedLine[29];
    const length = Number(trimmedLine.substring(27, 29).trim());
    const decimals = trimmedLine.substring(30, 32) !== ' ' ? Number(trimmedLine.substring(30, 32).trim()) : 0;
    const usage = trimmedLine[32] !== ' ' ? trimmedLine[32] : ' ';
    const isHidden = trimmedLine[32] === 'H';
    const isReferenced = trimmedLine[23] === 'R';

    const { attributes, nextIndex } = extractAttributes('F', lines, lineIndex, true, components.indicators);

    // Check if the current record (lastRecord) is a subfile by looking at its attributes
    const currentRecordEntry = fieldsPerRecords.find(r => r.record === lastRecord);
    const isSubfile = currentRecordEntry ? isSubfileRecord(currentRecordEntry.attributes) : false;
    
    // For subfiles, swap row and column positions
    let finalRow = components.row;
    let finalCol = components.col;
    
    if (isSubfile && !isHidden) {
        // In subfiles, the positions are swapped: what appears in the "row" position is actually the column,
        // and what appears in the "column" position is actually the row
        finalRow = components.col;
        finalCol = components.row;
    };

    const element = {
        kind: 'field' as const,
        name: components.fieldName,
        type: type,
        length: length,
        decimals: decimals,
        usage: usage,
        row: isHidden ? undefined : finalRow,
        column: isHidden ? undefined : finalCol,
        hidden: isHidden,
        referenced: isReferenced,
        lineIndex: lineIndex,
        recordname: lastRecord,
        attributes: attributes || [],
        indicators: components.indicators || undefined,
    };

    return { element, nextIndex, lastRecord };
};

/**
 * Parses a constant element from the current line(s), handling multi-line constants
 * @param lines - All document lines
 * @param lineIndex - Current line index
 * @param trimmedLine - Current line content
 * @param components - Extracted line components
 * @param lastRecord - Current record name
 * @returns Parsing result with constant element
 */
function parseConstantElement(
    lines: string[],
    lineIndex: number,
    trimmedLine: string,
    components: any,
    lastRecord: string
) {
    // Handle multi-line constants
    const { fullValue, lastLineIndex } = extractMultiLineConstant(lines, lineIndex, trimmedLine);
    const { attributes, nextIndex } = extractAttributes('C', lines, lastLineIndex, true, components.indicators);

    // Check if the current record (lastRecord) is a subfile by looking at its attributes
    const currentRecordEntry = fieldsPerRecords.find(r => r.record === lastRecord);
    const isSubfile = currentRecordEntry ? isSubfileRecord(currentRecordEntry.attributes) : false;
        
    // For subfiles, swap row and column positions
    let finalRow = components.row;
    let finalCol = components.col;
        
    if (isSubfile) {
        finalRow = components.col;
        finalCol = components.row;
    };
    
    const element = {
        kind: 'constant' as const,
        name: fullValue,
        row: finalRow,
        column: finalCol,
        lineIndex: lineIndex,
        lastLineIndex: lastLineIndex,
        recordname: lastRecord,
        attributes: attributes || [],
        indicators: components.indicators
    };

    return { element, nextIndex: lastLineIndex, lastRecord };
};

/**
 * Extracts multi-line constant values, following continuation characters
 * @param lines - All document lines
 * @param startIndex - Starting line index
 * @param trimmedLine - Initial line content
 * @returns Full constant value and last line index used
 */
function extractMultiLineConstant(
    lines: string[],
    startIndex: number,
    trimmedLine: string
): { fullValue: string; lastLineIndex: number } {

    let fullValue = trimmedLine.substring(39, 79);
    let continuationIndex = startIndex;

    // Follow continuation lines (marked with '-' at position 79)
    while (lines[continuationIndex]?.charAt(79) === '-') {
        continuationIndex++;
        const nextLine = lines[continuationIndex];
        if (!nextLine) break;

        const nextTrimmed = nextLine.substring(5);
        const continuedValue = nextTrimmed.substring(39, 79);
        fullValue = fullValue.slice(0, -1) + continuedValue; // Remove '-' and append
    };

    return { fullValue: fullValue.trim(), lastLineIndex: continuationIndex };
};

/**
 * Parses attribute elements from the current line
 * @param lines - All document lines
 * @param lineIndex - Current line index
 * @param trimmedLine - Current line content
 * @param components - Extracted line components
 * @param lastRecord - Current record name
 * @returns Parsing result with attribute element or undefined
 */
function parseAttributeElement(
    lines: string[],
    lineIndex: number,
    trimmedLine: string,
    components: any,
    lastRecord: string
) {
    const { attributes, nextIndex } = extractAttributes('A', lines, lineIndex, true, components.indicators);

    if (attributes.length > 0) {
        const maxLastLineIndex = attributes.reduce(
            (max, attr) => Math.max(max, attr.lastLineIndex ?? lineIndex),
            lineIndex
        );
        const element = {
            kind: 'attribute' as const,
            lineIndex: lineIndex,
            lastLineIndex: maxLastLineIndex,
            value: '',
            indicators: components.indicators,
            attributes: attributes
        };
        return { element, nextIndex, lastRecord };
    };

    return { element: undefined, nextIndex: lineIndex, lastRecord };
};

/**
 * Parses indicator specifications from a DDS line segment
 * @param input - 9-character string containing indicator specifications
 * @returns Array of parsed indicator objects
 */
export function parseDdsIndicators(input: string): DdsIndicator[] {
    const indicators: DdsIndicator[] = [];

    // Process 3 indicator positions (3 characters each)
    for (let i = 0; i < 3; i++) {
        const segment = input.slice(i * 3, i * 3 + 3);
        const activeChar = segment[0] || ' ';
        const numberStr = segment.slice(1).trim();

        if (numberStr === '') continue;

        indicators.push({
            active: activeChar !== 'N',
            number: parseInt(numberStr, 10)
        });
    };

    // Sort indicators by number for consistent ordering
    indicators.sort((a, b) => a.number - b.number);
    return indicators;
};


/**
 * Extracts attribute specifications from DDS lines, handling multi-line attributes
 * @param lineType - Type of line being processed ('R', 'F', 'C', 'A')
 * @param lines - All document lines
 * @param startIndex - Starting line index
 * @param includeIndicators - Whether to include indicator information
 * @param indicators - Indicator objects to associate with attributes
 * @returns Extracted attributes and next line index
 */
function extractAttributes(
    lineType: string,
    lines: string[],
    startIndex: number,
    includeIndicators: boolean,
    indicators?: DdsIndicator[]
): { attributes: DdsAttribute[]; nextIndex: number } {

    let rawAttributeText = '';
    let currentIndex = startIndex;

    // Collect attribute text across potentially multiple lines
    while (currentIndex < lines.length) {
        const line = lines[currentIndex];
        const trimmed = line.substring(5);
        const attributePart = trimmed.substring(39, 75);

        // Remove continuation character and append
        rawAttributeText += attributePart.replace(/-$/, '');

        // Stop if no continuation character found
        if (!attributePart.trim().endsWith('-')) break;
        currentIndex++;
    };

    rawAttributeText = rawAttributeText.trim();

    // Return empty attributes if no content found
    if (!rawAttributeText) {
        return { attributes: [], nextIndex: currentIndex };
    };

    // Special handling for constants at the same line index
    if (lineType === 'C' && currentIndex === startIndex) {
        return { attributes: [], nextIndex: currentIndex };
    };

    // Create attribute object
    const attribute: DdsAttribute = {
        kind: 'attribute',
        lineIndex: startIndex,
        lastLineIndex: currentIndex,
        value: lineType === 'C' ? '' : rawAttributeText,
        indicators: includeIndicators && indicators ? indicators : []
    };

    return { attributes: [attribute], nextIndex: currentIndex };
};

/**
 * Links attribute elements to their parent elements (file, record, field, constant)
 * @param ddsElements - Array of all parsed DDS elements
 */
function linkAttributesToParents(ddsElements: DdsElement[]): void {
    let currentFile: DdsElement | undefined;
    let currentRecord: DdsElement | undefined;
    let lastField: DdsElement | undefined;

    for (const element of ddsElements) {
        switch (element.kind) {
            case 'file':
                currentFile = element;
                currentRecord = undefined;
                lastField = undefined;
                break;

            case 'record':
                currentRecord = element;
                lastField = undefined;
                break;

            case 'field':
            case 'constant':
                lastField = element;
                break;

            case 'attribute':
                if (lastField) {
                    lastField.attributes = [
                        ...(lastField.attributes || []),
                        ...(element.attributes || [])
                    ];
                } else if (currentRecord) {
                    currentRecord.attributes = [
                        ...(currentRecord.attributes || []),
                        ...(element.attributes || [])
                    ];
                } else if (currentFile) {
                    currentFile.attributes = [
                        ...(currentFile.attributes || []),
                        ...(element.attributes || [])
                    ];
                };
                break;
        };
    };
};

/**
 * Links field and constant elements to their parent records in the global structure
 * @param ddsElements - Array of all parsed DDS elements
 */
function linkFieldsAndConstantsToRecords(ddsElements: DdsElement[]): void {
    for (const element of ddsElements) {
        if ((element.kind === 'field') || element.kind === 'constant') {
            // Find parent record for this field/constant
            const parentRecord = [...ddsElements]
                .reverse()
                .find(p =>
                    p.lineIndex < element.lineIndex &&
                    p.kind === 'record'
                ) as DdsRecord | undefined;

            if (parentRecord) {
                const recordEntry = fieldsPerRecords.find(r => r.record === parentRecord.name);

                if (recordEntry) {
                    if (element.kind === 'field') {
                        addFieldToRecord(element, recordEntry);
                    } else if (element.kind === 'constant') {
                        addConstantToRecord(element, recordEntry);
                    };
                };
            };
        };
    };
};

/**
 * Adds a field element to its parent record entry
 * @param field - Field element to add
 * @param recordEntry - Record entry to add field to
 */
function addFieldToRecord(field: any, recordEntry: any): void {
    // Avoid duplicate fields
    if (!recordEntry.fields.some((f: any) => f.name === field.name)) {
        
        // Process attributes preserving their indicators
        const processedAttributes = field.attributes?.map((attr: any) => ({
            value: attr.value,
            indicators: attr.indicators || [],
            lineIndex: attr.lineIndex,
            lastLineIndex: attr.lastLineIndex ?? attr.lineIndex
        })).filter((attr: any) => attr.value) || [];

        recordEntry.fields.push({
            name: field.name,
            type: field.type,
            row: field.row || 0,
            col: field.column || 0,
            length: field.length || 0,
            attributes: processedAttributes,
            indicators: field.indicators || [],
            lineIndex: field.lineIndex,
            lastLineIndex: field.lastLineIndex || field.lineIndex
        });
    }
};

/**
 * Adds a constant element to its parent record entry
 * @param constant - Constant element to add
 * @param recordEntry - Record entry to add constant to
 */
function addConstantToRecord(constant: any, recordEntry: any): void {
    // Remove quotes from constant name for storage
    const constantName = constant.name.slice(1, -1);

    // Process attributes preserving their indicators
    const processedAttributes = constant.attributes?.map((attr: any) => ({
        value: attr.value,
        indicators: attr.indicators || [],
        lineIndex: attr.lineIndex,
        lastLineIndex: attr.lastLineIndex ?? attr.lineIndex
    })).filter((attr: any) => attr.value) || [];

    // Avoid duplicate constants
    if (!recordEntry.constants.some((c: any) => c.name === constantName)) {
        recordEntry.constants.push({
            name: constantName,
            type: undefined,
            row: constant.row || 0,
            col: constant.column || 0,
            length: constantName.length,
            attributes: processedAttributes,
            lineIndex: constant.lineIndex,
            lastLineIndex: constant.lastLineIndex
        });
    };
};

/**
 * Processes file-level attributes, particularly DSPSIZ for screen dimensions
 * @param file - Root file element
 * @param ddsElements - Array of all parsed elements
 */
function processFileAttributes(file: DdsFile, ddsElements: DdsElement[]): void {
    if (!file.attributes || file.attributes.length === 0) return;

    // Add attributes group element for display
    ddsElements.push({
        kind: 'group',
        lineIndex: file.lineIndex,
        attribute: 'Attributes',
        attributes: file.attributes,
        children: []
    });
    // Add file-level attributes to structure
    attributesFileLevel.push(...file.attributes);

    // Process DSPSIZ attribute for screen size information
    processDspsizAttribute(file.attributes);
};

/**
 * Parses DSPSIZ content to extract screen size definitions
 * Handles both explicit sizes: DSPSIZ(24 80 *DS3 27 132 *DS4)
 * And predefined sizes: DSPSIZ(*DS3 *DS4)
 * @param dspsizContent - Content within DSPSIZ parentheses
 * @returns Array of parsed screen size objects
 */
function parseDspsizSizes(dspsizContent: string): Array<{ row: number; col: number; name: string }> {
    const sizes: Array<{ row: number; col: number; name: string }> = [];

    // Map of predefined display sizes
    const predefinedSizes: Record<string, { row: number; col: number }> = {
        '*DS3': { row: 24, col: 80 },
        '*DS4': { row: 27, col: 132 }
    };

    const tokens = dspsizContent.trim().split(/\s+/);

    for (let i = 0; i < tokens.length; ) {
        const token = tokens[i].toUpperCase();

        // Case 1: predefined name only (*DS3 or *DS4)
        if (token.startsWith('*')) {
            const predefined = predefinedSizes[token];
            if (predefined) {
                sizes.push({ ...predefined, name: token });
            };
            i++;
        }
        // Case 2: numeric definition (24 80 [*DS3])
        else if (/^\d+$/.test(token)) {
            const row = parseInt(token, 10);
            const col = parseInt(tokens[i + 1], 10);
            const next = tokens[i + 2]?.toUpperCase();
            const name = next?.startsWith('*') ? next : '';

            if (!isNaN(row) && !isNaN(col)) {
                sizes.push({ row, col, name });
                i += name ? 3 : 2;
            } else {
                i++;
            };
        }
        else {
            i++;
        };
    };

    return sizes;
};

/**
 * Extracts screen size information from DSPSIZ file attribute
 * @param attributes - File attributes to search
 */
function processDspsizAttribute(attributes: DdsAttribute[]): void {
    const dspsizAttribute = attributes.find(attr =>
        attr.value.toUpperCase().includes("DSPSIZ(")
    );

    if (!dspsizAttribute) {
        // No DSPSIZ found, set default 27x132
        setDefaultScreenSize();
        return;
    };

    const dspsizMatch = dspsizAttribute.value.match(/DSPSIZ\s*\(([^)]+)\)/i);
    if (!dspsizMatch) {
        // DSPSIZ found but malformed, set default 27x132
        setDefaultScreenSize();
        return;
    };

    const dspsizContent = dspsizMatch[1].trim();
    const screenSizes = parseDspsizSizes(dspsizContent);

    // If parsing failed or returned empty, set default 27x132
    if (screenSizes.length === 0) {
        setDefaultScreenSize();
        return;
    };

    // Update global file size attributes
    updateFileSizeAttributes(screenSizes);
};

/**
 * Updates global file size attributes based on parsed screen sizes
 * @param sizes - Array of parsed screen size objects
 */
function updateFileSizeAttributes(sizes: Array<{ row: number; col: number; name: string }>): void {
    fileSizeAttributes.numDsply = sizes.length;

    if (sizes[0]) {
        fileSizeAttributes.maxRow1 = sizes[0].row;
        fileSizeAttributes.maxCol1 = sizes[0].col;
        fileSizeAttributes.nameDsply1 = sizes[0].name;
    };

    if (sizes[1]) {
        fileSizeAttributes.maxRow2 = sizes[1].row;
        fileSizeAttributes.maxCol2 = sizes[1].col;
        fileSizeAttributes.nameDsply2 = sizes[1].name;
    };
};

/**
 * Sets default screen size to 24x80 when DSPSIZ is not found or malformed
 */
function setDefaultScreenSize(): void {
    fileSizeAttributes.numDsply = 1;
    fileSizeAttributes.maxRow1 = 24;
    fileSizeAttributes.maxCol1 = 80;
    fileSizeAttributes.nameDsply1 = '*DS3';
    // Clear second display size
    fileSizeAttributes.maxRow2 = 0;
    fileSizeAttributes.maxCol2 = 0;
    fileSizeAttributes.nameDsply2 = '';
};

/**
 * NEW: Processes record sizes after all elements have been parsed
 * Assigns default size or WINDOW-specific size to each record
 * @param ddsElements - Array of all parsed DDS elements
 */
function processRecordSizes(ddsElements: DdsElement[]): void {
    const recordElements = ddsElements.filter(el => el.kind === 'record') as DdsRecord[];

    for (const record of recordElements) {
        // Check if record has WINDOW attribute
        const windowSize = extractWindowSize(record.attributes);

        if (windowSize) {
            // Use WINDOW-specific size
            record.size = windowSize;
        } else {
            // Use default size from file attributes
            record.size = getDefaultSize();
        };

        // Also update the fieldsPerRecords structure for easy access
        const recordEntry = fieldsPerRecords.find(r => r.record === record.name);
        if (recordEntry) {
            recordEntry.size = record.size;
        };
    };
};

/**
 * Extracts WINDOW size information from record attributes
 * @param attributes - Record attributes to search
 * @returns DdsSize object if WINDOW attribute found, undefined otherwise
 */
function extractWindowSize(attributes?: DdsAttribute[]): DdsSize | undefined {
    if (!attributes) return undefined;

    const windowAttribute = attributes.find(attr =>
        attr.value.toUpperCase().includes('WINDOW(')
    );
    if (!windowAttribute) return undefined;

    // WINDOW(startRow startCol numRows numCols)
    const windowMatch = windowAttribute.value.match(
        /WINDOW\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\)/i
    );
    if (!windowMatch) return undefined;

    const startRow = parseInt(windowMatch[1], 10);
    const startCol = parseInt(windowMatch[2], 10);
    const rows = parseInt(windowMatch[3], 10);
    const cols = parseInt(windowMatch[4], 10);

    return {
        rows,
        cols,
        name: `WINDOW_${startRow}_${startCol}_${rows}_${cols}`,
        source: 'window',
        originRow: startRow,
        originCol: startCol
    };
};

/**
 * Legacy function maintained for backward compatibility
 * @param text - DDS document text to parse
 * @returns Array of all parsed DDS elements
 */
export function getAllDdsElements(text: string): DdsElement[] {
    return parseDocument(text);
};

/**
 * Assigns endIndex to each record based on the next record's start or EOF.
 * Also updates the FieldsPerRecord mirror.
 * @param ddsElements - All parsed elements
 * @param totalLines - Total number of lines in the source text
 */
function assignRecordEndIndices(ddsElements: DdsElement[], totalLines: number): void {
    const recs = (ddsElements.filter(el => el.kind === 'record') as DdsRecord[])
        .sort((a, b) => a.lineIndex - b.lineIndex);

    for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        const next = recs[i + 1];
        const endIdx = next ? next.lineIndex - 1 : totalLines - 1; // inclusive range

        rec.endIndex = endIdx;

        const entry = fieldsPerRecords.find(r => r.record === rec.name);
        if (entry) entry.endIndex = endIdx;
    };
};

/**
 * Sync record attributes into fieldsPerRecords
 * @param ddsElements - All elements
 */
function syncRecordAttributes(ddsElements: DdsElement[]): void {
    const recs = ddsElements.filter(el => el.kind === 'record') as DdsRecord[];

    for (const rec of recs) {
        const entry = fieldsPerRecords.find(r => r.record === rec.name);
        if (entry) {
            entry.attributes = rec.attributes;
        };
    };
};
