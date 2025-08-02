/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.parser.ts
*/

import { DdsElement, DdsIndicator, DdsFile, DdsAttribute, fileSizeAttributes } from './dspf-edit.model';

export function parseDocument(text: string): DdsElement[] {
    const lines = text.split(/\r?\n/);
    const ddsElements: DdsElement[] = [];

    // Adds element 'file' as root
    const file: DdsFile = {
        kind: 'file',
        lineIndex: 0,
        attributes: []
    };
    ddsElements.push(file);

    // Go through all lines and parse them
    let i = 0;
    while (i < lines.length) {
        const { element, nextIndex } = parseDdsLine(lines, i);
        if (element) ddsElements.push(element);
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
            const match = dspsizLine.value.match(/DSPSIZ\s*\(\s*(\d+)\s+(\d+)/);

            if (match) {
                fileSizeAttributes.maxRow = parseInt(match[1], 10);
                fileSizeAttributes.maxCol = parseInt(match[2], 10);
            };
        };
    };


    return ddsElements.filter(el => el.kind !== 'attribute');
};

function parseDdsLine(lines: string[], lineIndex: number): { element: DdsElement | undefined; nextIndex: number } {
    const line = lines[lineIndex];
    const trimmed = line.substring(5);

    if (trimmed.startsWith('A*')) return { element: undefined, nextIndex: lineIndex };

    const indicators = parseDdsIndicators(trimmed.substring(2, 11));
    const fieldName = trimmed.substring(13, 23).trim();
    const rowText = trimmed.substring(34, 37).trim();
    const colText = trimmed.substring(36, 39).trim();
    const row = rowText ? Number(rowText) : undefined;
    const col = colText ? Number(colText) : undefined;

    // "Record"
    if (trimmed[11] === 'R') {
        const name = trimmed.substring(13, 23).trim();
        const { attributes, nextIndex } = extractAttributes('R', lines, lineIndex, false);
        return {
            element: {
                kind: 'record',
                lineIndex,
                name,
                attributes
            },
            nextIndex
        };
    };

    // "Field"
    if (fieldName) {
        const type = trimmed[29];
        const length = Number(trimmed.substring(27, 29).trim());
        const decimals = trimmed.substring(30,32) !== ' ' ? Number(trimmed.substring(30, 32).trim()) : 0;
        const usage = trimmed[32] !== ' ' ? trimmed[32] : ' ';
        const isHidden = trimmed[32] === 'H';
        const { attributes, nextIndex } = extractAttributes('F', lines, lineIndex, true, indicators);
        return {
            element: {
                kind: 'field',
                name: fieldName,
                type: type,
                length : length,
                decimals : decimals,
                usage : usage,
                row: isHidden ? undefined : row,
                column: isHidden ? undefined : col,
                hidden : isHidden,
                lineIndex: lineIndex,
                attributes: attributes ? attributes : [],
                indicators: indicators || undefined,
            },
            nextIndex
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
                attributes: attributes ? attributes : [],
                indicators: indicators
            },
            nextIndex: continuationIndex
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
            nextIndex
        };
    };

    return { element: undefined, nextIndex: lineIndex };
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
