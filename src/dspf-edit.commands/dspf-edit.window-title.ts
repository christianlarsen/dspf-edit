/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.window-title.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute, FieldInfo, FieldsPerRecord, fieldsPerRecords, getAvailableDisplayFormats } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument, applyWorkspaceEdit, writeDisplayFormatCondition,
    insertKeywordLines, replaceKeywordTextInLines, removeKeywordTextFromLines
} from '../dspf-edit.utils/dspf-edit.helper';
import { parseDocument, pickForActiveFormat, parseWindowDefinition } from '../dspf-edit.parser/dspf-edit.parser';
import { validateFieldNameFormat } from './dspf-edit.edit-field';
import { describeFieldDefinition, findField, hiddenFieldLine, insertHiddenFieldLines, isNamedByRecordKeywords, deleteUnusedFields } from './dspf-edit.hidden-fields';
import { ExtensionState } from '../dspf-edit.states/state';

/**
 * The window's title and footer: the WDWTITLE keywords embedding a text in its top border and in
 * its bottom border (*BOTTOM). Each text is either a literal, (*TEXT 'Title'), or a P field the
 * program fills, (*TEXT &FIELD), which must be a character field with usage P in the window's
 * record (DDS reference).
 */

// INTERFACES AND TYPES

export type TitleAlign = 'LEFT' | 'CENTER' | 'RIGHT';
export type TitlePosition = 'TOP' | 'BOTTOM';

/** Where a title's text comes from: written in the source, or a P field the program fills. */
export type TitleSource = { kind: 'text'; text: string } | { kind: 'field'; name: string };

/** A WDWTITLE keyword's parameters, as parseWindowTitleKeyword reads them. */
export interface WindowTitleParts {
    source?: TitleSource;
    position: TitlePosition;
    /** Only when coded: the default depends on the position (see defaultAlign) */
    align?: TitleAlign;
    /** The (*COLOR ...) and (*DSPATR ...) parameters as coded, kept as they are when the text changes */
    colorPart?: string;
    dspatrPart?: string;
};

/** The title or footer the window has now: the first WDWTITLE in effect for that border. */
interface ExistingWindowTitle extends WindowTitleParts {
    attr: DdsAttribute;
};

// PARSING AND WRITING THE KEYWORD

/**
 * Reads a WDWTITLE keyword: its text (a literal, with '' for a quote, or &FIELD), border,
 * alignment, color and display attributes.
 * @param value - The keyword, e.g. "WDWTITLE((*TEXT &TTL1) (*COLOR RED) *BOTTOM)"
 */
export function parseWindowTitleKeyword(value: string): WindowTitleParts {
    const upper = value.toUpperCase();
    const literal = value.match(/\(\s*\*TEXT\s+'((?:[^']|'')*)'\s*\)/i)?.[1];
    const field = value.match(/\(\s*\*TEXT\s+&([A-Za-z@#$][A-Za-z0-9@#$_]*)\s*\)/i)?.[1];
    const source: TitleSource | undefined = literal !== undefined ? { kind: 'text', text: literal.replace(/''/g, "'") }
        : field ? { kind: 'field', name: field.toUpperCase() }
        : undefined;

    return {
        source,
        position: /\*BOTTOM\b/.test(upper) ? 'BOTTOM' : 'TOP',
        align: /\*RIGHT\b/.test(upper) ? 'RIGHT' : /\*LEFT\b/.test(upper) ? 'LEFT' : /\*CENTER\b/.test(upper) ? 'CENTER' : undefined,
        colorPart: value.match(/\(\s*\*COLOR\s+\w+\s*\)/i)?.[0],
        dspatrPart: value.match(/\(\s*\*DSPATR(?:\s+\w+)+\s*\)/i)?.[0]
    };
};

/** Where a title is aligned when the keyword doesn't say: centered on top, left on the bottom border (DDS reference). */
export function defaultAlign(position: TitlePosition): TitleAlign {
    return position === 'BOTTOM' ? 'LEFT' : 'CENTER';
};

/**
 * Writes a WDWTITLE keyword: WDWTITLE((*TEXT 'Title') [(*COLOR ..)] [(*DSPATR ..)] *CENTER [*BOTTOM]).
 * The alignment is always written, as before; *TOP isn't, being the default.
 */
export function buildWindowTitleKeyword(parts: WindowTitleParts & { source: TitleSource }): string {
    const text = parts.source.kind === 'text'
        ? `(*TEXT '${parts.source.text.replace(/'/g, "''")}')`
        : `(*TEXT &${parts.source.name})`;
    const align = `*${parts.align ?? defaultAlign(parts.position)}`;
    return `WDWTITLE(${[text, parts.colorPart, parts.dspatrPart, align, parts.position === 'BOTTOM' ? '*BOTTOM' : undefined]
        .filter(Boolean).join(' ')})`;
};

/** How a title reads in the list: 'Customers' (quoted), '&TITULO (field)', or none. */
function describeSource(source: TitleSource | undefined): string {
    if (!source) {return 'none';}
    return source.kind === 'text' ? `'${source.text}'` : `&${source.name} (field)`;
};

// COMMAND REGISTRATION

/**
 * Registers the "Change Window Title" command for DDS window records: a window listing the
 * window's title and footer, to set, change or remove each.
 * @param context - The VS Code extension context
 */
export function windowTitle(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.window-title", async (node: DdsNode) => {
            await handleWindowTitleCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the window title command workflow for a tree node: validates it's a record, then
 * delegates to the shared, record-name-based flow (also used by the preview panel).
 * @param node - The DDS node containing the window record
 */
async function handleWindowTitleCommand(node: DdsNode): Promise<void> {
    const element = node.ddsElement;
    if (element.kind !== "record") {
        vscode.window.showWarningMessage("Window title can only be set on records.");
        return;
    };

    await editWindowTitleForRecord(element.name);
};

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Change' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Shows the window's title and footer, each with ✏️ (or selecting the row) to set or change it and
 * 🗑️ to remove it. The list opens again after each change; Escape closes it. Shared by the tree
 * context-menu command and by clicking the title directly in the record preview.
 * @param recordName - Name of the window record to edit the titles of
 * @param activeFormat - Display format (e.g. "*DS3") currently being previewed, when called from the
 * preview panel; undefined when called from the tree, which has no notion of an "active" format.
 */
export async function editWindowTitleForRecord(recordName: string, activeFormat?: string): Promise<void> {
    try {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const record = fieldsPerRecords.find(r => r.record === recordName);
        const windowCandidates = (record?.attributes ?? []).filter(a => a.value.toUpperCase().startsWith('WINDOW('));
        if (!record || windowCandidates.length === 0) {
            vscode.window.showWarningMessage(`Record '${recordName}' does not have a WINDOW keyword.`);
            return;
        };

        // The tree has no "active format" of its own — use the one selected in the open Screen
        // Preview, if any. Otherwise, if the record declares a separate window per display size (one
        // WINDOW() line per format), ask which one this title edit targets.
        activeFormat = activeFormat ?? ExtensionState.previewDisplayFormat;
        if (!activeFormat && windowCandidates.length > 1) {
            const picked = await pickTargetFormat(windowCandidates);
            if (!picked) {
                return;
            };
            activeFormat = picked.format;
        };

        const windowAttr = pickForActiveFormat(windowCandidates, activeFormat)!;
        const windowDefinition = parseWindowDefinition(windowAttr.value);
        if (!windowDefinition) {
            vscode.window.showWarningMessage(
                `Record '${recordName}' shares another record's window (WINDOW(${windowAttr.value.replace(/^WINDOW\(|\)$/g, '')})) — change the title on that record instead.`
            );
            return;
        };
        const context: TitleEditContext = {
            editor,
            recordName,
            activeFormat,
            windowWidth: windowDefinition.numCols,
            hasFormatWindows: windowCandidates.length > 1
        };

        let focus: TitlePosition | undefined;
        while (true) {
            parseDocument(editor.document.getText());
            const current = fieldsPerRecords.find(r => r.record === recordName);
            if (!current) {
                return;
            };
            const titles = findExistingWindowTitles(current, activeFormat);

            const choice = await showTitleList(recordName, titles, focus);
            if (!choice) {
                return;
            };
            focus = choice.position;

            const done = choice.action === 'remove'
                ? await removeWindowTitle(context, current, titles[choice.position]!)
                : await setWindowTitle(context, current, choice.position, titles[choice.position]);
            if (!done) {
                continue;
            };
            await vscode.commands.executeCommand('cursorRight');
            await vscode.commands.executeCommand('cursorLeft');
        };

    } catch (error) {
        console.error('Error changing window title:', error);
        vscode.window.showErrorMessage('An error occurred while changing the window title.');
    };
};

/** What the title edits need to know about the window. */
interface TitleEditContext {
    editor: vscode.TextEditor;
    recordName: string;
    activeFormat?: string;
    /** The window's width: a literal title can't be longer, and a new title field is created this long */
    windowWidth: number;
    /** True when the record has a WINDOW line per display size, so a new title may need conditioning on one */
    hasFormatWindows: boolean;
};

/**
 * Asks the user which declared display format's window a title edit should target, when the record
 * has more than one WINDOW() line and the caller (the tree) has no implicit "active format" to go by.
 * @param windowCandidates - The record's WINDOW() attribute lines, one per declared format
 * @returns The chosen format (undefined means the unconditioned/shared line), or null if cancelled
 */
async function pickTargetFormat(windowCandidates: DdsAttribute[]): Promise<{ format?: string } | null> {
    const options: (vscode.QuickPickItem & { format?: string })[] = windowCandidates.map(c => ({
        label: c.displayFormat ?? 'All sizes (unconditioned)',
        format: c.displayFormat
    }));

    const selection = await vscode.window.showQuickPick(options, {
        title: 'Change Window Title - Select Display Size',
        placeHolder: 'This record has a separate window per display size — choose which one to edit',
        ignoreFocusOut: true
    });

    return selection ? { format: selection.format } : null;
};

// EXISTING TITLES

/**
 * The record's title and footer for the given display format: for each border, the first
 * WDWTITLE in effect — when there are more, DDS combines them and the first one's parameters win.
 * @param record - The record's field/attribute info
 * @param activeFormat - Display format (e.g. "*DS3") to prefer, when the record has a WDWTITLE per format
 */
function findExistingWindowTitles(record: FieldsPerRecord, activeFormat?: string): Partial<Record<TitlePosition, ExistingWindowTitle>> {
    const candidates = (record.attributes ?? [])
        .filter(a => a.value.toUpperCase().startsWith('WDWTITLE('))
        .map(attr => ({ attr, displayFormat: attr.displayFormat, parts: parseWindowTitleKeyword(attr.value) }));

    const titles: Partial<Record<TitlePosition, ExistingWindowTitle>> = {};
    for (const position of ['TOP', 'BOTTOM'] as const) {
        const picked = pickForActiveFormat(candidates.filter(c => c.parts.position === position), activeFormat);
        if (picked) {
            titles[position] = { ...picked.parts, attr: picked.attr };
        };
    };
    return titles;
};

// THE LIST

type TitleListItem = vscode.QuickPickItem & { position: TitlePosition };

/**
 * Shows the title and footer rows and resolves to what the user did with one: set or change it
 * (the row, or its ✏️ button) or remove it (🗑️) — undefined when closed.
 */
function showTitleList(
    recordName: string,
    titles: Partial<Record<TitlePosition, ExistingWindowTitle>>,
    focus: TitlePosition | undefined
): Promise<{ action: 'set' | 'remove'; position: TitlePosition } | undefined> {
    const items: TitleListItem[] = (['TOP', 'BOTTOM'] as const).map(position => {
        const title = titles[position];
        return {
            position,
            label: position === 'TOP' ? 'Title (top)' : 'Footer (bottom)',
            description: describeSource(title?.source),
            detail: title ? `Aligned ${(title.align ?? defaultAlign(position)).toLowerCase()}` : undefined,
            buttons: title ? [EDIT_BUTTON, REMOVE_BUTTON] : [EDIT_BUTTON]
        };
    });

    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<TitleListItem>();
        quickPick.title = `Window Title for ${recordName}`;
        quickPick.placeholder = 'Select the title or the footer to set it — ✏️ changes, 🗑️ removes';
        quickPick.items = items;
        quickPick.activeItems = items.filter(item => item.position === focus);
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: { action: 'set' | 'remove'; position: TitlePosition } | undefined) => {
            if (settled) {return;}
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'set', position: event.item.position });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            finish(picked ? { action: 'set', position: picked.position } : undefined);
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

// SETTING A TITLE

/**
 * Sets or changes the title of one border: a text or a field, and its alignment. A field the
 * record doesn't have yet is created as a P field as long as the window is wide; one it has must
 * be a character P field. A field the title no longer uses can then be deleted.
 * @returns True when the source changed
 */
async function setWindowTitle(
    context: TitleEditContext,
    record: FieldsPerRecord,
    position: TitlePosition,
    existing: ExistingWindowTitle | undefined
): Promise<boolean> {
    const what = position === 'TOP' ? 'Title' : 'Footer';

    const kind = await vscode.window.showQuickPick([
        { label: 'Text', value: 'text' as const, description: existing?.source?.kind === 'text' ? '(current)' : undefined, detail: 'A text written in the source' },
        { label: 'Field', value: 'field' as const, description: existing?.source?.kind === 'field' ? '(current)' : undefined, detail: 'A P field of the record the program fills, (*TEXT &FIELD)' }
    ], {
        title: `Window ${what} for ${context.recordName}`,
        placeHolder: 'Where the text comes from',
        ignoreFocusOut: true
    });
    if (!kind) {
        return false;
    };

    const source = kind.value === 'text'
        ? await collectTitleText(what, existing?.source, context.windowWidth)
        : await collectTitleField(what, context.recordName, existing?.source, context.windowWidth);
    if (!source) {
        return false;
    };

    const align = await collectTitleAlign(what, existing?.align ?? defaultAlign(position));
    if (!align) {
        return false;
    };

    const keywordText = buildWindowTitleKeyword({ ...existing, position, source, align });
    if (!(await writeWindowTitle(context, record, existing, keywordText))) {
        return false;
    };

    // The field: created when missing; the old one offered for deletion when no longer used.
    const created: string[] = [];
    if (source.kind === 'field' && !findField(context.editor, context.recordName, source.name)) {
        const line = hiddenFieldLine(source.name, { type: 'A', length: context.windowWidth, usage: 'P' });
        if (!(await insertHiddenFieldLines(context.editor, context.recordName, [line]))) {
            return true;
        };
        created.push(source.name);
    };
    const oldField = existing?.source?.kind === 'field' ? existing.source.name : undefined;
    if (oldField && !(source.kind === 'field' && source.name === oldField)) {
        await offerDeletingTitleField(context, oldField);
    };

    vscode.window.showInformationMessage(
        `Window ${what.toLowerCase()} for '${context.recordName}' set to ${describeSource(source)}${created.length > 0 ? `; created field ${created[0]} (${context.windowWidth}A P)` : ''}.`
    );
    return true;
};

/**
 * Asks for a literal title, at most as long as the window is wide.
 * @returns The text, or undefined if cancelled or left empty
 */
async function collectTitleText(what: string, current: TitleSource | undefined, maxLength: number): Promise<TitleSource | undefined> {
    const value = await vscode.window.showInputBox({
        title: `Window ${what} - Text`,
        prompt: `Enter the ${what.toLowerCase()} (max ${maxLength} characters — the window's width)`,
        value: current?.kind === 'text' ? current.text : '',
        ignoreFocusOut: true,
        validateInput: input => {
            const text = input.trim();
            if (!text) {return 'Enter a text, or press Escape (🗑️ in the list removes it).';}
            return text.length > maxLength ? `It can't be longer than ${maxLength} characters (the window's width).` : null;
        }
    });
    const text = value?.trim();
    return text ? { kind: 'text', text } : undefined;
};

/**
 * Asks for the name of the P field holding the title. A field the record has must be a character
 * field with usage P (DDS reference); one it doesn't have is created.
 * @returns The field, or undefined if cancelled
 */
async function collectTitleField(what: string, recordName: string, current: TitleSource | undefined, windowWidth: number): Promise<TitleSource | undefined> {
    const value = await vscode.window.showInputBox({
        title: `Window ${what} - Field`,
        prompt: `Field the program fills with the ${what.toLowerCase()}: a character P field of ${recordName}, created (${windowWidth}A P) if missing`,
        value: current?.kind === 'field' ? current.name : (what === 'Title' ? 'WDWTITLE' : 'WDWFOOTER'),
        ignoreFocusOut: true,
        validateInput: input => {
            const name = input.trim().toUpperCase();
            if (!name) {return 'This field is required.';}
            const formatError = validateFieldNameFormat(name);
            if (formatError) {return formatError;}
            const existing = fieldsPerRecords.find(r => r.record === recordName)?.fields.find(f => f.name.toUpperCase() === name);
            const problem = existing ? titleFieldProblem(existing) : undefined;
            return problem ? `${name} is already defined in ${recordName} as ${problem}; a title field must be character with usage P (e.g. ${windowWidth}A P).` : null;
        }
    });
    const name = value?.trim().toUpperCase();
    return name ? { kind: 'field', name } : undefined;
};

/**
 * Why an existing field can't hold a window title — how it's defined instead — or undefined when it
 * can: a character field (A, or no data type) with usage P.
 */
export function titleFieldProblem(field: FieldInfo): string | undefined {
    const fits = !field.referenced
        && ['A', ''].includes((field.type || '').toUpperCase())
        && (field.usage || '').toUpperCase() === 'P';
    return fits ? undefined : describeFieldDefinition(field);
};

/** Asks for the title's alignment, the current one first. */
async function collectTitleAlign(what: string, current: TitleAlign): Promise<TitleAlign | undefined> {
    const options: (vscode.QuickPickItem & { value: TitleAlign })[] = (['CENTER', 'LEFT', 'RIGHT'] as const).map(value => ({
        label: value.charAt(0) + value.slice(1).toLowerCase(),
        description: value === current ? '(current)' : undefined,
        value
    }));
    options.sort((a, b) => Number(b.value === current) - Number(a.value === current));

    const selection = await vscode.window.showQuickPick(options, {
        title: `Window ${what} - Alignment`,
        placeHolder: 'Select the alignment',
        ignoreFocusOut: true
    });
    return selection?.value;
};

// DDS SOURCE UPDATE

/**
 * Writes the keyword: in place of the existing one, or on a line of its own after the window's
 * WINDOW and WDWTITLE keywords. A new one on a record with a window per display size is
 * conditioned on the format being worked on — except the primary one, which DDS doesn't allow
 * conditioning on (see writeDisplayFormatCondition).
 */
async function writeWindowTitle(context: TitleEditContext, record: FieldsPerRecord, existing: ExistingWindowTitle | undefined, keywordText: string): Promise<boolean> {
    const { editor } = context;
    if (existing) {
        return replaceKeywordTextInLines(editor, existing.attr.lineIndex, existing.attr.lastLineIndex ?? existing.attr.lineIndex, existing.attr.value, keywordText);
    };

    const windowKeywords = (record.attributes ?? []).filter(a => /^(WINDOW|WDWTITLE)\(/i.test(a.value));
    const insertionPoint = Math.max(...windowKeywords.map(a => a.lastLineIndex ?? a.lineIndex)) + 1;
    if (!(await insertKeywordLines(editor, insertionPoint, keywordText))) {
        return false;
    };

    const primaryFormat = getAvailableDisplayFormats()[0]?.name;
    if (context.hasFormatWindows && context.activeFormat && context.activeFormat !== primaryFormat) {
        const line = editor.document.lineAt(insertionPoint);
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(editor.document.uri, line.range, writeDisplayFormatCondition(line.text, context.activeFormat));
        return applyWorkspaceEdit(workspaceEdit, 'condition the window title on its display size');
    };
    return true;
};

/** Removes one border's title, then offers to delete its field if nothing else uses it. */
async function removeWindowTitle(context: TitleEditContext, record: FieldsPerRecord, existing: ExistingWindowTitle): Promise<boolean> {
    const { attr } = existing;
    const onRecordLine = attr.lineIndex === record.startIndex;
    if (!(await removeKeywordTextFromLines(context.editor, attr.lineIndex, attr.lastLineIndex ?? attr.lineIndex, attr.value, onRecordLine))) {
        return false;
    };
    if (existing.source?.kind === 'field') {
        await offerDeletingTitleField(context, existing.source.name);
    };
    return true;
};

/** Offers to delete a title field no keyword of the record names any more. */
async function offerDeletingTitleField(context: TitleEditContext, name: string): Promise<void> {
    if (findField(context.editor, context.recordName, name) && !isNamedByRecordKeywords(context.editor, context.recordName, name)) {
        await deleteUnusedFields(context.editor, context.recordName, 'WDWTITLE', [name]);
    };
};
