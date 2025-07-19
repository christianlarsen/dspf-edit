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
                attributes: attributes,
                indicators: indicators || undefined,
            },
            nextIndex
        };
    }
    ;
    // "Constant"
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
                attributes: attributes,
                indicators: indicators
            },
            nextIndex
        };
    }
    ;
    // "Attributes"
    const { attributes, nextIndex } = extractAttributes('A', lines, lineIndex, true, indicators);
    if (attributes.length > 0) {
        return {
            element: {
                kind: 'attribute',
                lineIndex: lineIndex,
                value: '',
                indicators: indicators,
                attributes: attributes
            },
            nextIndex
        };
    }
    ;
    return { element: undefined, nextIndex: lineIndex };
}
;
function describeDdsField(field) {
    if (field.kind !== 'field')
        return 'Not a field.';
    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `${row},${col}`;
}
;
function describeDdsConstant(field) {
    if (field.kind !== 'constant')
        return 'Not a constant.';
    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `${row},${col}`;
}
;
function describeDdsRecord(field) {
    if (field.kind !== 'record')
        return 'Not a record.';
    return `Attributes: ${formatDdsAttributes(field.attributes)}`;
}
;
function describeDdsFile(field) {
    if (field.kind !== 'file')
        return 'Not a file.';
    return '';
}
;
function parseDdsIndicators(input) {
    const indicators = [];
    for (let i = 0; i < 3; i++) {
        const segment = input.slice(i * 3, i * 3 + 3);
        const activeChar = segment[0] || ' ';
        const numberStr = segment.slice(1).trim();
        if (numberStr === '')
            continue;
        indicators.push({ active: activeChar !== 'N', number: parseInt(numberStr, 10) });
    }
    ;
    return indicators;
}
;
function formatDdsIndicators(indicators) {
    if (!indicators)
        return '';
    return indicators.map(ind => {
        const status = ind.active ? ' ' : 'N';
        const number = ind.number.toString().padStart(2, '0');
        return `${status}${number}`;
    }).join('');
}
;
function formatDdsAttributes(attributes) {
    if (!attributes || attributes.length === 0)
        return '';
    return attributes.map(attr => {
        const indicators = attr.indicators ? formatDdsIndicators(attr.indicators).trim() : '';
        return (indicators ? indicators + ' ' : '') + attr.value;
    }).join(', ');
}
;
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
    const attribute = {
        kind: 'attribute',
        lineIndex: currentIndex,
        value: lineType === 'C' ? '' : raw,
        indicators: getInd && indicators ? indicators : []
    };
    return { attributes: [attribute], nextIndex: currentIndex };
}
function getAllDdsElements(text) {
    return parseDdsElements(text);
}
//# sourceMappingURL=dds-aid.helper.js.map