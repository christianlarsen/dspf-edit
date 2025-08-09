/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.helper.ts
*/
import * as vscode from 'vscode';
import { DdsElement, DdsIndicator, DdsAttribute, records, fieldsPerRecord, ConstantInfo, FieldInfo } from './dspf-edit.model';
import { DdsTreeProvider } from './dspf-edit.providers';
import { parseDocument } from './dspf-edit.parser';

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

export function recordExists(recordName: string): boolean {

    let exists: boolean = false;

    if (records.includes(recordName.toUpperCase())) {
        exists = true;
    };
    return exists;

};

export function findOverlapsInRecord(record: fieldsPerRecord) {
    const overlaps: { a: FieldInfo | ConstantInfo, b: FieldInfo | ConstantInfo }[] = [];

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
};

export function updateTreeProvider(treeProvider: DdsTreeProvider, document?: vscode.TextDocument) {
    try {
        if (document && isDdsFile(document)) {
            const text = document.getText();
            const elements = parseDocument(text);
            treeProvider.setElements(elements);
        } else {
            treeProvider.setElements([]);
        };
        treeProvider.refresh();
    } catch (error) {
        console.error('Error updating DDS tree:', error);
        vscode.window.showErrorMessage('Error parsing DDS file');
        treeProvider.setElements([]);
        treeProvider.refresh();
    };
};

export function goToLine(lineNumber: number): void {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage('No active editor.');
        return;
    };

    const position = new vscode.Position(lineNumber - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
};
