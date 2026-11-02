/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.copy-format.ts
*/

import * as vscode from 'vscode';
import { DdsIndicator } from '../dspf-edit.model/dspf-edit.model';
import { findElementInsertionPoint, applyWorkspaceEdit, formatIndicatorCondition, paginateKeywordText, checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { getResolvedRef } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';
import { removeWholeKeyword } from './dspf-edit.conditioned-keywords';
import { buildConditionedKeywordLines, isPureIndicatorContinuationLine, setLineCondition } from './dspf-edit.add-indicators';
import { upgradeSignedTypeOnFieldLine } from './dspf-edit.add-editing-keywords';

/**
 * Copy Format / Paste Format, as a format painter: the colors, display attributes, conditioning
 * indicators and/or number editing of one field or constant, copied once and pasted onto as many
 * others as needed. Pasting replaces what the target had of each part copied, so it ends up looking like
 * the source.
 */

// INTERFACES AND TYPES

/** One COLOR or DSPATR keyword as copied, with its condition (empty when copied without it). */
interface CopiedKeyword {
    keyword: 'COLOR' | 'DSPATR';
    /** The values inside it: ['RED'], ['UL', 'HI'], or ['&PFLD'] for a program-to-system field. */
    codes: string[];
    indicators: DdsIndicator[];
};

/** What was copied, and from where. */
export interface CopiedFormat {
    sourceName: string;
    sourceLineIndex: number;
    /** Undefined when colors weren't copied — pasting then leaves the target's colors alone. */
    colors?: CopiedKeyword[];
    /** Undefined when attributes weren't copied. */
    attributes?: CopiedKeyword[];
    /** Undefined when the element's own indicators weren't copied. */
    elementIndicators?: DdsIndicator[];
    /** Undefined when number editing wasn't copied. */
    editing?: CopiedEditing;
};

/** A numeric field's editing keywords as copied — empty when it has none — and the size of the
 * field they were written for, which an edit mask has to match. */
interface CopiedEditing {
    keywords: string[];
    length?: number;
    decimals?: number;
};

/** What a field is as far as number editing goes. */
interface NumericShape {
    numeric: boolean;
    /** Why it can't take editing, when it can't. */
    reason?: string;
    length?: number;
    decimals?: number;
};

/** Which parts of the format to copy. */
export interface FormatParts {
    colors: boolean;
    attributes: boolean;
    elementIndicators: boolean;
    /** Edit code, edit word and edit mask. */
    editing: boolean;
    /** False to copy colors and attributes without their indicators. */
    keepIndicators: boolean;
};

interface FormatPartItem extends vscode.QuickPickItem {
    part: keyof FormatParts;
};

// CONSTANTS

/** DSPATR values valid on any field and on constants (DDS reference, "Valid attributes for the
 * first format of the DSPATR keyword"). */
const ATTRIBUTES_FOR_ALL = ['BL', 'CS', 'HI', 'ND', 'PC', 'RI', 'UL'];

/** DSPATR values valid on input-capable fields only. */
const ATTRIBUTES_FOR_INPUT = ['MDT', 'OID', 'PR', 'SP'];

const EDITING_KEYWORDS = ['EDTCDE', 'EDTWRD', 'EDTMSK'];

/** Field lengths EDTCDE(W) and EDTCDE(Y) work for (see DATE_EDIT_CODE_VALID_LENGTHS in
 * dspf-edit.add-editing-keywords.ts). */
const DATE_EDIT_CODE_LENGTHS: Record<string, number[]> = {
    W: [5, 6, 7, 8],
    Y: [3, 4, 5, 6, 7, 8]
};

/** CHECK values DDS doesn't allow on a field with EDTMSK. */
const CHECKS_NOT_WITH_EDIT_MASK = ['AB', 'MF', 'RB', 'RZ', 'RLTB'];

/** Database data types a referenced field can borrow and still be edited as a number. */
const NUMERIC_DATABASE_TYPES = ['P', 'S', 'B', 'F', 'I', 'Y'];

// CLIPBOARD

let copiedFormat: CopiedFormat | undefined;

/** The format last copied, if any. */
export function getCopiedFormat(): CopiedFormat | undefined {
    return copiedFormat;
};

// COPY

/**
 * Asks which parts of a field or constant's format to copy — colors, attributes, its own
 * indicators, and whether colors and attributes keep their indicators — and keeps them for
 * Paste Format.
 * @param element - The field or constant to copy from
 * @returns True when something was copied
 */
export async function copyFormat(element: any): Promise<boolean> {
    const colors = readKeywords(element, 'COLOR');
    const attributes = readKeywords(element, 'DSPATR');
    const elementIndicators: DdsIndicator[] = element.indicators ?? [];
    const editing = readEditingKeywords(element);

    const items: FormatPartItem[] = [
        { part: 'colors', label: 'Colors', description: describeKeywords(colors), picked: true },
        { part: 'attributes', label: 'Display attributes', description: describeKeywords(attributes), picked: true },
        { part: 'elementIndicators', label: `Indicators of ${element.name} itself`, description: formatIndicatorCondition(elementIndicators) || 'none' }
    ];
    // Only a field can have number editing. Checked when it has some: copying none would take
    // the targets' own away.
    if (element.kind === 'field') {
        items.push({ part: 'editing', label: 'Number editing (edit code, edit word, edit mask)', description: editing.join(' · ') || 'none', picked: editing.length > 0 });
    };
    items.push({ part: 'keepIndicators', label: 'Keep the indicators of colors and attributes', description: 'unchecked, they are pasted without condition', picked: true });
    const picked = await vscode.window.showQuickPick(items, {
        title: `Copy Format of ${element.name}`,
        placeHolder: 'Check what to copy — pasting replaces what the target has of each part checked',
        canPickMany: true,
        ignoreFocusOut: true
    });
    if (!picked) return false;

    const has = (part: FormatPartItem['part']) => picked.some(item => item.part === part);
    if (!has('colors') && !has('attributes') && !has('elementIndicators') && !has('editing')) {
        vscode.window.showInformationMessage('Nothing to copy.');
        return false;
    };

    const { document } = checkForEditorAndDocument();
    copiedFormat = readFormat(element, {
        colors: has('colors'),
        attributes: has('attributes'),
        elementIndicators: has('elementIndicators'),
        editing: has('editing'),
        keepIndicators: has('keepIndicators')
    }, document?.uri.toString() ?? '');
    vscode.window.showInformationMessage(`Format of ${element.name} copied. Select where to paste it and use Actions > Paste Format.`);
    return true;
};

/**
 * The parts of a field or constant's format asked for, as Paste Format takes them.
 * @param element - The field or constant to copy from
 * @param parts - Which parts to copy
 * @param documentUri - The document's URI, to find a referenced field's resolved size
 */
export function readFormat(element: any, parts: FormatParts, documentUri: string): CopiedFormat {
    const read = (keyword: 'COLOR' | 'DSPATR') => {
        const keywords = readKeywords(element, keyword);
        return parts.keepIndicators ? keywords : withoutIndicators(keywords);
    };
    return {
        sourceName: element.name,
        sourceLineIndex: element.lineIndex,
        colors: parts.colors ? read('COLOR') : undefined,
        attributes: parts.attributes ? read('DSPATR') : undefined,
        elementIndicators: parts.elementIndicators ? (element.indicators ?? []) : undefined,
        editing: parts.editing && element.kind === 'field' ? readEditing(element, documentUri) : undefined
    };
};

/** The field's editing keywords, and its size. */
function readEditing(element: any, documentUri: string): CopiedEditing {
    const shape = numericShape(element, documentUri);
    return { keywords: readEditingKeywords(element), length: shape.length, decimals: shape.decimals };
};

/** The field's EDTCDE, EDTWRD and EDTMSK keywords, as written. Option indicators aren't valid on
 * them, so they're never conditioned. */
function readEditingKeywords(element: any): string[] {
    return ((element.attributes ?? []) as { value: string }[])
        .map(attr => attr.value)
        .filter(value => EDITING_KEYWORDS.some(keyword => value.startsWith(`${keyword}(`)));
};

/**
 * Whether a field can be edited as a number, and its length and decimals. DDS allows EDTCDE and
 * EDTWRD only with Y or blank in position 35: blank is numeric when decimals are given, and for a
 * referenced field when the field it refers to is numeric — known only once it's been resolved.
 * S counts too: pasting turns it into Y, as STRSDA does when an edit code is added.
 */
function numericShape(field: any, documentUri: string): NumericShape {
    const type = (field.type ?? '').trim().toUpperCase();
    if (type !== '' && type !== 'Y' && type !== 'S') {
        return { numeric: false, reason: `type ${type}` };
    };

    if (field.referenced) {
        const resolved = getResolvedRef(documentUri, field.recordname, field.name, field.refOverrides);
        if (!resolved) {
            return { numeric: false, reason: 'referenced field not resolved yet' };
        };
        const numeric = type !== '' || NUMERIC_DATABASE_TYPES.includes((resolved.type ?? '').toUpperCase());
        return { numeric, reason: numeric ? undefined : 'not numeric', length: resolved.length, decimals: resolved.decimals };
    };

    const numeric = type !== '' || field.decimals !== undefined;
    return { numeric, reason: numeric ? undefined : 'not numeric', length: field.length, decimals: field.decimals };
};

/**
 * The element's COLOR or DSPATR keywords. One on the element's own definition line is read as
 * unconditioned: that line's indicators condition the element, not the keyword.
 */
function readKeywords(element: any, keyword: 'COLOR' | 'DSPATR'): CopiedKeyword[] {
    const pattern = new RegExp(`^${keyword}\\(\\s*(.*?)\\s*\\)$`);
    return ((element.attributes ?? []) as { value: string; lineIndex: number; indicators?: DdsIndicator[]; displayFormat?: string }[])
        .flatMap(attr => {
            const match = attr.value.match(pattern);
            if (!match || attr.displayFormat) return [];
            const indicators = attr.lineIndex === element.lineIndex ? [] : (attr.indicators ?? []);
            return [{ keyword, codes: match[1].split(/\s+/), indicators }];
        });
};

/** 'RED when 30 · WHT' — what a part of the format holds, for the copy window. */
function describeKeywords(keywords: CopiedKeyword[]): string {
    if (keywords.length === 0) return 'none';
    return keywords.map(kw => {
        const condition = formatIndicatorCondition(kw.indicators);
        return kw.codes.join(' ') + (condition ? ` when ${condition}` : '');
    }).join(' · ');
};

/**
 * The keywords with no condition. Without indicators, two colors would both always apply, so only
 * the first is kept; attributes are merged, each value once (DDS allows each only once per field).
 */
function withoutIndicators(keywords: CopiedKeyword[]): CopiedKeyword[] {
    if (keywords.length === 0) return [];
    if (keywords[0].keyword === 'COLOR') {
        return [{ ...keywords[0], indicators: [] }];
    };
    const codes = [...new Set(keywords.flatMap(kw => kw.codes))];
    return [{ keyword: 'DSPATR', codes, indicators: [] }];
};

// PASTE

/**
 * Pastes the copied format onto fields and constants: for each part copied, removes what the
 * target has of it and adds the source's. Attributes a target can't take (Protect on a constant,
 * a program-to-system field its record doesn't have...) are left out, and said so.
 * Targets are done from the last one in the source up, so each edit only moves lines below the
 * ones still to do.
 * @param editor - The active text editor
 * @param targets - The fields and constants to paste onto
 * @param format - What to paste: the format last copied, unless given
 * @returns True when at least one target was changed
 */
export async function pasteFormat(editor: vscode.TextEditor, targets: any[], format = copiedFormat): Promise<boolean> {
    if (!format) {
        vscode.window.showInformationMessage('Copy the format of a field or constant first.');
        return false;
    };

    const ordered = targets
        .filter(target => target.kind === 'field' || target.kind === 'constant')
        .filter(target => target.lineIndex !== format.sourceLineIndex || target.name !== format.sourceName)
        .sort((a, b) => b.lineIndex - a.lineIndex);
    if (ordered.length === 0) return false;

    const skipped: string[] = [];
    let pasted = 0;
    for (const target of ordered) {
        if (!(await pasteFormatOnto(editor, target, format, skipped))) break;
        pasted++;
    };
    if (pasted === 0) return false;

    const onto = pasted === 1 ? ordered[0].name : `${pasted} elements`;
    const note = skipped.length > 0 ? ` Left out: ${[...new Set(skipped)].join('; ')}.` : '';
    vscode.window.showInformationMessage(`Pasted the format of ${format.sourceName} onto ${onto}.${note}`);
    return true;
};

/**
 * Pastes the format onto one target: removes its colors and/or attributes, adds the copied ones
 * on lines of their own below it, then sets its own indicators — last, since a long condition
 * adds lines above it.
 * @param skipped - Collects what had to be left out, for the closing message
 * @returns False when an edit couldn't be applied
 */
async function pasteFormatOnto(editor: vscode.TextEditor, target: any, format: CopiedFormat, skipped: string[]): Promise<boolean> {
    const editing = format.editing ? fitEditing(format.editing, target, editor.document.uri.toString(), skipped) : undefined;
    const keywordsToRemove = [
        ...['COLOR', 'DSPATR'].filter(keyword => keyword === 'COLOR' ? format.colors : format.attributes),
        ...(editing ? EDITING_KEYWORDS : [])
    ];
    if (keywordsToRemove.length > 0) {
        const toRemove = ((target.attributes ?? []) as { value: string; lineIndex: number; lastLineIndex?: number }[])
            .filter(attr => keywordsToRemove.some(keyword => attr.value.startsWith(`${keyword}(`)))
            .sort((a, b) => b.lineIndex - a.lineIndex);
        for (const attr of toRemove) {
            const removed = await removeWholeKeyword(editor, target, {
                keywordText: attr.value,
                lineIndex: attr.lineIndex,
                lastLineIndex: attr.lastLineIndex ?? attr.lineIndex
            });
            if (!removed) return false;
        };
    };

    const elements = parseDocument(editor.document.getText());
    target = elements.find(el => el.kind === target.kind && el.lineIndex === target.lineIndex);
    if (!target) return false;

    const keywords = [
        ...(format.colors ?? []),
        ...(format.attributes ?? []).flatMap(kw => fitAttributeKeyword(kw, target, elements, skipped))
    ];
    if (keywords.length > 0 || (editing?.length ?? 0) > 0) {
        const lines = [
            ...(editing ?? []).flatMap(keywordText => paginateKeywordText(keywordText).map(chunk => '     A'.padEnd(44, ' ') + chunk)),
            ...keywords.flatMap(kw => buildConditionedKeywordLines(`${kw.keyword}(${kw.codes.join(' ')})`, kw.indicators))
        ];
        const workspaceEdit = new vscode.WorkspaceEdit();
        // DDS doesn't allow an edit code or edit word on an S field: it becomes Y, as in STRSDA.
        if (editing?.some(keyword => keyword.startsWith('EDTCDE(') || keyword.startsWith('EDTWRD('))) {
            upgradeSignedTypeOnFieldLine(editor.document, workspaceEdit, editor.document.uri, target);
        };
        if (!(await insertLinesBelowElement(editor, target, lines, workspaceEdit))) return false;
    };

    if (format.elementIndicators) {
        if (target.displayFormat) {
            skipped.push(`indicators of ${target.name}, conditioned by a display size`);
        } else if (!(await setLineCondition(editor, target.lineIndex, format.elementIndicators))) {
            return false;
        };
    };
    return true;
};

/**
 * The copied attribute keyword as the target can take it: values only input-capable fields allow
 * are dropped from constants and output fields, and a program-to-system field (&PFLD) is kept
 * only when the target's record has that P field.
 */
function fitAttributeKeyword(keyword: CopiedKeyword, target: any, elements: any[], skipped: string[]): CopiedKeyword[] {
    const pField = keyword.codes[0]?.startsWith('&') ? keyword.codes[0].substring(1) : undefined;
    if (pField) {
        const hasPField = target.kind === 'field' && elements.some(el =>
            el.kind === 'field' && el.recordname === target.recordname && el.name === pField && el.usage === 'P');
        if (!hasPField) {
            skipped.push(`${pField} attribute field on ${target.name}`);
            return [];
        };
        return [keyword];
    };

    const inputCapable = target.kind === 'field' && (target.usage === 'I' || target.usage === 'B');
    const allowed = inputCapable ? [...ATTRIBUTES_FOR_ALL, ...ATTRIBUTES_FOR_INPUT] : ATTRIBUTES_FOR_ALL;
    const codes = keyword.codes.filter(code => allowed.includes(code));
    keyword.codes.filter(code => !codes.includes(code)).forEach(code => skipped.push(`${code} on ${target.name}`));
    return codes.length > 0 ? [{ ...keyword, codes }] : [];
};

/**
 * The copied editing keywords as the target can take them, or undefined to leave its own editing
 * alone — it isn't a field, or isn't one the edit code or edit word fits. With no editing copied,
 * an empty list: the target's own is just removed. The edit mask goes only on an input-capable
 * field of the same length and decimals as the source (it has to match the edited field
 * character for character), and not with the CHECK values DDS forbids beside it.
 */
function fitEditing(editing: CopiedEditing, target: any, documentUri: string, skipped: string[]): string[] | undefined {
    if (target.kind !== 'field') return undefined;
    if (editing.keywords.length === 0) return [];

    const leaveOut = (why: string) => {
        skipped.push(`number editing on ${target.name} (${why})`);
        return undefined;
    };
    const shape = numericShape(target, documentUri);
    if (!shape.numeric) return leaveOut(shape.reason ?? 'not numeric');

    const targetKeywords = ((target.attributes ?? []) as { value: string }[]).map(attr => attr.value);
    if (targetKeywords.some(value => /^DFT(VAL)?\(/.test(value))) return leaveOut('it has a default value');

    for (const keyword of editing.keywords) {
        const editCode = keyword.match(/^EDTCDE\(\s*(\S+)/)?.[1];
        const validLengths = editCode ? DATE_EDIT_CODE_LENGTHS[editCode] : undefined;
        if (validLengths && !validLengths.includes(shape.length ?? 0)) {
            return leaveOut(`edit code ${editCode} needs length ${validLengths.join(', ')}`);
        };
        const editWord = keyword.match(/^EDTWRD\('(.*)'\)$/)?.[1];
        const digitPositions = editWord ? (editWord.match(/[ 0]/g) ?? []).length : 0;
        if (digitPositions > 0 && digitPositions !== shape.length) {
            return leaveOut(`the edit word has ${digitPositions} digit positions, the field is length ${shape.length}`);
        };
    };

    return editing.keywords.filter(keyword => {
        if (!keyword.startsWith('EDTMSK(')) return true;
        const inputCapable = target.usage === 'I' || target.usage === 'B';
        const sameSize = shape.length === editing.length && shape.decimals === editing.decimals;
        const forbiddenCheck = targetKeywords.some(value => {
            const checks = value.match(/^CHECK\((.*)\)$/)?.[1].trim().split(/\s+/) ?? [];
            return checks.some(check => CHECKS_NOT_WITH_EDIT_MASK.includes(check));
        });
        if (inputCapable && sameSize && !forbiddenCheck) return true;
        skipped.push(`edit mask on ${target.name}`);
        return false;
    });
};

/**
 * Inserts lines right after the element's last line. findElementInsertionPoint stops at the next
 * field or constant, but the indicator-only lines conditioning it come before it — they belong to
 * it, so the lines go in above them.
 * @param workspaceEdit - Other edits to apply along with the insertion, if any
 */
async function insertLinesBelowElement(editor: vscode.TextEditor, element: any, lines: string[], workspaceEdit = new vscode.WorkspaceEdit()): Promise<boolean> {
    const document = editor.document;
    let insertionPoint = findElementInsertionPoint(editor, element);
    while (insertionPoint - 1 > element.lineIndex && insertionPoint < document.lineCount
        && isPureIndicatorContinuationLine(document.lineAt(insertionPoint - 1).text)) {
        insertionPoint--;
    };

    if (insertionPoint >= document.lineCount) {
        workspaceEdit.insert(document.uri, document.lineAt(document.lineCount - 1).range.end, '\n' + lines.join('\n'));
    } else {
        workspaceEdit.insert(document.uri, new vscode.Position(insertionPoint, 0), lines.join('\n') + '\n');
    };
    return applyWorkspaceEdit(workspaceEdit, 'paste the format');
};
