/*
    Christian Larsen, 2025
    "RPG structure"
    dds-aid.helper.ts
*/
import * as vscode from 'vscode';
import { DdsElement, DdsIndicator, DdsFile, DdsAttribute, fileSizeAttributes } from './dds-aid.model';


// Describes a "field" (returns row and column)
export function describeDdsField(field: DdsElement): string {
    if (field.kind !== 'field') return 'Not a field.';

    const length = field.length;
    const decimals = field.decimals;

    const sizeText = decimals && decimals > 0 ? `(${length}:${decimals})` : `(${length})`;
    const type = field.type;

    if (field.hidden) {
        return `${sizeText}${type} (Hidden)`;
    } else {
        const row = field.row?.toString().padStart(2, '0') ?? '--';
        const col = field.column?.toString().padStart(2, '0') ?? '--';
        return `${sizeText}${type} [${col},${row}]`;
    };
};

// Describes a "constant" (returns row and column)
export function describeDdsConstant(field: DdsElement): string {
    if (field.kind !== 'constant') return 'Not a constant.';

    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `[${row},${col}]`;
};

// Describes a "record" (returns line with "attributes" of the)
export function describeDdsRecord(field: DdsElement): string {
    if (field.kind !== 'record') return 'Not a record.';

    return '';
};

// Describes a "file" (returns a blank string)
export function describeDdsFile(field: DdsElement): string {
    if (field.kind !== 'file') return 'Not a file.';

    return '';
};

// Returns the indicators formatted in a string
export function formatDdsIndicators(indicators?: DdsIndicator[]): string {
    if (!indicators) return '';
    if (indicators.length === 0) return '';

    const indicatorStr = `[${indicators.map(ind => {
        const status = ind.active ? ' ' : 'N';
        const number = ind.number.toString().padStart(2, '0');
        return `${status}${number}`;
    }).join('')}]`;

    return indicatorStr;
};

// Returns attributes formatted in a string
export function formatDdsAttributes(attributes?: DdsAttribute[]): string {
    if (!attributes || attributes.length === 0) return '';

    return attributes.map(attr => {
        const indicators = attr.indicators ? formatDdsIndicators(attr.indicators).trim() : '';
        return (indicators ? indicators + ' ' : '') + attr.value;
    }).join(', ');
};

export function findEndLineIndex(document: vscode.TextDocument, startLineIndex: number): number {
    let endLineIndex = startLineIndex;

    for (let i = startLineIndex; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;

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

export function isDdsFile(document: vscode.TextDocument): boolean {
    const ddsExtensions = ['.dspf'];
    return ddsExtensions.some(ext => document.fileName.toLowerCase().endsWith(ext));
};

export function parseSize(newSize: string): { length: number, decimals: number } {
    const [intPart, decPart] = newSize.split(',');

    const length = parseInt(intPart, 10);
    const decimals = decPart ? parseInt(decPart, 10) : 0;

    return { length, decimals };
};

