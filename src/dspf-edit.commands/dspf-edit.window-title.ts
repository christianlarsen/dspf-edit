/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.window-title.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { FieldsPerRecord, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';
import { generateWindowTitleLines } from './dspf-edit.new-record';

type TitleAlign = 'LEFT' | 'CENTER' | 'RIGHT';
type TitlePosition = 'TOP' | 'BOTTOM';

/** The record's current WDWTITLE() keyword, if any, parsed for editing. */
interface ExistingWindowTitle {
    text: string;
    align: TitleAlign;
    position: TitlePosition;
    lineIndex: number;
    lastLineIndex: number;
};

// COMMAND REGISTRATION

/**
 * Registers the "Change Window Title" command for DDS window records.
 * Lets the user add, edit, or remove the WDWTITLE() keyword.
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

/**
 * Collects the new title text/alignment/position from the user and writes (or removes) the
 * WDWTITLE() keyword for the given window record. Shared by the tree context-menu command and by
 * clicking the title directly in the record preview.
 * @param recordName - Name of the window record to edit the title for
 */
export async function editWindowTitleForRecord(recordName: string): Promise<void> {
    try {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const record = fieldsPerRecords.find(r => r.record === recordName);
        const windowAttr = record?.attributes?.find(a => a.value.toUpperCase().startsWith('WINDOW('));
        if (!record || !windowAttr) {
            vscode.window.showWarningMessage(`Record '${recordName}' does not have a WINDOW keyword.`);
            return;
        };

        const windowMatch = windowAttr.value.match(/WINDOW\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+[^)]*)?\s*\)/i);
        if (!windowMatch) {
            vscode.window.showWarningMessage(
                `Record '${recordName}' shares another record's window (WINDOW(${windowAttr.value.replace(/^WINDOW\(|\)$/g, '')})) — change the title on that record instead.`
            );
            return;
        };
        const windowWidth = parseInt(windowMatch[4], 10);

        const existing = findExistingWindowTitle(record);

        const text = await collectTitleText(existing?.text, windowWidth);
        if (text === null) {
            return;
        };

        if (text === '') {
            if (!existing) {
                vscode.window.showInformationMessage('No title entered.');
                return;
            };
            if (!(await removeWindowTitle(editor, existing))) {
                return;
            };
            vscode.window.showInformationMessage(`Removed window title for '${recordName}'.`);
            return;
        };

        const align = await collectTitleAlign(existing?.align);
        if (!align) {
            return;
        };

        const position = await collectTitlePosition(existing?.position);
        if (!position) {
            return;
        };

        const anchorLineIndex = windowAttr.lastLineIndex ?? windowAttr.lineIndex;
        if (!(await applyWindowTitle(editor, anchorLineIndex, existing, text, align, position))) {
            return;
        };

        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        vscode.window.showInformationMessage(`Window title updated for '${recordName}'.`);

    } catch (error) {
        console.error('Error changing window title:', error);
        vscode.window.showErrorMessage('An error occurred while changing the window title.');
    };
};

// EXISTING TITLE LOOKUP

/**
 * Finds and parses the record's WDWTITLE() keyword, if any.
 * @param record - The record's field/attribute info
 */
function findExistingWindowTitle(record: FieldsPerRecord): ExistingWindowTitle | undefined {
    const attr = record.attributes?.find(a => a.value.toUpperCase().startsWith('WDWTITLE('));
    if (!attr) {
        return undefined;
    };

    const textMatch = attr.value.match(/WDWTITLE\(\(\*\w+\s+'([^']*)'\)/i);
    if (!textMatch) {
        return undefined;
    };

    const upperValue = attr.value.toUpperCase();

    return {
        text: textMatch[1],
        align: upperValue.includes('*RIGHT') ? 'RIGHT' : upperValue.includes('*LEFT') ? 'LEFT' : 'CENTER',
        position: upperValue.includes('*BOTTOM') ? 'BOTTOM' : 'TOP',
        lineIndex: attr.lineIndex,
        lastLineIndex: attr.lastLineIndex ?? attr.lineIndex
    };
};

// USER INPUT COLLECTION

/**
 * Collects the new title text from the user, pre-filled with the current one if editing.
 * @param current - The record's current title text, if any
 * @param maxLength - Maximum title length, i.e. the window's width (WINDOW's numCols)
 * @returns The trimmed title (empty string means "remove the title"), or null if cancelled
 */
async function collectTitleText(current: string | undefined, maxLength: number): Promise<string | null> {
    const value = await vscode.window.showInputBox({
        title: 'Window Title',
        prompt: `Enter the window title (max ${maxLength} characters — the window's width); leave empty to remove it`,
        value: current ?? '',
        placeHolder: 'Window Title',
        ignoreFocusOut: true,
        validateInput: (v) => validateWindowTitle(v, maxLength)
    });

    if (value === undefined) {
        return null;
    };
    return value.trim();
};

/**
 * Validates window title length against the window's width, and that it doesn't contain a
 * single quote (which would break out of the DDS string literal).
 * @param value - Title to validate
 * @param maxLength - Maximum allowed length (the window's width)
 */
function validateWindowTitle(value: string, maxLength: number): string | null {
    if (!value || value.trim() === '') {
        return null;
    };

    const trimmedValue = value.trim();
    if (trimmedValue.includes("'")) {
        return "Title cannot contain a single quote (').";
    };
    if (trimmedValue.length > maxLength) {
        return `Title cannot exceed ${maxLength} characters (the window's width).`;
    };

    return null;
};

/**
 * Collects the title's horizontal alignment.
 * @param current - The record's current alignment, if editing an existing title
 */
async function collectTitleAlign(current: TitleAlign | undefined): Promise<TitleAlign | null> {
    const options: (vscode.QuickPickItem & { value: TitleAlign })[] = [
        { label: 'Center', value: 'CENTER' },
        { label: 'Left', value: 'LEFT' },
        { label: 'Right', value: 'RIGHT' }
    ];

    const selection = await vscode.window.showQuickPick(options, {
        title: `Window Title - Horizontal Alignment (current: ${current ?? 'CENTER'})`,
        placeHolder: 'Select the title alignment',
        ignoreFocusOut: true
    });

    return selection?.value ?? null;
};

/**
 * Collects the title's vertical position (top or bottom border of the window).
 * @param current - The record's current position, if editing an existing title
 */
async function collectTitlePosition(current: TitlePosition | undefined): Promise<TitlePosition | null> {
    const options: (vscode.QuickPickItem & { value: TitlePosition })[] = [
        { label: 'Top', value: 'TOP' },
        { label: 'Bottom', value: 'BOTTOM' }
    ];

    const selection = await vscode.window.showQuickPick(options, {
        title: `Window Title - Vertical Position (current: ${current ?? 'TOP'})`,
        placeHolder: 'Select the title position',
        ignoreFocusOut: true
    });

    return selection?.value ?? null;
};

// DDS SOURCE UPDATE

/**
 * Writes the new WDWTITLE() keyword, replacing the existing one's line(s) if present, or
 * inserting a new line right after the WINDOW() keyword otherwise.
 * @param editor - The active text editor
 * @param anchorLineIndex - Line to insert after, when there's no existing title (the WINDOW keyword's own last line)
 * @param existing - The record's current title, if any, to replace
 * @param text - The new title text
 * @param align - The new horizontal alignment
 * @param position - The new vertical position
 */
async function applyWindowTitle(
    editor: vscode.TextEditor,
    anchorLineIndex: number,
    existing: ExistingWindowTitle | undefined,
    text: string,
    align: TitleAlign,
    position: TitlePosition
): Promise<boolean> {
    const lines = generateWindowTitleLines(text, align, position);
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    if (existing) {
        const range = new vscode.Range(
            existing.lineIndex, 0,
            existing.lastLineIndex, editor.document.lineAt(existing.lastLineIndex).text.length
        );
        workspaceEdit.replace(uri, range, lines.join('\n'));
    } else {
        const insertPosition = new vscode.Position(anchorLineIndex + 1, 0);
        workspaceEdit.insert(uri, insertPosition, lines.join('\n') + '\n');
    };

    return applyWorkspaceEdit(workspaceEdit, 'update the window title');
};

/**
 * Removes the record's existing WDWTITLE() keyword line(s) entirely.
 * @param editor - The active text editor
 * @param existing - The title to remove
 */
async function removeWindowTitle(editor: vscode.TextEditor, existing: ExistingWindowTitle): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    const range = new vscode.Range(
        existing.lineIndex, 0,
        existing.lastLineIndex + 1, 0
    );
    workspaceEdit.delete(uri, range);

    return applyWorkspaceEdit(workspaceEdit, 'remove the window title');
};
