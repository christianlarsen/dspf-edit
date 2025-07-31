"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDdsElements = parseDdsElements;
exports.describeDdsField = describeDdsField;
exports.describeDdsConstant = describeDdsConstant;
exports.describeDdsRecord = describeDdsRecord;
exports.describeDdsFile = describeDdsFile;
exports.parseDdsIndicators = parseDdsIndicators;
exports.formatDdsIndicators = formatDdsIndicators;
exports.formatDdsAttributes = formatDdsAttributes;
exports.getAllDdsElements = getAllDdsElements;
/*
    Christian Larsen, 2025
    "RPG structure"
    dds-aid.helper.ts
*/
const dds_aid_model_1 = require("./dds-aid.model");
function parseDdsElements(text) {
    const lines = text.split(/\r?\n/);
    const ddsElements = [];
    // Adds element 'file' as root
    const file = {
        kind: 'file',
        lineIndex: 0,
        attributes: []
    };
    ddsElements.push(file);
    // Go through all lines and parse them
    let i = 0;
    while (i < lines.length) {
        const { element, nextIndex } = parseDdsLine(lines, i);
        if (element)
            ddsElements.push(element);
        i = nextIndex + 1;
    }
    ;
    // Let's put the attributes with their "parents"
    for (const el of ddsElements) {
        if (el.kind === 'attribute') {
            const parent = [...ddsElements]
                .reverse()
                .find(p => p.lineIndex < el.lineIndex &&
                (p.kind === 'field' || p.kind === 'constant' || p.kind === 'record' || p.kind === 'file'));
            if (parent) {
                parent.attributes = [...(parent.attributes || []), ...(el.attributes || [])];
            }
            ;
        }
        ;
    }
    ;
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
                dds_aid_model_1.fileSizeAttributes.maxRow = parseInt(match[1], 10);
                dds_aid_model_1.fileSizeAttributes.maxCol = parseInt(match[2], 10);
            }
            ;
        }
        ;
    }
    ;
    return ddsElements.filter(el => el.kind !== 'attribute');
}
;
function parseDdsLine(lines, lineIndex) {
    const line = lines[lineIndex];
    const trimmed = line.substring(5);
    if (trimmed.startsWith('A*'))
        return { element: undefined, nextIndex: lineIndex };
    const indicators = parseDdsIndicators(trimmed.substring(2, 11));
    const fieldName = trimmed.substring(13, 23).trim();
    const row = Number(trimmed.substring(34, 37).trim());
    const col = Number(trimmed.substring(36, 39).trim());
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
    }
    ;
    // "Field"
    if (fieldName) {
        const type = trimmed[29];
        const length = trimmed.substring(27, 29).trim();
        const decimals = trimmed[31] !== ' ' ? Number(trimmed.substring(30, 31).trim()) : undefined;
        const usage = trimmed[32] !== ' ' ? trimmed[32] : undefined;
        const { attributes, nextIndex } = extractAttributes('F', lines, lineIndex, true, indicators);
        return {
            element: {
                kind: 'field',
                name: fieldName,
                type: type,
                row: row,
                column: col,
                lineIndex: lineIndex,
                attributes: attributes ? attributes : [],
                indicators: indicators || undefined,
            },
            nextIndex
        };
    }
    ;
    // "Constant"
    if (!fieldName && row && col) {
        let fullValue = trimmed.substring(39, 79);
        let continuationIndex = lineIndex;
        while (lines[continuationIndex].charAt(79) === '-') {
            continuationIndex++;
            const nextLine = lines[continuationIndex];
            if (!nextLine)
                break;
            const nextTrimmed = nextLine.substring(5);
            const continuedValue = nextTrimmed.substring(39, 79);
            fullValue = fullValue.slice(0, -1) + continuedValue;
        }
        ;
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
    }
    ;
    /*
        if (!fieldName && row && col) {
            const value = trimmed.substring(39).trim();
            const { attributes, nextIndex } = extractAttributes('C', lines, lineIndex, true, indicators);
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
                nextIndex
            };
        };
    */
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
    }
    ;
    return { element: undefined, nextIndex: lineIndex };
}
;
// Describes a "field" (returns row and column)
function describeDdsField(field) {
    if (field.kind !== 'field')
        return 'Not a field.';
    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `${row},${col}`;
}
;
// Describes a "constant" (returns row and column)
function describeDdsConstant(field) {
    if (field.kind !== 'constant')
        return 'Not a constant.';
    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `${row},${col}`;
}
;
// Describes a "record" (returns line with "attributes" of the)
function describeDdsRecord(field) {
    if (field.kind !== 'record')
        return 'Not a record.';
    return '';
}
;
// Describes a "file" (returns a blank string)
function describeDdsFile(field) {
    if (field.kind !== 'file')
        return 'Not a file.';
    return '';
}
;
// Parse indicators inside a string and return DdsIndicator[]
function parseDdsIndicators(input) {
    const indicators = [];
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
    indicators.sort((a, b) => a.number - b.number);
    return indicators;
}
;
// Returns the indicators formatted in a string
function formatDdsIndicators(indicators) {
    if (!indicators)
        return '';
    if (indicators.length === 0)
        return '';
    const indicatorStr = `[${indicators.map(ind => {
        const status = ind.active ? ' ' : 'N';
        const number = ind.number.toString().padStart(2, '0');
        return `${status}${number}`;
    }).join('')}]`;
    return indicatorStr;
}
;
// Returns attributes formatted in a string
function formatDdsAttributes(attributes) {
    if (!attributes || attributes.length === 0)
        return '';
    return attributes.map(attr => {
        const indicators = attr.indicators ? formatDdsIndicators(attr.indicators).trim() : '';
        return (indicators ? indicators + ' ' : '') + attr.value;
    }).join(', ');
}
;
// Extracts attributes
function extractAttributes(lineType, lines, startIndex, getInd, indicators) {
    let raw = '';
    let currentIndex = startIndex;
    while (currentIndex < lines.length) {
        const line = lines[currentIndex];
        const trimmed = line.substring(5);
        const part = trimmed.substring(39, 75);
        raw += part.replace(/-$/, '');
        if (!part.trim().endsWith('-'))
            break;
        currentIndex++;
    }
    raw = raw.trim();
    if (!raw)
        return { attributes: [], nextIndex: currentIndex };
    if (lineType === 'C' && currentIndex === startIndex) {
        return { attributes: [], nextIndex: currentIndex };
    }
    else {
        const attribute = {
            kind: 'attribute',
            lineIndex: currentIndex,
            value: lineType === 'C' ? '' : raw,
            indicators: getInd && indicators ? indicators : []
        };
        return { attributes: [attribute], nextIndex: currentIndex };
    }
}
;
function getAllDdsElements(text) {
    return parseDdsElements(text);
}
//# sourceMappingURL=dds-aid.helper.js.map