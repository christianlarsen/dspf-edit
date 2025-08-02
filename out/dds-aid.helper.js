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
// Describes a "field" (returns row and column)
function describeDdsField(field) {
    if (field.kind !== 'field')
        return 'Not a field.';
    if (!field.hidden) {
        const row = field.row?.toString().padStart(2, '0') ?? '--';
        const col = field.column?.toString().padStart(2, '0') ?? '--';
        return `${row},${col}`;
    }
    else {
        return '(hidden)';
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
//# sourceMappingURL=dds-aid.helper.js.map