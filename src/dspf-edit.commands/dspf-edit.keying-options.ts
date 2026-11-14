/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.keying-options.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsIndicator } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, findElementInsertionPoint, insertKeywordLines, formatIndicatorCondition } from '../dspf-edit.utils/dspf-edit.helper';
import { KeywordValue, KeywordValueSpec, manageKeywordValues, removeKeywordValue, reparseElement } from './dspf-edit.conditioned-keywords';

/**
 * Keying options: the keyboard-control and data-entry codes of the CHECK keyword an input-capable
 * field can have — the same set the "Select Keying Options" screen offers:
 *   ME  Mandatory entry        ER  Automatic record advance (end of record)
 *   MF  Mandatory fill         FE  Field exit key required
 *   RB  Right adjust blank fill  RZ  Right adjust zero fill
 * The other CHECK codes (AB, M10, M11, VN, VNE, LC, RL, RLTB) are left as they are: the window only
 * lists, adds and removes these six, even when they share one CHECK() with others.
 * Per the DDS reference, option indicators are valid only for CHECK(ER) and CHECK(ME); MF can't go
 * with RB or RZ (nor with WRDWRAP); RB/RZ can't go with WRDWRAP; and a CNTFLD field can't have
 * MF, RB or RZ.
 */

// KEYING OPTIONS

const KEYING_OPTION_NAMES: Record<string, string> = {
    ME: 'Mandatory entry',
    ER: 'Automatic record advance',
    MF: 'Mandatory fill',
    FE: 'Field exit key required',
    RB: 'Right adjust blank fill',
    RZ: 'Right adjust zero fill'
};

/** The only CHECK codes DDS allows indicators on. */
const CONDITIONABLE_CODES = ['ME', 'ER'];

// COMMAND REGISTRATION

/**
 * Registers the keying options command for input-capable fields.
 * @param context - The VS Code extension context
 */
export function keyingOptions(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dspf-edit.keying-options', async (node: DdsNode) => {
            await handleKeyingOptionsCommand(node);
        })
    );
};

// COMMAND HANDLER

async function handleKeyingOptionsCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const element = node.ddsElement as any;
        if (element.kind !== 'field') {
            vscode.window.showWarningMessage('Keying options can only be set on fields.');
            return;
        };
        if (!isInputCapable(element)) {
            vscode.window.showWarningMessage(`${element.name} is an output-only field: keying options only apply to fields the user can type into (usage I or B).`);
            return;
        };

        await manageKeywordValues(editor, element, buildKeyingOptionsSpec(element));

    } catch (error) {
        console.error('Error managing keying options:', error);
        vscode.window.showErrorMessage('An error occurred while managing keying options.');
    };
};

/** Input-only (I) or input/output (B); a blank usage is output-only in a display file. */
function isInputCapable(element: any): boolean {
    const usage = (element.usage || '').trim().toUpperCase();
    return usage === 'I' || usage === 'B';
};

/**
 * The window's spec for one field. The field's other keywords are read once, up front, for the
 * combinations DDS doesn't allow (WRDWRAP, CNTFLD, and the older AUTO(RAB/RAZ) right-adjust form).
 */
function buildKeyingOptionsSpec(element: any): KeywordValueSpec {
    const otherKeywords = ((element.attributes || []) as { value: string }[]).map(attr => attr.value.toUpperCase());
    const hasWrdwrap = otherKeywords.some(value => /^WRDWRAP\b/.test(value));
    const hasCntfld = otherKeywords.some(value => /^CNTFLD\(/.test(value));
    const autoRightAdjust = otherKeywords.find(value => /^AUTO\(\s*RA[BZ]\s*\)$/.test(value));

    return {
        keyword: 'CHECK',
        codes: Object.keys(KEYING_OPTION_NAMES),
        noun: 'keying option',
        nounPlural: 'keying options',
        describe: code => KEYING_OPTION_NAMES[code] ? `${code} — ${KEYING_OPTION_NAMES[code]}` : code,
        read: field => getCurrentKeyingOptions(field),
        add: addKeyingOptions,
        removeAll: removeAllKeyingOptions,
        canCondition: code => CONDITIONABLE_CODES.includes(code),
        placeholder: 'Check the keying options it should have and press Enter — pencil sets indicators (ME and ER only), trash removes',
        validate: codes => {
            const has = (code: string) => codes.includes(code);
            if (has('RB') && has('RZ')) {
                return 'RB and RZ can\'t go together: a field is right-adjusted with either blank fill or zero fill.';
            };
            if (has('MF') && (has('RB') || has('RZ'))) {
                return 'Mandatory fill (MF) can\'t go with right adjust (RB or RZ).';
            };
            const fillOrAdjust = codes.filter(code => ['MF', 'RB', 'RZ'].includes(code));
            if (fillOrAdjust.length > 0 && hasWrdwrap) {
                return `${fillOrAdjust.join(', ')} can't go on a field with word wrap (WRDWRAP).`;
            };
            if (fillOrAdjust.length > 0 && hasCntfld) {
                return `${fillOrAdjust.join(', ')} can't go on a field split into lines (CNTFLD).`;
            };
            if ((has('RB') || has('RZ')) && autoRightAdjust) {
                return `${element.name} is already right-adjusted by ${autoRightAdjust}; remove it first.`;
            };
            return undefined;
        }
    };
};

// ADDING

/**
 * Adds keying options one per line — CHECK(ME), then CHECK(FE) — the way STRSDA writes them, in
 * the window's order, after the field's last line. Each line can then take its own indicators.
 */
async function addKeyingOptions(editor: vscode.TextEditor, element: any, codes: string[]): Promise<boolean> {
    const ordered = Object.keys(KEYING_OPTION_NAMES).filter(code => codes.includes(code));
    for (const code of ordered) {
        if (!(await insertKeywordLines(editor, findElementInsertionPoint(editor, element), `CHECK(${code})`))) {
            return false;
        };
    };
    return true;
};

// READING AND REMOVING

/**
 * The keying options the field has now, one per code: CHECK(ME FE) gives ME and FE, both pointing
 * back to the same keyword text. Codes that aren't keying options (AB, VN, LC...) are left out.
 */
function getCurrentKeyingOptions(element: any): KeywordValue[] {
    const attributes = (element.attributes || []) as { value: string; indicators?: DdsIndicator[]; lineIndex: number; lastLineIndex?: number }[];
    const values: KeywordValue[] = [];

    for (const attr of attributes) {
        const match = attr.value.match(/^CHECK\(\s*([^)]*?)\s*\)$/i);
        if (!match) continue;

        for (const code of match[1].toUpperCase().split(/\s+/)) {
            if (!KEYING_OPTION_NAMES[code]) continue;
            values.push({
                code,
                keywordText: attr.value,
                lineIndex: attr.lineIndex,
                lastLineIndex: attr.lastLineIndex ?? attr.lineIndex,
                conditionText: formatIndicatorCondition(attr.indicators)
            });
        };
    };
    return values;
};

/**
 * Removes every keying option, one at a time from the last line up, re-reading the field after
 * each: two of them can share one CHECK() (and other CHECK codes can share it too), so each removal
 * can rewrite the keyword the next one is read from.
 */
async function removeAllKeyingOptions(editor: vscode.TextEditor, element: any): Promise<boolean> {
    while (true) {
        const remaining = getCurrentKeyingOptions(element).sort((a, b) => b.lineIndex - a.lineIndex);
        if (remaining.length === 0) {
            return true;
        };
        if (!(await removeKeywordValue(editor, element, remaining[0]))) {
            return false;
        };
        element = reparseElement(editor, element);
        if (!element) {
            return false;
        };
    };
};
