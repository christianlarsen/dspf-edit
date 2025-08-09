"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeDdsField = describeDdsField;
exports.describeDdsConstant = describeDdsConstant;
exports.describeDdsRecord = describeDdsRecord;
exports.describeDdsFile = describeDdsFile;
exports.formatDdsIndicators = formatDdsIndicators;
exports.formatDdsAttributes = formatDdsAttributes;
exports.findEndLineIndex = findEndLineIndex;
exports.isDdsFile = isDdsFile;
exports.parseSize = parseSize;
exports.recordExists = recordExists;
exports.findOverlapsInRecord = findOverlapsInRecord;
const dspf_edit_model_1 = require("./dspf-edit.model");
// Describes a "field" (returns row and column)
function describeDdsField(field) {
    if (field.kind !== 'field')
        return 'Not a field.';
    const length = field.length;
    const decimals = field.decimals;
    const sizeText = decimals && decimals > 0 ? `(${length}:${decimals})` : `(${length})`;
    const type = field.type;
    if (field.hidden) {
        return `${sizeText}${type} (Hidden)`;
    }
    else {
        const row = field.row?.toString().padStart(2, '0') ?? '--';
        const col = field.column?.toString().padStart(2, '0') ?? '--';
        return `${sizeText}${type} [${col},${row}]`;
    }
    ;
}
;
// Describes a "constant" (returns row and column)
function describeDdsConstant(field) {
    if (field.kind !== 'constant')
        return 'Not a constant.';
    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `[${row},${col}]`;
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
function findEndLineIndex(document, startLineIndex) {
    let endLineIndex = startLineIndex;
    for (let i = startLineIndex; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        const isContinuedConstant = line.startsWith("     A") &&
            line.charAt(79) === "-";
        if (isContinuedConstant) {
            endLineIndex = i + 1;
        }
        else {
            break;
        }
        ;
    }
    ;
    return endLineIndex;
}
;
function isDdsFile(document) {
    const ddsExtensions = ['.dspf'];
    return ddsExtensions.some(ext => document.fileName.toLowerCase().endsWith(ext));
}
;
function parseSize(newSize) {
    const [intPart, decPart] = newSize.split(',');
    const length = parseInt(intPart, 10);
    const decimals = decPart ? parseInt(decPart, 10) : 0;
    return { length, decimals };
}
;
function recordExists(recordName) {
    let exists = false;
    if (dspf_edit_model_1.records.includes(recordName.toUpperCase())) {
        exists = true;
    }
    ;
    return exists;
}
;
function findOverlapsInRecord(record) {
    const overlaps = [];
    const elements = [
        ...record.fields.map(f => ({ ...f, kind: "field" })),
        ...record.constants.map(c => ({ ...c, kind: "constant" }))
    ];
    for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
            const e1 = elements[i];
            const e2 = elements[j];
            if (e1.row === e2.row) {
                const e1End = e1.col + e1.length - 1;
                const e2End = e2.col + e2.length - 1;
                if (e1.col <= e2End && e2.col <= e1End) {
                    overlaps.push({ a: e1, b: e2 });
                }
            }
        }
    }
    return overlaps;
}
;
//# sourceMappingURL=dspf-edit.helper.js.map