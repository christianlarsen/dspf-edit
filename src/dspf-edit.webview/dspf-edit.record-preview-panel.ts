/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.record-preview-panel.ts
*/

import * as vscode from 'vscode';
import { FieldsPerRecord, DdsSize, DdsAttribute, AttributeWithIndicators, DdsIndicator, fieldsPerRecords, attributesFileLevel, records, getDefaultSize, getAvailableDisplayFormats, getSizeForFormat, SYSTEM_FIELD_PLACEHOLDER, groupIndicatorsByCondition } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, updateTreeProvider, applyWorkspaceEdit, applyDisplayFormatSplitEdit } from '../dspf-edit.utils/dspf-edit.helper';
import { getBackgroundColor, getDdsColorMap, getReferencedFieldColor } from '../dspf-edit.utils/dspf-edit.preview-colors';
import { getDecimalSeparators } from '../dspf-edit.utils/dspf-edit.decimal-format';
import { DdsTreeProvider, DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { ExtensionState } from '../dspf-edit.states/state';
import { getResolvedRef } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';
import { resolveRecordSizeForFormat, filterForActiveFormat, pickForActiveFormat } from '../dspf-edit.parser/dspf-edit.parser';
import { editWindowTitleForRecord } from '../dspf-edit.commands/dspf-edit.window-title';
import { getConstantTextFromUser, insertNewConstant, updateExistingConstant } from '../dspf-edit.commands/dspf-edit.edit-constant';
import { addFieldAtPosition } from '../dspf-edit.commands/dspf-edit.edit-field';
import { addColorToMultipleElements } from '../dspf-edit.commands/dspf-edit.add-color';
import { addAttributeToMultipleElements } from '../dspf-edit.commands/dspf-edit.add-attribute';
import { removeElements } from '../dspf-edit.commands/dspf-edit.remove-element';
import { copyFieldToPosition } from '../dspf-edit.commands/dspf-edit.copy-field';
import { copyConstantToPosition } from '../dspf-edit.commands/dspf-edit.copy-constant';

/**
 * Item sent to the webview for rendering (a single field or constant on the screen grid).
 */
interface PreviewItem {
    kind: 'field' | 'constant';
    name: string;
    text: string;
    row: number;
    col: number;
    length: number;
    lineIndex: number;
    color: string;
    highIntensity: boolean;
    reverseImage: boolean;
    blink: boolean;
    underline: boolean;
    columnSeparator: boolean;
    nonDisplay: boolean;
    /** Row/col offset that was added to place this item, so a drag-to-move can be converted back to record-local coordinates. */
    rowOffset: number;
    colOffset: number;
    /** True when this item belongs to the record overlaid *behind* a window, not the record being previewed. */
    isBackground: boolean;
    /** False for subfile page-repeat ghosts and background items: only the "real" instance can be clicked/dragged. */
    isInteractive: boolean;
    /** True for input-capable fields (usage I or B), shown underlined instead of boxed. Always false for constants and output-only fields. */
    isInputCapable: boolean;
    /**
     * True when this background item shares the *same* window as the record being previewed
     * (an auto-paired SFL/SFLCTL half, or the window's owner record) rather than belonging to a
     * genuinely different record positioned behind it. The window's own opaque frame is drawn over
     * "behind" background items (they're physically covered by the window), but same-window items
     * must be drawn on top of that frame fill, since they're part of the window's own content.
     */
    sameWindow?: boolean;
    /**
     * True for a referenced field (REFFLD/position-29 `R`): its real type/length live in the
     * external database field, which dspf-edit has no way to read, so it can't be previewed at its
     * real width. Rendered as a single placeholder character in a distinct color with a dashed box,
     * instead of pretending to know its size.
     */
    isReferenced?: boolean;
    /**
     * True only for a field whose displayed width equals its raw DDS length one-to-one — a plain
     * alphanumeric or unedited numeric field, not referenced, not a system keyword (DATE, USER...),
     * and not carrying an editing mask (EDTCDE/EDTWRD widen the display beyond the raw length).
     * Drives whether the preview offers a drag handle on its right edge to resize it.
     */
    isResizable?: boolean;
    /** For a resizable field: the shortest length its own type allows (decimals + 1 for a numeric field with decimals, else 1). */
    minLength?: number;
    /**
     * True for a genuine constant literal (same gating as `isResizable` — not a system keyword)
     * that isn't part of a subfile record. Drives whether the preview offers a *second* drag handle,
     * on the constant's left edge, to grow/shrink its *leading* blank padding instead of its
     * trailing one. Excluded for a subfile record: the parser stores its row/column swapped, and
     * unlike the right handle (which never touches position), this one has to rewrite the constant's
     * column — not worth risking writing it to the wrong raw source column without a way to verify
     * against real STRSDA for a subfile.
     */
    isResizableLeft?: boolean;
    /** For a left-resizable constant: the shortest length that doesn't eat into its own non-leading-blank text (mirrors `minLength`, from the other end). */
    minLengthLeft?: number;
    /**
     * A field's real DDS length/decimals, for display in the preview's selection bar — omitted
     * for constants and for a referenced field whose real length dspf-edit has no way to read
     * (see `isReferenced`), since there's nothing true to show there.
     */
    dataLength?: number;
    decimals?: number;
};

/** A rectangle in the coordinates of the canvas being drawn (the full display size). */
interface WindowFrame {
    row: number;
    col: number;
    rows: number;
    cols: number;
};

// A WINDOW(row col numRows numCols) keyword gives the *border's* corner and the *content* area's
// size. The content sits inset from the border: 1 row above/below, and 2 columns to the left and
// right (confirmed against real STRSDA output: the border sits at column 0, column 1 stays blank,
// and content starts at column 2 — symmetric on the right).
const WINDOW_BORDER_TOP = 1;
const WINDOW_BORDER_BOTTOM = 1;
const WINDOW_BORDER_LEFT = 2;
const WINDOW_BORDER_RIGHT = 2;

/** Placeholder character shown across a field's width, keyed by [isNumeric][usage]. */
const FIELD_USAGE_PLACEHOLDER: Record<'alpha' | 'numeric', Record<string, string>> = {
    alpha: { O: 'O', B: 'B', I: 'I' },
    numeric: { O: '6', B: '9', I: '3' }
};

/**
 * Whether a field is numeric, per DDS's own Type/decimal-positions default rules: 'A' is always
 * alphanumeric, anything else non-blank (Y, S, L, T, Z, ...) is always numeric. A blank Type is
 * ambiguous on its own — it's alphanumeric only when the decimal-positions column is also blank; a
 * blank Type with decimal positions given (even 0) is a plain zoned-numeric field.
 * @param type - DDS data type code (position 35), possibly blank
 * @param rawDecimals - The field's decimal positions as parsed, `undefined` when left blank
 */
function isNumericFieldType(type: string | undefined, rawDecimals: number | undefined): boolean {
    const trimmedType = (type || '').trim();
    return trimmedType !== '' ? trimmedType !== 'A' : rawDecimals !== undefined;
};

/**
 * Builds the placeholder text shown across a field's width, based on its data type and usage
 * (O=output, B=both, I=input), matching the classic screen-design-aid convention.
 * Falls back to the field name if the usage code isn't one of O/B/I.
 * @param name - Field name (used as a fallback label, and to detect a system keyword field)
 * @param type - DDS data type code; 'A' is always alphanumeric, anything else non-blank (Y, S, L,
 * T, Z, ...) is always numeric. A blank Type is DDS's own default and is ambiguous on its own —
 * it's alphanumeric only when the decimal-positions column is also blank; a blank Type with
 * decimal positions given (even 0) is a plain zoned-numeric field, so `decimals` disambiguates it.
 * @param usage - DDS usage code (O, B, I, H, ...)
 * @param length - Field length, i.e. how many placeholder characters to repeat
 * @param editWordMask - The field's EDTWRD() mask text, if any (e.g. '   .  ') — when present, its
 * blanks are filled with the placeholder character instead of just repeating it for `length`, so
 * an edited numeric field previews with its decimal point (or other insert characters) in place.
 * @param decimals - The field's decimal positions as parsed from the source, `undefined` when that
 * column was left blank — only consulted when `type` is blank (see above)
 */
function getFieldPlaceholderText(name: string, type: string | undefined, usage: string | undefined, length: number, editWordMask?: string | null, decimals?: number): string {
    const systemPlaceholder = SYSTEM_FIELD_PLACEHOLDER[name.trim().toUpperCase()];
    if (systemPlaceholder) {
        return systemPlaceholder;
    };

    const isNumeric = isNumericFieldType(type, decimals);
    // A blank usage column means Output — DDS's own default (see generateNewFieldLine, which
    // leaves it blank for that same reason) — not "no usage code".
    const usageCode = (usage || '').trim().toUpperCase() || 'O';
    const placeholderChar = FIELD_USAGE_PLACEHOLDER[isNumeric ? 'numeric' : 'alpha'][usageCode];

    if (!placeholderChar) {
        return name;
    };

    if (editWordMask) {
        return editWordMask.split('').map(ch => ch === ' ' ? placeholderChar : ch).join('');
    };

    return placeholderChar.repeat(Math.max(length, 1));
};

/**
 * Extracts a field's EDTWRD() mask (the text between its quotes), if it carries one.
 * @param attributes - The element's DDS attributes
 */
function getEditWordMask(attributes: AttributeWithIndicators[] | undefined): string | null {
    const attr = attributes?.find(a => /^EDTWRD\(/i.test(a.value));
    if (!attr) {
        return null;
    };

    return attr.value.match(/^EDTWRD\(\s*'([^']*)'\s*\)$/i)?.[1] ?? null;
};

/**
 * The standard DDS numeric edit codes: whether each inserts a thousands separator, and what (if
 * any) sign indicator it reserves room for. The separator/decimal-point characters themselves come
 * from the user's configured decimal format (see dspf-edit.utils/dspf-edit.decimal-format.ts,
 * driven by the IBM i's QDECFMT system value), not hardcoded here. Every edit code always inserts a
 * decimal point when the field has decimals and suppresses leading zeros — irrelevant to a generic
 * placeholder preview (there's no real value to format), which only needs the extra display
 * width/characters.
 * The DDS reference's own edit-code summary table (Table 6) shows N/O/P/Q as identical to
 * J/K/L/M in every column, including sign — but that table doesn't capture sign *position*, and
 * real STRSDA shows they differ there: J/K/L/M reserve the minus sign trailing (after the last
 * digit), N/O/P/Q reserve it leading (before the first digit) — confirmed against a real STRSDA
 * screenshot, not just the manual (see the mirror-STRSDA project guidance).
 */
const EDIT_CODE_INFO: Record<string, { comma: boolean; sign: '' | '-' | 'CR'; signLeading?: boolean }> = {
    '1': { comma: true, sign: '' },
    '2': { comma: true, sign: '' },
    '3': { comma: false, sign: '' },
    '4': { comma: false, sign: '' },
    A: { comma: true, sign: 'CR' },
    B: { comma: true, sign: 'CR' },
    C: { comma: false, sign: 'CR' },
    D: { comma: false, sign: 'CR' },
    J: { comma: true, sign: '-' },
    K: { comma: true, sign: '-' },
    L: { comma: false, sign: '-' },
    M: { comma: false, sign: '-' },
    N: { comma: true, sign: '-', signLeading: true },
    O: { comma: true, sign: '-', signLeading: true },
    P: { comma: false, sign: '-', signLeading: true },
    Q: { comma: false, sign: '-', signLeading: true }
};

/**
 * Extracts a field's EDTCDE() code, if it carries one (its optional modifier — asterisk fill or a
 * currency symbol — doesn't affect the preview mask, so it's not extracted here).
 * @param attributes - The element's DDS attributes
 */
function getEditCode(attributes: AttributeWithIndicators[] | undefined): string | null {
    const attr = attributes?.find(a => /^EDTCDE\(/i.test(a.value));
    if (!attr) {
        return null;
    };

    return attr.value.match(/^EDTCDE\(\s*([1-4A-DJ-Q])/i)?.[1]?.toUpperCase() ?? null;
};

/**
 * Builds an EDTWRD-mask-shaped string (blanks mark digit positions, everything else is literal)
 * for a field carrying EDTCDE(code), from the standard DDS edit-code table above — the same extra
 * width (commas, decimal point, sign) SDA/RDi reserve when previewing an edited numeric field.
 * @param length - The field's digit length
 * @param decimals - The field's decimal positions
 * @param code - The EDTCDE code (1-4, A-D, J-Q)
 */
function getEditCodeMask(length: number, decimals: number, code: string): string | null {
    const info = EDIT_CODE_INFO[code];
    if (!info) {
        return null;
    };

    const { thousands, decimal } = getDecimalSeparators();
    const intDigits = Math.max(length - decimals, 1);
    let mask = '';
    for (let i = 0; i < intDigits; i++) {
        const remaining = intDigits - i;
        if (info.comma && i > 0 && remaining % 3 === 0) {
            mask += thousands;
        };
        mask += ' ';
    };
    if (decimals > 0) {
        mask += decimal + ' '.repeat(decimals);
    };
    mask = info.signLeading ? info.sign + mask : mask + info.sign;

    return mask;
};

/**
 * Determines the extra width IBM i itself reserves for an *unedited* numeric field (no EDTCDE/
 * EDTWRD) — confirmed against real STRSDA and the DDS reference's own "Default (blank)" and
 * per-keyboard-shift display-length rules:
 * - Blank Type with decimal positions given (even 0) defaults to signed numeric (S) when no editing
 *   keyword is present (an editing keyword would instead default it to numeric-only (Y), but then
 *   `editingMask` wouldn't be null and this function wouldn't run).
 * - An input-capable (I/B) signed numeric (S) field always reserves one extra trailing position for
 *   a minus sign, regardless of decimal positions — and never shows a decimal point on screen (the
 *   manual is explicit that IBM i performs no decimal alignment for S fields).
 * - An input-capable numeric-only (Y) or numeric-shift (N) field instead reserves one extra position
 *   for the decimal point, but only when it actually has decimal positions — no sign position at all.
 * - An output-only field never gets an extra position, whatever its shift.
 * @param type - DDS data type code (position 35), possibly blank
 * @param usage - DDS usage code (O, B, I, H, ...)
 * @param length - The field's digit length
 * @param rawDecimals - The field's decimal positions as parsed, `undefined` when left blank
 */
function getUneditedNumericMask(type: string | undefined, usage: string | undefined, length: number, rawDecimals: number | undefined): string | null {
    if (!isNumericFieldType(type, rawDecimals)) {
        return null;
    };

    const usageCode = (usage || '').trim().toUpperCase() || 'O';
    if (usageCode !== 'I' && usageCode !== 'B') {
        return null;
    };

    const shift = (type || '').trim().toUpperCase() || 'S';
    if (shift === 'S') {
        return ' '.repeat(Math.max(length, 1)) + '-';
    };

    const decimals = rawDecimals ?? 0;
    if ((shift === 'Y' || shift === 'N') && decimals > 0) {
        const intDigits = Math.max(length - decimals, 1);
        return ' '.repeat(intDigits) + getDecimalSeparators().decimal + ' '.repeat(decimals);
    };

    return null;
};

/**
 * Resolves the mask that determines a numeric field's placeholder text and extra display width
 * beyond its raw DDS length — an explicit EDTWRD (takes precedence, since DDS doesn't allow both on
 * the same field), a standard EDTCDE code, or — when neither is present — the extra sign/decimal-
 * point position IBM i itself reserves for an unedited numeric field (see getUneditedNumericMask).
 * @param attributes - The element's DDS attributes
 * @param type - DDS data type code (position 35), possibly blank
 * @param usage - DDS usage code (O, B, I, H, ...)
 * @param length - The field's digit length (post REFFLD resolution, if applicable)
 * @param decimals - The field's decimal positions (post REFFLD resolution, if applicable)
 * @param rawDecimals - The field's decimal positions as parsed, `undefined` when left blank
 */
function getEditingMask(attributes: AttributeWithIndicators[] | undefined, type: string | undefined, usage: string | undefined, length: number, decimals: number, rawDecimals: number | undefined): string | null {
    const wordMask = getEditWordMask(attributes);
    if (wordMask) {
        return wordMask;
    };

    const code = getEditCode(attributes);
    if (code) {
        return getEditCodeMask(length, decimals, code);
    };

    return getUneditedNumericMask(type, usage, length, rawDecimals);
};

/**
 * Extracts a field's CNTFLD() continuation width, if it carries one — the number of characters
 * shown per line before wrapping to the next row (same column) for a field too long to fit on one line.
 * @param attributes - The element's DDS attributes
 */
function getContinuedFieldWidth(attributes: AttributeWithIndicators[] | undefined): number | null {
    const attr = attributes?.find(a => /^CNTFLD\(/i.test(a.value));
    if (!attr) {
        return null;
    };

    const width = attr.value.match(/^CNTFLD\(\s*(\d+)\s*\)$/i)?.[1];
    return width ? Number(width) : null;
};

/** True when a field carries SNGCHCFLD or MLTCHCFLD (a single- or multiple-choice selection field). */
function isChoiceField(attributes: AttributeWithIndicators[] | undefined): boolean {
    return Boolean(attributes?.some(attr => /^(SNGCHCFLD|MLTCHCFLD)\b/i.test(attr.value)));
};

/** A selection field's choice-list arrangement: how many choices per row/column, and the gap between columns. */
interface ChoiceLayout {
    numCols?: number;
    numRows?: number;
    gutter: number;
};

/**
 * Extracts a SNGCHCFLD/MLTCHCFLD field's layout parameters — *NUMCOL (n choices per row, filling
 * row by row) or *NUMROW (n choices per column, filling column by column); DDS treats the two as
 * mutually exclusive. *GUTTER sets the blank space between columns (DDS default: 3). With neither
 * *NUMCOL nor *NUMROW coded, the field's own default is a single vertical column.
 * @param attributes - The field's DDS attributes
 */
function getChoiceLayout(attributes: AttributeWithIndicators[] | undefined): ChoiceLayout {
    const attr = attributes?.find(a => /^(SNGCHCFLD|MLTCHCFLD)\b/i.test(a.value));
    if (!attr) { return { gutter: 3 }; };

    const numCols = attr.value.match(/\*NUMCOL\s+(\d+)/i)?.[1];
    const numRows = attr.value.match(/\*NUMROW\s+(\d+)/i)?.[1];
    const gutter = attr.value.match(/\*GUTTER\s+(\d+)/i)?.[1];

    return {
        numCols: numCols ? Number(numCols) : undefined,
        numRows: numRows ? Number(numRows) : undefined,
        gutter: gutter ? Number(gutter) : 3
    };
};

/** One CHOICE() option belonging to a SNGCHCFLD/MLTCHCFLD field, in source order. */
interface ChoiceOption {
    number: string;
    text: string;
    lineIndex: number;
};

/**
 * Extracts a selection field's CHOICE() options, in source order — the same order a real 5250
 * lists them in (confirmed against STRSDA), one per line as "N. text", below/right of the field's
 * own input box. Only a literal 'text' choice can be shown; a program-to-system field reference
 * (&fieldname) has no compile-time value, so it falls back to showing the field name itself.
 * @param attributes - The field's DDS attributes
 */
function getChoiceOptions(attributes: AttributeWithIndicators[] | undefined): ChoiceOption[] {
    if (!attributes) { return []; };

    const options: ChoiceOption[] = [];
    for (const attr of attributes) {
        const match = attr.value.match(/^CHOICE\(\s*(\d+)\s+(.+?)\)\s*;?$/i);
        if (!match) { continue; };

        const [, number, rest] = match;
        const quoted = rest.match(/^'([^']*)'/);
        const text = quoted ? quoted[1] : rest.replace(/^&/, '').trim();
        options.push({ number, text, lineIndex: attr.lineIndex });
    };
    return options;
};

/**
 * Determines the display color for a field/constant based on its COLOR() DDS keyword, if any —
 * falling back to white (not the default green) when DSPATR(HI) is set without an explicit color,
 * matching a real 5250 display.
 * @param attributes - The element's DDS attributes
 * @param highIntensity - Whether the element also carries DSPATR(HI)
 * @returns A CSS color string
 */
function getDisplayColor(attributes: AttributeWithIndicators[] | undefined, highIntensity: boolean): string {
    const ddsColorMap = getDdsColorMap();
    const colorAttr = attributes?.find(attr => /^COLOR\([A-Z]{3}\)$/.test(attr.value));
    if (!colorAttr) {
        return highIntensity ? ddsColorMap.WHT : ddsColorMap.GRN;
    };

    const code = colorAttr.value.match(/^COLOR\(([A-Z]{3})\)$/)?.[1];
    return (code && ddsColorMap[code]) || (highIntensity ? ddsColorMap.WHT : ddsColorMap.GRN);
};

/**
 * Checks whether a field/constant carries a given DSPATR() keyword (e.g. DSPATR(UL)).
 * @param attributes - The element's DDS attributes
 * @param code - The two-letter DSPATR code to look for (HI, RI, BL, UL, ND, CS)
 */
function hasDisplayAttribute(attributes: AttributeWithIndicators[] | undefined, code: string): boolean {
    return Boolean(attributes?.some(attr => attr.value === `DSPATR(${code})`));
};

/**
 * Groups an attribute's DDS keyword for the "no indicator simulation" fallback: all COLOR() lines
 * are alternatives for the same thing (only one color can apply), while each distinct DSPATR()
 * code is its own independent flag.
 * @param value - The attribute's raw keyword text (e.g. "COLOR(BLU)", "DSPATR(HI)")
 */
function attributeGroupKey(value: string): string {
    const upper = value.toUpperCase();
    return upper.startsWith('COLOR(') ? 'COLOR' : upper;
};

/**
 * Finds the record's WINDOW() keyword, if any. When the record is conditioned by more than one
 * display format (one WINDOW() line per format), picks the one matching activeFormat.
 * @param recordName - Name of the record to inspect
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function findWindowAttribute(recordName: string, activeFormat?: string): { startRow: number; startCol: number; numRows: number; numCols: number; lineIndex: number; hasOwnMessageLine: boolean } | undefined {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    const candidates = record?.attributes?.filter(a => a.value.toUpperCase().startsWith('WINDOW(')) ?? [];
    const attr = pickForActiveFormat(candidates, activeFormat);
    if (!attr) {
        return undefined;
    };

    const match = attr.value.match(/WINDOW\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)((?:\s+[^)]*)?)\s*\)/i);
    if (!match) {
        return undefined;
    };

    // Per the DDS reference (WINDOW keyword, "MSGLIN parameter"): a window's own last content line
    // is reserved as its message line by default — *NOMSGLIN is what opts OUT of that, moving error
    // messages back to the bottom of the physical display (or MSGLOC) instead.
    const hasOwnMessageLine = !/\*NOMSGLIN\b/i.test(match[5] ?? '');

    return {
        startRow: parseInt(match[1], 10),
        startCol: parseInt(match[2], 10),
        numRows: parseInt(match[3], 10),
        numCols: parseInt(match[4], 10),
        lineIndex: attr.lineIndex,
        hasOwnMessageLine
    };
};

/** A window's title, extracted from its WDWTITLE() keyword. */
interface WindowTitle {
    text: string;
    position: 'TOP' | 'BOTTOM';
    align: 'LEFT' | 'CENTER' | 'RIGHT';
    /** The title's own *COLOR code (e.g. "GRN"), if coded — defaults to the border's color otherwise. */
    color?: string;
    /** The title's own *DSPATR codes, if coded — defaults to the border's display attributes otherwise. */
    dspatr?: string[];
};

/**
 * Finds and parses the record's WDWTITLE() keyword, if any. When the record shares its window
 * with another record (WINDOW(other-record-name), or an SFL/SFLCTL pair where only one side
 * declares the window), the title is commonly only present on that owner record — falls back
 * to it if the record itself has none. When conditioned by more than one display format (one
 * WDWTITLE() per format), picks the one matching activeFormat.
 * Handles the common form WDWTITLE((*TEXT 'title text') [*TOP|*BOTTOM] [*LEFT|*CENTER|*RIGHT]).
 * @param recordName - Name of the record to inspect
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function findWindowTitle(recordName: string, activeFormat?: string): WindowTitle | undefined {
    const ownerName = getEffectiveSize(recordName, activeFormat)?.sharedFromRecord;

    for (const name of ownerName ? [recordName, ownerName] : [recordName]) {
        const rec = fieldsPerRecords.find(r => r.record === name);
        const candidates = rec?.attributes?.filter(a => a.value.toUpperCase().startsWith('WDWTITLE(')) ?? [];
        const attr = pickForActiveFormat(candidates, activeFormat);
        if (!attr) {
            continue;
        };

        const textMatch = attr.value.match(/WDWTITLE\(\(\*\w+\s+'([^']*)'\)/i);
        if (!textMatch) {
            continue;
        };

        const upperValue = attr.value.toUpperCase();
        const position = upperValue.includes('*BOTTOM') ? 'BOTTOM' : 'TOP';
        // Per the DDS reference: centered by default when embedded in the top border, left-aligned
        // by default in the bottom border — *LEFT/*RIGHT/*CENTER always overrides either default.
        const align = upperValue.includes('*RIGHT') ? 'RIGHT'
            : upperValue.includes('*LEFT') ? 'LEFT'
            : (position === 'BOTTOM' ? 'LEFT' : 'CENTER');

        const color = upperValue.match(/\(\s*\*COLOR\s+(\w+)\s*\)/)?.[1];
        const dspatrList = upperValue.match(/\(\s*\*DSPATR((?:\s+\w+)+)\s*\)/)?.[1];
        const dspatr = dspatrList ? dspatrList.trim().split(/\s+/) : undefined;

        return { text: textMatch[1], position, align, color, dspatr };
    };

    return undefined;
};

/**
 * Resolves a window title's final on-screen appearance: its own *COLOR/*DSPATR when coded on the
 * WDWTITLE() keyword itself, defaulting to the border's own otherwise (per the DDS reference) — and
 * whether it gets a padding space on each side, which DDS only adds when the title specifies a
 * color or display attribute of its own; otherwise the border characters flow right up to the
 * title's first/last character.
 * @param title - The parsed WDWTITLE() info
 * @param border - The window's resolved border (see `resolveWindowBorder`)
 */
function resolveTitleAppearance(title: WindowTitle, border: WindowBorder): WindowTitle & {
    hexColor: string;
    reverseImage: boolean;
    highIntensity: boolean;
    underline: boolean;
    blink: boolean;
    padded: boolean;
} {
    const dspatr = title.dspatr;
    return {
        ...title,
        hexColor: (title.color && getDdsColorMap()[title.color]) || border.color,
        reverseImage: dspatr ? dspatr.includes('RI') : border.reverseImage,
        highIntensity: dspatr ? dspatr.includes('HI') : border.highIntensity,
        underline: dspatr ? dspatr.includes('UL') : border.underline,
        blink: dspatr ? dspatr.includes('BL') : border.blink,
        padded: Boolean(title.color || dspatr)
    };
};

/** A window's resolved border: color, display attributes, and its 8 border characters (WDWBORDER). */
interface WindowBorder {
    color: string;
    reverseImage: boolean;
    highIntensity: boolean;
    underline: boolean;
    blink: boolean;
    chars: string[];
};

// WDWBORDER's own default when no *CHAR is coded at any level (DDS reference): period for the top
// border/corners, colon for the sides/bottom corners. Order: top-left, top, top-right, left, right,
// bottom-left, bottom, bottom-right.
const DEFAULT_WDWBORDER_CHARS = ['.', '.', '.', ':', ':', ':', '.', ':'];

/** WDWBORDER's own default color when none is coded at any level. */
const DEFAULT_WDWBORDER_COLOR = 'BLU';

/**
 * Parses the *COLOR/*DSPATR/*CHAR parameters out of one WDWBORDER(...) keyword's raw value —
 * whichever subset it specifies (at least one is required, but never all three).
 * @param value - The raw WDWBORDER(...) keyword text
 */
function parseWdwBorderParams(value: string): { color?: string; dspatr?: string[]; chars?: string[] } {
    const color = value.match(/\(\s*\*COLOR\s+(\w+)\s*\)/i)?.[1]?.toUpperCase();
    const dspatrList = value.match(/\(\s*\*DSPATR((?:\s+\w+)+)\s*\)/i)?.[1];
    const dspatr = dspatrList ? dspatrList.trim().toUpperCase().split(/\s+/) : undefined;
    const charText = value.match(/\(\s*\*CHAR\s+'([^']*)'\s*\)/i)?.[1];
    const chars = charText !== undefined ? [...charText.padEnd(8, ' ')].slice(0, 8) : undefined;

    return { color, dspatr, chars };
};

/**
 * Combines every active WDWBORDER() candidate at one level (the file's, or one record's) into a
 * single set of parameters — DDS allows more than one WDWBORDER at the same level, combining
 * whichever parameters each one specifies; when two specify the *same* parameter, the first wins.
 * @param values - Raw WDWBORDER(...) keyword texts, in source order
 */
function combineWdwBorderLevel(values: string[]): { color?: string; dspatr?: string[]; chars?: string[] } {
    let color: string | undefined;
    let dspatr: string[] | undefined;
    let chars: string[] | undefined;

    for (const value of values) {
        const parsed = parseWdwBorderParams(value);
        color = color ?? parsed.color;
        dspatr = dspatr ?? parsed.dspatr;
        chars = chars ?? parsed.chars;
    };

    return { color, dspatr, chars };
};

/** A single function-key command (CAxx/CFxx), as relevant to the preview's legend. */
interface FunctionKeyCommand {
    type: 'CA' | 'CF';
    keyNumber: string;
    description: string;
    indicators?: DdsIndicator[];
    displayFormat?: string;
};

/**
 * Parses CAxx()/CFxx() key command lines out of an arbitrary attribute list (a record's own, or the
 * file's) — same format `dspf-edit.add-keys.ts` generates/reads, kept independent since this also
 * needs each command's own indicators/display-format condition, which that command's own model
 * doesn't carry (it's only used there for a flat "current commands" summary).
 * @param attributes - Attribute lines to scan
 */
function extractFunctionKeyCommands(attributes: DdsAttribute[] | undefined): FunctionKeyCommand[] {
    const commands: FunctionKeyCommand[] = [];

    (attributes ?? []).forEach(attr => {
        // No length cap on the description here: DDS allows text longer than fits on one source
        // line (spilling onto a continuation line, already reassembled into `attr.value` by the
        // parser) — capping the match would silently drop keys with a longer description, e.g. one
        // that had to wrap (see dspf-edit.add-keys.ts's extractKeyCommandsFromAttributes for the
        // matching read-side fix, and validateKeyCommandDescription for where 25 legitimately still
        // applies: only when this tool itself creates a new one).
        const match = attr.value.match(/^(CA|CF)(\d{2})\(\d{2}\s+'([^']*)'\)$/);
        if (match) {
            commands.push({
                type: match[1] as 'CA' | 'CF',
                keyNumber: match[2],
                description: match[3],
                indicators: attr.indicators,
                displayFormat: attr.displayFormat
            });
        };
    });

    return commands;
};

/**
 * Resolves the candidate function-key commands (CAxx/CFxx) for a record, for the preview's
 * function-key legend: the record's own, plus the file-level ones (which apply to every record
 * format) — except for any key number the record already defines itself, which entirely overrides
 * the file-level one for that number, matching how DDS actually resolves it at runtime. A key
 * number can still yield more than one candidate here (e.g. two indicator-conditioned alternates,
 * "CA03 cond. on 50" / "CA03 cond. on N50") — narrowing that down to the one that currently applies
 * (by display format, then by indicator state) is the caller's job, the same way it's already done
 * for every other conditionable item in the preview (see `isItemDisplayed`/`filterForActiveFormat`).
 * @param recordName - Name of the record being previewed
 */
function getEffectiveFunctionKeyCommands(recordName: string): FunctionKeyCommand[] {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    const recordCommands = extractFunctionKeyCommands(record?.attributes);
    const overriddenNumbers = new Set(recordCommands.map(cmd => cmd.keyNumber));

    const fileCommands = extractFunctionKeyCommands(attributesFileLevel)
        .filter(cmd => !overriddenNumbers.has(cmd.keyNumber));

    return [...recordCommands, ...fileCommands];
};

/** Whether a record's attributes include the SFL keyword (i.e. it's a subfile detail record). */
function isSflRecordInfo(recordInfo: FieldsPerRecord): boolean {
    return recordInfo.attributes?.some(attr => attr.value === 'SFL') ?? false;
};

/** Whether a record's attributes include an SFLCTL() keyword (i.e. it's a subfile control record). */
function isSflCtlRecordInfo(recordInfo: FieldsPerRecord): boolean {
    return recordInfo.attributes?.some(attr => attr.value.toUpperCase().startsWith('SFLCTL(')) ?? false;
};

/**
 * Finds the control record for a subfile (SFL) record, i.e. the one carrying SFLCTL(sflRecordName).
 * @param sflRecordName - Name of the subfile (SFL) record
 */
function findSflControlRecord(sflRecordName: string): FieldsPerRecord | undefined {
    return fieldsPerRecords.find(r =>
        r.attributes?.some(attr => {
            const match = attr.value.match(/^SFLCTL\(\s*([A-Za-z0-9@#$]+)\s*\)$/i);
            return Boolean(match && match[1].toUpperCase() === sflRecordName.toUpperCase());
        })
    );
};

/**
 * Finds an SFLCTL record's own SFLPAG() attribute (the candidate matching activeFormat, when
 * conditioned by more than one display format).
 * @param recordInfo - The SFLCTL record
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function findOwnSflPagAttribute(recordInfo: FieldsPerRecord, activeFormat?: string): DdsAttribute | undefined {
    const candidates = recordInfo.attributes?.filter(a => a.value.toUpperCase().startsWith('SFLPAG(')) ?? [];
    return pickForActiveFormat(candidates, activeFormat);
};

/**
 * Finds the SFLPAG (page size, i.e. number of subfile rows shown at once) for a subfile record,
 * by locating its control record (the one with SFLCTL(sflRecordName)) and reading SFLPAG() from it.
 * When conditioned by more than one display format (one SFLPAG() per format), picks the one
 * matching activeFormat.
 * @param sflRecordName - Name of the subfile (SFL) record
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function findSubfilePageSize(sflRecordName: string, activeFormat?: string): number | undefined {
    const controlRecord = findSflControlRecord(sflRecordName);
    if (!controlRecord) {
        return undefined;
    };

    const pagAttr = findOwnSflPagAttribute(controlRecord, activeFormat);
    const match = pagAttr?.value.match(/SFLPAG\(\s*(\d+)\s*\)/i);
    return match ? parseInt(match[1], 10) : undefined;
};

/**
 * Finds the "other half" of a subfile pair: given the SFL detail record, its control record
 * (SFLCTL); given the control record, the SFL detail record it controls. Used to automatically
 * show the header (SFLCTL) alongside the detail rows (SFL), or vice versa, since neither preview
 * is complete on its own.
 * @param recordName - Name of an SFL or SFLCTL record
 */
function findSubfilePairRecordName(recordName: string): string | undefined {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    if (!record) {
        return undefined;
    };

    if (isSflRecordInfo(record)) {
        return findSflControlRecord(recordName)?.record;
    };

    const sflctlAttr = record.attributes?.find(attr => attr.value.toUpperCase().startsWith('SFLCTL('));
    const match = sflctlAttr?.value.match(/^SFLCTL\(\s*([A-Za-z0-9@#$]+)\s*\)$/i);
    return match?.[1];
};

/**
 * Finds the record that actually owns a shared window, i.e. the one named by
 * WINDOW(other-record-name) (or, transitively, the SFL/SFLCTL pair that inherited it). Used to
 * automatically show that owner as background too, since it commonly carries the WDWTITLE and
 * other static text (e.g. function-key footers) that belong to the window as a whole.
 * @param recordName - Name of the record to inspect
 */
function findWindowOwnerRecordName(recordName: string, activeFormat?: string): string | undefined {
    const owner = getEffectiveSize(recordName, activeFormat)?.sharedFromRecord;
    return owner && owner.toUpperCase() !== recordName.toUpperCase() ? owner : undefined;
};

/**
 * Identifies which window a record's own content belongs to, for comparing whether two records
 * share the exact same window (as opposed to one merely being positioned behind the other): the
 * record's own name if it defines a window directly, or the name of the record it borrows one
 * from (WINDOW(other-record-name), or an inherited SFL/SFLCTL pair). Undefined for non-window records.
 * @param recordName - Name of the record to inspect
 */
function windowOwnerOf(recordName: string, activeFormat?: string): string | undefined {
    const size = getEffectiveSize(recordName, activeFormat);
    if (size?.source !== 'window') {
        return undefined;
    };
    return size.sharedFromRecord ?? recordName;
};

/**
 * Resolves a record's effective size: the live, display-format-aware resolution
 * (resolveRecordSizeForFormat) when a display format is actively selected in the preview, else the
 * cached parse-time size — unchanged behavior for files that don't declare multiple DSPSIZ formats.
 * @param recordName - Name of the record to resolve
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function getEffectiveSize(recordName: string, activeFormat?: string): DdsSize | undefined {
    if (activeFormat) {
        return resolveRecordSizeForFormat(recordName, activeFormat);
    };
    return fieldsPerRecords.find(r => r.record === recordName)?.size;
};

/**
 * Read-only visual preview panel for a single DDS record.
 * Shows fields/constants positioned on a monospace grid matching the record's screen size.
 * WINDOW records are drawn at their real screen position, on a canvas sized to the full display,
 * optionally with another record overlaid behind them to see how the window sits on top of it.
 * Refreshes automatically whenever the DDS source is re-parsed.
 */
export class RecordPreviewPanel {

    private static current: RecordPreviewPanel | undefined;

    private readonly panel: vscode.WebviewPanel;
    private recordName: string;
    private treeSubscription: vscode.Disposable | undefined;
    private treeProvider: DdsTreeProvider | undefined;
    private overlayRecordName: string | undefined;
    private indicatorsEnabled = false;
    private activeIndicators: Set<number> = new Set();
    private activeDisplayFormat: string | undefined;
    private lastRecordInfo: FieldsPerRecord | undefined;
    private lastSize: DdsSize | undefined;
    private focusModeActive = false;
    /** The field/constant node armed by the Actions menu's "Copy...", waiting for the webview to
     * report a canvas click (`copyElementAt`) to actually place it. Cleared once consumed. */
    private pendingCopySource: DdsNode | undefined;

    private constructor(recordName: string) {
        this.recordName = recordName;

        this.panel = vscode.window.createWebviewPanel(
            'dspfEditRecordPreview',
            `Preview: ${recordName}`,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            // retainContextWhenHidden: without it, VS Code tears down the webview's live page
            // (canvas, drag state, everything) whenever it's hidden — which moving/dragging the
            // panel to a different editor group briefly does — and only reloads the static HTML on
            // return, with nothing to trigger a fresh 'render' message; the canvas just stays blank
            // until some unrelated state change (editing the document, switching records...) happens
            // to call render() again. Keeping the page alive in the background avoids that entirely.
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getHtml();

        this.panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message));

        this.panel.onDidDispose(() => {
            this.treeSubscription?.dispose();
            if (RecordPreviewPanel.current === this) {
                RecordPreviewPanel.current = undefined;
            };
        });
    }

    /**
     * Whether a preview panel is currently open (used to decide whether tree selection changes
     * should retarget it to a different record).
     */
    static isOpen(): boolean {
        return RecordPreviewPanel.current !== undefined;
    };

    /**
     * Name of the record currently shown in the open preview panel, if any. Used to tell whether
     * a tree selection needs to retarget the panel or just highlight an item already shown in it.
     */
    static getCurrentRecordName(): string | undefined {
        return RecordPreviewPanel.current?.recordName;
    };

    /**
     * Whether the open preview panel currently has its "focus mode" on (source editor's group
     * maximized away). Commands that jump the source editor to a line after an edit — normally
     * triggered from the tree view — need this to avoid undoing the maximize.
     */
    static isFocusModeActive(): boolean {
        return RecordPreviewPanel.current?.focusModeActive ?? false;
    };

    /**
     * Moves the source editor's cursor/selection to `position` and reveals it — the "jump to what
     * was just edited" step used after tree-driven commands (move field/constant, delete, add...).
     * When the preview's focus mode is on, this deliberately skips vscode.window.showTextDocument
     * (which would surface the source editor's hidden group and undo the maximize) and just updates
     * the editor object directly instead, so the source is at the right spot whenever focus mode
     * gets turned off. Otherwise behaves as a normal "reveal and focus" jump.
     * @param editor - The source editor to reveal the position in
     * @param position - The position to move the cursor to and reveal
     */
    static async revealInSourceEditor(editor: vscode.TextEditor, position: vscode.Position): Promise<void> {
        if (RecordPreviewPanel.isFocusModeActive()) {
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenterIfOutsideViewport
            );
            return;
        };

        await vscode.window.showTextDocument(editor.document, {
            viewColumn: editor.viewColumn,
            preserveFocus: false
        });
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');
    };

    /**
     * Highlights the given source line in the open preview panel (the persistent selection box
     * shown when clicking a field/constant), without navigating the editor or changing the
     * previewed record. Used to mirror a tree selection into the preview. No-op if no panel is open.
     * @param lineIndex - Zero-based source line index to highlight
     */
    static selectLineIfOpen(lineIndex: number): void {
        RecordPreviewPanel.current?.panel.webview.postMessage({ type: 'selectLine', lineIndex });
    };

    /**
     * Rebuilds and re-renders the open preview panel's HTML — used after a preview color
     * changes (see dspf-edit.utils/dspf-edit.preview-colors.ts), since `getHtml()` only runs
     * once at construction otherwise. No-op if no panel is open.
     */
    static refreshTheme(): void {
        const panel = RecordPreviewPanel.current;
        if (!panel) { return; };
        panel.panel.webview.html = panel.getHtml();
        panel.render();
    };

    /**
     * Gets the single preview panel, retargeting it to the given record if it already exists,
     * or creates a new one.
     * @param recordName - Name of the record to preview
     * @param treeProvider - The tree provider, used to force a re-parse right after a drag/resize edit
     */
    static getOrCreate(recordName: string, treeProvider: DdsTreeProvider): RecordPreviewPanel {
        const existing = RecordPreviewPanel.current;
        if (existing) {
            existing.recordName = recordName;
            existing.treeProvider = treeProvider;
            existing.overlayRecordName = undefined;
            // indicatorsEnabled (the "Indicators" toggle checkbox) and activeDisplayFormat (the
            // selected DSPSIZ format, e.g. *DS3) are deliberately NOT reset here — they're panel-wide
            // view preferences (formats are file-level, not per-record) that should stay as the user
            // left them when switching which record is previewed.
            existing.activeIndicators = new Set();
            existing.panel.title = `Preview: ${recordName}`;
            // Reveal without forcing a column: the user may have moved the panel elsewhere
            // (e.g. to a bottom group), and switching records shouldn't snap it back to "Beside".
            existing.panel.reveal(undefined, true);
            return existing;
        };

        const created = new RecordPreviewPanel(recordName);
        created.treeProvider = treeProvider;
        RecordPreviewPanel.current = created;
        return created;
    };

    /**
     * Registers the listener that keeps this panel in sync with tree refreshes (i.e. re-parses of the DDS source).
     * Only one subscription is kept per panel; callers may call this again safely.
     * @param onRefresh - Callback invoked whenever the tree/model is refreshed
     */
    setRefreshSource(event: vscode.Event<any>, onRefresh: () => void): void {
        this.treeSubscription?.dispose();
        this.treeSubscription = event(onRefresh);
    };

    /**
     * Receives the current record's data and (re-)renders the preview.
     * @param recordInfo - The record's fields/constants, or undefined if the record no longer exists
     * @param size - The record's screen size (rows/cols; window origin when it's a WINDOW record)
     */
    update(recordInfo: FieldsPerRecord | undefined, size: DdsSize | undefined): void {
        this.lastRecordInfo = recordInfo;
        this.lastSize = size;
        this.render();
    };

    /**
     * Resolves the previewed record's current geometry (size, whether it's a window, and the
     * row/col offset that places its record-local coordinates on the screen canvas), honoring the
     * active display format. Shared by `render()` and by anything that needs to convert a screen
     * click back to a record-local position (e.g. placing a new constant).
     */
    private resolveActiveGeometry(): {
        recordInfo: FieldsPerRecord;
        size: DdsSize;
        isWindow: boolean;
        rowOffset: number;
        colOffset: number;
        minDetailRow: number | null;
    } | null {
        const recordInfo = this.lastRecordInfo;
        if (!recordInfo || !this.lastSize) {
            return null;
        };

        const availableFormats = getAvailableDisplayFormats();

        // A previously-selected format can stop being valid for what's being previewed now — the
        // panel is reused across documents (switching which record is shown doesn't recreate it), so
        // a format kept from a different file, or one a live edit just dropped from DSPSIZ, must be
        // let go too. Left in place, the format dropdown would try to select a value with no matching
        // <option>, which a <select> just renders blank instead of falling back to any real choice.
        if (this.activeDisplayFormat && !availableFormats.some(f => f.name === this.activeDisplayFormat)) {
            this.activeDisplayFormat = undefined;
        };

        // Default to the first declared format so a record's WINDOW()/attributes conditioned per
        // format resolve consistently from the very first render, instead of showing every
        // candidate at once. The selector itself stays locked to it when the file only declares one.
        if (availableFormats.length > 0 && !this.activeDisplayFormat) {
            this.activeDisplayFormat = availableFormats[0].name;
        };

        // With a format actively selected, re-resolve the record's size live (it may be
        // conditioned differently per format, e.g. a WINDOW() line per format); otherwise use the
        // cached, parse-time size exactly as before.
        const size = this.activeDisplayFormat
            ? resolveRecordSizeForFormat(this.recordName, this.activeDisplayFormat)
            : this.lastSize;

        const isWindow = size.source === 'window';

        // A window is drawn at its real screen position, on a canvas sized to the full display,
        // so its own fields/constants (which are stored record-local, 1-based) need shifting by
        // its origin plus the border inset (see WINDOW_BORDER_* above): local col 1 must land on
        // originCol + WINDOW_BORDER_LEFT, so the offset itself is one less than that.
        const rowOffset = isWindow ? size.originRow + (WINDOW_BORDER_TOP - 1) : 0;
        const colOffset = isWindow ? size.originCol + (WINDOW_BORDER_LEFT - 1) : 0;

        // A subfile detail (SFL) record's own rows shouldn't be draggable up into the area already
        // occupied by its SFLCTL header's static content (labels, titles...) — that's not a valid
        // screen layout, the repeating detail area has to start below wherever the header ends.
        let minDetailRow: number | null = null;
        if (isSflRecordInfo(recordInfo)) {
            const pairName = findSubfilePairRecordName(this.recordName);
            const headerItems = pairName ? this.buildBackgroundItemsFor(pairName) : undefined;
            if (headerItems && headerItems.length > 0) {
                minDetailRow = Math.max(...headerItems.map(item => item.row)) + 1;
            };
        };

        return { recordInfo, size, isWindow, rowOffset, colOffset, minDetailRow };
    };

    /**
     * Renders the last received record data, honoring the current overlay selection.
     * Split out from `update()` so changing the overlay (a pure view change) can re-render
     * without needing a fresh parse.
     */
    private render(): void {
        const geometry = this.resolveActiveGeometry();
        if (!geometry) {
            this.panel.webview.postMessage({ type: 'notFound' });
            return;
        };
        const { recordInfo, size, isWindow, rowOffset, colOffset, minDetailRow } = geometry;

        const availableFormats = getAvailableDisplayFormats();
        const defaultSize = this.activeDisplayFormat
            ? (getSizeForFormat(this.activeDisplayFormat) ?? getDefaultSize())
            : getDefaultSize();

        const canvasSize = isWindow ? { rows: defaultSize.rows, cols: defaultSize.cols } : { rows: size.rows, cols: size.cols };

        const items = this.buildItems(recordInfo, rowOffset, colOffset, false);
        if (isSflRecordInfo(recordInfo)) {
            items.push(...this.buildSubfileRepeats(items, this.recordName));
        };

        // The overlaid (background) record can be previewed on its own, whether or not it's itself
        // a window, no matter what the record being previewed is. Indicator simulation doesn't
        // apply to it, so its own indicators aren't offered in the toggle list either.
        const backgroundItems: PreviewItem[] = [];
        const shownAsBackground = new Set<string>([this.recordName]);
        const toProcess: string[] = [this.recordName];

        const addBackground = (name: string | undefined): void => {
            if (!name || shownAsBackground.has(name)) {
                return;
            };
            const items = this.buildBackgroundItemsFor(name);
            if (!items) {
                return;
            };
            backgroundItems.push(...items);
            shownAsBackground.add(name);
            toProcess.push(name);
        };

        addBackground(this.overlayRecordName);

        // A subfile's own preview is incomplete without its counterpart: the SFL detail record
        // has no header/titles of its own (those live on the SFLCTL record), and the SFLCTL record
        // has no rows of its own. Likewise, a record whose WINDOW() keyword only names another
        // record (or that inherited its window from an SFL/SFLCTL pair) is missing that owner's
        // own content (e.g. WDWTITLE, footer text). Show whichever of these isn't already visible,
        // automatically, following the chain (e.g. SFL -> its SFLCTL -> that SFLCTL's window owner).
        for (let i = 0; i < toProcess.length; i++) {
            const anchor = toProcess[i];
            addBackground(findSubfilePairRecordName(anchor));
            addBackground(findWindowOwnerRecordName(anchor, this.activeDisplayFormat));
        };

        const availableIndicators = this.collectIndicatorNumbers(recordInfo).sort((a, b) => a - b);

        // The content area (where fields/constants live); its top-left is 1 row/col inside the border.
        const windowFrame: WindowFrame | null = isWindow
            ? { row: size.originRow + WINDOW_BORDER_TOP, col: size.originCol + WINDOW_BORDER_LEFT, rows: size.rows, cols: size.cols }
            : null;

        // The visual border itself: the content area padded out by the border widths.
        const outerFrame: WindowFrame | null = (isWindow && windowFrame)
            ? {
                row: size.originRow,
                col: size.originCol,
                rows: windowFrame.rows + WINDOW_BORDER_TOP + WINDOW_BORDER_BOTTOM,
                cols: windowFrame.cols + WINDOW_BORDER_LEFT + WINDOW_BORDER_RIGHT
            }
            : null;

        // A window can't be resized past the edge of the physical screen it's positioned on
        // (accounting for the border that surrounds the content area on every side).
        const maxSize = isWindow
            ? {
                rows: defaultSize.rows - size.originRow - (WINDOW_BORDER_TOP + WINDOW_BORDER_BOTTOM) + 1,
                cols: defaultSize.cols - size.originCol - (WINDOW_BORDER_LEFT + WINDOW_BORDER_RIGHT) + 1
            }
            : null;

        const availableRecords = records.filter(name => name !== this.recordName);
        const rawWindowTitle = isWindow ? (findWindowTitle(this.recordName, this.activeDisplayFormat) ?? null) : null;
        const windowBorder = isWindow ? this.resolveWindowBorder(this.resolveWindowRecordName()) : null;
        const windowTitle = (rawWindowTitle && windowBorder) ? resolveTitleAppearance(rawWindowTitle, windowBorder) : rawWindowTitle;
        const errorMessage = this.resolveErrorMessage(recordInfo);

        // A window reserves its own last content line as a message line unless *NOMSGLIN is coded
        // on its WINDOW() keyword (DDS reference, WINDOW keyword's MSGLIN parameter) — when that's
        // the case, an active error shows there instead of at the bottom of the physical display.
        const windowInfoForMsgLine = isWindow ? findWindowAttribute(this.resolveWindowRecordName(), this.activeDisplayFormat) : undefined;
        const errorMessageFrame = (errorMessage && windowFrame && (windowInfoForMsgLine?.hasOwnMessageLine ?? true))
            ? { row: windowFrame.row + windowFrame.rows - 1, col: windowFrame.col, cols: windowFrame.cols }
            : null;

        const sflPagAttr = isSflCtlRecordInfo(recordInfo) ? findOwnSflPagAttribute(recordInfo, this.activeDisplayFormat) : undefined;
        const sflPagMatch = sflPagAttr?.value.match(/SFLPAG\(\s*(\d+)\s*\)/i);
        const sflPag = sflPagMatch ? parseInt(sflPagMatch[1], 10) : null;

        // Function-key legend (e.g. "F3=Exit  F12=Cancel"): file-level + record-level CAxx/CFxx.
        const functionKeys = this.getVisibleFunctionKeys(this.recordName);

        this.panel.webview.postMessage({
            type: 'render',
            recordName: this.recordName,
            size: canvasSize,
            isWindow,
            windowFrame,
            outerFrame,
            windowTitle,
            windowBorder,
            errorMessage,
            errorMessageFrame,
            sflPag,
            maxSize,
            availableRecords,
            overlayRecordName: this.overlayRecordName ?? null,
            availableIndicators,
            indicatorsEnabled: this.indicatorsEnabled,
            activeIndicators: [...this.activeIndicators],
            availableFormats,
            activeDisplayFormat: this.activeDisplayFormat ?? null,
            minDetailRow,
            items,
            backgroundItems,
            functionKeys
        });
    };

    /**
     * Builds background (dimmed, non-interactive) items for an arbitrary record by name: figures
     * out its own offset (in case it's itself a window) and expands subfile page-repeats if it's
     * an SFL record. Used for both the manual overlay and the automatic SFL/SFLCTL pairing.
     * @param recordName - Name of the record to render as background
     */
    private buildBackgroundItemsFor(recordName: string): PreviewItem[] | undefined {
        const record = fieldsPerRecords.find(r => r.record === recordName);
        if (!record) {
            return undefined;
        };

        const size = getEffectiveSize(recordName, this.activeDisplayFormat);
        const isWin = size?.source === 'window';
        const rOffset = isWin && size ? size.originRow + (WINDOW_BORDER_TOP - 1) : 0;
        const cOffset = isWin && size ? size.originCol + (WINDOW_BORDER_LEFT - 1) : 0;

        const items = this.buildItems(record, rOffset, cOffset, true);
        if (isSflRecordInfo(record)) {
            items.push(...this.buildSubfileRepeats(items, recordName));
        };

        // A same-window item (an auto-paired SFL/SFLCTL half, or the window's owner) is part of
        // the window's own content and must show through its opaque frame, unlike a genuinely
        // different record merely positioned behind the window.
        const foregroundOwner = windowOwnerOf(this.recordName, this.activeDisplayFormat);
        const sameWindow = foregroundOwner !== undefined && windowOwnerOf(recordName, this.activeDisplayFormat) === foregroundOwner;
        for (const item of items) {
            item.sameWindow = sameWindow;
        };

        return items;
    };

    /**
     * Builds the preview items for a record's fields/constants, shifted by the given offset.
     * @param recordInfo - The record's fields/constants
     * @param rowOffset - Added to each field/constant's own row (0 unless this is a window's own content)
     * @param colOffset - Added to each field/constant's own col (0 unless this is a window's own content)
     * @param isBackground - Whether these items belong to the record overlaid behind a window
     */
    private buildItems(recordInfo: FieldsPerRecord, rowOffset: number, colOffset: number, isBackground: boolean): PreviewItem[] {
        const items: PreviewItem[] = [];

        // The parser stores a subfile (SFL) record's field/constant row and column swapped
        // (a leftover of how move-fields/move-constants track "horizontal" movement for SFLs).
        // Undo that swap here to get the real screen row/col for display.
        const isSfl = isSflRecordInfo(recordInfo);

        // Indicator toggling only applies to the record being actively previewed; an overlaid
        // background record always uses the resting state (every indicator OFF), regardless of
        // what's toggled for the foreground record.
        const useLiveIndicators = this.indicatorsEnabled && !isBackground;
        const documentUri = ExtensionState.lastDdsDocument?.uri.toString();

        for (const field of recordInfo.fields) {
            if (this.activeDisplayFormat && field.displayFormat && field.displayFormat !== this.activeDisplayFormat) {
                continue;
            };
            if (!this.isItemDisplayed(field.indicators, useLiveIndicators)) {
                continue;
            };

            const trueRow = isSfl ? field.col : field.row;
            const trueCol = isSfl ? field.row : field.col;

            if (trueRow > 0 && trueCol > 0) {
                const activeAttrs = this.getActiveAttributes(field.attributes, useLiveIndicators);
                const usageCode = (field.usage || '').trim().toUpperCase();
                // A referenced field (REFFLD/position-29 `R`) has no type/length of its own in the
                // source — they live in the external database field, which dspf-edit can't read on
                // its own — so it's shown as a single marker character instead of a guessed-width
                // placeholder, unless its real type/length has already been resolved (via the
                // "Resolve Referenced Field" tree command), in which case it renders like any other
                // field, just tinted the reference color when it carries no COLOR()/DSPATR() of its own.
                const resolvedRef = field.referenced && documentUri ? getResolvedRef(documentUri, recordInfo.record, field.name) : undefined;
                const isReferenced = field.referenced === true && !resolvedRef;
                // The displayed text's own length drives the item's width/hit-box (below), not the
                // parsed field length: a system keyword field (DATE, USER...) always renders at a
                // fixed width of its own, regardless of whatever the source's length column holds
                // — and an edited numeric field (EDTWRD, or EDTCDE with a standard code) is wider
                // per insert character (its decimal point, thousands commas, sign...), which
                // text.length already reflects.
                const effectiveLength = resolvedRef?.length ?? field.length;
                const rawDecimals = resolvedRef?.decimals ?? field.decimals;
                const effectiveDecimals = rawDecimals ?? 0;
                const effectiveType = resolvedRef?.type ?? field.type;
                const editingMask = getEditingMask(activeAttrs, effectiveType, field.usage, effectiveLength, effectiveDecimals, rawDecimals);
                const text = isReferenced
                    ? getFieldPlaceholderText(field.name, field.type, field.usage, 1)
                    : getFieldPlaceholderText(field.name, effectiveType, field.usage, effectiveLength, editingMask, rawDecimals);
                const color = isReferenced || (field.referenced && activeAttrs.length === 0)
                    ? getReferencedFieldColor()
                    : getDisplayColor(activeAttrs, hasDisplayAttribute(activeAttrs, 'HI'));
                // A drag handle to resize a field only makes sense when its displayed width maps
                // 1:1 back to its raw DDS length: not a referenced field (its length lives in the
                // external database field, not this source), not a system keyword like DATE/USER
                // (fixed width, no real length column), not carrying an editing mask (EDTCDE/EDTWRD
                // widen the display for the decimal point/commas/sign beyond the raw length, and an
                // unedited signed-numeric/decimal-point-bearing field reserves its own extra
                // sign/decimal position the same way — see getUneditedNumericMask), and not
                // PSHBTNFLD (DDS requires it to be exactly length 2 — resizing it would produce
                // uncompilable DDS).
                const isSystemField = Boolean(SYSTEM_FIELD_PLACEHOLDER[field.name.trim().toUpperCase()]);
                const isPushButtonField = activeAttrs.some(attr => /^PSHBTNFLD\b/i.test(attr.value));
                const isResizable = !field.referenced && !isSystemField && !editingMask && !isPushButtonField;
                const minLength = effectiveDecimals > 0 ? effectiveDecimals + 1 : 1;
                const baseItem = {
                    kind: 'field' as const,
                    name: field.name,
                    col: trueCol + colOffset,
                    lineIndex: field.lineIndex,
                    color,
                    highIntensity: hasDisplayAttribute(activeAttrs, 'HI'),
                    reverseImage: hasDisplayAttribute(activeAttrs, 'RI') || this.hasActiveErrorMessage(field.attributes, useLiveIndicators),
                    blink: hasDisplayAttribute(activeAttrs, 'BL'),
                    underline: hasDisplayAttribute(activeAttrs, 'UL'),
                    columnSeparator: hasDisplayAttribute(activeAttrs, 'CS'),
                    nonDisplay: hasDisplayAttribute(activeAttrs, 'ND'),
                    rowOffset,
                    colOffset,
                    isBackground,
                    isInteractive: !isBackground,
                    isInputCapable: usageCode === 'I' || usageCode === 'B',
                    isReferenced,
                    isResizable,
                    minLength,
                    dataLength: isReferenced ? undefined : effectiveLength,
                    decimals: isReferenced ? undefined : effectiveDecimals
                };

                // CNTFLD(n) wraps a field too long for one line across multiple rows, n characters
                // per row, all starting at the same column — matching how RDi previews it — instead
                // of a single run that overflows past the record's right edge. A wrapped line's own
                // width isn't the field's real length, so it's never individually resizable.
                const continuedWidth = getContinuedFieldWidth(activeAttrs);
                if (continuedWidth && continuedWidth > 0 && text.length > continuedWidth) {
                    const chunkCount = Math.ceil(text.length / continuedWidth);
                    for (let chunk = 0; chunk < chunkCount; chunk++) {
                        const chunkText = text.substr(chunk * continuedWidth, continuedWidth);
                        items.push({ ...baseItem, text: chunkText, row: trueRow + rowOffset + chunk, length: chunkText.length, isResizable: false });
                    };
                } else {
                    items.push({ ...baseItem, text, row: trueRow + rowOffset, length: text.length });
                };

                // SNGCHCFLD/MLTCHCFLD: confirmed against STRSDA — the field's own input box
                // (already pushed above) sits to the left of the choice list, each CHOICE()
                // rendered as "<number>. <text>" (MLTCHCFLD lets the user type several numbers into
                // that same box; the choice list itself looks identical). With neither *NUMCOL nor
                // *NUMROW coded, that's a single vertical column starting on the field's own row
                // (fillSize 1 below degenerates the row-major layout to exactly that). *NUMCOL(n)
                // fills n choices per row before wrapping to the next row; *NUMROW(n) fills n
                // choices per column before starting the next column — same options, different
                // reading order. Every column uses one uniform width (the longest choice label,
                // plus the gutter), matching how SDA/RDi lay these out. Purely informational
                // (isInteractive false): CHOICE lines have no row/col of their own in DDS to
                // drag/reposition.
                //
                // PSHBTNFLD/PSHBTNCHC(), unlike SNGCHCFLD/MLTCHCFLD, was confirmed against STRSDA to
                // have *no* text fallback at all on a plain 5250 — the field just shows as an
                // ordinary input box, with no special handling here.
                if (isChoiceField(activeAttrs)) {
                    const options = getChoiceOptions(activeAttrs);
                    const layout = getChoiceLayout(activeAttrs);
                    const maxLabelLength = Math.max(0, ...options.map(o => `${o.number}. ${o.text}`.length));
                    const columnWidth = maxLabelLength + layout.gutter;
                    const columnMajor = layout.numRows !== undefined;
                    const fillSize = (columnMajor ? layout.numRows : layout.numCols) ?? 1;
                    const choiceCol = trueCol + colOffset + effectiveLength + 1;

                    options.forEach((option, index) => {
                        const rowIndex = columnMajor ? index % fillSize : Math.floor(index / fillSize);
                        const colIndex = columnMajor ? Math.floor(index / fillSize) : index % fillSize;
                        const label = `${option.number}. ${option.text}`;
                        items.push({
                            ...baseItem,
                            name: `${field.name}_CHOICE_${option.number}`,
                            text: label,
                            row: trueRow + rowOffset + rowIndex,
                            col: choiceCol + colIndex * columnWidth,
                            length: label.length,
                            lineIndex: option.lineIndex,
                            reverseImage: false,
                            underline: false,
                            isInteractive: false,
                            isInputCapable: false,
                            isReferenced: false,
                            isResizable: false
                        });
                    });
                };
            };
        };

        for (const constant of recordInfo.constants) {
            if (this.activeDisplayFormat && constant.displayFormat && constant.displayFormat !== this.activeDisplayFormat) {
                continue;
            };
            if (!this.isItemDisplayed(constant.indicators, useLiveIndicators)) {
                continue;
            };

            const trueRow = isSfl ? constant.col : constant.row;
            const trueCol = isSfl ? constant.row : constant.col;

            if (trueRow > 0 && trueCol > 0) {
                const activeAttrs = this.getActiveAttributes(constant.attributes, useLiveIndicators);
                // Same reasoning as the field loop above: a bare system keyword (DATE, USER...)
                // renders at its own fixed width, not the raw constant text's length.
                const isSystemConstant = Boolean(SYSTEM_FIELD_PLACEHOLDER[constant.name.trim().toUpperCase()]);
                const text = isSystemConstant ? SYSTEM_FIELD_PLACEHOLDER[constant.name.trim().toUpperCase()] : constant.name;
                items.push({
                    kind: 'constant',
                    name: constant.name,
                    text,
                    row: trueRow + rowOffset,
                    col: trueCol + colOffset,
                    length: text.length,
                    lineIndex: constant.lineIndex,
                    color: getDisplayColor(activeAttrs, hasDisplayAttribute(activeAttrs, 'HI')),
                    highIntensity: hasDisplayAttribute(activeAttrs, 'HI'),
                    reverseImage: hasDisplayAttribute(activeAttrs, 'RI'),
                    blink: hasDisplayAttribute(activeAttrs, 'BL'),
                    underline: hasDisplayAttribute(activeAttrs, 'UL'),
                    columnSeparator: hasDisplayAttribute(activeAttrs, 'CS'),
                    nonDisplay: hasDisplayAttribute(activeAttrs, 'ND'),
                    rowOffset,
                    colOffset,
                    isBackground,
                    isInteractive: !isBackground,
                    isInputCapable: false,
                    // A constant has no LENGTH keyword of its own in DDS — its width *is* its quoted
                    // literal's character count — so it's only resizable when it's a genuine literal
                    // (not a bare system keyword like DATE/USER, whose real display text isn't its
                    // stored name at all). Shrinking below its own trimmed (non-blank) text is never
                    // offered — only trailing blank padding can be added/removed.
                    isResizable: !isSystemConstant,
                    minLength: Math.max(constant.name.replace(/\s+$/, '').length, 1),
                    // Left-edge handle: excluded for a subfile record — the parser stores its
                    // row/column swapped (see `isSfl` above), and unlike the right handle (which
                    // never touches position), a left-resize has to rewrite the constant's column —
                    // not worth risking writing it to the wrong raw source column without a way to
                    // verify against real STRSDA for a subfile. See PreviewItem.isResizableLeft.
                    isResizableLeft: !isSystemConstant && !isSfl,
                    minLengthLeft: Math.max(constant.name.replace(/^\s+/, '').length, 1)
                });
            };
        };

        // Even with indicators resolved (live or resting-state), two genuinely unconditioned
        // items (or ones whose conditions aren't perfectly complementary) could still land on the
        // exact same spot — keep only the first-defined one so they don't render stacked.
        return this.dedupByPosition(items);
    };

    /**
     * Checks whether a field/constant's own line-level indicators (columns 7-15, e.g. "61"/"N61")
     * are satisfied. Indicators sharing the same `group` (all those coded on one line, plus any
     * ANDed onto it via 'A'-continuation lines) are ANDed together; different groups (started by an
     * 'O'-continuation line) are ORed — matching real DDS conditioning. Indicators with no `group`
     * (the common case: a single, non-continued line) are all treated as one group. With live
     * indicators, checks them against the currently toggled-on set. Otherwise, uses the resting
     * state — every indicator assumed OFF — so only unconditioned items and negated ("N")
     * conditions show; this is what makes mutually-exclusive alternates (e.g. one shown on "61",
     * another on "N61") resolve to a single, deterministic one even when they don't happen to share
     * the same screen position. No indicators at all means "always shown".
     * @param indicators - The item's own indicators
     * @param useLiveIndicators - Whether to check against the toggled-on indicator set, or assume all OFF
     */
    private isItemDisplayed(indicators: DdsIndicator[] | undefined, useLiveIndicators: boolean): boolean {
        if (!indicators || indicators.length === 0) {
            return true;
        };

        const satisfies = (ind: DdsIndicator) =>
            useLiveIndicators ? this.activeIndicators.has(ind.number) === ind.active : !ind.active;

        return groupIndicatorsByCondition(indicators).some(group => group.every(satisfies));
    };

    /**
     * Filters a field/constant's own COLOR()/DSPATR() attributes the same way visibility is
     * filtered: attributes conditioned on a display format other than the active one are dropped
     * first; then, ones whose own indicators aren't satisfied (checked live or against the resting
     * state — see isItemDisplayed) are dropped too. If more than one candidate for the same
     * keyword still remains (e.g. two unconditioned COLOR() lines), keeps just the first-defined one.
     * @param attributes - The field/constant's own attributes
     * @param useLiveIndicators - Whether to check against the toggled-on indicator set, or assume all OFF
     */
    private getActiveAttributes(attributes: AttributeWithIndicators[], useLiveIndicators: boolean): AttributeWithIndicators[] {
        const forFormat = filterForActiveFormat(attributes, this.activeDisplayFormat);
        const displayed = forFormat.filter(attr => this.isItemDisplayed(attr.indicators, useLiveIndicators));

        const seen = new Set<string>();
        const result: AttributeWithIndicators[] = [];
        for (const attr of displayed) {
            const key = attributeGroupKey(attr.value);
            if (seen.has(key)) {
                continue;
            };
            seen.add(key);
            result.push(attr);
        };
        return result;
    };

    /**
     * Resolves the function keys to show in the preview's legend for a record: every distinct key
     * number among its candidate CAxx/CFxx commands (see `getEffectiveFunctionKeyCommands` — record
     * overriding file), narrowed to the active display format. Unlike a field/constant, a key stays
     * in the legend even when its own indicator condition currently isn't satisfied — it's still
     * *defined*, just not presently enabled — so the caller can render it dimmed; `active` says
     * whether at least one of that key's candidates (there can be more than one — indicator-ANDed,
     * OR'd alternates, or just unconditioned) is currently satisfied (live simulation, same check
     * used everywhere else conditionable in the preview). When more than one candidate exists for a
     * number, the active one's description is shown (falling back to the first candidate's when
     * none currently apply).
     * @param recordName - Name of the record being previewed
     */
    private getVisibleFunctionKeys(recordName: string): { key: string; description: string; active: boolean }[] {
        const forFormat = filterForActiveFormat(getEffectiveFunctionKeyCommands(recordName), this.activeDisplayFormat);

        const byKeyNumber = new Map<string, FunctionKeyCommand[]>();
        for (const cmd of forFormat) {
            const candidates = byKeyNumber.get(cmd.keyNumber);
            if (candidates) {
                candidates.push(cmd);
            } else {
                byKeyNumber.set(cmd.keyNumber, [cmd]);
            };
        };

        const result: { key: string; description: string; active: boolean }[] = [];
        for (const [keyNumber, candidates] of byKeyNumber) {
            const activeCandidate = candidates.find(cmd => this.isItemDisplayed(cmd.indicators, this.indicatorsEnabled));
            const chosen = activeCandidate ?? candidates[0];
            result.push({ key: `F${parseInt(keyNumber, 10)}`, description: chosen.description, active: Boolean(activeCandidate) });
        };

        return result.sort((a, b) => parseInt(a.key.slice(1), 10) - parseInt(b.key.slice(1), 10));
    };

    /**
     * Whether a field's own ERRMSG() is currently active (its conditioning indicator satisfied) —
     * the field it's attached to is shown in reverse image while its error is in effect, same as a
     * real 5250 highlights the field an error message refers to.
     */
    private hasActiveErrorMessage(attributes: AttributeWithIndicators[], useLiveIndicators: boolean): boolean {
        const forFormat = filterForActiveFormat(attributes, this.activeDisplayFormat);
        return forFormat.some(attr => /^ERRMSG\(/i.test(attr.value) && this.isItemDisplayed(attr.indicators, useLiveIndicators));
    };

    /**
     * Finds the record's currently-active ERRMSG() message, if any: an ERRMSG keyword (record-level,
     * or on one of the record's own fields/constants) whose own conditioning indicator is satisfied
     * by the indicator simulation — same gating already used for COLOR()/DSPATR() via isItemDisplayed.
     * Shown on the display's message line (the bottom row) like a real 5250 error, in white.
     */
    private resolveErrorMessage(recordInfo: FieldsPerRecord): { text: string } | null {
        const candidates: { value: string; indicators?: DdsIndicator[]; displayFormat?: string }[] = [
            ...(recordInfo.attributes ?? []),
            ...recordInfo.fields.flatMap(field => field.attributes),
            ...recordInfo.constants.flatMap(constant => constant.attributes)
        ];

        const forFormat = filterForActiveFormat(candidates, this.activeDisplayFormat);
        for (const attr of forFormat) {
            if (!this.isItemDisplayed(attr.indicators, this.indicatorsEnabled)) {
                continue;
            };
            const errmsgMatch = attr.value.match(/^ERRMSG\('([^']+)'\s*(\d{2})?\)$/);
            if (errmsgMatch) {
                return { text: errmsgMatch[1] };
            };
        };
        return null;
    };

    /**
     * Keeps only the first (lowest lineIndex) item at each exact (row, col), so alternate
     * constants/fields that occupy the same spot don't render stacked on top of each other.
     */
    private dedupByPosition(items: PreviewItem[]): PreviewItem[] {
        const bestByPosition = new Map<string, PreviewItem>();

        for (const item of items) {
            const key = item.row + ',' + item.col;
            const existing = bestByPosition.get(key);
            if (!existing || item.lineIndex < existing.lineIndex) {
                bestByPosition.set(key, item);
            };
        };

        const kept = new Set(bestByPosition.values());
        return items.filter(item => kept.has(item));
    };

    /**
     * Collects the distinct indicator numbers referenced by a record's own fields/constants, and
     * its own record-level attributes (e.g. a record-level ERRMSG()) — used to populate the
     * indicator toggle list in the toolbar.
     */
    private collectIndicatorNumbers(recordInfo: FieldsPerRecord): number[] {
        const numbers = new Set<number>();
        for (const attr of recordInfo.attributes ?? []) {
            for (const ind of attr.indicators ?? []) {
                numbers.add(ind.number);
            };
        };
        for (const field of recordInfo.fields) {
            for (const ind of field.indicators ?? []) {
                numbers.add(ind.number);
            };
            for (const attr of field.attributes) {
                for (const ind of attr.indicators ?? []) {
                    numbers.add(ind.number);
                };
            };
        };
        for (const constant of recordInfo.constants) {
            for (const ind of constant.indicators ?? []) {
                numbers.add(ind.number);
            };
            for (const attr of constant.attributes) {
                for (const ind of attr.indicators ?? []) {
                    numbers.add(ind.number);
                };
            };
        };
        return [...numbers];
    };

    /**
     * Repeats a subfile's own base items for each additional visible page row (SFLPAG), stacked
     * downward. The repeats are display-only: dragging/clicking always targets the single real
     * source line, so only the first (base) instance stays interactive.
     * @param baseItems - The subfile's own items, as built for its first (real) row
     * @param recordName - Name of the subfile (SFL) record
     */
    private buildSubfileRepeats(baseItems: PreviewItem[], recordName: string): PreviewItem[] {
        const sflPag = findSubfilePageSize(recordName, this.activeDisplayFormat);
        if (!sflPag || sflPag <= 1 || baseItems.length === 0) {
            return [];
        };

        const rows = baseItems.map(item => item.row);
        const rowSpan = Math.max(...rows) - Math.min(...rows) + 1;

        const repeats: PreviewItem[] = [];
        for (let page = 1; page < sflPag; page++) {
            for (const item of baseItems) {
                repeats.push({ ...item, row: item.row + page * rowSpan, isInteractive: false });
            };
        };

        return repeats;
    };

    /**
     * Handles messages posted from the webview: click-to-navigate, drag-to-move, window resize,
     * and overlay selection.
     */
    private async onDidReceiveMessage(message: any): Promise<void> {
        if (message?.type === 'navigate' && typeof message.lineIndex === 'number') {
            await this.navigateToLine(message.lineIndex);
            return;
        };

        if (message?.type === 'move' && Array.isArray(message.moves)) {
            await this.moveElements(message.moves);
            return;
        };

        if (message?.type === 'resizeField' && typeof message.lineIndex === 'number' && typeof message.newLength === 'number') {
            await this.resizeField(message.lineIndex, message.newLength);
            return;
        };

        if (message?.type === 'resizeConstant' && typeof message.lineIndex === 'number' && typeof message.newLength === 'number') {
            await this.resizeConstant(message.lineIndex, message.newLength);
            return;
        };

        if (message?.type === 'resizeConstantLeft' && typeof message.lineIndex === 'number' && typeof message.newLength === 'number') {
            await this.resizeConstantLeft(message.lineIndex, message.newLength);
            return;
        };

        if (message?.type === 'resize' && typeof message.newRows === 'number' && typeof message.newCols === 'number') {
            await this.resizeWindow(message.newRows, message.newCols);
            return;
        };

        if (message?.type === 'moveWindow' && typeof message.newRow === 'number' && typeof message.newCol === 'number') {
            await this.moveWindowPosition(message.newRow, message.newCol);
            return;
        };

        if (message?.type === 'editWindowTitle') {
            await this.editWindowTitle();
            return;
        };

        if (message?.type === 'windowMenu') {
            await this.showWindowMenu();
            return;
        };

        if (message?.type === 'centerWindowHorizontally') {
            await this.centerWindowHorizontally();
            return;
        };

        if (message?.type === 'centerElement' && typeof message.lineIndex === 'number') {
            await this.centerElement(message.lineIndex);
            return;
        };

        if (message?.type === 'elementMenu' && Array.isArray(message.lineIndices)) {
            await this.showElementMenu(message.lineIndices);
            return;
        };

        if (message?.type === 'addConstantAt' && typeof message.row === 'number' && typeof message.col === 'number') {
            await this.addConstantAt(message.row, message.col);
            return;
        };

        if (message?.type === 'addFieldAt' && typeof message.row === 'number' && typeof message.col === 'number') {
            await this.addFieldAt(message.row, message.col);
            return;
        };

        if (message?.type === 'copyElementAt' && typeof message.row === 'number' && typeof message.col === 'number') {
            await this.copyElementAt(message.row, message.col);
            return;
        };

        if (message?.type === 'setOverlay') {
            this.overlayRecordName = message.recordName || undefined;
            this.render();
            return;
        };

        if (message?.type === 'setDisplayFormat' && typeof message.name === 'string') {
            this.activeDisplayFormat = message.name || undefined;
            this.render();
            return;
        };

        if (message?.type === 'setIndicatorsEnabled') {
            this.indicatorsEnabled = Boolean(message.enabled);
            this.render();
            return;
        };

        if (message?.type === 'toggleIndicator' && typeof message.number === 'number') {
            if (this.activeIndicators.has(message.number)) {
                this.activeIndicators.delete(message.number);
            } else {
                this.activeIndicators.add(message.number);
            };
            this.render();
            return;
        };

        if (message?.type === 'sflpagIncrement') {
            await this.adjustSubfilePageSize(1);
            return;
        };

        if (message?.type === 'sflpagDecrement') {
            await this.adjustSubfilePageSize(-1);
        };

        if (message?.type === 'toggleFocusMode') {
            await this.toggleFocusMode();
            return;
        };

        if (message?.type === 'openConfiguration') {
            // Guards the same rule the button's own disabled state already enforces: opening the
            // Configuration panel "beside" this one would silently drop focus mode (see
            // 'focusModeChanged' in the injected script) instead of respecting it.
            if (!this.focusModeActive) {
                await vscode.commands.executeCommand('dspf-edit.configure-preview-colors');
            };
            return;
        };
    };

    /**
     * Toggles "focus mode": maximizes the preview's editor group so it fills the editing area,
     * hiding the DDS source editor beside it. The Side Bar (tree view) isn't part of the editor
     * grid, so it stays visible throughout. Uses VS Code's own maximize-group state rather than
     * tracking layout ourselves, so it only reflects toggles made through this button.
     */
    private async toggleFocusMode(): Promise<void> {
        this.panel.reveal(undefined, false);
        await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
        this.focusModeActive = !this.focusModeActive;
        this.panel.webview.postMessage({ type: 'focusModeChanged', active: this.focusModeActive });
    };

    /**
     * Navigates the DDS editor to the given line (used when clicking a field/constant in the preview),
     * and also selects the matching node in the tree view, if one is found.
     * @param lineIndex - Zero-based line index to jump to
     */
    private async navigateToLine(lineIndex: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const position = new vscode.Position(lineIndex, 0);
        await RecordPreviewPanel.revealInSourceEditor(editor, position);

        const treeView = this.treeProvider?.getTreeView();
        if (this.treeProvider && treeView) {
            const node = await this.treeProvider.findFieldOrConstantNode(lineIndex);
            if (node) {
                try {
                    await treeView.reveal(node, { select: true, focus: false, expand: true });
                } catch {
                    // Ignore reveal errors (e.g. the item is currently filtered out of the tree).
                };
            };
        };
    };

    /**
     * Applies a drag-and-drop move from the preview (one item, or several dragged together as a
     * multi-selection): writes each one's new row/column back into its own DDS source line, at the
     * same fixed columns used by the move-fields/move-constants commands (raw columns 38-41 for
     * the row/line spec, 41-44 for the column/position spec). All moves land in a single
     * WorkspaceEdit, so a group move is also a single undo step.
     * Each screen position is converted back to record-local coordinates using the offset that was
     * applied when its item was built (non-zero only for a window's own fields/constants).
     * @param moves - One entry per moved field/constant: its line index, new screen row/col, and
     * the row/col offset to subtract to get back to record-local coordinates
     */
    private async moveElements(moves: Array<{ lineIndex: number; newRow: number; newCol: number; rowOffset: number; colOffset: number }>): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        // The raw source columns are always "Line spec" (38-41) / "Position spec" (41-44) — i.e.
        // row/col in that fixed order — for every record type. A subfile only swaps which of these
        // ends up labeled model.row/model.col internally (see buildItems' undo); the physical
        // columns themselves never swap, so no subfile-specific handling is needed here.
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uri = editor.document.uri;

        for (const move of moves) {
            if (move.lineIndex >= editor.document.lineCount) {
                continue;
            };

            const localRow = move.newRow - move.rowOffset;
            const localCol = move.newCol - move.colOffset;

            workspaceEdit.replace(uri, new vscode.Range(move.lineIndex, 38, move.lineIndex, 41), String(localRow).padStart(3, ' '));
            workspaceEdit.replace(uri, new vscode.Range(move.lineIndex, 41, move.lineIndex, 44), String(localCol).padStart(3, ' '));
        };

        if (!(await applyWorkspaceEdit(workspaceEdit, moves.length > 1 ? 'move the elements' : 'move the element'))) {
            return;
        };
        this.forceReparse(editor.document);
    };

    /**
     * Applies a drag-to-resize from the preview (dragging a field's own right-edge handle): writes
     * its new length into the raw "Length" column (29-34, the same 5-character zone the tree's
     * "Edit field" command writes), leaving decimals and everything else on the line untouched.
     * Only ever triggered for a field whose displayed width already equals its raw length one-to-one
     * (see PreviewItem.isResizable) — the webview itself won't offer the handle otherwise.
     * @param lineIndex - The field's own source line
     * @param newLength - The new length to write (already clamped in the webview against the
     * field's own minimum and the record/window's own width)
     */
    private async resizeField(lineIndex: number, newLength: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor || lineIndex >= editor.document.lineCount) {
            return;
        };

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(editor.document.uri, new vscode.Range(lineIndex, 29, lineIndex, 34), String(newLength).padStart(5, ' '));

        if (!(await applyWorkspaceEdit(workspaceEdit, 'resize the field'))) {
            return;
        };
        this.forceReparse(editor.document);
    };

    /**
     * Applies a drag-to-resize from the preview (dragging a constant's own right-edge handle): a
     * constant has no LENGTH keyword of its own — its width *is* its quoted literal's character
     * count — so "resizing" it means growing/shrinking its trailing blank padding, never its actual
     * visible text (the webview only ever offers this drag down to the constant's own trimmed
     * length — see PreviewItem.minLength). Reuses the tree's "Edit constant" rewrite logic, which
     * already handles a constant growing past the single-line threshold into multiple lines (or
     * collapsing back).
     * @param lineIndex - The constant's own source line
     * @param newLength - The new total character count to write (already clamped in the webview)
     */
    private async resizeConstant(lineIndex: number, newLength: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor || lineIndex >= editor.document.lineCount) {
            return;
        };

        const constant = fieldsPerRecords.flatMap(r => r.constants).find(c => c.lineIndex === lineIndex);
        if (!constant) {
            return;
        };

        const newText = newLength >= constant.name.length
            ? constant.name + ' '.repeat(newLength - constant.name.length)
            : constant.name.slice(0, newLength);

        if (!(await updateExistingConstant(editor, { lineIndex }, newText))) {
            return;
        };
        this.forceReparse(editor.document);
    };

    /**
     * Applies a drag-to-resize from the preview (dragging a constant's own LEFT-edge handle): the
     * mirror image of `resizeConstant` — grows/shrinks the constant's *leading* blank padding
     * instead of its trailing one. Unlike the right handle, this also has to move the constant's own
     * start column (position spec, source columns 41-44) by the same amount its text gains/loses at
     * the front, so its visible (non-blank) characters land on the exact same screen position as
     * before — only the box's left edge actually moves. Applied as two separate edits — the column
     * first, then `updateExistingConstant` for the text (same call `resizeConstant` makes, already
     * correctly handling the constant growing past the single-line threshold into multiple lines or
     * collapsing back) — rather than one combined atomic edit, so the (tricky, easy to get subtly
     * wrong) multi-line continuation rewrite stays fully delegated to that already-tested logic
     * instead of being duplicated here. Costs an extra undo step compared to the right handle; worth
     * it for correctness on the rarer multi-line case.
     * @param lineIndex - The constant's own source line
     * @param newLength - The new total character count to write (already clamped in the webview)
     */
    private async resizeConstantLeft(lineIndex: number, newLength: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor || lineIndex >= editor.document.lineCount) {
            return;
        };

        const constant = fieldsPerRecords.flatMap(r => r.constants).find(c => c.lineIndex === lineIndex);
        if (!constant) {
            return;
        };

        const delta = newLength - constant.name.length;
        const newText = delta >= 0
            ? ' '.repeat(delta) + constant.name
            : constant.name.slice(-newLength);
        const newColumn = constant.col - delta;
        if (newColumn < 1) {
            return;
        };

        const columnEdit = new vscode.WorkspaceEdit();
        columnEdit.replace(editor.document.uri, new vscode.Range(lineIndex, 41, lineIndex, 44), String(newColumn).padStart(3, ' '));
        if (!(await applyWorkspaceEdit(columnEdit, 'resize the constant'))) {
            return;
        };

        if (!(await updateExistingConstant(editor, { lineIndex }, newText))) {
            return;
        };
        this.forceReparse(editor.document);
    };

    /**
     * Places a brand-new constant at a screen position picked directly in the preview (the
     * "+ Constant" button's placement mode): converts the click back to a record-local row/col,
     * validates it's actually within the previewed record's own area, then reuses the same
     * text-prompt and insertion logic as the tree's "Add constant" command.
     * @param screenRow - Row clicked, in screen/canvas coordinates
     * @param screenCol - Column clicked, in screen/canvas coordinates
     */
    private async addConstantAt(screenRow: number, screenCol: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const position = this.resolveClickPosition(screenRow, screenCol, 'constant');
        if (!position) {
            return;
        };
        const { row, col } = position;

        const text = await getConstantTextFromUser("Enter constant text (without quotes)", "", col);
        if (!text) {
            return;
        };

        if (!(await insertNewConstant(editor, { text, row, column: col, recordName: this.recordName }))) {
            return;
        };
        this.forceReparse(editor.document);
    };

    /**
     * Places a brand-new field at a screen position picked directly in the preview (the
     * "+ Field" button's placement mode): converts the click back to a record-local row/col,
     * validates it, then reuses the same name/usage/type prompts and insertion logic as the
     * tree's "Add field" command.
     * @param screenRow - Row clicked, in screen/canvas coordinates
     * @param screenCol - Column clicked, in screen/canvas coordinates
     */
    private async addFieldAt(screenRow: number, screenCol: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const position = this.resolveClickPosition(screenRow, screenCol, 'field');
        if (!position) {
            return;
        };

        await addFieldAtPosition(this.recordName, { row: position.row, column: position.col });
        this.forceReparse(editor.document);
    };

    /**
     * Converts a screen click to a record-local row/col for the currently previewed record,
     * validating it falls within the record's own area (its window's content frame, if it's a
     * window; the record's own screen size otherwise) and, for an SFL detail record, below its
     * SFLCTL header's occupied rows. Shows a warning and returns null on an invalid click.
     * @param screenRow - Row clicked, in screen/canvas coordinates
     * @param screenCol - Column clicked, in screen/canvas coordinates
     * @param kind - What's being placed, only used to word the warning message
     */
    private resolveClickPosition(screenRow: number, screenCol: number, kind: 'constant' | 'field'): { row: number; col: number } | null {
        const geometry = this.resolveActiveGeometry();
        if (!geometry) {
            return null;
        };
        const { size, rowOffset, colOffset, minDetailRow } = geometry;

        const row = screenRow - rowOffset;
        const col = screenCol - colOffset;

        if (row < 1 || row > size.rows || col < 1 || col > size.cols) {
            vscode.window.showWarningMessage(
                `Cannot place a ${kind} there — click inside record '${this.recordName}' (rows 1-${size.rows}, columns 1-${size.cols}).`
            );
            return null;
        };
        if (minDetailRow !== null && row < minDetailRow) {
            vscode.window.showWarningMessage(
                `Cannot place a ${kind} on row ${row} — it's occupied by the subfile header (rows below ${minDetailRow} only).`
            );
            return null;
        };

        return { row, col };
    };

    /**
     * Name of the record whose WINDOW() keyword should actually be edited for the current record:
     * itself, unless its window was inherited (WINDOW(other-record-name), or an SFL/SFLCTL pair
     * sharing one side's window) — in which case the real geometry lives on the owner record.
     */
    private resolveWindowRecordName(): string {
        return getEffectiveSize(this.recordName, this.activeDisplayFormat)?.sharedFromRecord ?? this.recordName;
    };

    /**
     * The WDWBORDER() candidates from one attribute list (a record's own, or the file's) currently
     * in effect: matching the active display format, and whose own option indicator (if any) is
     * satisfied — same gating as everywhere else conditionable in the preview.
     * @param attributes - Attribute lines to scan (a record's own, or `attributesFileLevel`)
     */
    private activeWdwBorderValues(attributes: DdsAttribute[] | undefined): string[] {
        const forFormat = filterForActiveFormat(attributes ?? [], this.activeDisplayFormat);
        return forFormat
            .filter(attr => /^WDWBORDER\(/i.test(attr.value))
            .filter(attr => this.isItemDisplayed(attr.indicators, this.indicatorsEnabled))
            .map(attr => attr.value);
    };

    /**
     * Resolves a window's border — color, display attributes (RI/HI/UL/BL), and its 8 border
     * characters — from its own WDWBORDER() keyword(s), combined with the file-level one(s) per the
     * DDS reference: a record-level value wins over a file-level one for the same parameter (see
     * `combineWdwBorderLevel` for same-level combining). Falls back to DDS's own defaults (blue, no
     * display attributes, "." for the top/corners and ":" for the sides) when nothing is coded.
     * @param recordName - Name of the window/pull-down record (its own, or the one it shares a window with)
     */
    private resolveWindowBorder(recordName: string): WindowBorder {
        const record = fieldsPerRecords.find(r => r.record === recordName);
        const recordLevel = combineWdwBorderLevel(this.activeWdwBorderValues(record?.attributes));
        const fileLevel = combineWdwBorderLevel(this.activeWdwBorderValues(attributesFileLevel));

        const color = recordLevel.color ?? fileLevel.color ?? DEFAULT_WDWBORDER_COLOR;
        const dspatr = recordLevel.dspatr ?? fileLevel.dspatr ?? [];
        const chars = recordLevel.chars ?? fileLevel.chars ?? DEFAULT_WDWBORDER_CHARS;
        const ddsColorMap = getDdsColorMap();

        return {
            color: ddsColorMap[color] ?? ddsColorMap[DEFAULT_WDWBORDER_COLOR],
            reverseImage: dspatr.includes('RI'),
            highIntensity: dspatr.includes('HI'),
            underline: dspatr.includes('UL'),
            blink: dspatr.includes('BL'),
            chars
        };
    };

    /**
     * Applies a resize (from dragging the window's corner handle), keeping its screen position unchanged.
     * @param newRows - New window height
     * @param newCols - New window width
     */
    private async resizeWindow(newRows: number, newCols: number): Promise<void> {
        const windowRecordName = this.resolveWindowRecordName();
        const windowInfo = findWindowAttribute(windowRecordName, this.activeDisplayFormat);
        if (!windowInfo) {
            return;
        };

        await this.rewriteWindowKeyword(windowRecordName, windowInfo.startRow, windowInfo.startCol, newRows, newCols);
    };

    /**
     * Applies a move (from dragging the window's frame), keeping its size unchanged.
     * @param newRow - New window screen row
     * @param newCol - New window screen column
     */
    private async moveWindowPosition(newRow: number, newCol: number): Promise<void> {
        const windowRecordName = this.resolveWindowRecordName();
        const windowInfo = findWindowAttribute(windowRecordName, this.activeDisplayFormat);
        if (!windowInfo) {
            return;
        };

        await this.rewriteWindowKeyword(windowRecordName, newRow, newCol, windowInfo.numRows, windowInfo.numCols);
    };

    /**
     * Opens the same "Change Window Title" prompt used from the tree's context menu, triggered by
     * clicking the title directly on the preview. Edits the window-owner record when the title
     * belongs to a shared window (WINDOW(other-record-name), or an inherited SFL/SFLCTL pair).
     */
    private async editWindowTitle(): Promise<void> {
        await editWindowTitleForRecord(this.resolveWindowRecordName(), this.activeDisplayFormat);

        const { editor } = checkForEditorAndDocument();
        if (editor) {
            this.forceReparse(editor.document);
        };
    };

    /**
     * Shows the window's action menu, opened from the "⋮" button drawn in the frame's corner.
     * Currently just offers "Change Title...", but is meant to grow: additional actions (e.g. a
     * one-click "Center Horizontally") can be appended here, and/or given their own icon on the
     * canvas later, following the same pattern as the title button.
     */
    private async showWindowMenu(): Promise<void> {
        const options: (vscode.QuickPickItem & { action: string })[] = [
            { label: '$(edit) Change Title...', action: 'editTitle' }
        ];

        const selection = await vscode.window.showQuickPick(options, {
            title: `Window '${this.recordName}' — Actions`,
            placeHolder: 'Select an action',
            ignoreFocusOut: true
        });
        if (!selection) {
            return;
        };

        if (selection.action === 'editTitle') {
            await this.editWindowTitle();
        };
    };

    /**
     * Centers the window horizontally on the screen, keeping its row and size unchanged. A
     * one-click action triggered from its own icon, bypassing the actions menu — the same
     * centering math as the "Change Window Size" command's CENTERED option, for consistency.
     */
    private async centerWindowHorizontally(): Promise<void> {
        const windowRecordName = this.resolveWindowRecordName();
        const windowInfo = findWindowAttribute(windowRecordName, this.activeDisplayFormat);
        if (!windowInfo) {
            return;
        };

        const defaultSize = this.activeDisplayFormat
            ? (getSizeForFormat(this.activeDisplayFormat) ?? getDefaultSize())
            : getDefaultSize();

        const newStartCol = Math.max(1, Math.floor((defaultSize.cols - windowInfo.numCols) / 2) + 1);
        if (newStartCol === windowInfo.startCol) {
            return;
        };

        await this.rewriteWindowKeyword(windowRecordName, windowInfo.startRow, newStartCol, windowInfo.numRows, windowInfo.numCols);
    };

    /**
     * Centers the selected field/constant horizontally, triggered from the preview's "Selection
     * actions" bar (shown in the toolbar strip once something is selected — see the webview's
     * `updateSelectionBar`). Runs the tree's own "Center" command (dspf-edit.center) against the
     * matching tree node, so the exact same logic/validation is used regardless of which UI
     * triggered it.
     * @param lineIndex - Zero-based source line index of the selected field/constant
     */
    private async centerElement(lineIndex: number): Promise<void> {
        const node = await this.treeProvider?.findFieldOrConstantNode(lineIndex);
        if (!node) {
            return;
        };
        await vscode.commands.executeCommand('dspf-edit.center', node, this.activeDisplayFormat);

        const { editor } = checkForEditorAndDocument();
        if (editor) {
            this.forceReparse(editor.document);
        };
    };

    /**
     * Shows a compact actions menu for the selected field(s)/constant(s) (the "⋮ Actions" button in
     * the "Selection actions" bar), offering the same color/attribute/delete commands as the tree's
     * context menu — kept short on purpose so the preview doesn't grow a second full context menu;
     * anything not offered here is still reachable from the tree. With a single element selected,
     * this runs the exact same per-element commands the tree uses (full indicator prompting,
     * existing-value replace/remove, per-element delete confirmation). With more than one selected,
     * it instead applies the same color/attribute/delete to all of them at once — no indicator
     * prompting there, since indicators aren't a value that makes sense shared across a group of
     * differently-conditioned elements (see `addColorToMultipleElements`/`addAttributeToMultipleElements`/`removeElements`).
     * Copy is offered only for a single selection: it doesn't apply/insert anything itself, it
     * arms `pendingCopySource` and puts the webview into its click-to-place mode (see
     * `copyElementAt`) — the same "click a spot in the preview" gesture the "+ Field"/"+ Constant"
     * buttons already use, just for a copy of an existing element instead of a brand-new one.
     * Rename (fields)/Edit Text (constants), Indicators, and the field-only Validity Checks/
     * Editing Keywords/Error Messages are also single-selection only — like Copy, they just
     * delegate straight to the tree's own `dspf-edit.rename-field`/`dspf-edit.edit-constant`/
     * `dspf-edit.add-indicators`/`dspf-edit.add-validity-check`/`dspf-edit.add-editing-keywords`/
     * `dspf-edit.add-error-message` commands (same prompt/validation/confirmation as right-clicking
     * the element in the tree), and indicators specifically aren't a value that makes sense shared
     * across a group of differently-conditioned elements (same reason the multi-element branch
     * below has no indicator prompting either).
     * @param lineIndices - Zero-based source line indices of the selected fields/constants
     */
    private async showElementMenu(lineIndices: number[]): Promise<void> {
        const resolved = await Promise.all(lineIndices.map(li => this.treeProvider?.findFieldOrConstantNode(li)));
        const nodes = resolved.filter((n): n is DdsNode =>
            !!n && (n.ddsElement.kind === 'field' || n.ddsElement.kind === 'constant'));
        if (nodes.length === 0) {
            return;
        };
        const isMulti = nodes.length > 1;

        const options: (vscode.QuickPickItem & { command: string })[] = [
            { label: '$(paintcan) Add Color...', command: 'add-color' },
            { label: '$(symbol-color) Add Attribute...', command: 'add-attribute' }
        ];
        if (!isMulti) {
            const kind = nodes[0].ddsElement.kind;
            if (kind === 'field') {
                options.push(
                    { label: '$(check) Validity Checks...', command: 'add-validity-check' },
                    { label: '$(symbol-numeric) Editing Keywords...', command: 'add-editing-keywords' },
                    { label: '$(warning) Error Messages...', command: 'add-error-message' }
                );
            };
            const editOption = kind === 'field'
                ? { label: '$(edit) Rename...', command: 'rename-field' }
                : { label: '$(edit) Edit Text...', command: 'edit-constant' };
            options.push(
                editOption,
                { label: '$(symbol-boolean) Indicators...', command: 'add-indicators' },
                { label: '$(copy) Copy...', command: 'copy' }
            );
        };
        options.push({ label: '$(trash) Delete...', command: 'delete' });

        const singleElementName = (nodes[0].ddsElement as { name: string }).name;
        const selection = await vscode.window.showQuickPick(options, {
            title: isMulti ? `${nodes.length} elements — Actions` : `${singleElementName} — Actions`,
            placeHolder: 'Select an action',
            ignoreFocusOut: true
        });
        if (!selection) {
            return;
        };

        if (selection.command === 'copy') {
            this.pendingCopySource = nodes[0];
            this.panel.webview.postMessage({ type: 'startCopyPlacement', kind: nodes[0].ddsElement.kind });
            return;
        };

        const { editor } = checkForEditorAndDocument();

        if (!isMulti) {
            if (selection.command === 'delete') {
                await vscode.commands.executeCommand('dspf-edit.remove-element', nodes[0]);
            } else {
                await vscode.commands.executeCommand(`dspf-edit.${selection.command}`, nodes[0]);
            };
        } else if (editor) {
            if (selection.command === 'add-color') {
                await addColorToMultipleElements(editor, nodes);
            } else if (selection.command === 'add-attribute') {
                await addAttributeToMultipleElements(editor, nodes);
            } else {
                await removeElements(editor, nodes);
            };
        };

        if (editor) {
            this.forceReparse(editor.document);
        };
    };

    /**
     * Places a copy of the field/constant armed by the Actions menu's "Copy..." (`pendingCopySource`)
     * at a screen position picked directly in the preview — the counterpart to `addConstantAt`/
     * `addFieldAt`, but copying an existing element (with all its attributes/colors/indicators)
     * instead of creating a blank one. Always copies within the record currently being previewed,
     * per `resolveClickPosition`'s own validation.
     * @param screenRow - Row clicked, in screen/canvas coordinates
     * @param screenCol - Column clicked, in screen/canvas coordinates
     */
    private async copyElementAt(screenRow: number, screenCol: number): Promise<void> {
        const sourceNode = this.pendingCopySource;
        this.pendingCopySource = undefined;
        if (!sourceNode) {
            return;
        };

        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const kind = sourceNode.ddsElement.kind === 'field' ? 'field' : 'constant';
        const position = this.resolveClickPosition(screenRow, screenCol, kind);
        if (!position) {
            return;
        };

        if (kind === 'field') {
            await copyFieldToPosition(editor, sourceNode, this.recordName, position.row, position.col);
        } else {
            await copyConstantToPosition(editor, sourceNode, this.recordName, position.row, position.col);
        };

        this.forceReparse(editor.document);
    };

    /**
     * Rewrites the record's WINDOW(startRow startCol numRows numCols) keyword to the given values.
     * When the file declares more than one display format and the currently-effective WINDOW() line
     * is the shared unconditioned one, this splits it first (see `applyDisplayFormatSplitEdit`) so
     * the edit only affects the format currently being previewed, instead of silently changing every
     * format's window at once.
     * @param recordName - Name of the record whose WINDOW() line(s) to rewrite
     */
    private async rewriteWindowKeyword(recordName: string, startRow: number, startCol: number, numRows: number, numCols: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const record = fieldsPerRecords.find(r => r.record === recordName);
        const candidates = record?.attributes?.filter(a => a.value.toUpperCase().startsWith('WINDOW(')) ?? [];
        if (candidates.length === 0) {
            return;
        };

        const declaredFormats = getAvailableDisplayFormats().map(f => f.name);
        const workspaceEdit = new vscode.WorkspaceEdit();

        applyDisplayFormatSplitEdit(
            workspaceEdit,
            editor.document,
            candidates,
            this.activeDisplayFormat,
            declaredFormats,
            (existingLineText) => existingLineText.replace(
                /WINDOW\s*\(\s*\d+\s+\d+\s+\d+\s+\d+(\s+[^)]*)?\s*\)/i,
                (_match, suffix) => `WINDOW(${startRow} ${startCol} ${numRows} ${numCols}${suffix ?? ''})`
            )
        );

        if (!(await applyWorkspaceEdit(workspaceEdit, 'resize/move the window'))) {
            return;
        };
        this.forceReparse(editor.document);
    };

    /**
     * Increments or decrements an SFLCTL record's SFLPAG() (number of subfile rows shown at once),
     * always keeping SFLSIZ() one more than SFLPAG — the common convention that gives the subfile
     * one row of headroom past what's visible. Both are 4-digit zero-padded numeric literals. When
     * the file declares more than one display format and either keyword's currently-effective line
     * is still the shared unconditioned one, splits it first (see `applyDisplayFormatSplitEdit`) so
     * the change only affects the format currently being previewed.
     */
    private async adjustSubfilePageSize(delta: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const recordInfo = fieldsPerRecords.find(r => r.record === this.recordName);
        if (!recordInfo || !isSflCtlRecordInfo(recordInfo)) {
            return;
        };

        const pagCandidates = recordInfo.attributes?.filter(a => a.value.toUpperCase().startsWith('SFLPAG(')) ?? [];
        const pagAttr = pickForActiveFormat(pagCandidates, this.activeDisplayFormat);
        const pagMatch = pagAttr?.value.match(/SFLPAG\(\s*(\d+)\s*\)/i);
        if (!pagAttr || !pagMatch) {
            return;
        };

        const currentPag = parseInt(pagMatch[1], 10);
        const newPag = Math.min(Math.max(currentPag + delta, 1), 9998);
        if (newPag === currentPag) {
            return;
        };
        const newSiz = newPag + 1;

        const declaredFormats = getAvailableDisplayFormats().map(f => f.name);
        const workspaceEdit = new vscode.WorkspaceEdit();

        applyDisplayFormatSplitEdit(
            workspaceEdit,
            editor.document,
            pagCandidates,
            this.activeDisplayFormat,
            declaredFormats,
            (existingLineText) => existingLineText.replace(/SFLPAG\(\s*\d+\s*\)/i, `SFLPAG(${String(newPag).padStart(4, '0')})`)
        );

        const sizCandidates = recordInfo.attributes?.filter(a => a.value.toUpperCase().startsWith('SFLSIZ(')) ?? [];
        applyDisplayFormatSplitEdit(
            workspaceEdit,
            editor.document,
            sizCandidates,
            this.activeDisplayFormat,
            declaredFormats,
            (existingLineText) => existingLineText.replace(/SFLSIZ\(\s*\d+\s*\)/i, `SFLSIZ(${String(newSiz).padStart(4, '0')})`)
        );

        if (!(await applyWorkspaceEdit(workspaceEdit, 'change the subfile page size'))) {
            return;
        };
        this.forceReparse(editor.document);
    };

    /**
     * The webview holds focus during drag/resize, so the normal onDidChangeTextDocument listener
     * (which only reacts when the edited document is the active text editor) won't fire.
     * Force the re-parse immediately instead of waiting for the user to click back into the source.
     */
    private forceReparse(document: vscode.TextDocument): void {
        if (this.treeProvider) {
            updateTreeProvider(this.treeProvider, document);
        };
    };

    /**
     * Builds the webview HTML: a canvas that draws the field/constant grid and reports clicks,
     * drags, resizes and overlay selection back.
     */
    private getHtml(): string {
        const bg = getBackgroundColor();
        const fg = getDdsColorMap().GRN;
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    body {
        margin: 0;
        padding: 8px;
        background: ${bg};
        color: ${fg};
        font-family: var(--vscode-editor-font-family, monospace);
    }
    .toolbar-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 16px;
        row-gap: 4px;
        margin-bottom: 6px;
        font-size: 12px;
    }
    /* toolbarRowDisplaced only ever holds actionBar while it's away from toolbarRow3 (see
       updateSelectionBar) — collapse it to nothing rather than leaving an empty row/gap when it's
       not currently hosting anything. */
    .toolbar-row:empty {
        display: none;
    }
    #info {
        opacity: 0.7;
    }
    #formatBar, #toolbar {
        display: none;
        align-items: center;
        gap: 4px;
    }
    #formatBar select, #toolbar select {
        background: ${bg};
        color: ${fg};
        border: 1px solid #333333;
        font-family: inherit;
    }
    #formatBar select:disabled {
        color: #666666;
        border-color: #222222;
        cursor: default;
    }
    #actionBar {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    #actionBar button, #sflpagBar button, #focusModeBtn, #configBtn {
        background: ${bg};
        color: ${fg};
        border: 1px solid #333333;
        font-family: inherit;
        font-size: 12px;
        padding: 2px 6px;
        cursor: pointer;
    }
    #actionBar button.active, #focusModeBtn.active {
        background: ${fg};
        color: ${bg};
        border-color: ${fg};
    }
    #actionBar button:disabled, #sflpagBar button:disabled, #configBtn:disabled {
        color: #666666;
        border-color: #222222;
        cursor: default;
    }
    #selectionLabel {
        opacity: 0.7;
    }
    /* Empty (no selection) — hide it entirely rather than leaving a zero-width flex item, whose
       column-gap before actionBar would otherwise shift the buttons right of where the row above
       (e.g. "Format:") starts, even though nothing visible is actually there. */
    #selectionLabel:empty {
        display: none;
    }
    #indicatorBar {
        display: none;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }
    #sflpagBar {
        display: none;
        align-items: center;
        gap: 4px;
    }
    #sflpagValue {
        min-width: 2ch;
        text-align: center;
    }
    #indicatorList {
        display: none;
        margin-bottom: 6px;
    }
    .indicator-btn {
        display: inline-block;
        min-width: 20px;
        margin: 2px;
        padding: 1px 4px;
        text-align: center;
        border: 1px solid #555555;
        color: #888888;
        background: ${bg};
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
    }
    .indicator-btn.on {
        color: ${bg};
        background: ${fg};
        border-color: ${fg};
    }
    canvas {
        background: ${bg};
        border: 1px solid #333333;
        cursor: default;
    }
    #functionKeyList {
        display: none;
        margin-bottom: 6px;
    }
    .function-key-badge {
        display: inline-block;
        margin: 2px;
        padding: 1px 6px;
        border: 1px solid ${fg};
        color: ${fg};
        background: ${bg};
        font-family: inherit;
        font-size: 11px;
    }
    .function-key-badge.active {
        color: ${bg};
        background: ${fg};
    }
</style>
</head>
<body>
<div id="toolbarRow1" class="toolbar-row">
    <span id="info">Loading...</span>
    <button id="focusModeBtn" title="Hide the source code editor to focus on the preview (tree view stays visible)">🗖 Focus</button>
    <button id="configBtn" title="Configure the preview (colors)">⚙ Configuration</button>
</div>
<div id="toolbarRow2" class="toolbar-row">
    <span id="formatBar">
        <label for="formatSelect">Format: </label>
        <select id="formatSelect"></select>
    </span>
    <span id="toolbar">
        <label for="overlaySelect">Overlay: </label>
        <select id="overlaySelect"></select>
    </span>
    <span id="sflpagBar">
        <label>Page rows: </label>
        <button id="sflpagMinusBtn" title="Decrease SFLPAG (SFLSIZ stays SFLPAG + 1)">-</button>
        <span id="sflpagValue"></span>
        <button id="sflpagPlusBtn" title="Increase SFLPAG (SFLSIZ stays SFLPAG + 1)">+</button>
    </span>
</div>
<div id="toolbarRow3" class="toolbar-row">
    <span id="selectionLabel"></span>
    <span id="actionBar">
        <button id="addFieldBtn" title="Click, then click a point in the screen to place a new field there">+ Field</button>
        <button id="addConstantBtn" title="Click, then click a point in the screen to place a new constant there">+ Constant</button>
        <button id="gridDotsBtn" title="Show a dot in every empty character cell, to see spacing between fields/constants">⋅ Grid</button>
        <button id="selectionCenterBtn" title="Center horizontally" disabled>↔ Center</button>
        <button id="selectionMenuBtn" title="More actions (color, attributes, copy, delete...)" disabled>⋮ Actions</button>
    </span>
</div>
<div id="toolbarRowDisplaced" class="toolbar-row"></div>
<div id="toolbarRow4" class="toolbar-row">
    <label id="indicatorBar"><input type="checkbox" id="indicatorsToggle"> Indicators</label>
</div>
<div id="indicatorList"></div>
<div id="functionKeyList"></div>
<canvas id="screen"></canvas>
<script>
    const vscode = acquireVsCodeApi();
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    const info = document.getElementById('info');
    const focusModeBtn = document.getElementById('focusModeBtn');
    const configBtn = document.getElementById('configBtn');
    const formatBar = document.getElementById('formatBar');
    const formatSelect = document.getElementById('formatSelect');
    const toolbar = document.getElementById('toolbar');
    const overlaySelect = document.getElementById('overlaySelect');
    const indicatorBar = document.getElementById('indicatorBar');
    const indicatorsToggle = document.getElementById('indicatorsToggle');
    const indicatorList = document.getElementById('indicatorList');
    const functionKeyList = document.getElementById('functionKeyList');
    const sflpagBar = document.getElementById('sflpagBar');
    const sflpagMinusBtn = document.getElementById('sflpagMinusBtn');
    const sflpagPlusBtn = document.getElementById('sflpagPlusBtn');
    const sflpagValue = document.getElementById('sflpagValue');
    const addConstantBtn = document.getElementById('addConstantBtn');
    const addFieldBtn = document.getElementById('addFieldBtn');
    const gridDotsBtn = document.getElementById('gridDotsBtn');
    const actionBar = document.getElementById('actionBar');
    const toolbarRow3 = document.getElementById('toolbarRow3');
    const toolbarRowDisplaced = document.getElementById('toolbarRowDisplaced');
    const selectionLabel = document.getElementById('selectionLabel');
    const selectionCenterBtn = document.getElementById('selectionCenterBtn');
    const selectionMenuBtn = document.getElementById('selectionMenuBtn');

    const CHAR_W = 9;
    const CHAR_H = 18;
    const BLINK_INTERVAL_MS = 600;
    const HANDLE_SIZE = 8;
    const MENU_ICON_SIZE = 16;

    // A resize handle (window corner, field right edge) is a small triangle rather than a solid
    // square — filling only the lower-right half of its own HANDLE_SIZE box, its outer corner
    // sitting exactly in the corner being dragged.
    function drawResizeHandleTriangle(boxX, boxY) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(boxX + HANDLE_SIZE, boxY);
        ctx.lineTo(boxX, boxY + HANDLE_SIZE);
        ctx.lineTo(boxX + HANDLE_SIZE, boxY + HANDLE_SIZE);
        ctx.closePath();
        ctx.fill();
    }

    // Mirror image of drawResizeHandleTriangle, for a constant's left-edge handle — fills the
    // lower-left half of its box instead, so its outer corner sits at the box's bottom-left.
    function drawResizeHandleTriangleLeft(boxX, boxY) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(boxX, boxY);
        ctx.lineTo(boxX + HANDLE_SIZE, boxY + HANDLE_SIZE);
        ctx.lineTo(boxX, boxY + HANDLE_SIZE);
        ctx.closePath();
        ctx.fill();
    }

    // Mirrors WINDOW_BORDER_* on the host: content sits 1 row inside the border top/bottom, and
    // 2 columns inside the border left/right (verified against real STRSDA output).
    const WINDOW_BORDER_TOP = 1;
    const WINDOW_BORDER_BOTTOM = 1;
    const WINDOW_BORDER_LEFT = 2;
    const WINDOW_BORDER_RIGHT = 2;

    let currentItems = [];
    let currentBackgroundItems = [];
    let currentSize = null;
    let currentWindowFrame = null;
    let currentOuterFrame = null;
    let currentWindowTitle = null;
    let currentWindowBorder = null;
    let currentErrorMessage = null;
    let currentErrorMessageFrame = null;
    let currentTitleRect = null;
    let currentMenuIconRect = null;
    let currentCenterIconRect = null;
    let windowHovered = false;
    let maxSize = null;
    let minDetailRow = null;
    let blinkOn = true;
    let dragState = null;
    let resizeState = null;
    let moveWindowState = null;
    let elementResizeState = null;
    let currentElementHandleRect = null;
    let currentElementHandleRectLeft = null;
    let selectedLineIndices = new Set();
    let currentRecordName = null;
    let placingKind = null; // null | 'constant' | 'field'
    let showGridDots = false;

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function resolveItemRowCol(item, moveDelta) {
        const dragged = dragState && dragState.items.find(d => d.item === item);
        let row = dragged ? dragged.startRow + dragState.rowDelta : item.row;
        let col = dragged ? dragged.startCol + dragState.colDelta : item.col;

        // A "sameWindow" background item (the other half of an SFL/SFLCTL pair, sharing this exact
        // window) must move along with the window being dragged, same as the foreground record's
        // own items — only a genuinely different background record (a different window, or none at
        // all) stays put.
        if (moveDelta && (!item.isBackground || item.sameWindow)) {
            row += moveDelta.row;
            col += moveDelta.col;
        }

        return { row, col };
    }

    function drawItem(item, fontFamily, moveDelta) {
        if (item.nonDisplay) {
            return;
        }
        if (item.blink && !blinkOn) {
            return;
        }

        const isSelected = selectedLineIndices.has(item.lineIndex);
        const { row, col } = resolveItemRowCol(item, moveDelta);
        const isDragged = Boolean(item.isBeingResized || (dragState && dragState.items.some(d => d.item === item)));

        const x = (col - 1) * CHAR_W;
        const y = (row - 1) * CHAR_H;
        const w = Math.max(item.length, item.text.length, 1) * CHAR_W;

        ctx.font = (item.highIntensity ? 'bold ' : '') + (CHAR_H - 4) + 'px ' + fontFamily;

        if (item.reverseImage) {
            ctx.fillStyle = item.color;
            ctx.fillRect(x, y, w, CHAR_H);
            ctx.fillStyle = '${bg}';
        } else {
            ctx.fillStyle = item.color;
        }

        // Drawn one character at a time, centered in its own CHAR_W-wide cell — same cx formula
        // grid dots use — rather than a single fillText call left-padded by a flat 2px. Both fixes
        // the drift a whole-string fillText has from the font's own glyph advance width over a
        // long enough string, and keeps each character's visual center aligned with a grid dot's,
        // instead of a fixed left pad making wider glyphs (e.g. bold capitals) look shifted right
        // of where a dot in the same cell sits.
        const text = item.text.length > item.length ? item.text.substring(0, item.length) : item.text;
        ctx.textAlign = 'center';
        for (let i = 0; i < text.length; i++) {
            ctx.fillText(text[i], x + i * CHAR_W + CHAR_W / 2, y + CHAR_H / 2);
        }
        ctx.textAlign = 'start';

        if (item.underline || item.isInputCapable) {
            ctx.strokeStyle = item.reverseImage ? '${bg}' : item.color;
            ctx.beginPath();
            ctx.moveTo(x, y + CHAR_H - 2.5);
            ctx.lineTo(x + w, y + CHAR_H - 2.5);
            ctx.stroke();
        }

        if (item.isReferenced) {
            ctx.save();
            ctx.strokeStyle = item.color;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, CHAR_H - 1);
            ctx.restore();
        }

        if (item.columnSeparator) {
            ctx.strokeStyle = item.color;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, y);
            ctx.lineTo(x + 0.5, y + CHAR_H);
            ctx.moveTo(x + w - 0.5, y);
            ctx.lineTo(x + w - 0.5, y + CHAR_H);
            ctx.stroke();
        }

        if (isSelected) {
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.setLineDash(isDragged ? [3, 2] : []);
            ctx.strokeRect(x - 1.5, y - 1.5, w + 2, CHAR_H + 2);
            ctx.restore();
        }
    }

    function drawGridDots(size, items, backgroundItems, moveDelta, outerFrame, windowFrame) {
        if (!showGridDots) {
            return;
        }

        // A "behind" background item covered by the window's own opaque frame fill (see the
        // fillRect over currentOuterFrame in draw()) is invisible there, so it must not blank out
        // a grid dot in that cell; outside the frame (or for "sameWindow" items, which are drawn
        // after the fill and do show through) it's still visibly occupying its cell.
        const isCoveredByFrame = (row, col) => {
            if (!outerFrame) {
                return false;
            }
            return row >= outerFrame.row && row < outerFrame.row + outerFrame.rows &&
                col >= outerFrame.col && col < outerFrame.col + outerFrame.cols;
        };

        // Cells where a field/constant could never actually go: the border itself (the outer frame
        // minus the content rect it wraps). windowFrame.col/.row already mark the first *writable*
        // content cell (WINDOW_BORDER_LEFT/TOP bake in the border inset — confirmed against real
        // STRSDA — so there's no separate column/row inside windowFrame left to exclude here.
        const isUnwritableCell = (row, col) => {
            if (!outerFrame || !isCoveredByFrame(row, col)) {
                return false;
            }
            if (!windowFrame) {
                return true;
            }
            const insideContent = row >= windowFrame.row && row < windowFrame.row + windowFrame.rows &&
                col >= windowFrame.col && col < windowFrame.col + windowFrame.cols;
            return !insideContent;
        };

        const occupied = new Set();
        const markOccupied = (item, respectFrameCover) => {
            if (item.nonDisplay || (item.blink && !blinkOn)) {
                return;
            }
            const { row, col } = resolveItemRowCol(item, moveDelta);
            const w = Math.max(item.length, item.text.length, 1);
            for (let c = 0; c < w; c++) {
                const cellCol = col + c;
                if (respectFrameCover && isCoveredByFrame(row, cellCol)) {
                    continue;
                }
                occupied.add(row + ',' + cellCol);
            }
        };
        items.forEach(item => markOccupied(item, false));
        (backgroundItems || []).forEach(item => markOccupied(item, !item.sameWindow));

        // Drawn as an actual circle rather than the '⋅' glyph: a font's glyph bearing/advance box
        // isn't necessarily centered on the character it draws, which visibly threw the dot off
        // to one side of its cell; an arc is centered on (cx, cy) exactly, by construction.
        const DOT_RADIUS = 1.3;
        ctx.save();
        ctx.fillStyle = '#008800';
        for (let row = 1; row <= size.rows; row++) {
            for (let col = 1; col <= size.cols; col++) {
                if (occupied.has(row + ',' + col) || isUnwritableCell(row, col)) {
                    continue;
                }
                const cx = (col - 1) * CHAR_W + CHAR_W / 2;
                const cy = (row - 1) * CHAR_H + CHAR_H / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    function draw(size, items, backgroundItems, windowFrame, windowTitle, outerFrame) {
        currentItems = items;
        currentBackgroundItems = backgroundItems || [];
        currentSize = size;
        currentWindowFrame = windowFrame || null;
        currentOuterFrame = outerFrame || null;
        currentWindowTitle = windowTitle || null;
        canvas.width = size.cols * CHAR_W;
        canvas.height = size.rows * CHAR_H;

        const fontFamily = getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-family').trim() || 'monospace';

        ctx.fillStyle = '${bg}';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textBaseline = 'middle';

        // A "behind" background item (a genuinely different record positioned behind the window)
        // is drawn before the window's own opaque frame fill, so the frame physically covers it,
        // just like the real window would. A "same window" item (an auto-paired SFL/SFLCTL half,
        // or the window's owner record) is part of the window's own content and is drawn later,
        // after the frame fill, so it shows through instead of being hidden by it.
        const behindItems = currentBackgroundItems.filter(item => !item.sameWindow);
        const sameWindowItems = currentBackgroundItems.filter(item => item.sameWindow);

        if (behindItems.length) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            for (const item of behindItems) {
                drawItem(item, fontFamily, null);
            }
            ctx.restore();
        }

        // While the window is being dragged, its own fields/constants — and any "sameWindow"
        // background items, the other half of an SFL/SFLCTL pair sharing this exact window — move
        // along with its border. A genuinely different background record's items stay put, since
        // that record (and its own window, if any) isn't being moved.
        const moveDelta = (moveWindowState && currentOuterFrame)
            ? { row: currentOuterFrame.row - moveWindowState.startRow, col: currentOuterFrame.col - moveWindowState.startCol }
            : null;

        if (currentOuterFrame) {
            const fx = (currentOuterFrame.col - 1) * CHAR_W;
            const fy = (currentOuterFrame.row - 1) * CHAR_H;
            const fw = currentOuterFrame.cols * CHAR_W;
            const fh = currentOuterFrame.rows * CHAR_H;

            ctx.fillStyle = '${bg}';
            ctx.fillRect(fx, fy, fw, fh);

            // WDWBORDER: a real 5250 window border is one character thick on every side, drawn with
            // the record's/file's resolved color, display attributes, and its own 8 border
            // characters (top-left, top, top-right, left, right, bottom-left, bottom, bottom-right)
            // — not a plain decorative rectangle. A blinking border fully disappears during the off
            // phase, same as any other blinking item (see drawItem).
            if (currentWindowBorder && !(currentWindowBorder.blink && !blinkOn)) {
                const border = currentWindowBorder;
                const topRow = currentOuterFrame.row;
                const bottomRow = currentOuterFrame.row + currentOuterFrame.rows - 1;
                const leftCol = currentOuterFrame.col;
                const rightCol = currentOuterFrame.col + currentOuterFrame.cols - 1;
                const [tl, top, tr, left, right, bl, bottom, br] = border.chars;
                const fg = border.reverseImage ? '${bg}' : border.color;
                const bg = border.reverseImage ? border.color : '${bg}';

                ctx.font = (border.highIntensity ? 'bold ' : '') + (CHAR_H - 4) + 'px ' + fontFamily;
                ctx.textAlign = 'center';

                const paintBorderCell = (row, col, ch) => {
                    const x = (col - 1) * CHAR_W;
                    const y = (row - 1) * CHAR_H;
                    ctx.fillStyle = bg;
                    ctx.fillRect(x, y, CHAR_W, CHAR_H);
                    if (ch !== ' ') {
                        ctx.fillStyle = fg;
                        ctx.fillText(ch, x + CHAR_W / 2, y + CHAR_H / 2);
                    }
                    if (border.underline) {
                        ctx.strokeStyle = fg;
                        ctx.beginPath();
                        ctx.moveTo(x + 1, y + CHAR_H - 1.5);
                        ctx.lineTo(x + CHAR_W - 1, y + CHAR_H - 1.5);
                        ctx.stroke();
                    }
                };

                for (let col = leftCol; col <= rightCol; col++) {
                    paintBorderCell(topRow, col, col === leftCol ? tl : col === rightCol ? tr : top);
                    if (bottomRow !== topRow) {
                        paintBorderCell(bottomRow, col, col === leftCol ? bl : col === rightCol ? br : bottom);
                    }
                }
                for (let row = topRow + 1; row < bottomRow; row++) {
                    paintBorderCell(row, leftCol, left);
                    if (rightCol !== leftCol) {
                        paintBorderCell(row, rightCol, right);
                    }
                }

                ctx.textAlign = 'start';
            } else if (!currentWindowBorder) {
                ctx.strokeStyle = '#666666';
                ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
            }
        }

        if (sameWindowItems.length) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            for (const item of sameWindowItems) {
                drawItem(item, fontFamily, moveDelta);
            }
            ctx.restore();
        }

        for (const item of items) {
            // Field/constant resize preview: while dragging its handle, the element's own text
            // stretches/shrinks live to the currently-dragged length — nothing is actually written
            // back until the drag ends (mouseup). A field repeats its own placeholder character; a
            // constant has no such placeholder, so it grows/shrinks its own trailing (right handle)
            // or leading (left handle) blank padding instead, same as the actual edit applied on
            // mouseup (see resizeConstant/resizeConstantLeft on the host). The left handle also
            // moves the item's own start column live, since its right edge is the one staying fixed.
            if (elementResizeState && item === elementResizeState.item) {
                const newLength = elementResizeState.newLength;
                const isLeftDrag = elementResizeState.side === 'left';
                let ghostText, ghostCol;
                if (isLeftDrag) {
                    ghostText = newLength >= item.name.length
                        ? ' '.repeat(newLength - item.name.length) + item.name
                        : item.name.slice(item.name.length - newLength);
                    ghostCol = item.col + item.length - newLength;
                } else {
                    ghostText = item.kind === 'constant'
                        ? (newLength >= item.name.length ? item.name + ' '.repeat(newLength - item.name.length) : item.name.slice(0, newLength))
                        : (item.text.charAt(0) || ' ').repeat(newLength);
                    ghostCol = item.col;
                }
                drawItem(Object.assign({}, item, { text: ghostText, length: newLength, col: ghostCol, isBeingResized: true }), fontFamily, moveDelta);
            } else {
                drawItem(item, fontFamily, moveDelta);
            }
        }

        drawGridDots(size, items, currentBackgroundItems, moveDelta, currentOuterFrame, currentWindowFrame);

        // Element resize handles: shown only while exactly one resizable field/constant is selected —
        // a small grip just past its right edge (outside its own text, so it never overlaps it even
        // at width 1, addressing how cramped a narrow one would otherwise feel) that drags its length;
        // a constant can also get a second, mirrored grip just before its left edge, to grow/shrink
        // its leading padding instead (see PreviewItem.isResizableLeft). Only the handle matching the
        // side actually being dragged is shown while a drag is in progress — the other one's position
        // would otherwise go stale (it's computed from the item's un-dragged base length/column).
        currentElementHandleRect = null;
        currentElementHandleRectLeft = null;
        if (selectedLineIndices.size === 1) {
            const selectedLineIndex = [...selectedLineIndices][0];
            const isDraggingLeft = elementResizeState && elementResizeState.side === 'left';
            const isDraggingRight = elementResizeState && elementResizeState.side !== 'left';

            const handleItem = items.find(i => i.lineIndex === selectedLineIndex && (i.kind === 'field' || i.kind === 'constant') && i.isResizable);
            if (handleItem && !isDraggingLeft) {
                const { row, col } = resolveItemRowCol(handleItem, moveDelta);
                const width = isDraggingRight ? elementResizeState.newLength : Math.max(handleItem.length, handleItem.text.length, 1);
                // Bottom-anchored within the row, same corner convention as the window's own handle
                // (its outer tip sits exactly at the element's own bottom-right corner) — reads more
                // like a familiar resize grip than one centered on the row.
                const hx = (col - 1 + width) * CHAR_W;
                const hy = row * CHAR_H - HANDLE_SIZE;
                currentElementHandleRect = { x: hx, y: hy, width: HANDLE_SIZE, height: HANDLE_SIZE, item: handleItem };

                drawResizeHandleTriangle(hx, hy);
            }

            const handleItemLeft = items.find(i => i.lineIndex === selectedLineIndex && i.kind === 'constant' && i.isResizableLeft);
            if (handleItemLeft && !isDraggingRight) {
                const { row, col } = resolveItemRowCol(handleItemLeft, moveDelta);
                const baseWidth = Math.max(handleItemLeft.length, handleItemLeft.text.length, 1);
                const width = isDraggingLeft ? elementResizeState.newLength : baseWidth;
                const rightEdgeCol = col + baseWidth - 1; // fixed anchor: unaffected by the live drag width
                const liveStartCol = rightEdgeCol - width + 1;
                const hx = (liveStartCol - 1) * CHAR_W;
                const hy = row * CHAR_H - HANDLE_SIZE;
                currentElementHandleRectLeft = { x: hx - HANDLE_SIZE, y: hy, width: HANDLE_SIZE, height: HANDLE_SIZE, item: handleItemLeft };

                drawResizeHandleTriangleLeft(hx - HANDLE_SIZE, hy);
            }
        }

        // A currently-active ERRMSG() shows on the message line, in white, overwriting whatever
        // would otherwise be there, same as a real 5250 error line. Where that line actually is
        // depends on the window's own WINDOW() keyword (DDS's MSGLIN parameter, see
        // findWindowAttribute's hasOwnMessageLine): by default a window reserves its own last
        // content line for this (currentErrorMessageFrame, set by the extension); only with
        // *NOMSGLIN coded (or when the record isn't a window at all) does it fall back to the
        // physical display's own bottom row, spanning the full canvas width.
        if (currentErrorMessage) {
            const frame = currentErrorMessageFrame;
            const rowY = frame ? (frame.row - 1) * CHAR_H : (size.rows - 1) * CHAR_H;
            const colX = frame ? (frame.col - 1) * CHAR_W : 0;
            const widthPx = frame ? frame.cols * CHAR_W : canvas.width;
            const maxChars = frame ? frame.cols : size.cols;

            ctx.fillStyle = '${bg}';
            ctx.fillRect(colX, rowY, widthPx, CHAR_H);
            ctx.fillStyle = '#ffffff';
            ctx.font = (CHAR_H - 4) + 'px ' + fontFamily;
            ctx.textAlign = 'center';
            const text = currentErrorMessage.text;
            for (let i = 0; i < text.length && i < maxChars; i++) {
                ctx.fillText(text[i], colX + i * CHAR_W + CHAR_W / 2, rowY + CHAR_H / 2);
            }
            ctx.textAlign = 'start';
        }

        if (currentOuterFrame) {
            const hx = (currentOuterFrame.col - 1 + currentOuterFrame.cols) * CHAR_W;
            const hy = (currentOuterFrame.row - 1 + currentOuterFrame.rows) * CHAR_H;
            drawResizeHandleTriangle(hx - HANDLE_SIZE, hy - HANDLE_SIZE);
        }

        currentTitleRect = null;

        if (currentOuterFrame && currentWindowTitle) {
            const fx = (currentOuterFrame.col - 1) * CHAR_W;
            const fy = (currentOuterFrame.row - 1) * CHAR_H;
            const fw = currentOuterFrame.cols * CHAR_W;
            const fh = currentOuterFrame.rows * CHAR_H;

            const titleY = currentWindowTitle.position === 'BOTTOM' ? fy + fh - CHAR_H : fy;
            // WDWTITLE: padded with a space on each side only when it specifies its own *COLOR or
            // *DSPATR — otherwise the border characters flow right up to the title's own text
            // (DDS reference).
            const text = currentWindowTitle.padded ? ' ' + currentWindowTitle.text + ' ' : currentWindowTitle.text;

            ctx.font = (currentWindowTitle.highIntensity ? 'bold ' : '') + (CHAR_H - 4) + 'px ' + fontFamily;
            const textWidth = Math.min(ctx.measureText(text).width, fw - 4);

            let textX;
            if (currentWindowTitle.align === 'LEFT') {
                textX = fx + 2;
            } else if (currentWindowTitle.align === 'RIGHT') {
                textX = fx + fw - textWidth - 2;
            } else {
                textX = fx + (fw - textWidth) / 2;
            }

            currentTitleRect = { x: textX, y: titleY, width: textWidth, height: CHAR_H };

            // Defaults to the border's own color/attributes when the title doesn't specify its own
            // (see resolveTitleAppearance) — so a colored/reverse-image border carries through to
            // its embedded title instead of always showing plain white-on-black. A blinking title
            // fully disappears during the off phase, same as the border/any other blinking item.
            if (!(currentWindowTitle.blink && !blinkOn)) {
                const fg = currentWindowTitle.reverseImage ? '${bg}' : currentWindowTitle.hexColor;
                const bg = currentWindowTitle.reverseImage ? currentWindowTitle.hexColor : '${bg}';

                ctx.fillStyle = bg;
                ctx.fillRect(textX, titleY, textWidth, CHAR_H);
                ctx.fillStyle = fg;
                ctx.fillText(text, textX, titleY + CHAR_H / 2);

                if (currentWindowTitle.underline) {
                    ctx.strokeStyle = fg;
                    ctx.beginPath();
                    ctx.moveTo(textX + 1, titleY + CHAR_H - 1.5);
                    ctx.lineTo(textX + textWidth - 1, titleY + CHAR_H - 1.5);
                    ctx.stroke();
                }
            }
        }

        currentMenuIconRect = null;
        currentCenterIconRect = null;
        if (currentOuterFrame && windowHovered) {
            const drawIconButton = (x, y, glyph, title) => {
                ctx.fillStyle = '#dddddd';
                ctx.fillRect(x, y, MENU_ICON_SIZE, MENU_ICON_SIZE);
                ctx.strokeStyle = '#666666';
                ctx.strokeRect(x + 0.5, y + 0.5, MENU_ICON_SIZE - 1, MENU_ICON_SIZE - 1);

                ctx.fillStyle = '${bg}';
                ctx.font = (MENU_ICON_SIZE - 2) + 'px ' + fontFamily;
                const glyphWidth = ctx.measureText(glyph).width;
                ctx.fillText(glyph, x + (MENU_ICON_SIZE - glyphWidth) / 2, y + MENU_ICON_SIZE / 2);

                return { x, y, width: MENU_ICON_SIZE, height: MENU_ICON_SIZE };
            };

            // "Window actions" button in the frame's top-right corner: always available (even
            // before a title exists), and where future menu-based actions can be added.
            const menuX = (currentOuterFrame.col - 1 + currentOuterFrame.cols) * CHAR_W - MENU_ICON_SIZE - 2;
            const menuY = (currentOuterFrame.row - 1) * CHAR_H + (CHAR_H - MENU_ICON_SIZE) / 2;
            currentMenuIconRect = drawIconButton(menuX, menuY, '⋮', 'Window actions');

            // "Center horizontally" button, a one-click action next to it (no menu needed) — the
            // pattern any future direct-action icon can follow.
            const centerX = menuX - MENU_ICON_SIZE - 2;
            const centerY = menuY;
            currentCenterIconRect = drawIconButton(centerX, centerY, '↔', 'Center horizontally');
        }

        updateSelectionBar();
    }

    // Selected field/constant's actions live in the toolbar strip, not floating over the canvas:
    // a constant can be a single character (narrower than an icon button), and hovering it is also
    // how a drag starts, so icons drawn on top of it would fight the drag gesture. Kept in sync
    // from draw() itself, so it never goes stale (selection cleared, item edited/removed, etc.)
    // relative to whatever was last rendered.
    function updateSelectionBar() {
        const items = currentItems.filter(i => selectedLineIndices.has(i.lineIndex) && i.isInteractive);

        // A CNTFLD-wrapped field renders as several items sharing one lineIndex (one per wrapped
        // line) — it's still a single field for selection purposes, so count/act on distinct
        // lineIndexes, not raw rendered items.
        const uniqueByLine = [...new Map(items.map(i => [i.lineIndex, i])).values()];
        const hasSelection = uniqueByLine.length > 0;
        const multi = uniqueByLine.length > 1;

        if (!hasSelection) {
            selectionLabel.textContent = '';
        } else if (multi) {
            const kinds = new Set(uniqueByLine.map(i => i.kind));
            const noun = kinds.size === 1 ? uniqueByLine[0].kind + 's' : 'fields/constants';
            selectionLabel.textContent = uniqueByLine.length + ' ' + noun + ' selected';
        } else {
            const item = uniqueByLine[0];
            let label;
            if (item.kind === 'field' && item.dataLength !== undefined) {
                // Not shown for a referenced field (item.dataLength is unset then): its real
                // length lives in the external database field, dspf-edit has no way to read it,
                // so there's nothing true to display beyond the generic fallback below.
                const size = item.decimals ? item.dataLength + ',' + item.decimals : item.dataLength;
                label = item.name + ' (' + size + ') — Pos= ' + item.row + ', ' + item.col;
            } else if (item.kind === 'constant') {
                label = '1 constant selected — Pos= ' + item.row + ', ' + item.col + ', width ' + item.length;
            } else {
                label = '1 field selected — Pos= ' + item.row + ', ' + item.col;
            }
            selectionLabel.textContent = label;
        }

        // Center only makes sense for exactly one selected element; Actions applies to one or
        // several. Both stay visible but disabled rather than hidden when they don't apply — and
        // both live inside actionBar itself, so they always move together with the rest of the buttons.
        selectionCenterBtn.disabled = !hasSelection || multi;
        selectionMenuBtn.disabled = !hasSelection;

        // All the buttons (+Field/+Constant/Grid/Center/Actions) share row 3 with the
        // selection label when nothing is selected; once something is, the label needs that room,
        // so the whole button group moves into its own dedicated row (toolbarRowDisplaced) as one
        // unit until the selection is cleared again. That row sits between row 3 and the Indicators
        // row, and collapses to nothing when empty (see the ".toolbar-row:empty" rule), so the
        // Indicators row always ends up directly below wherever the buttons currently are, on its
        // own line, rather than sharing a line with them.
        if (hasSelection) {
            toolbarRowDisplaced.appendChild(actionBar);
        } else {
            toolbarRow3.appendChild(actionBar);
        }
    }

    setInterval(() => {
        const anyBlinking = currentItems.some(item => item.blink) || currentBackgroundItems.some(item => item.blink);
        if (!anyBlinking) {
            return;
        }
        blinkOn = !blinkOn;
        draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
    }, BLINK_INTERVAL_MS);

    function cellAt(ev) {
        const rect = canvas.getBoundingClientRect();
        const col = Math.floor((ev.clientX - rect.left) / CHAR_W) + 1;
        const row = Math.floor((ev.clientY - rect.top) / CHAR_H) + 1;
        return { row, col };
    }

    function findItemAt(ev) {
        // Only the real, interactive instance can be clicked/selected/dragged: an overlaid
        // background record is reference-only, and subfile page-repeat ghosts aren't real lines.
        const { row, col } = cellAt(ev);
        return currentItems.find(item =>
            item.isInteractive &&
            row === item.row &&
            col >= item.col &&
            col < item.col + Math.max(item.length, item.text.length, 1)
        );
    }

    function isOverResizeHandle(ev) {
        if (!currentOuterFrame) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const hx = (currentOuterFrame.col - 1 + currentOuterFrame.cols) * CHAR_W;
        const hy = (currentOuterFrame.row - 1 + currentOuterFrame.rows) * CHAR_H;
        return px >= hx - HANDLE_SIZE && px <= hx && py >= hy - HANDLE_SIZE && py <= hy;
    }

    function isOverElementResizeHandle(ev) {
        if (!currentElementHandleRect) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        return px >= currentElementHandleRect.x && px <= currentElementHandleRect.x + currentElementHandleRect.width &&
               py >= currentElementHandleRect.y && py <= currentElementHandleRect.y + currentElementHandleRect.height;
    }

    function isOverElementResizeHandleLeft(ev) {
        if (!currentElementHandleRectLeft) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        return px >= currentElementHandleRectLeft.x && px <= currentElementHandleRectLeft.x + currentElementHandleRectLeft.width &&
               py >= currentElementHandleRectLeft.y && py <= currentElementHandleRectLeft.y + currentElementHandleRectLeft.height;
    }

    function isOverWindowFrame(ev) {
        if (!currentOuterFrame) {
            return false;
        }
        const { row, col } = cellAt(ev);
        return row >= currentOuterFrame.row && row < currentOuterFrame.row + currentOuterFrame.rows &&
               col >= currentOuterFrame.col && col < currentOuterFrame.col + currentOuterFrame.cols;
    }

    function isOverTitle(ev) {
        if (!currentTitleRect) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        return px >= currentTitleRect.x && px < currentTitleRect.x + currentTitleRect.width &&
               py >= currentTitleRect.y && py < currentTitleRect.y + currentTitleRect.height;
    }

    function isOverMenuIcon(ev) {
        if (!currentMenuIconRect) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        return px >= currentMenuIconRect.x && px < currentMenuIconRect.x + currentMenuIconRect.width &&
               py >= currentMenuIconRect.y && py < currentMenuIconRect.y + currentMenuIconRect.height;
    }

    function isOverCenterIcon(ev) {
        if (!currentCenterIconRect) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        return px >= currentCenterIconRect.x && px < currentCenterIconRect.x + currentCenterIconRect.width &&
               py >= currentCenterIconRect.y && py < currentCenterIconRect.y + currentCenterIconRect.height;
    }

    // Icons only show while the mouse is over the window (frame + content); redraw only happens
    // when this actually flips, so hovering elsewhere doesn't repaint on every mousemove pixel.
    function updateWindowHoverState(ev) {
        const hovering = isOverWindowFrame(ev);
        if (hovering !== windowHovered) {
            windowHovered = hovering;
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    }

    function setPlacingKind(kind) {
        placingKind = kind;
        addConstantBtn.classList.toggle('active', placingKind === 'constant');
        addFieldBtn.classList.toggle('active', placingKind === 'field');
        canvas.style.cursor = placingKind ? 'crosshair' : '';
        canvas.title = placingKind === 'copy-field' ? 'Click a point in the screen to place the copy of the field'
            : placingKind === 'copy-constant' ? 'Click a point in the screen to place the copy of the constant'
            : placingKind ? ('Click a point in the screen to place the new ' + placingKind) : '';
    }

    addConstantBtn.addEventListener('click', () => {
        setPlacingKind(placingKind === 'constant' ? null : 'constant');
    });

    addFieldBtn.addEventListener('click', () => {
        setPlacingKind(placingKind === 'field' ? null : 'field');
    });

    gridDotsBtn.addEventListener('click', () => {
        showGridDots = !showGridDots;
        gridDotsBtn.classList.toggle('active', showGridDots);
        if (currentSize) {
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    });

    focusModeBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'toggleFocusMode' });
    });

    configBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'openConfiguration' });
    });

    // Center is only shown (see updateSelectionBar) when exactly one item is selected.
    selectionCenterBtn.addEventListener('click', () => {
        if (selectedLineIndices.size === 1) {
            vscode.postMessage({ type: 'centerElement', lineIndex: [...selectedLineIndices][0] });
        }
    });

    // Actions applies to the whole selection — one item or several.
    selectionMenuBtn.addEventListener('click', () => {
        if (selectedLineIndices.size > 0) {
            vscode.postMessage({ type: 'elementMenu', lineIndices: [...selectedLineIndices] });
        }
    });

    sflpagMinusBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'sflpagDecrement' });
    });

    sflpagPlusBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'sflpagIncrement' });
    });

    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && placingKind) {
            setPlacingKind(null);
        }
    });

    canvas.addEventListener('mousedown', (ev) => {
        if (placingKind) {
            const { row, col } = cellAt(ev);
            const messageType = placingKind === 'field' ? 'addFieldAt'
                : placingKind === 'constant' ? 'addConstantAt'
                : 'copyElementAt';
            vscode.postMessage({ type: messageType, row, col });
            setPlacingKind(null);
            return;
        }

        if (isOverElementResizeHandle(ev)) {
            const item = currentElementHandleRect.item;
            // The element's left edge (item.col) stays fixed — only its right edge can move — so the
            // longest it can grow to is however many columns remain to the record/window's own
            // right edge from there.
            let maxRightCol = currentSize.cols;
            if (currentWindowFrame && !item.isBackground) {
                maxRightCol = currentWindowFrame.col + currentWindowFrame.cols - 1;
            }
            const maxLength = Math.max(maxRightCol - item.col + 1, item.minLength || 1);

            elementResizeState = {
                item,
                startLength: item.length,
                newLength: item.length,
                minLength: item.minLength || 1,
                maxLength,
                side: 'right'
            };
            return;
        }

        if (isOverElementResizeHandleLeft(ev)) {
            const item = currentElementHandleRectLeft.item;
            // The element's right edge (its last character) stays fixed — only its left edge can
            // move — so the longest it can grow to is however many columns remain to the
            // record/window's own left edge from there (mirrors the right handle's own boundary).
            let minLeftCol = 1;
            if (currentWindowFrame && !item.isBackground) {
                minLeftCol = currentWindowFrame.col;
            }
            const rightEdgeCol = item.col + item.length - 1;
            const maxLength = Math.max(rightEdgeCol - minLeftCol + 1, item.minLengthLeft || 1);

            elementResizeState = {
                item,
                startLength: item.length,
                newLength: item.length,
                minLength: item.minLengthLeft || 1,
                maxLength,
                side: 'left'
            };
            return;
        }

        if (isOverResizeHandle(ev)) {
            resizeState = {
                contentRows: currentOuterFrame.rows - WINDOW_BORDER_TOP - WINDOW_BORDER_BOTTOM,
                contentCols: currentOuterFrame.cols - WINDOW_BORDER_LEFT - WINDOW_BORDER_RIGHT
            };
            return;
        }

        if (isOverMenuIcon(ev)) {
            vscode.postMessage({ type: 'windowMenu' });
            return;
        }

        if (isOverCenterIcon(ev)) {
            vscode.postMessage({ type: 'centerWindowHorizontally' });
            return;
        }

        if (isOverTitle(ev)) {
            vscode.postMessage({ type: 'editWindowTitle' });
            return;
        }

        const hit = findItemAt(ev);

        // Ctrl/Cmd+click toggles an item in/out of a multi-selection, without starting a drag —
        // the standard desktop convention for building up a selection one item at a time.
        if (hit && (ev.ctrlKey || ev.metaKey)) {
            if (selectedLineIndices.has(hit.lineIndex)) {
                selectedLineIndices.delete(hit.lineIndex);
            } else {
                selectedLineIndices.add(hit.lineIndex);
            }
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
            return;
        }

        if (hit) {
            // A plain click on an item already part of a multi-selection keeps the whole group
            // selected (in case this turns into a group drag); mouseup collapses it to just this
            // item if no drag actually happened. Clicking a different, unselected item replaces
            // the selection immediately, same as before multi-select existed.
            if (!selectedLineIndices.has(hit.lineIndex)) {
                selectedLineIndices = new Set([hit.lineIndex]);
                draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
            }

            const { row, col } = cellAt(ev);
            const draggedItems = currentItems.filter(i => selectedLineIndices.has(i.lineIndex) && i.isInteractive);
            dragState = {
                items: draggedItems.map(i => ({ item: i, startRow: i.row, startCol: i.col })),
                primaryLineIndex: hit.lineIndex,
                grabRowOffset: row - hit.row,
                grabColOffset: col - hit.col,
                rowDelta: 0,
                colDelta: 0,
                moved: false
            };
            return;
        }

        selectedLineIndices.clear();
        draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);

        // Clicked empty space inside the window's own frame (not on a field/constant): drag the window itself.
        if (isOverWindowFrame(ev)) {
            const { row, col } = cellAt(ev);
            moveWindowState = {
                grabRowOffset: row - currentOuterFrame.row,
                grabColOffset: col - currentOuterFrame.col,
                startRow: currentOuterFrame.row,
                startCol: currentOuterFrame.col,
                moved: false
            };
        }
    });

    document.addEventListener('mouseleave', () => {
        // The mouse left the whole webview, so no more mousemove events will arrive to notice it —
        // hide the icons explicitly instead of leaving them stuck showing.
        if (windowHovered) {
            windowHovered = false;
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    });

    window.addEventListener('mousemove', (ev) => {
        if (placingKind) {
            canvas.style.cursor = 'crosshair';
            return;
        }

        if (resizeState) {
            const { row, col } = cellAt(ev);
            const limitRows = maxSize ? maxSize.rows : currentSize.rows;
            const limitCols = maxSize ? maxSize.cols : currentSize.cols;
            // Content top-left (currentWindowFrame) stays fixed; the corner being dragged maps to
            // content size, not the outer border's own size (see WINDOW_BORDER_* above).
            const newContentRows = clamp(row - currentWindowFrame.row - (WINDOW_BORDER_BOTTOM - 1), 1, limitRows);
            const newContentCols = clamp(col - currentWindowFrame.col - (WINDOW_BORDER_RIGHT - 1), 1, limitCols);

            if (newContentRows !== resizeState.contentRows || newContentCols !== resizeState.contentCols) {
                resizeState.contentRows = newContentRows;
                resizeState.contentCols = newContentCols;
                currentOuterFrame = Object.assign({}, currentOuterFrame, {
                    rows: newContentRows + WINDOW_BORDER_TOP + WINDOW_BORDER_BOTTOM,
                    cols: newContentCols + WINDOW_BORDER_LEFT + WINDOW_BORDER_RIGHT
                });
                draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
            }
            return;
        }

        if (elementResizeState) {
            const { col } = cellAt(ev);
            const item = elementResizeState.item;
            // Right handle: distance from the fixed left edge (item.col) out to the cursor. Left
            // handle: distance from the cursor back to the fixed right edge instead.
            const desiredLength = elementResizeState.side === 'left'
                ? (item.col + item.length - 1) - col + 1
                : col - item.col + 1;
            const newLength = clamp(desiredLength, elementResizeState.minLength, elementResizeState.maxLength);

            if (newLength !== elementResizeState.newLength) {
                elementResizeState.newLength = newLength;
                draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
            }
            return;
        }

        if (moveWindowState) {
            const { row, col } = cellAt(ev);
            const limitRow = Math.max(currentSize.rows - currentOuterFrame.rows + 1, 1);
            const limitCol = Math.max(currentSize.cols - currentOuterFrame.cols + 1, 1);
            let newRow = clamp(row - moveWindowState.grabRowOffset, 1, limitRow);
            let newCol = clamp(col - moveWindowState.grabColOffset, 1, limitCol);

            // STRSDA never allows a window at row 1 and column 1 at the same time - nudge off the corner.
            if (newRow === 1 && newCol === 1) {
                if (limitCol >= 2) {
                    newCol = 2;
                } else if (limitRow >= 2) {
                    newRow = 2;
                }
            }

            if (newRow !== currentOuterFrame.row || newCol !== currentOuterFrame.col) {
                currentOuterFrame = Object.assign({}, currentOuterFrame, { row: newRow, col: newCol });
                moveWindowState.moved = true;
                draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
            }
            return;
        }

        if (!dragState) {
            updateWindowHoverState(ev);

            if (isOverElementResizeHandle(ev) || isOverElementResizeHandleLeft(ev)) {
                canvas.style.cursor = 'ew-resize';
                canvas.title = '';
                return;
            }

            const overHandle = isOverResizeHandle(ev);
            if (overHandle) {
                canvas.style.cursor = 'nwse-resize';
                canvas.title = '';
                return;
            }
            if (isOverMenuIcon(ev)) {
                canvas.style.cursor = 'pointer';
                canvas.title = 'Window actions';
                return;
            }
            if (isOverCenterIcon(ev)) {
                canvas.style.cursor = 'pointer';
                canvas.title = 'Center horizontally';
                return;
            }
            if (isOverTitle(ev)) {
                canvas.style.cursor = 'pointer';
                canvas.title = 'Click to change the window title';
                return;
            }
            const hit = findItemAt(ev);
            canvas.style.cursor = (!hit && isOverWindowFrame(ev)) ? 'move' : 'default';
            canvas.title = hit ? hit.name : '';
            return;
        }

        const { row, col } = cellAt(ev);
        const primary = dragState.items.find(d => d.item.lineIndex === dragState.primaryLineIndex);
        const desiredRowDelta = (row - dragState.grabRowOffset) - primary.startRow;
        const desiredColDelta = (col - dragState.grabColOffset) - primary.startCol;

        // Every dragged item must stay within its own valid bounds (window frame vs. whole canvas,
        // an SFL detail record's rows below its header, and its own width for the column limit) —
        // computed per item, same as a single drag always did, then intersected so the group's
        // shared delta can never push any one of them out of bounds.
        let minRowDelta = -Infinity, maxRowDelta = Infinity, minColDelta = -Infinity, maxColDelta = Infinity;
        for (const { item, startRow, startCol } of dragState.items) {
            const width = Math.max(item.length, item.text.length, 1);
            let itemMinRow = 1, itemMaxRow = currentSize.rows, itemMinCol = 1, itemMaxCol = currentSize.cols - width + 1;
            if (currentWindowFrame && !item.isBackground) {
                itemMinRow = currentWindowFrame.row;
                itemMaxRow = Math.max(currentWindowFrame.row + currentWindowFrame.rows - 1, itemMinRow);
                // currentWindowFrame.col is already the first writable content column (the border
                // inset is baked into WINDOW_BORDER_LEFT/windowFrame, not added again here).
                itemMinCol = currentWindowFrame.col;
                itemMaxCol = Math.max(currentWindowFrame.col + currentWindowFrame.cols - width, itemMinCol);
            }
            // A subfile detail record's own rows can't be dragged up into its header's static content.
            if (minDetailRow !== null && !item.isBackground) {
                itemMinRow = Math.max(itemMinRow, minDetailRow);
            }

            minRowDelta = Math.max(minRowDelta, itemMinRow - startRow);
            maxRowDelta = Math.min(maxRowDelta, itemMaxRow - startRow);
            minColDelta = Math.max(minColDelta, itemMinCol - startCol);
            maxColDelta = Math.min(maxColDelta, itemMaxCol - startCol);
        }

        const newRowDelta = clamp(desiredRowDelta, minRowDelta, maxRowDelta);
        const newColDelta = clamp(desiredColDelta, minColDelta, maxColDelta);

        if (newRowDelta !== dragState.rowDelta || newColDelta !== dragState.colDelta) {
            dragState.rowDelta = newRowDelta;
            dragState.colDelta = newColDelta;
            dragState.moved = true;
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    });

    window.addEventListener('mouseup', () => {
        if (elementResizeState) {
            const { item, newLength, startLength, side } = elementResizeState;
            elementResizeState = null;
            if (newLength !== startLength) {
                const messageType = side === 'left' ? 'resizeConstantLeft' : (item.kind === 'constant' ? 'resizeConstant' : 'resizeField');
                vscode.postMessage({ type: messageType, lineIndex: item.lineIndex, newLength });
            } else {
                draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
            }
            return;
        }

        if (resizeState) {
            const { contentRows, contentCols } = resizeState;
            resizeState = null;
            vscode.postMessage({ type: 'resize', newRows: contentRows, newCols: contentCols });
            return;
        }

        if (moveWindowState) {
            const moved = moveWindowState.moved;
            const finalRow = currentOuterFrame.row;
            const finalCol = currentOuterFrame.col;
            moveWindowState = null;
            if (moved) {
                vscode.postMessage({ type: 'moveWindow', newRow: finalRow, newCol: finalCol });
            }
            return;
        }

        if (!dragState) {
            return;
        }

        if (dragState.moved) {
            // A CNTFLD-wrapped field renders as several items sharing one lineIndex (one per
            // wrapped line), all dragged together for a consistent visual — but the field has only
            // one source line to write back to. Collapse each lineIndex down to a single move, using
            // its topmost item (smallest startRow), which is the field's actual anchor row; the
            // wrapped lines below it are re-derived from that on reparse. Without this, duplicate
            // moves for the same line produce overlapping edits that VS Code rejects outright.
            const primaryMoveByLine = new Map();
            for (const d of dragState.items) {
                const existing = primaryMoveByLine.get(d.item.lineIndex);
                if (!existing || d.startRow < existing.startRow) {
                    primaryMoveByLine.set(d.item.lineIndex, d);
                }
            }
            vscode.postMessage({
                type: 'move',
                moves: [...primaryMoveByLine.values()].map(d => ({
                    lineIndex: d.item.lineIndex,
                    newRow: d.startRow + dragState.rowDelta,
                    newCol: d.startCol + dragState.colDelta,
                    rowOffset: d.item.rowOffset,
                    colOffset: d.item.colOffset
                }))
            });
        } else {
            // No drag happened: a plain click on an item from a multi-selection collapses it back
            // down to just that one (the group stayed selected during mousedown only in case this
            // turned into a group drag).
            selectedLineIndices = new Set([dragState.primaryLineIndex]);
            vscode.postMessage({ type: 'navigate', lineIndex: dragState.primaryLineIndex });
        }

        dragState = null;
        draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
    });

    formatSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'setDisplayFormat', name: formatSelect.value || null });
    });

    function rebuildFormatOptions(availableFormats, selectedValue) {
        formatSelect.innerHTML = '';

        for (const format of availableFormats) {
            const opt = document.createElement('option');
            opt.value = format.name;
            opt.textContent = format.name + ' (' + format.rows + 'x' + format.cols + ')';
            formatSelect.appendChild(opt);
        }

        formatSelect.value = selectedValue;
    }

    overlaySelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'setOverlay', recordName: overlaySelect.value || null });
    });

    function rebuildOverlayOptions(availableRecords, selectedValue) {
        overlaySelect.innerHTML = '';

        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(none)';
        overlaySelect.appendChild(noneOption);

        for (const name of availableRecords) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            overlaySelect.appendChild(opt);
        }

        overlaySelect.value = selectedValue;
    }

    indicatorsToggle.addEventListener('change', () => {
        vscode.postMessage({ type: 'setIndicatorsEnabled', enabled: indicatorsToggle.checked });
    });

    function rebuildIndicatorList(availableIndicators, activeIndicators) {
        indicatorList.innerHTML = '';

        for (const number of availableIndicators) {
            const btn = document.createElement('span');
            btn.className = 'indicator-btn' + (activeIndicators.includes(number) ? ' on' : '');
            btn.textContent = number;
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'toggleIndicator', number });
            });
            indicatorList.appendChild(btn);
        }
    }

    function rebuildFunctionKeyList(functionKeys) {
        functionKeyList.innerHTML = '';

        for (const fk of functionKeys) {
            const badge = document.createElement('span');
            badge.className = 'function-key-badge' + (fk.active ? ' active' : '');
            badge.textContent = fk.key;
            badge.title = fk.description;
            functionKeyList.appendChild(badge);
        }
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'render') {
            if (message.recordName !== currentRecordName) {
                currentRecordName = message.recordName;
                selectedLineIndices.clear();
                dragState = null;
            }

            maxSize = message.maxSize || null;
            minDetailRow = typeof message.minDetailRow === 'number' ? message.minDetailRow : null;
            const availableFormats = message.availableFormats || [];
            formatBar.style.display = availableFormats.length > 0 ? 'inline-flex' : 'none';
            if (availableFormats.length > 0) {
                rebuildFormatOptions(availableFormats, message.activeDisplayFormat || '');
                // Locked (disabled) when the file only declares one display format — nothing to switch to.
                formatSelect.disabled = availableFormats.length <= 1;
            }

            const hasOverlayOptions = message.availableRecords && message.availableRecords.length > 0;
            toolbar.style.display = hasOverlayOptions ? 'inline-flex' : 'none';
            if (hasOverlayOptions) {
                rebuildOverlayOptions(message.availableRecords, message.overlayRecordName || '');
            }

            // indicatorBar (the "Indicators" checkbox) and indicatorList (the toggle buttons below
            // it) are separate sibling elements, not nested — indicatorList must be rebuilt/hidden
            // every render regardless of hasIndicators, or deleting the last element that carried
            // any indicator in the record leaves its stale buttons behind, still visible, since
            // hiding indicatorBar alone doesn't touch indicatorList at all.
            const hasIndicators = message.availableIndicators && message.availableIndicators.length > 0;
            indicatorBar.style.display = hasIndicators ? 'inline-flex' : 'none';
            indicatorsToggle.checked = Boolean(message.indicatorsEnabled);
            indicatorList.style.display = (hasIndicators && message.indicatorsEnabled) ? 'block' : 'none';
            rebuildIndicatorList(message.availableIndicators || [], message.activeIndicators || []);

            // Always shown (no on/off toggle, unlike indicators) — a programmer benefits from
            // seeing which function keys are defined at a glance, without an extra click.
            const hasFunctionKeys = message.functionKeys && message.functionKeys.length > 0;
            functionKeyList.style.display = hasFunctionKeys ? 'block' : 'none';
            rebuildFunctionKeyList(message.functionKeys || []);

            const hasSflPag = typeof message.sflPag === 'number';
            sflpagBar.style.display = hasSflPag ? 'inline-flex' : 'none';
            if (hasSflPag) {
                sflpagValue.textContent = String(message.sflPag);
                sflpagMinusBtn.disabled = message.sflPag <= 1;
                sflpagPlusBtn.disabled = message.sflPag >= 9998;
            }

            const baseInfo = message.size.rows + ' x ' + message.size.cols;
            info.textContent = message.windowFrame
                ? baseInfo + '  —  window ' + message.windowFrame.rows + 'x' + message.windowFrame.cols +
                  ' at (' + message.windowFrame.row + ',' + message.windowFrame.col + ')'
                : baseInfo;

            currentErrorMessage = message.errorMessage || null;
            currentErrorMessageFrame = message.errorMessageFrame || null;
            currentWindowBorder = message.windowBorder || null;
            draw(message.size, message.items, message.backgroundItems, message.windowFrame, message.windowTitle, message.outerFrame);
        } else if (message.type === 'notFound') {
            info.textContent = 'Record no longer exists.';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else if (message.type === 'selectLine') {
            selectedLineIndices = new Set([message.lineIndex]);
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        } else if (message.type === 'startCopyPlacement') {
            setPlacingKind(message.kind === 'field' ? 'copy-field' : 'copy-constant');
        } else if (message.type === 'focusModeChanged') {
            focusModeBtn.textContent = message.active ? '🗗 Show code' : '🗖 Focus';
            focusModeBtn.classList.toggle('active', message.active);
            // Opening the Configuration panel "beside" this one forces VS Code to un-maximize
            // a maximized editor group to make room — silently dropping focus mode instead of
            // actually opening the panel maximized, which looks broken. Simplest fix: only allow
            // it once focus mode is off.
            configBtn.disabled = message.active;
            configBtn.title = message.active
                ? 'Turn off Focus mode first to configure the preview'
                : "Configure the preview (colors)";
        }
    });
</script>
</body>
</html>`;
    };
};
