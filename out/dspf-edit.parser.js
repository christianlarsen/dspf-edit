"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.parser.ts
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentDdsElements = void 0;
exports.parseDocument = parseDocument;
exports.parseDdsIndicators = parseDdsIndicators;
exports.getAllDdsElements = getAllDdsElements;
const dspf_edit_model_1 = require("./dspf-edit.model");
// Global state to store current parsed DDS elements
exports.currentDdsElements = [];
/**
 * Main parser function that processes DDS document text and returns structured elements
 * @param text - Raw DDS document text to parse
 * @returns Array of parsed DDS elements
 */
function parseDocument(text) {
    const lines = text.split(/\r?\n/);
    const ddsElements = [];
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
    exports.currentDdsElements = ddsElements;
    return ddsElements.filter(el => el.kind !== 'attribute');
}
;
/**
 * Clears global state arrays used during parsing
 */
function clearGlobalState() {
    dspf_edit_model_1.records.length = 0;
    dspf_edit_model_1.fieldsPerRecords.length = 0;
    dspf_edit_model_1.attributesFileLevel.length = 0;
}
;
/**
 * Creates the root file element that serves as the document container
 * @returns DdsFile element representing the root
 */
function createRootFileElement() {
    return {
        kind: 'file',
        lineIndex: 0,
        attributes: []
    };
}
;
/**
 * Parses all lines in the document and returns the resulting elements
 * @param lines - Array of document lines to parse
 * @returns Array of parsed DDS elements
 */
function parseAllLines(lines) {
    const elements = [];
    let currentRecord = '';
    let lineIndex = 0;
    while (lineIndex < lines.length) {
        const parseResult = parseSingleDdsLine(lines, lineIndex, currentRecord);
        if (parseResult.element) {
            elements.push(parseResult.element);
        }
        ;
        currentRecord = parseResult.lastRecord;
        lineIndex = parseResult.nextIndex + 1;
    }
    ;
    return elements;
}
;
/**
 * Parses a single DDS line and returns the resulting element and parsing state
 * @param lines - All document lines (for multi-line parsing)
 * @param lineIndex - Current line being parsed
 * @param lastRecord - Name of the last record processed
 * @returns Parsing result with element, next index, and current record
 */
function parseSingleDdsLine(lines, lineIndex, lastRecord) {
    const line = lines[lineIndex];
    const trimmedLine = line.substring(5); // Skip sequence number area
    // Skip comment lines
    if (trimmedLine.startsWith('A*')) {
        return { element: undefined, nextIndex: lineIndex, lastRecord };
    }
    ;
    // Extract common line components
    const lineComponents = extractLineComponents(trimmedLine);
    // Determine element type and parse accordingly
    if (isRecordLine(trimmedLine)) {
        return parseRecordElement(lines, lineIndex, trimmedLine, lastRecord);
    }
    ;
    if (isFieldLine(lineComponents.fieldName)) {
        return parseFieldElement(lines, lineIndex, trimmedLine, lineComponents, lastRecord);
    }
    ;
    if (isConstantLine(lineComponents)) {
        return parseConstantElement(lines, lineIndex, trimmedLine, lineComponents, lastRecord);
    }
    ;
    // Default to attribute parsing
    return parseAttributeElement(lines, lineIndex, trimmedLine, lineComponents, lastRecord);
}
;
/**
 * Extracts common components from a DDS line
 * @param trimmedLine - Line with sequence number area removed
 * @returns Object containing parsed line components
 */
function extractLineComponents(trimmedLine) {
    const indicators = parseDdsIndicators(trimmedLine.substring(2, 11));
    const fieldName = trimmedLine.substring(13, 23).trim();
    const rowText = trimmedLine.substring(34, 37).trim();
    const colText = trimmedLine.substring(36, 39).trim();
    const row = rowText ? Number(rowText) : undefined;
    const col = colText ? Number(colText) : undefined;
    return { indicators, fieldName, row, col };
}
;
/**
 * Checks if the line represents a record definition
 * @param trimmedLine - Line to check
 * @returns True if line is a record definition
 */
function isRecordLine(trimmedLine) {
    return trimmedLine[11] === 'R';
}
;
/**
 * Checks if the line represents a field definition
 * @param fieldName - Extracted field name from line
 * @returns True if line is a field definition
 */
function isFieldLine(fieldName) {
    return Boolean(fieldName);
}
;
/**
 * Checks if the line represents a constant definition
 * @param components - Extracted line components
 * @returns True if line is a constant definition
 */
function isConstantLine(components) {
    return !components.fieldName && Boolean(components.row) && Boolean(components.col);
}
;
/**
 * Parses a record element from the current line
 * @param lines - All document lines
 * @param lineIndex - Current line index
 * @param trimmedLine - Current line content
 * @param lastRecord - Previous record name
 * @returns Parsing result with record element
 */
function parseRecordElement(lines, lineIndex, trimmedLine, lastRecord) {
    const name = trimmedLine.substring(13, 23).trim();
    const { attributes, nextIndex } = extractAttributes('R', lines, lineIndex, false);
    // Update global state
    dspf_edit_model_1.records.push(name);
    dspf_edit_model_1.fieldsPerRecords.push({
        record: name,
        attributes: attributes,
        fields: [],
        constants: [],
        startIndex: lineIndex,
        endIndex: 0
    });
    const element = {
        kind: 'record',
        lineIndex,
        name,
        attributes
    };
    return { element, nextIndex, lastRecord: name };
}
;
/**
 * Parses a field element from the current line
 * @param lines - All document lines
 * @param lineIndex - Current line index
 * @param trimmedLine - Current line content
 * @param components - Extracted line components
 * @param lastRecord - Current record name
 * @returns Parsing result with field element
 */
function parseFieldElement(lines, lineIndex, trimmedLine, components, lastRecord) {
    const type = trimmedLine[29];
    const length = Number(trimmedLine.substring(27, 29).trim());
    const decimals = trimmedLine.substring(30, 32) !== ' ' ? Number(trimmedLine.substring(30, 32).trim()) : 0;
    const usage = trimmedLine[32] !== ' ' ? trimmedLine[32] : ' ';
    const isHidden = trimmedLine[32] === 'H';
    const isReferenced = trimmedLine[23] === 'R';
    const { attributes, nextIndex } = extractAttributes('F', lines, lineIndex, true, components.indicators);
    const element = {
        kind: 'field',
        name: components.fieldName,
        type: type,
        length: length,
        decimals: decimals,
        usage: usage,
        row: isHidden ? undefined : components.row,
        column: isHidden ? undefined : components.col,
        hidden: isHidden,
        referenced: isReferenced,
        lineIndex: lineIndex,
        recordname: lastRecord,
        attributes: attributes || [],
        indicators: components.indicators || undefined,
    };
    return { element, nextIndex, lastRecord };
}
;
/**
 * Parses a constant element from the current line(s), handling multi-line constants
 * @param lines - All document lines
 * @param lineIndex - Current line index
 * @param trimmedLine - Current line content
 * @param components - Extracted line components
 * @param lastRecord - Current record name
 * @returns Parsing result with constant element
 */
function parseConstantElement(lines, lineIndex, trimmedLine, components, lastRecord) {
    // Handle multi-line constants
    const { fullValue, lastLineIndex } = extractMultiLineConstant(lines, lineIndex, trimmedLine);
    const { attributes, nextIndex } = extractAttributes('C', lines, lastLineIndex, true, components.indicators);
    const element = {
        kind: 'constant',
        name: fullValue,
        row: components.row,
        column: components.col,
        lineIndex: lineIndex,
        recordname: lastRecord,
        attributes: attributes || [],
        indicators: components.indicators
    };
    return { element, nextIndex: lastLineIndex, lastRecord };
}
;
/**
 * Extracts multi-line constant values, following continuation characters
 * @param lines - All document lines
 * @param startIndex - Starting line index
 * @param trimmedLine - Initial line content
 * @returns Full constant value and last line index used
 */
function extractMultiLineConstant(lines, startIndex, trimmedLine) {
    let fullValue = trimmedLine.substring(39, 79);
    let continuationIndex = startIndex;
    // Follow continuation lines (marked with '-' at position 79)
    while (lines[continuationIndex]?.charAt(79) === '-') {
        continuationIndex++;
        const nextLine = lines[continuationIndex];
        if (!nextLine)
            break;
        const nextTrimmed = nextLine.substring(5);
        const continuedValue = nextTrimmed.substring(39, 79);
        fullValue = fullValue.slice(0, -1) + continuedValue; // Remove '-' and append
    }
    ;
    return { fullValue: fullValue.trim(), lastLineIndex: continuationIndex };
}
;
/**
 * Parses attribute elements from the current line
 * @param lines - All document lines
 * @param lineIndex - Current line index
 * @param trimmedLine - Current line content
 * @param components - Extracted line components
 * @param lastRecord - Current record name
 * @returns Parsing result with attribute element or undefined
 */
function parseAttributeElement(lines, lineIndex, trimmedLine, components, lastRecord) {
    const { attributes, nextIndex } = extractAttributes('A', lines, lineIndex, true, components.indicators);
    if (attributes.length > 0) {
        const element = {
            kind: 'attribute',
            lineIndex: lineIndex,
            value: '',
            indicators: components.indicators,
            attributes: attributes
        };
        return { element, nextIndex, lastRecord };
    }
    ;
    return { element: undefined, nextIndex: lineIndex, lastRecord };
}
;
/**
 * Parses indicator specifications from a DDS line segment
 * @param input - 9-character string containing indicator specifications
 * @returns Array of parsed indicator objects
 */
function parseDdsIndicators(input) {
    const indicators = [];
    // Process 3 indicator positions (3 characters each)
    for (let i = 0; i < 3; i++) {
        const segment = input.slice(i * 3, i * 3 + 3);
        const activeChar = segment[0] || ' ';
        const numberStr = segment.slice(1).trim();
        if (numberStr === '')
            continue;
        indicators.push({
            active: activeChar !== 'N',
            number: parseInt(numberStr, 10)
        });
    }
    ;
    // Sort indicators by number for consistent ordering
    indicators.sort((a, b) => a.number - b.number);
    return indicators;
}
;
/**
 * Extracts attribute specifications from DDS lines, handling multi-line attributes
 * @param lineType - Type of line being processed ('R', 'F', 'C', 'A')
 * @param lines - All document lines
 * @param startIndex - Starting line index
 * @param includeIndicators - Whether to include indicator information
 * @param indicators - Indicator objects to associate with attributes
 * @returns Extracted attributes and next line index
 */
function extractAttributes(lineType, lines, startIndex, includeIndicators, indicators) {
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
        if (!attributePart.trim().endsWith('-'))
            break;
        currentIndex++;
    }
    ;
    rawAttributeText = rawAttributeText.trim();
    // Return empty attributes if no content found
    if (!rawAttributeText) {
        return { attributes: [], nextIndex: currentIndex };
    }
    ;
    // Special handling for constants at the same line index
    if (lineType === 'C' && currentIndex === startIndex) {
        return { attributes: [], nextIndex: currentIndex };
    }
    ;
    // Create attribute object
    const attribute = {
        kind: 'attribute',
        lineIndex: currentIndex,
        value: lineType === 'C' ? '' : rawAttributeText,
        indicators: includeIndicators && indicators ? indicators : []
    };
    return { attributes: [attribute], nextIndex: currentIndex };
}
;
/**
 * Links attribute elements to their parent elements (file, record, field, constant)
 * @param ddsElements - Array of all parsed DDS elements
 */
function linkAttributesToParents(ddsElements) {
    for (const element of ddsElements) {
        if (element.kind === 'attribute') {
            // Find the most recent parent element before this attribute
            const parent = [...ddsElements]
                .reverse()
                .find(p => p.lineIndex < element.lineIndex &&
                (p.kind === 'field' || p.kind === 'constant' || p.kind === 'record' || p.kind === 'file'));
            if (parent) {
                parent.attributes = [
                    ...(parent.attributes || []),
                    ...(element.attributes || [])
                ];
            }
            ;
        }
        ;
    }
    ;
}
;
/**
 * Links field and constant elements to their parent records in the global structure
 * @param ddsElements - Array of all parsed DDS elements
 */
function linkFieldsAndConstantsToRecords(ddsElements) {
    for (const element of ddsElements) {
        if ((element.kind === 'field' && element.hidden !== true) || element.kind === 'constant') {
            // Find parent record for this field/constant
            const parentRecord = [...ddsElements]
                .reverse()
                .find(p => p.lineIndex < element.lineIndex &&
                p.kind === 'record');
            if (parentRecord) {
                const recordEntry = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === parentRecord.name);
                if (recordEntry) {
                    if (element.kind === 'field') {
                        addFieldToRecord(element, recordEntry);
                    }
                    else if (element.kind === 'constant') {
                        addConstantToRecord(element, recordEntry);
                    }
                    ;
                }
                ;
            }
            ;
        }
        ;
    }
    ;
}
;
/**
 * Adds a field element to its parent record entry
 * @param field - Field element to add
 * @param recordEntry - Record entry to add field to
 */
function addFieldToRecord(field, recordEntry) {
    // Avoid duplicate fields
    if (!recordEntry.fields.some((f) => f.name === field.name)) {
        console.log(field.type);
        recordEntry.fields.push({
            name: field.name,
            type: field.type,
            row: field.row || 0,
            col: field.column || 0,
            length: field.length || 0,
            attributes: field.attributes?.map((attr) => attr.value).filter(Boolean) || [],
            indicators: field.indicators
        });
    }
    ;
}
;
/**
 * Adds a constant element to its parent record entry
 * @param constant - Constant element to add
 * @param recordEntry - Record entry to add constant to
 */
function addConstantToRecord(constant, recordEntry) {
    // Remove quotes from constant name for storage
    const constantName = constant.name.slice(1, -1);
    // Avoid duplicate constants
    if (!recordEntry.constants.some((c) => c.name === constantName)) {
        recordEntry.constants.push({
            name: constantName,
            type: undefined,
            row: constant.row || 0,
            col: constant.column || 0,
            length: constantName.length,
            attributes: constant.attributes?.map((attr) => attr.value).filter(Boolean) || []
        });
    }
    ;
}
;
/**
 * Processes file-level attributes, particularly DSPSIZ for screen dimensions
 * @param file - Root file element
 * @param ddsElements - Array of all parsed elements
 */
function processFileAttributes(file, ddsElements) {
    if (!file.attributes || file.attributes.length === 0)
        return;
    // Add attributes group element for display
    ddsElements.push({
        kind: 'group',
        lineIndex: file.lineIndex,
        attribute: 'Attributes',
        attributes: file.attributes,
        children: []
    });
    // Add file-level attributes to structure
    dspf_edit_model_1.attributesFileLevel.push(...file.attributes);
    // Process DSPSIZ attribute for screen size information
    processDspsizAttribute(file.attributes);
}
;
/**
 * Extracts screen size information from DSPSIZ file attribute
 * @param attributes - File attributes to search
 */
function processDspsizAttribute(attributes) {
    const dspsizAttribute = attributes.find(attr => attr.value.includes("DSPSIZ("));
    if (!dspsizAttribute)
        return;
    const dspsizMatch = dspsizAttribute.value.match(/DSPSIZ\s*\(([^)]+)\)/i);
    if (!dspsizMatch)
        return;
    const dspsizContent = dspsizMatch[1].trim();
    const screenSizes = parseDspsizSizes(dspsizContent);
    // Update global file size attributes
    updateFileSizeAttributes(screenSizes);
}
;
/**
 * Parses DSPSIZ content to extract screen size definitions
 * @param dspsizContent - Content within DSPSIZ parentheses
 * @returns Array of parsed screen size objects
 */
function parseDspsizSizes(dspsizContent) {
    const sizeRegex = /(\d+)\s+(\d+)(?:\s+([^\s)]+))?/g;
    const sizes = [];
    let match;
    while ((match = sizeRegex.exec(dspsizContent)) !== null) {
        sizes.push({
            row: parseInt(match[1], 10),
            col: parseInt(match[2], 10),
            name: match[3] || ''
        });
    }
    ;
    return sizes;
}
;
/**
 * Updates global file size attributes based on parsed screen sizes
 * @param sizes - Array of parsed screen size objects
 */
function updateFileSizeAttributes(sizes) {
    dspf_edit_model_1.fileSizeAttributes.numDsply = sizes.length;
    if (sizes[0]) {
        dspf_edit_model_1.fileSizeAttributes.maxRow1 = sizes[0].row;
        dspf_edit_model_1.fileSizeAttributes.maxCol1 = sizes[0].col;
        dspf_edit_model_1.fileSizeAttributes.nameDsply1 = sizes[0].name;
    }
    ;
    if (sizes[1]) {
        dspf_edit_model_1.fileSizeAttributes.maxRow2 = sizes[1].row;
        dspf_edit_model_1.fileSizeAttributes.maxCol2 = sizes[1].col;
        dspf_edit_model_1.fileSizeAttributes.nameDsply2 = sizes[1].name;
    }
    ;
}
;
/**
 * NEW: Processes record sizes after all elements have been parsed
 * Assigns default size or WINDOW-specific size to each record
 * @param ddsElements - Array of all parsed DDS elements
 */
function processRecordSizes(ddsElements) {
    const recordElements = ddsElements.filter(el => el.kind === 'record');
    for (const record of recordElements) {
        // Check if record has WINDOW attribute
        const windowSize = extractWindowSize(record.attributes);
        if (windowSize) {
            // Use WINDOW-specific size
            record.size = windowSize;
        }
        else {
            // Use default size from file attributes
            record.size = (0, dspf_edit_model_1.getDefaultSize)();
        }
        ;
        // Also update the fieldsPerRecords structure for easy access
        const recordEntry = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === record.name);
        if (recordEntry) {
            recordEntry.size = record.size;
        }
        ;
    }
    ;
}
;
/**
 * Extracts WINDOW size information from record attributes
 * @param attributes - Record attributes to search
 * @returns DdsSize object if WINDOW attribute found, undefined otherwise
 */
function extractWindowSize(attributes) {
    if (!attributes)
        return undefined;
    const windowAttribute = attributes.find(attr => attr.value.toUpperCase().includes('WINDOW('));
    if (!windowAttribute)
        return undefined;
    // WINDOW(startRow startCol numRows numCols)
    const windowMatch = windowAttribute.value.match(/WINDOW\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\)/i);
    if (!windowMatch)
        return undefined;
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
}
;
/**
 * Legacy function maintained for backward compatibility
 * @param text - DDS document text to parse
 * @returns Array of all parsed DDS elements
 */
function getAllDdsElements(text) {
    return parseDocument(text);
}
;
/**
 * Assigns endIndex to each record based on the next record's start or EOF.
 * Also updates the FieldsPerRecord mirror.
 * @param ddsElements - All parsed elements
 * @param totalLines - Total number of lines in the source text
 */
function assignRecordEndIndices(ddsElements, totalLines) {
    const recs = ddsElements.filter(el => el.kind === 'record')
        .sort((a, b) => a.lineIndex - b.lineIndex);
    for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        const next = recs[i + 1];
        const endIdx = next ? next.lineIndex - 1 : totalLines - 1; // inclusive range
        rec.endIndex = endIdx;
        const entry = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === rec.name);
        if (entry)
            entry.endIndex = endIdx;
    }
    ;
}
;
/**
 * Sync record attributes into fieldsPerRecords
 * @param ddsElements - All elements
 */
function syncRecordAttributes(ddsElements) {
    const recs = ddsElements.filter(el => el.kind === 'record');
    for (const rec of recs) {
        const entry = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === rec.name);
        if (entry) {
            entry.attributes = rec.attributes;
        }
        ;
    }
    ;
}
;
//# sourceMappingURL=dspf-edit.parser.js.map