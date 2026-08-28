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
    getSizeForFormat,
    attributesFileLevel,
    SYSTEM_FIELD_PLACEHOLDER
} from '../dspf-edit.model/dspf-edit.model';


// Global state to store current parsed DDS elements
export let currentDdsElements: DdsElement[] = [];

/**
 * Tracks the last resolved (row, col, length) of a positioned field/constant within the current
 * record, in source order. Needed to resolve DDS's relative record format: a blank Line (row)
 * field means "continue on the same row as the preceding field/constant", and a Position (col)
 * field written as "+n" means "n blank positions after the end of that preceding field/constant" —
 * both defined relative to whatever came immediately before in this record, not to any fixed origin.
 */
let lastPositionInRecord: { row: number; col: number; length: number } | undefined;

/**
 * AND-groups accumulated so far from indicator-only continuation lines (position 7 = 'A'/blank,
 * or 'O' to start a new OR'd group — see "Condition for display files (positions 7 through 16)"
 * in the DDS reference), waiting to be attached to the next field/constant/keyword line that
 * actually names something. Per that same rule, the field/constant/keyword itself only ever
 * appears on the last line of such a group, so this buffer is folded into (and cleared by)
 * whichever real element line follows — see resolveLineIndicators.
 */
let pendingIndicatorGroups: DdsIndicator[][] = [];

/**
 * Clears any indicator-continuation lines collected so far without a terminating element line
 * (either a fresh parse, or a malformed/dangling group — e.g. before a record line, which this
 * conditioning mechanism doesn't apply to).
 */
function resetPendingIndicatorGroups(): void {
    pendingIndicatorGroups = [];
};

/**
 * True when a line is a pure indicator continuation line: it carries its own conditioning
 * indicators (columns 8-16) but no keyword text (columns 45-80) — meaning it doesn't stand on its
 * own and instead extends whichever field/constant/keyword line follows. (A field/constant name or
 * position already rules this out at the call site, via isFieldLine/isConstantLine.)
 * @param trimmedLine - Line with the sequence number area removed
 * @param indicators - This line's own indicators, already parsed from columns 8-16
 */
function isIndicatorOnlyLine(trimmedLine: string, indicators: DdsIndicator[]): boolean {
    if (indicators.length === 0) return false;
    return trimmedLine.substring(39, 75).trim() === '';
};

/**
 * Folds a line's own indicators into the pending buffer according to its column-7 marker: 'O'
 * starts a new OR'd group, 'A' (or blank, the default) extends the AND group currently being built.
 * @param marker - The line's column-7 character
 * @param indicators - The line's own indicators (columns 8-16)
 */
function accumulatePendingIndicators(marker: string, indicators: DdsIndicator[]): void {
    if (marker === 'O' && pendingIndicatorGroups.length > 0) {
        pendingIndicatorGroups.push([...indicators]);
    } else {
        if (pendingIndicatorGroups.length === 0) pendingIndicatorGroups.push([]);
        pendingIndicatorGroups[pendingIndicatorGroups.length - 1].push(...indicators);
    };
};

/**
 * Resolves the final, group-tagged indicator set for a terminating element line (one that names a
 * field/constant or carries keyword text): folds its own indicators into any pending continuation
 * groups per its own column-7 marker, then flattens the result — each indicator tagged with its
 * (zero-based) OR-group index — and clears the pending buffer. When there's nothing pending (the
 * overwhelming majority of lines), this is just the line's own indicators, all in group 0,
 * identical to the pre-continuation-support behavior.
 * @param marker - The terminating line's column-7 character
 * @param ownIndicators - The terminating line's own indicators (columns 8-16)
 */
function resolveLineIndicators(marker: string, ownIndicators: DdsIndicator[]): DdsIndicator[] {
    if (pendingIndicatorGroups.length === 0) {
        return ownIndicators.map(ind => ({ ...ind, group: 0 }));
    };

    accumulatePendingIndicators(marker, ownIndicators);
    const groups = pendingIndicatorGroups;
    resetPendingIndicatorGroups();

    return groups.flatMap((group, groupIndex) => group.map(ind => ({ ...ind, group: groupIndex })));
};

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
    lastPositionInRecord = undefined;
    resetPendingIndicatorGroups();

    // Reset both display-size slots so switching to a document with fewer (or no) DSPSIZ formats
    // doesn't leak a stale second size (e.g. *DS4) left over from a previously parsed document —
    // processDspsizAttribute below only overwrites the slots it actually finds in this document.
    setDefaultScreenSize();
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
    // True once a field/constant has been seen for currentRecord — tells parseAttributeElement
    // whether a keyword-only line (e.g. SFL placed on its own line by SDA/RDI, instead of on the
    // record name's own line) still belongs to the record itself, or to the last field/constant.
    let hasFieldInCurrentRecord = false;

    while (lineIndex < lines.length) {
        const parseResult = parseSingleDdsLine(lines, lineIndex, currentRecord, hasFieldInCurrentRecord);

        if (parseResult.element) {
            elements.push(parseResult.element);

            if (parseResult.element.kind === 'record') {
                hasFieldInCurrentRecord = false;
            } else if (parseResult.element.kind === 'field' || parseResult.element.kind === 'constant') {
                hasFieldInCurrentRecord = true;
            };
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
    lastRecord: string,
    hasFieldInCurrentRecord: boolean
): { element: DdsElement | undefined; nextIndex: number; lastRecord: string } {

    const line = lines[lineIndex];
    const trimmedLine = line.substring(5); // Skip sequence number area

    // Skip comment lines (column 7 = '*', regardless of whether column 6 is 'A' or blank)
    if (trimmedLine.charAt(1) === '*') {
        return { element: undefined, nextIndex: lineIndex, lastRecord };
    };

    // Extract common line components
    const lineComponents = extractLineComponents(trimmedLine);
    // Column 7: blank/'A' continues (or starts) an AND group, 'O' starts a new OR'd group — see
    // resolveLineIndicators/accumulatePendingIndicators.
    const conditionMarker = trimmedLine.charAt(1);

    // Determine element type and parse accordingly
    if (isRecordLine(trimmedLine)) {
        // This conditioning mechanism applies to fields/constants/keywords, not record lines —
        // drop any dangling continuation group rather than let it leak into whatever comes next.
        resetPendingIndicatorGroups();
        return parseRecordElement(lines, lineIndex, trimmedLine, lastRecord);
    };

    if (isFieldLine(lineComponents.fieldName)) {
        const indicators = resolveLineIndicators(conditionMarker, lineComponents.indicators);
        return parseFieldElement(lines, lineIndex, trimmedLine, { ...lineComponents, indicators }, lastRecord);
    };

    if (isConstantLine(lineComponents)) {
        const indicators = resolveLineIndicators(conditionMarker, lineComponents.indicators);
        return parseConstantElement(lines, lineIndex, trimmedLine, { ...lineComponents, indicators }, lastRecord);
    };

    // Neither record, field, nor constant: either a pure indicator-only continuation line (no name,
    // no keyword text — buffer it for whichever real line follows) or a keyword-only attribute line.
    if (isIndicatorOnlyLine(trimmedLine, lineComponents.indicators)) {
        accumulatePendingIndicators(conditionMarker, lineComponents.indicators);
        return { element: undefined, nextIndex: lineIndex, lastRecord };
    };

    // Default to attribute parsing. Whether this line actually carries keyword text (and so should
    // consume the pending buffer) is only known once extractAttributes runs, so the merge happens
    // inside parseAttributeElement itself — a blank/malformed line here must NOT swallow indicators
    // that are still waiting for a later line.
    return parseAttributeElement(lines, lineIndex, trimmedLine, lineComponents, lastRecord, hasFieldInCurrentRecord, conditionMarker);
};

/**
 * Extracts common components from a DDS line
 * @param trimmedLine - Line with sequence number area removed
 * @returns Object containing parsed line components
 */
function extractLineComponents(trimmedLine: string) {
    const conditionZone = trimmedLine.substring(2, 11);
    // The same zone that normally holds up to 3 indicators can instead hold a display format
    // name (e.g. "*DS3"), conditioning the line to only apply under that DSPSIZ format.
    const displayFormat = parseDisplayFormatCondition(conditionZone);
    const indicators = displayFormat ? [] : parseDdsIndicators(conditionZone);
    const fieldName = trimmedLine.substring(13, 23).trim();
    const rowText = trimmedLine.substring(33, 36).trim();
    const colText = trimmedLine.substring(36, 39).trim();
    const row = rowText ? Number(rowText) : undefined;
    // A Position entry of "+n" (DDS relative record format) is placed n blank positions after the
    // end of the preceding field/constant, rather than at absolute column n. Number("+1") already
    // evaluates to 1, so the magnitude is captured the same way — this flag is what tells
    // resolvePosition to treat it as an offset instead of an absolute column.
    const colRelative = colText.startsWith('+');
    const col = colText ? Number(colText) : undefined;

    return { indicators, fieldName, row, col, colRelative, displayFormat };
};

/**
 * Resolves a field/constant's actual (row, col) from the raw values read off the DDS source,
 * applying the DDS relative record format rules (see extractLineComponents): a blank Line (row)
 * continues on the same row as the immediately preceding positioned field/constant in this record,
 * and a Position (col) written as "+n" is placed n blank positions after that preceding element's
 * end column. Falls back to treating "+n" as an absolute column when there is no preceding element
 * to be relative to (malformed source).
 * @param row - Row read from columns 39-41; undefined means the field was left blank
 * @param col - Col read from columns 42-44; undefined means the field was left blank
 * @param colRelative - True when the Position field was written as "+n"
 */
function resolvePosition(
    row: number | undefined,
    col: number | undefined,
    colRelative: boolean
): { row: number | undefined; col: number | undefined } {
    if (row === undefined && col === undefined) {
        return { row, col };
    };

    const resolvedRow = row !== undefined ? row : lastPositionInRecord?.row;

    let resolvedCol = col;
    if (colRelative && col !== undefined) {
        const previousEndCol = lastPositionInRecord
            ? lastPositionInRecord.col + lastPositionInRecord.length
            : 0;
        resolvedCol = previousEndCol + col;
    };

    return { row: resolvedRow, col: resolvedCol };
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
 * Checks if the line represents a constant definition. The Line (row) entry is legitimately blank
 * under the DDS relative record format — it means "same row as the preceding field/constant" — so
 * only the Position (col) entry is required here; row is resolved later via resolvePosition.
 * @param components - Extracted line components
 * @returns True if line is a constant definition
 */
function isConstantLine(components: { fieldName: string; row?: number; col?: number }): boolean {
    return !components.fieldName && Boolean(components.col);
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

    // A new record always starts with an explicit absolute position — relative "+n"/blank-row
    // notation is only relative to a preceding field/constant within the same record.
    lastPositionInRecord = undefined;

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
/**
 * System-defined length for DDS data types whose length is never written in the source's length
 * columns (position 30-34) — DDS itself derives it, so those columns are legitimately left blank.
 * Matches the defaults `edit-field.ts`'s `getSystemDefinedLength` uses when creating one of these.
 */
const FIXED_LENGTH_BY_TYPE: Record<string, number> = { L: 10, T: 8, Z: 26 };

/**
 * Extracts a referenced field's REFFLD() target: the field name (and, optionally, its qualified
 * database file) whose type/length/decimals this field borrows. Matches the format dspf-edit
 * itself generates (see `generateNewFieldLine` in edit-field.ts): REFFLD(field-name {library/}file-name).
 * The field name may itself be qualified with a record format name (record-format-name/field-name)
 * — needed when the referenced file has more than one record format containing a field with that
 * name, to say which format's definition to borrow from.
 * Falls back to the field's own name when there's no REFFLD (a bare "R" referencing a file/record
 * -level REF() under the same field name).
 * @param attributes - The field's own DDS attributes
 * @param ownName - The field's own name, used as the fallback reference target
 */
function parseReffldTarget(attributes: DdsAttribute[] | undefined, ownName: string): { fieldName: string; file?: string; library?: string; recordFormat?: string } {
    const attr = attributes?.find(a => a.value.toUpperCase().startsWith('REFFLD('));
    if (!attr) {
        return { fieldName: ownName };
    };

    const match = attr.value.match(/^REFFLD\(\s*(\S+)(?:\s+(\S+))?\s*\)$/i);
    if (!match) {
        return { fieldName: ownName };
    };

    const [, fieldSpec, qualifiedFile] = match;
    const slashIndex = fieldSpec.indexOf('/');
    const recordFormat = slashIndex >= 0 ? fieldSpec.slice(0, slashIndex) : undefined;
    const fieldName = slashIndex >= 0 ? fieldSpec.slice(slashIndex + 1) : fieldSpec;

    if (!qualifiedFile) {
        return { fieldName, recordFormat };
    };

    const [library, file] = qualifiedFile.includes('/') ? qualifiedFile.split('/') : [undefined, qualifiedFile];
    return { fieldName, file, library, recordFormat };
};

function parseFieldElement(
    lines: string[],
    lineIndex: number,
    trimmedLine: string,
    components: any,
    lastRecord: string
) {
    const type = trimmedLine[29];
    const length = Number(trimmedLine.substring(24, 29).trim()) || FIXED_LENGTH_BY_TYPE[type] || 0;
    // A truly blank decimal-positions column (vs. an explicit "0") is kept as `undefined`, not
    // coerced to 0 — with a blank Type column too, that blank/non-blank distinction is exactly
    // what tells a plain zoned-numeric field (Type blank, decimals given, even 0) apart from a
    // plain alphanumeric one (Type blank, decimals also blank). See isNumeric in
    // dspf-edit.record-preview-panel.ts and isNumericField in dspf-edit.add-editing-keywords.ts.
    const decimalsRaw = trimmedLine.substring(30, 32).trim();
    const decimals = decimalsRaw !== '' ? Number(decimalsRaw) : undefined;
    const usage = trimmedLine[32] !== ' ' ? trimmedLine[32] : ' ';
    const isHidden = trimmedLine[32] === 'H';
    const isReferenced = trimmedLine[23] === 'R';

    const { attributes, nextIndex } = extractAttributes('F', lines, lineIndex, true, components.indicators, components.displayFormat);
    const refTarget = isReferenced ? parseReffldTarget(attributes, components.fieldName) : undefined;

    // Check if the current record (lastRecord) is a subfile by looking at its attributes
    const currentRecordEntry = fieldsPerRecords.find(r => r.record === lastRecord);
    const isSubfile = currentRecordEntry ? isSubfileRecord(currentRecordEntry.attributes) : false;

    // Resolve DDS relative record format ("+n" position, blank line) against the preceding
    // field/constant in this record, using the raw (pre-subfile-swap) row/col as written in source.
    const { row: resolvedRow, col: resolvedCol } = resolvePosition(components.row, components.col, components.colRelative);

    // For subfiles, swap row and column positions
    let finalRow = resolvedRow;
    let finalCol = resolvedCol;

    if (isSubfile && !isHidden) {
        // In subfiles, the positions are swapped: what appears in the "row" position is actually the column,
        // and what appears in the "column" position is actually the row
        finalRow = resolvedCol;
        finalCol = resolvedRow;
    };

    if (!isHidden && resolvedRow !== undefined && resolvedCol !== undefined) {
        // A bare system keyword field (DATE/TIME/USER/SYSNAME) renders at its fixed placeholder
        // width, not the declared DDS length (usually 0, since none is coded) — use that width here
        // so a following "+n" relative position lands after the actual rendered text, not the source length.
        const systemWidth = SYSTEM_FIELD_PLACEHOLDER[String(components.fieldName).trim().toUpperCase()]?.length;
        lastPositionInRecord = { row: resolvedRow, col: resolvedCol, length: systemWidth ?? length };
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
        refTarget: refTarget,
        lineIndex: lineIndex,
        recordname: lastRecord,
        attributes: attributes || [],
        indicators: components.indicators || undefined,
        displayFormat: components.displayFormat,
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
    const { attributes, nextIndex } = extractAttributes('C', lines, lastLineIndex, true, components.indicators, components.displayFormat);

    // Check if the current record (lastRecord) is a subfile by looking at its attributes
    const currentRecordEntry = fieldsPerRecords.find(r => r.record === lastRecord);
    const isSubfile = currentRecordEntry ? isSubfileRecord(currentRecordEntry.attributes) : false;

    // Resolve DDS relative record format ("+n" position, blank line) against the preceding
    // field/constant in this record, using the raw (pre-subfile-swap) row/col as written in source.
    const { row: resolvedRow, col: resolvedCol } = resolvePosition(components.row, components.col, components.colRelative);

    // For subfiles, swap row and column positions
    let finalRow = resolvedRow;
    let finalCol = resolvedCol;

    if (isSubfile) {
        finalRow = resolvedCol;
        finalCol = resolvedRow;
    };

    if (resolvedRow !== undefined && resolvedCol !== undefined) {
        // A bare system keyword constant (DATE/TIME/USER/SYSNAME) renders at its fixed placeholder
        // width, not its raw source text length — use that width here so a following "+n" relative
        // position lands after the actual rendered text, not the source keyword's length.
        const strippedValue = stripConstantQuotes(fullValue);
        const systemWidth = SYSTEM_FIELD_PLACEHOLDER[strippedValue.trim().toUpperCase()]?.length;
        lastPositionInRecord = { row: resolvedRow, col: resolvedCol, length: systemWidth ?? strippedValue.length };
    };

    const element = {
        kind: 'constant' as const,
        name: fullValue,
        // Falls back to 0 only for malformed source (blank Line with no preceding field/constant
        // in this record to inherit a row from) — DdsConstant.row/column are non-optional.
        row: finalRow ?? 0,
        column: finalCol ?? 0,
        lineIndex: lineIndex,
        lastLineIndex: lastLineIndex,
        recordname: lastRecord,
        attributes: attributes || [],
        indicators: components.indicators,
        displayFormat: components.displayFormat
    };

    return { element, nextIndex: lastLineIndex, lastRecord };
};

/**
 * Extracts multi-line constant values, following continuation characters.
 * The value area is the standard DDS keyword-area window, columns 45-80 (36 characters,
 * `substring(39, 75)` on the already-5-char-stripped line) — matching `extractAttributes`
 * elsewhere in this file. A line continues onto the next when the last *non-blank* character
 * in that window is a hyphen — the compiler does not require it to sit exactly at column 80,
 * since a still-open (unterminated) quoted string followed only by blanks and a trailing '-'
 * is unambiguous. Source lines are frequently shorter than 80 columns once trailing blanks are
 * stripped (e.g. by an editor that doesn't pad DDS source), so anchoring the check to raw column
 * 80 missed the dash entirely and left each physical line parsed as its own broken constant.
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

    let fullValue = trimmedLine.substring(39, 75);
    let continuationIndex = startIndex;

    // Follow continuation lines (marked with a trailing '-', wherever it falls before column 80)
    while (fullValue.trimEnd().endsWith('-')) {
        const trimmedEnd = fullValue.trimEnd();
        fullValue = trimmedEnd.substring(0, trimmedEnd.length - 1); // Drop the dash and any padding after it

        continuationIndex++;
        const nextLine = lines[continuationIndex];
        if (!nextLine) break;

        const nextTrimmed = nextLine.substring(5);
        fullValue += nextTrimmed.substring(39, 75);
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
    lastRecord: string,
    hasFieldInCurrentRecord: boolean,
    conditionMarker: string
) {
    // Extract with the line's own (unmerged) indicators first — extractAttributes returns an empty
    // array whenever there's no actual keyword text, and only then do we know whether this line is
    // real or a blank/malformed one. Only a real line may consume the pending continuation buffer
    // (see the comment at this function's call site).
    const { attributes, nextIndex } = extractAttributes('A', lines, lineIndex, true, components.indicators, components.displayFormat);

    if (attributes.length > 0) {
        // Now that we know this line carries a real keyword, fold it (and any pending
        // continuation groups) into the attribute's final, group-tagged indicator set.
        const indicators = resolveLineIndicators(conditionMarker, components.indicators);
        attributes.forEach(attr => { attr.indicators = indicators; });

        // A keyword-only line with no field/constant seen yet since the record line belongs to the
        // record itself (e.g. SFL placed on its own line by SDA/RDI instead of the record name's
        // own line). linkAttributesToParents() links it into the record element too, but only after
        // the whole document has been parsed — too late for isSubfileRecord() checks made earlier in
        // this same pass (see parseFieldElement/parseConstantElement). Updating fieldsPerRecords here,
        // as soon as the keyword is read, makes it visible to every field/constant parsed afterwards.
        // syncRecordAttributes() overwrites this with the final, equivalent list once parsing ends.
        if (!hasFieldInCurrentRecord && lastRecord) {
            const currentRecordEntry = fieldsPerRecords.find(r => r.record === lastRecord);
            if (currentRecordEntry) {
                currentRecordEntry.attributes = [...(currentRecordEntry.attributes || []), ...attributes];
            };
        };

        const maxLastLineIndex = attributes.reduce(
            (max, attr) => Math.max(max, attr.lastLineIndex ?? lineIndex),
            lineIndex
        );
        const element = {
            kind: 'attribute' as const,
            lineIndex: lineIndex,
            lastLineIndex: maxLastLineIndex,
            value: '',
            indicators: indicators,
            displayFormat: components.displayFormat,
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
 * Detects a display format condition (e.g. "*DS3", "*DS4") in the same 9-character zone that
 * normally holds indicators. A DDS line can be conditioned on a named DSPSIZ format instead of
 * (or as well as) indicators, so this must be checked before treating that zone as indicators —
 * otherwise the "*DS3" text gets misread as garbage indicator data.
 * @param input - 9-character string containing indicator specifications or a format condition
 * @returns The format name (e.g. "*DS3") if present, else undefined
 */
export function parseDisplayFormatCondition(input: string): string | undefined {
    const match = input.trim().match(/^(\*[A-Z0-9]+)/i);
    return match ? match[1].toUpperCase() : undefined;
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
    indicators?: DdsIndicator[],
    displayFormat?: string
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
        indicators: includeIndicators && indicators ? indicators : [],
        displayFormat: includeIndicators ? displayFormat : undefined
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
    // ddsElements is already in source line order (parseAllLines pushes each element as it parses
    // lines top to bottom), so the nearest preceding record is simply the last 'record' element
    // seen so far in a single forward pass — no need to rescan the whole array per field/constant.
    let currentRecord: DdsRecord | undefined;

    // Per-record dedup sets, keyed by the record's own fieldsPerRecords entry (a stable object
    // reference for its lifetime here) — an O(1) alternative to rescanning recordEntry.fields/
    // .constants (which only grow) on every single field/constant, an O(n²) hotspot at scale.
    const seenFieldNames = new Map<any, Set<string>>();
    const seenConstantLines = new Map<any, Set<number>>();

    for (const element of ddsElements) {
        if (element.kind === 'record') {
            currentRecord = element;
            continue;
        };

        if ((element.kind === 'field' || element.kind === 'constant') && currentRecord) {
            const recordEntry = fieldsPerRecords.find(r => r.record === currentRecord!.name);

            if (recordEntry) {
                if (element.kind === 'field') {
                    let names = seenFieldNames.get(recordEntry);
                    if (!names) {
                        names = new Set();
                        seenFieldNames.set(recordEntry, names);
                    };
                    addFieldToRecord(element, recordEntry, names);
                } else {
                    let lines = seenConstantLines.get(recordEntry);
                    if (!lines) {
                        lines = new Set();
                        seenConstantLines.set(recordEntry, lines);
                    };
                    addConstantToRecord(element, recordEntry, lines);
                };
            };
        };
    };
};

/**
 * Adds a field element to its parent record entry, unless a field of the same name was already
 * added to it (tracked via `seenFieldNames`, an O(1) alternative to rescanning recordEntry.fields).
 * @param field - Field element to add
 * @param recordEntry - Record entry to add field to
 * @param seenFieldNames - Field names already added to this record entry
 */
function addFieldToRecord(field: any, recordEntry: any, seenFieldNames: Set<string>): void {
    // Avoid duplicate fields
    if (!seenFieldNames.has(field.name)) {
        seenFieldNames.add(field.name);

        // Process attributes preserving their indicators
        const processedAttributes = field.attributes?.map((attr: any) => ({
            value: attr.value,
            indicators: attr.indicators || [],
            lineIndex: attr.lineIndex,
            lastLineIndex: attr.lastLineIndex ?? attr.lineIndex,
            displayFormat: attr.displayFormat
        })).filter((attr: any) => attr.value) || [];

        recordEntry.fields.push({
            name: field.name,
            type: field.type,
            usage: field.usage,
            row: field.row || 0,
            col: field.column || 0,
            length: field.length || 0,
            decimals: field.decimals,
            referenced: field.referenced,
            attributes: processedAttributes,
            indicators: field.indicators || [],
            lineIndex: field.lineIndex,
            lastLineIndex: field.lastLineIndex || field.lineIndex,
            displayFormat: field.displayFormat
        });
    }
};

/**
 * Removes quotes from a constant's raw name for storage/length purposes — but only when it's
 * actually a quoted literal. A DDS system keyword (DATE, TIME, USER, SYSNAME) can be coded bare, in
 * the same position a quoted constant would occupy; blindly slicing it would eat its first/last letter.
 * @param rawName - Raw constant text as read from the source (may or may not be quoted)
 */
function stripConstantQuotes(rawName: string): string {
    return rawName.length >= 2 && rawName.startsWith("'") && rawName.endsWith("'")
        ? rawName.slice(1, -1)
        : rawName;
};

/**
 * Adds a constant element to its parent record entry, unless this exact source line was already
 * added to it (tracked via `seenLineIndexes`, an O(1) alternative to rescanning recordEntry.constants).
 * @param constant - Constant element to add
 * @param recordEntry - Record entry to add constant to
 * @param seenLineIndexes - Line indexes already added to this record entry
 */
function addConstantToRecord(constant: any, recordEntry: any, seenLineIndexes: Set<number>): void {
    const constantName = stripConstantQuotes(constant.name);

    // Process attributes preserving their indicators
    const processedAttributes = constant.attributes?.map((attr: any) => ({
        value: attr.value,
        indicators: attr.indicators || [],
        lineIndex: attr.lineIndex,
        lastLineIndex: attr.lastLineIndex ?? attr.lineIndex,
        displayFormat: attr.displayFormat
    })).filter((attr: any) => attr.value) || [];

    // Guards against this same source line being linked twice — not against two constants sharing
    // identical text: DDS pixel-art constructions legitimately repeat the same blank/space text
    // (e.g. '   ' or ' ') at dozens of different positions to build a colored block pattern, and
    // comparing by text alone (as this used to) silently dropped all but the first of each.
    if (!seenLineIndexes.has(constant.lineIndex)) {
        seenLineIndexes.add(constant.lineIndex);
        recordEntry.constants.push({
            name: constantName,
            type: undefined,
            row: constant.row || 0,
            col: constant.column || 0,
            length: constantName.length,
            attributes: processedAttributes,
            indicators: constant.indicators || [],
            lineIndex: constant.lineIndex,
            lastLineIndex: constant.lastLineIndex,
            displayFormat: constant.displayFormat
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
    } else {
        // No second format in this document — clear it explicitly rather than leaving whatever
        // was there before (relevant if this is ever called more than once per parse).
        fileSizeAttributes.maxRow2 = 0;
        fileSizeAttributes.maxCol2 = 0;
        fileSizeAttributes.nameDsply2 = '';
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
 * Assigns default size or WINDOW-specific size to each record.
 * Handles both forms of the WINDOW() keyword: the direct
 * WINDOW(startRow startCol numRows numCols), and the shared-window reference
 * WINDOW(other-record-name) — commonly used by a subfile's SFLCTL record to reuse the same
 * window as another record (e.g. one that carries the WDWTITLE and footer text). It also
 * propagates a window's size across an SFL/SFLCTL pair when only one side of the pair declares it,
 * since both halves occupy the exact same screen area.
 * @param ddsElements - Array of all parsed DDS elements
 */
function processRecordSizes(ddsElements: DdsElement[]): void {
    const recordElements = ddsElements.filter(el => el.kind === 'record') as DdsRecord[];
    const sizeByRecord = computeSizeByRecord(recordElements);

    for (const record of recordElements) {
        record.size = sizeByRecord.get(record.name) ?? getDefaultSize();

        // Also update the fieldsPerRecords structure for easy access
        const recordEntry = fieldsPerRecords.find(r => r.record === record.name);
        if (recordEntry) {
            recordEntry.size = record.size;
        };
    };
};

/**
 * Computes each record's WINDOW-derived size: direct definition, WINDOW(other-record-name)
 * references (following chains, guarding against cycles), and SFL/SFLCTL pair propagation.
 * Shared by the parse-time cached resolution (processRecordSizes, format-oblivious — always picks
 * the first WINDOW candidate) and the live, display-format-aware resolution used by the preview
 * (resolveRecordSizeForFormat) when a record is conditioned by more than one DSPSIZ format.
 * @param recordElements - All parsed records
 * @param activeFormat - Selected display format name (e.g. "*DS3") to prefer when a record has
 * more than one WINDOW() candidate; undefined to always take the first candidate (original behavior)
 */
function computeSizeByRecord(recordElements: DdsRecord[], activeFormat?: string): Map<string, DdsSize> {
    const sizeByRecord = new Map<string, DdsSize>();
    const referenceByRecord = new Map<string, string>();

    for (const record of recordElements) {
        const extracted = extractWindowSize(record.attributes, activeFormat);
        if (extracted?.size) {
            sizeByRecord.set(record.name, extracted.size);
        } else if (extracted?.referenceName) {
            referenceByRecord.set(record.name, extracted.referenceName);
        };
    };

    // Resolve WINDOW(other-record-name) references, following chains and guarding against cycles.
    for (const [recordName, referenceName] of referenceByRecord) {
        const visited = new Set<string>([recordName]);
        let ownerName = referenceName;
        while (referenceByRecord.has(ownerName) && !sizeByRecord.has(ownerName) && !visited.has(ownerName)) {
            visited.add(ownerName);
            ownerName = referenceByRecord.get(ownerName)!;
        };

        const ownerSize = sizeByRecord.get(ownerName);
        if (ownerSize) {
            sizeByRecord.set(recordName, { ...ownerSize, sharedFromRecord: ownerSize.sharedFromRecord ?? ownerName });
        };
    };

    propagateSubfileWindowSizes(recordElements, sizeByRecord);

    return sizeByRecord;
};

/**
 * Live, display-format-aware version of the WINDOW size resolution done by processRecordSizes at
 * parse time. Used by the preview panel to recompute a record's effective size on the fly when
 * the user switches display format (*DS3/*DS4), without needing a re-parse — some records
 * (typically a subfile's SFLCTL, or a window that reuses another record's WINDOW) declare a
 * different WINDOW() for each format, one line per format, conditioned on that format's name.
 * @param recordName - Name of the record to resolve
 * @param activeFormat - Selected display format name (e.g. "*DS3")
 */
export function resolveRecordSizeForFormat(recordName: string, activeFormat: string): DdsSize {
    const recordElements = currentDdsElements.filter(el => el.kind === 'record') as DdsRecord[];
    const sizeByRecord = computeSizeByRecord(recordElements, activeFormat);
    return sizeByRecord.get(recordName) ?? getSizeForFormat(activeFormat) ?? getDefaultSize();
};

/**
 * Filters out attributes/fields/constants conditioned by a display format other than the active
 * one; unconditioned ones (and everything, when no format is active) always pass through.
 * @param items - Items carrying an optional displayFormat condition
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
export function filterForActiveFormat<T extends { displayFormat?: string }>(items: T[], activeFormat: string | undefined): T[] {
    if (!activeFormat) {
        return items;
    };
    return items.filter(item => !item.displayFormat || item.displayFormat === activeFormat);
};

/**
 * Picks which of several same-keyword candidates applies, when a record/field/constant is
 * conditioned by more than one display format (one line per format, e.g. WDWTITLE or SFLPAG
 * declared once for *DS3 and once for *DS4). Prefers the one matching activeFormat, falling back
 * to an unconditioned one, then to the first candidate — so behavior is unchanged when no format
 * is active.
 * @param candidates - Same-keyword attribute candidates, in source order
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
export function pickForActiveFormat<T extends { displayFormat?: string }>(candidates: T[], activeFormat?: string): T | undefined {
    if (candidates.length === 0) {
        return undefined;
    };
    if (!activeFormat) {
        return candidates[0];
    };
    return candidates.find(c => c.displayFormat === activeFormat)
        ?? candidates.find(c => !c.displayFormat)
        ?? candidates[0];
};

/**
 * Shares a window's size across an SFL/SFLCTL pair when only one side declares WINDOW(): the
 * subfile detail (SFL) record and its control (SFLCTL) record occupy the exact same screen area,
 * but the WINDOW() keyword (direct or shared-reference) commonly sits on just one of them.
 * @param recordElements - All parsed records
 * @param sizeByRecord - Sizes resolved so far (direct + reference), mutated in place
 */
function propagateSubfileWindowSizes(recordElements: DdsRecord[], sizeByRecord: Map<string, DdsSize>): void {
    const findSflCtlPairName = (sflName: string): string | undefined => {
        const ctlRecord = recordElements.find(r =>
            r.attributes?.some(attr => {
                const match = attr.value.match(/^SFLCTL\(\s*([A-Za-z0-9@#$]+)\s*\)$/i);
                return Boolean(match && match[1].toUpperCase() === sflName.toUpperCase());
            })
        );
        return ctlRecord?.name;
    };

    const findSflNameFromCtl = (ctlRecord: DdsRecord): string | undefined => {
        const attr = ctlRecord.attributes?.find(a => a.value.toUpperCase().startsWith('SFLCTL('));
        return attr?.value.match(/^SFLCTL\(\s*([A-Za-z0-9@#$]+)\s*\)$/i)?.[1];
    };

    for (const record of recordElements) {
        if (sizeByRecord.has(record.name)) {
            continue;
        };

        const pairName = isSubfileRecord(record.attributes)
            ? findSflCtlPairName(record.name)
            : findSflNameFromCtl(record);

        const pairSize = pairName ? sizeByRecord.get(pairName) : undefined;
        if (pairSize) {
            sizeByRecord.set(record.name, { ...pairSize, sharedFromRecord: pairSize.sharedFromRecord ?? pairName });
        };
    };
};

/**
 * Picks which of a record's WINDOW() attribute candidates applies. A record can have more than
 * one when it's conditioned by different DSPSIZ display formats (*DS3/*DS4), one WINDOW() line
 * per format. Prefers the one matching activeFormat, falling back to an unconditioned one, then to
 * the first candidate in source order — that last fallback is what makes this format-oblivious
 * (always "first WINDOW wins") when no activeFormat is given, preserving the original behavior for
 * the parse-time cached size.
 * @param attributes - Record attributes to search
 * @param activeFormat - Selected display format name (e.g. "*DS3"), or undefined
 */
function pickWindowAttribute(attributes: DdsAttribute[] | undefined, activeFormat?: string): DdsAttribute | undefined {
    const candidates = (attributes ?? []).filter(attr => attr.value.toUpperCase().startsWith('WINDOW('));
    if (candidates.length === 0) {
        return undefined;
    };
    if (!activeFormat) {
        return candidates[0];
    };
    return candidates.find(attr => attr.displayFormat === activeFormat)
        ?? candidates.find(attr => !attr.displayFormat)
        ?? candidates[0];
};

/**
 * Extracts WINDOW size information from record attributes. Supports both the direct form,
 * WINDOW(startRow startCol numRows numCols), and the shared-window reference form,
 * WINDOW(other-record-name), which is resolved later against the other record's own size.
 * @param attributes - Record attributes to search
 * @param activeFormat - Selected display format name (e.g. "*DS3"), to pick the right candidate
 * when the record has more than one WINDOW() line (one per DSPSIZ format)
 * @returns The resolved size (direct form), a reference name to resolve later (name form), or undefined
 */
function extractWindowSize(attributes?: DdsAttribute[], activeFormat?: string): { size?: DdsSize; referenceName?: string } | undefined {
    const windowAttribute = pickWindowAttribute(attributes, activeFormat);
    if (!windowAttribute) return undefined;

    // WINDOW(startRow startCol numRows numCols [*NOMSGLIN | *RESTORE | *PRINT])
    const windowMatch = windowAttribute.value.match(
        /WINDOW\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+[^)]*)?\s*\)/i
    );
    if (windowMatch) {
        const startRow = parseInt(windowMatch[1], 10);
        const startCol = parseInt(windowMatch[2], 10);
        const rows = parseInt(windowMatch[3], 10);
        const cols = parseInt(windowMatch[4], 10);

        return {
            size: {
                rows,
                cols,
                name: `WINDOW_${startRow}_${startCol}_${rows}_${cols}`,
                source: 'window',
                originRow: startRow,
                originCol: startCol
            }
        };
    };

    // WINDOW(other-record-name): reuses the window defined by another record.
    const referenceMatch = windowAttribute.value.match(/WINDOW\s*\(\s*([A-Za-z0-9@#$]+)\s*\)/i);
    if (referenceMatch) {
        return { referenceName: referenceMatch[1] };
    };

    return undefined;
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
