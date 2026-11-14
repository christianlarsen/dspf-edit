/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.split-field-lines.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords, FieldInfo, getAvailableDisplayFormats, getRecordSize, getSizeForFormat, fileSizeAttributes } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, findElementInsertionPoint, insertKeywordLines, replaceKeywordTextInLines } from '../dspf-edit.utils/dspf-edit.helper';
import { removeWholeKeyword, nudgeCursor } from './dspf-edit.conditioned-keywords';

/**
 * Splits an input field across several lines with CNTFLD(width) — a continued-entry field: the
 * field's length is shown `width` columns at a time, each piece on the next row at the same column,
 * e.g. a 90-character field with CNTFLD(30) is a 3-line, 30-column text box.
 * Per the DDS reference the field must be input-capable, character (data type A) and not in a
 * subfile; the width must be less than the field's length and fit in the display or window; it
 * can't go with AUTO(RAB/RAZ), CHECK(AB MF RB RZ RLTB), CHOICE, DSPATR(OID/SP) or EDTMSK; no other
 * field may sit inside its rectangle; and it takes no option indicators.
 */

// COMMAND REGISTRATION

/**
 * Registers the split field into lines command.
 * @param context - The VS Code extension context
 */
export function splitFieldLines(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dspf-edit.split-field-lines', async (node: DdsNode) => {
            await handleSplitFieldLinesCommand(node);
        })
    );
};

// COMMAND HANDLER

async function handleSplitFieldLinesCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const element = node.ddsElement as any;
        const problem = whyCannotSplit(element);
        if (problem) {
            vscode.window.showWarningMessage(problem);
            return;
        };

        const fieldInfo = findFieldInfo(element);
        const current = findCntfld(element);

        if (current) {
            const choice = await vscode.window.showQuickPick([
                { label: '$(edit) Change the width', description: `now ${current.width} columns`, action: 'change' as const },
                { label: '$(trash) Put it back on one line', description: `removes CNTFLD(${current.width})`, action: 'remove' as const }
            ], {
                title: `Split ${element.name} into lines`,
                placeHolder: describeSplit(fieldInfo?.length, current.width),
                ignoreFocusOut: true
            });
            if (!choice) return;

            if (choice.action === 'remove') {
                if (!(await removeWholeKeyword(editor, element, current))) return;
                await nudgeCursor();
                vscode.window.showInformationMessage(`${element.name} is back on one line.`);
                return;
            };
        };

        const width = await askWidth(element, fieldInfo, current?.width);
        if (width === undefined) return;

        if (fieldInfo && !(await confirmNoOverlap(element, fieldInfo, width))) return;

        const keywordText = `CNTFLD(${width})`;
        const done = current
            ? await replaceKeywordTextInLines(editor, current.lineIndex, current.lastLineIndex, current.keywordText, keywordText)
            : await insertKeywordLines(editor, findElementInsertionPoint(editor, element), keywordText);
        if (!done) return;

        await nudgeCursor();
        vscode.window.showInformationMessage(`${element.name} split into lines: ${describeSplit(fieldInfo?.length, width)}.`);

    } catch (error) {
        console.error('Error splitting the field into lines:', error);
        vscode.window.showErrorMessage('An error occurred while splitting the field into lines.');
    };
};

// CHECKS

const CONFLICTING_KEYWORDS: { pattern: RegExp; name: string }[] = [
    { pattern: /^AUTO\(\s*RA[BZ]\s*\)$/i, name: 'AUTO(RAB/RAZ)' },
    { pattern: /^CHECK\(.*\b(AB|MF|RB|RZ|RLTB)\b.*\)$/i, name: 'CHECK(AB/MF/RB/RZ/RLTB)' },
    { pattern: /^CHOICE\(/i, name: 'CHOICE' },
    { pattern: /^DSPATR\(.*\b(OID|SP)\b.*\)$/i, name: 'DSPATR(OID/SP)' },
    { pattern: /^EDTMSK\(/i, name: 'EDTMSK' }
];

/** Why the field can't be split into lines, or undefined when it can. */
function whyCannotSplit(element: any): string | undefined {
    if (element.kind !== 'field') {
        return 'Only fields can be split into lines.';
    };

    const usage = (element.usage || '').trim().toUpperCase();
    if (usage !== 'I' && usage !== 'B') {
        return `${element.name} is an output-only field: only fields the user can type into (usage I or B) can be split into lines.`;
    };

    const type = (element.type || '').trim().toUpperCase();
    const isCharacter = type === 'A' || (type === '' && (element.decimals === undefined || element.referenced));
    if (!isCharacter) {
        return `${element.name} isn't a character field: only character fields (data type A) can be split into lines.`;
    };

    const record = fieldsPerRecords.find(r => r.record === element.recordname);
    if (record?.attributes?.some(attr => attr.value === 'SFL')) {
        return `${element.name} is in a subfile record: fields in a subfile can't be split into lines.`;
    };

    const keywords = ((element.attributes || []) as { value: string }[]).map(attr => attr.value);
    const conflicts = CONFLICTING_KEYWORDS.filter(conflict => keywords.some(value => conflict.pattern.test(value))).map(conflict => conflict.name);
    if (conflicts.length > 0) {
        return `${element.name} has ${conflicts.join(', ')}, which can't go on a field split into lines. Remove ${conflicts.length === 1 ? 'it' : 'them'} first.`;
    };

    return undefined;
};

/** The field's CNTFLD keyword and where it is, when it has one. */
function findCntfld(element: any): { width: number; keywordText: string; lineIndex: number; lastLineIndex: number } | undefined {
    const attr = ((element.attributes || []) as { value: string; lineIndex: number; lastLineIndex?: number }[])
        .find(a => /^CNTFLD\(/i.test(a.value));
    if (!attr) return undefined;

    const width = Number(attr.value.match(/^CNTFLD\(\s*(\d+)\s*\)$/i)?.[1] ?? 0);
    return { width, keywordText: attr.value, lineIndex: attr.lineIndex, lastLineIndex: attr.lastLineIndex ?? attr.lineIndex };
};

/** The field's resolved position and length (relative positions such as +2 already worked out). */
function findFieldInfo(element: any): FieldInfo | undefined {
    return fieldsPerRecords.find(r => r.record === element.recordname)?.fields.find(f => f.lineIndex === element.lineIndex);
};

/**
 * The rows and columns the field has to fit in: its window's, in a window record; otherwise the
 * screen of the display format the field is conditioned on, or — when the file declares two and
 * the field isn't tied to either — the smaller of them, so it fits on both.
 */
function getAvailableArea(element: any): { rows: number; cols: number } {
    const size = getRecordSize(element.recordname);
    if (size?.source === 'window') {
        return { rows: size.rows, cols: size.cols };
    };

    if (element.displayFormat) {
        const formatSize = getSizeForFormat(element.displayFormat);
        if (formatSize) return { rows: formatSize.rows, cols: formatSize.cols };
    };

    const formats = getAvailableDisplayFormats();
    if (formats.length === 0) {
        return { rows: fileSizeAttributes.maxRow1, cols: fileSizeAttributes.maxCol1 };
    };
    return { rows: Math.min(...formats.map(f => f.rows)), cols: Math.min(...formats.map(f => f.cols)) };
};

/** "90 characters → 3 lines of 30 columns", or just the width when the length isn't known. */
function describeSplit(length: number | undefined, width: number): string {
    if (!length || width <= 0) {
        return `${width} columns per line`;
    };
    const lines = Math.ceil(length / width);
    return `${length} characters → ${lines} line${lines === 1 ? '' : 's'} of ${width} columns`;
};

/**
 * Asks for the column width, checking it against the field's length and the room left on the
 * display (or window) to the right of and below the field.
 */
async function askWidth(element: any, fieldInfo: FieldInfo | undefined, currentWidth: number | undefined): Promise<number | undefined> {
    const length = fieldInfo?.length || element.length || 0;
    const area = getAvailableArea(element);
    const col = fieldInfo?.col ?? 0;
    const row = fieldInfo?.row ?? 0;
    const maxWidth = Math.min(col > 0 ? area.cols - col + 1 : area.cols, length > 0 ? length - 1 : area.cols);

    const value = await vscode.window.showInputBox({
        title: `Split ${element.name} into lines`,
        prompt: length > 0
            ? `Columns per line (1-${maxWidth}). ${element.name} is ${length} characters long; each line starts at column ${col || '?'}.`
            : `Columns per line (1-${maxWidth}).`,
        value: currentWidth ? String(currentWidth) : suggestWidth(length, maxWidth),
        ignoreFocusOut: true,
        validateInput: input => {
            const text = input.trim();
            if (!/^\d+$/.test(text)) return 'Enter a whole number of columns.';
            const width = Number(text);
            if (width < 1) return 'The width must be at least 1 column.';
            if (length > 0 && width >= length) return `The width must be less than the field's length (${length}).`;
            if (col > 0 && col + width - 1 > area.cols) {
                return `${width} columns starting at column ${col} go past column ${area.cols}, the right edge of the ${getRecordSize(element.recordname)?.source === 'window' ? 'window' : 'display'}. Use ${area.cols - col + 1} or less.`;
            };
            if (length > 0 && row > 0) {
                const lastRow = row + Math.ceil(length / width) - 1;
                if (lastRow > area.rows) {
                    return `${describeSplit(length, width)} would end on row ${lastRow}, past the last row (${area.rows}). Use a wider width.`;
                };
            };
            return null;
        }
    });

    return value === undefined ? undefined : Number(value.trim());
};

/** A starting width: about half the field, or as wide as fits — whichever is smaller. */
function suggestWidth(length: number, maxWidth: number): string {
    if (length <= 1 || maxWidth < 1) return '';
    return String(Math.max(1, Math.min(maxWidth, Math.ceil(length / 2))));
};

/**
 * DDS allows no other field inside a continued-entry field's rectangle. Lists the fields and
 * constants that would end up inside it — on any of its rows, between its first and last column —
 * and asks before going ahead (they may be conditioned so they're never shown together).
 */
async function confirmNoOverlap(element: any, fieldInfo: FieldInfo, width: number): Promise<boolean> {
    const record = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!record || fieldInfo.row <= 0 || fieldInfo.col <= 0 || !fieldInfo.length) return true;

    const firstRow = fieldInfo.row;
    const lastRow = firstRow + Math.ceil(fieldInfo.length / width) - 1;
    const firstCol = fieldInfo.col;
    const lastCol = firstCol + width - 1;

    const inside = [
        ...record.fields.filter(f => f.lineIndex !== fieldInfo.lineIndex),
        ...record.constants
    ].filter(other =>
        other.row >= firstRow && other.row <= lastRow &&
        other.col <= lastCol && other.col + Math.max(other.length, 1) - 1 >= firstCol &&
        (!other.displayFormat || !element.displayFormat || other.displayFormat === element.displayFormat)
    );
    if (inside.length === 0) return true;

    const names = inside.map(other => other.name).join(', ');
    const answer = await vscode.window.showWarningMessage(
        `Split into lines, ${element.name} would cover rows ${firstRow}-${lastRow}, columns ${firstCol}-${lastCol}, where ${names} ${inside.length === 1 ? 'is' : 'are'}. No other field can be inside it unless they're never shown at the same time.`,
        { modal: true },
        'Split anyway'
    );
    return answer === 'Split anyway';
};
