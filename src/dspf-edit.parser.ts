/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.parser.ts
*/

import { DdsElement, DdsRecord, DdsIndicator, DdsFile, DdsAttribute, fileSizeAttributes, records, fieldsPerRecords } from './dspf-edit.model';

export let currentDdsElements: DdsElement[] = [];

export function parseDocument(text: string): DdsElement[] {
    const lines = text.split(/\r?\n/);
    const ddsElements: DdsElement[] = [];
    records.length = 0;
    fieldsPerRecords.length = 0;

    // Adds element 'file' as root
    const file: DdsFile = {
        kind: 'file',
        lineIndex: 0,
        attributes: []
    };
    ddsElements.push(file);

    // Go through all lines and parse them
    let record = '';
    let i = 0;
    while (i < lines.length) {
        const { element, nextIndex, lastrecord } = parseDdsLine(lines, i, record);
        if (element) ddsElements.push(element);
        record = lastrecord;

        i = nextIndex + 1;
    };

    // Let's put the attributes with their "parents"
    for (const el of ddsElements) {
        if (el.kind === 'attribute') {
            const parent = [...ddsElements]
                .reverse()
                .find(p =>
                    p.lineIndex < el.lineIndex &&
                    (p.kind === 'field' || p.kind === 'constant' || p.kind === 'record' || p.kind === 'file')
                );
            if (parent) {
                parent.attributes = [...(parent.attributes || []), ...(el.attributes || [])];
            };
        };
    };

    // Let's put the fields and constants with their "parents" (in the fieldsPerRecords structure)
    // and the attributes with their fields and constants
    for (const el of ddsElements) {
        if ((el.kind === 'field' && el.hidden != true) || el.kind === 'constant') {
            const parentRecord = [...ddsElements]
                .reverse()
                .find(p =>
                    p.lineIndex < el.lineIndex &&
                    p.kind === 'record'
                ) as DdsRecord | undefined;

            if (parentRecord) {
                const recordEntry = fieldsPerRecords.find(r => r.record === parentRecord.name);
                if (recordEntry) {
                    if (el.kind === 'field') {
                        if (!recordEntry.fields.some(field => field.name === el.name)) {
                            recordEntry.fields.push({
                                name: el.name,
                                row: el.row ? el.row : 0,
                                col: el.column ? el.column : 0,
                                length: el.length ? el.length : 0,
                                attributes: el.attributes?.map(attr => attr.value).filter(Boolean) || []
                            });
                        };
                    }
                    else if (el.kind === 'constant') {
                        if (!recordEntry.constants.some(constant => constant.name === el.name)) {
                            recordEntry.constants.push({
                                name: el.name.slice(1, -1),
                                row: el.row ? el.row : 0,
                                col: el.column ? el.column : 0,
                                length: el.name.slice(1, -1).length,
                                attributes: el.attributes?.map(attr => attr.value).filter(Boolean) || []
                            });
                        };
                    };
                };
            };
        };
    };

    if (file.attributes && file.attributes.length > 0) {
        ddsElements.push({
            kind: 'group',
            lineIndex: file.lineIndex,
            attribute: 'Attributes',
            attributes: file.attributes ? file.attributes : [],
            children: []
        });
        // Retrieves the "size" of the screen from the DSPSIZ file attribute
        const dspsizLine = file.attributes.find(line => line.value.includes("DSPSIZ("));
        if (dspsizLine) {
            const matchAll = dspsizLine.value.match(/DSPSIZ\s*\(([^)]+)\)/i);

            if (matchAll) {
                const inside = matchAll[1].trim();
                const sizeRegex = /(\d+)\s+(\d+)(?:\s+([^\s)]+))?/g;

                let sizes: { row: number; col: number; name: string }[] = [];
                let m;
                while ((m = sizeRegex.exec(inside)) !== null) {
                    sizes.push({
                        row: parseInt(m[1], 10),
                        col: parseInt(m[2], 10),
                        name: m[3] ? m[3] : ''
                    });
                };
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
        };
    };
    /* Pending TODO
    // - Check indicators!!

    for (const rec of fieldsPerRecords) {
        const overlaps = findOverlapsInRecord(rec);
        if (overlaps.length > 0) {
            vscode.window.showWarningMessage(`Overlaping found on ${rec.record}`);
        };
    };
    */
   
    currentDdsElements = ddsElements;

    return ddsElements.filter(el => el.kind !== 'attribute');
};

function parseDdsLine(lines: string[], lineIndex: number, lastrecord: string): { element: DdsElement | undefined; nextIndex: number; lastrecord: string } {
    const line = lines[lineIndex];
    const trimmed = line.substring(5);

    if (trimmed.startsWith('A*')) return { element: undefined, nextIndex: lineIndex, lastrecord: lastrecord };

    const indicators = parseDdsIndicators(trimmed.substring(2, 11));
    const fieldName = trimmed.substring(13, 23).trim();
    const rowText = trimmed.substring(34, 37).trim();
    const colText = trimmed.substring(36, 39).trim();
    const row = rowText ? Number(rowText) : undefined;
    const col = colText ? Number(colText) : undefined;

    // "Record"
    if (trimmed[11] === 'R') {
        const name = trimmed.substring(13, 23).trim();
        lastrecord = name;
        const { attributes, nextIndex } = extractAttributes('R', lines, lineIndex, false);
        records.push(name);
        fieldsPerRecords.push({ record: name, fields: [], constants: [] });

        return {
            element: {
                kind: 'record',
                lineIndex,
                name,
                attributes
            },
            nextIndex,
            lastrecord
        };
    };

    // "Field"
    if (fieldName) {
        const type = trimmed[29];
        const length = Number(trimmed.substring(27, 29).trim());
        const decimals = trimmed.substring(30, 32) !== ' ' ? Number(trimmed.substring(30, 32).trim()) : 0;
        const usage = trimmed[32] !== ' ' ? trimmed[32] : ' ';
        const isHidden = trimmed[32] === 'H';
        const isReferenced = trimmed[23] === 'R';
        const { attributes, nextIndex } = extractAttributes('F', lines, lineIndex, true, indicators);
        return {
            element: {
                kind: 'field',
                name: fieldName,
                type: type,
                length: length,
                decimals: decimals,
                usage: usage,
                row: isHidden ? undefined : row,
                column: isHidden ? undefined : col,
                hidden: isHidden,
                referenced: isReferenced,
                lineIndex: lineIndex,
                recordname: lastrecord,
                attributes: attributes ? attributes : [],
                indicators: indicators || undefined,
            },
            nextIndex,
            lastrecord
        };
    };

    // "Constant"
    if (!fieldName && row && col) {
        let fullValue = trimmed.substring(39, 79);
        let continuationIndex = lineIndex;

        while (lines[continuationIndex].charAt(79) === '-') {
            continuationIndex++;
            const nextLine = lines[continuationIndex];
            if (!nextLine) break;

            const nextTrimmed = nextLine.substring(5);
            const continuedValue = nextTrimmed.substring(39, 79);
            fullValue = fullValue.slice(0, -1) + continuedValue;
        };

        const value = fullValue.trim();

        const { attributes, nextIndex } = extractAttributes('C', lines, continuationIndex, true, indicators);
        return {
            element: {
                kind: 'constant',
                name: value,
                row: row,
                column: col,
                lineIndex: lineIndex,
                recordname: lastrecord,
                attributes: attributes ? attributes : [],
                indicators: indicators
            },
            nextIndex: continuationIndex,
            lastrecord
        };
    };

    // "Attributes"
    const { attributes, nextIndex } = extractAttributes('A', lines, lineIndex, true, indicators);
    if (attributes.length > 0) {
        return {
            element: {
                kind: 'attribute',
                lineIndex: lineIndex,
                value: '',
                indicators: indicators,
                attributes: attributes ? attributes : []
            },
            nextIndex,
            lastrecord
        };
    };

    return { element: undefined, nextIndex: lineIndex, lastrecord };
};

// Parse indicators inside a string and return DdsIndicator[]
export function parseDdsIndicators(input: string): DdsIndicator[] {
    const indicators: DdsIndicator[] = [];

    for (let i = 0; i < 3; i++) {
        const segment = input.slice(i * 3, i * 3 + 3);
        const activeChar = segment[0] || ' ';
        const numberStr = segment.slice(1).trim();
        if (numberStr === '') continue;
        indicators.push(
            {
                active: activeChar !== 'N',
                number: parseInt(numberStr, 10)
            }
        );
    };
    indicators.sort((a, b) => a.number - b.number);

    return indicators;
};

// Extracts attributes
function extractAttributes(lineType: string, lines: string[], startIndex: number, getInd: boolean, indicators?: DdsIndicator[]): { attributes: DdsAttribute[]; nextIndex: number } {
    let raw = '';
    let currentIndex = startIndex;

    while (currentIndex < lines.length) {
        const line = lines[currentIndex];
        const trimmed = line.substring(5);
        const part = trimmed.substring(39, 75);
        raw += part.replace(/-$/, '');
        if (!part.trim().endsWith('-')) break;
        currentIndex++;
    };

    raw = raw.trim();
    if (!raw) return { attributes: [], nextIndex: currentIndex };

    if (lineType === 'C' && currentIndex === startIndex) {
        return { attributes: [], nextIndex: currentIndex };
    } else {
        const attribute: DdsAttribute = {
            kind: 'attribute',
            lineIndex: currentIndex,
            value: lineType === 'C' ? '' : raw,
            indicators: getInd && indicators ? indicators : []
        };
        return { attributes: [attribute], nextIndex: currentIndex };
    };
};

export function getAllDdsElements(text: string): DdsElement[] {
    return parseDocument(text);
};
