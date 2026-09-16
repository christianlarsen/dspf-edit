/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.add-chginpdft.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute, attributesFileLevel, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument,
    findElementInsertionPointRecordFirstLine,
    findElementInsertionPointFileFirstLine,
    applyWorkspaceEdit
} from '../dspf-edit.utils/dspf-edit.helper';

// COMMAND REGISTRATION

/**
 * Registers the "Change Input Default (CHGINPDFT)" command for DDS records and at file level.
 * Only manages the parameterless form (`CHGINPDFT` with no parameters), which removes the
 * automatic underline input-capable fields otherwise get by default — see
 * RecordPreviewPanel.isDefaultUnderlineSuppressed, the preview's own reading of this same keyword.
 * The parameterized form (CHGINPDFT(CS), CHGINPDFT(UL CS), ...) isn't offered here yet.
 * @param context - The VS Code extension context
 */
export function addChginpdft(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-chginpdft", async (node: DdsNode) => {
            await handleAddChginpdftCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the "Change Input Default (CHGINPDFT)" command for a DDS record or the file itself.
 * @param node - The DDS node the command was invoked from
 */
async function handleAddChginpdftCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        if (node.ddsElement.kind !== 'record' && node.ddsElement.kind !== 'file') {
            vscode.window.showWarningMessage('CHGINPDFT can only be set on a record or at file level.');
            return;
        };

        const recordElement = node.ddsElement.kind === 'record' ? node.ddsElement : undefined;
        const scopeLabel = recordElement ? `record ${recordElement.name}` : 'the whole file';
        const attributes = recordElement
            ? fieldsPerRecords.find(r => r.record === recordElement.name)?.attributes
            : attributesFileLevel;

        // At record scope, the file level might already carry its own CHGINPDFT (bare or with
        // parameters) — that cascades down to every record unless overridden here (per the DDS
        // reference: the lower level always wins), so it's worth flagging before offering to add or
        // remove one on just this record.
        if (recordElement) {
            const fileLevelExisting = attributesFileLevel.find(attr => /^CHGINPDFT(\(|$)/i.test(attr.value.trim()));
            if (fileLevelExisting) {
                vscode.window.showWarningMessage(
                    `The file already has ${fileLevelExisting.value.trim()} at file level, which applies to every record — including this one — unless overridden here.`
                );
            };
        };

        const existing = (attributes ?? []).find(attr => /^CHGINPDFT(\(|$)/i.test(attr.value.trim()));
        const isBare = existing?.value.trim().toUpperCase() === 'CHGINPDFT';

        if (existing && !isBare) {
            vscode.window.showWarningMessage(
                `${scopeLabel} already has ${existing.value.trim()} — this command only manages the parameterless CHGINPDFT (remove default underline). Edit it directly in the source to change it.`
            );
            return;
        };

        if (existing) {
            const action = await vscode.window.showQuickPick(
                [
                    { label: '$(trash) Remove CHGINPDFT', action: 'remove' as const },
                    { label: 'Cancel', action: 'cancel' as const }
                ],
                {
                    title: `CHGINPDFT is set on ${scopeLabel}`,
                    placeHolder: 'Input-capable fields here are no longer underlined by default'
                }
            );
            if (!action || action.action === 'cancel') {
                return;
            };

            if (!(await removeChginpdftLine(editor, existing))) {
                return;
            };
            vscode.window.showInformationMessage(`CHGINPDFT removed from ${scopeLabel}.`);
            return;
        };

        const action = await vscode.window.showQuickPick(
            [
                { label: '$(add) Add CHGINPDFT', action: 'add' as const },
                { label: 'Cancel', action: 'cancel' as const }
            ],
            {
                title: `Set CHGINPDFT on ${scopeLabel}?`,
                placeHolder: 'Removes the default underline from input-capable fields here (a field with its own DSPATR(UL) is unaffected)'
            }
        );
        if (!action || action.action === 'cancel') {
            return;
        };

        const insertionPoint = recordElement
            ? findElementInsertionPointRecordFirstLine(editor, { lineIndex: recordElement.lineIndex })
            : findElementInsertionPointFileFirstLine(editor);
        if (insertionPoint === -1) {
            vscode.window.showErrorMessage('Could not find insertion point for CHGINPDFT.');
            return;
        };

        if (!(await writeChginpdftLine(editor, insertionPoint))) {
            return;
        };
        vscode.window.showInformationMessage(`CHGINPDFT set on ${scopeLabel}.`);
    } catch (error) {
        console.error('Error managing CHGINPDFT:', error);
        vscode.window.showErrorMessage('An error occurred while managing CHGINPDFT.');
    };
};

// DDS MODIFICATION FUNCTIONS

/**
 * Builds a bare "CHGINPDFT" keyword line, same column layout (keyword starting at column 45) as
 * every other file/record-level keyword line written by this extension (see e.g.
 * dspf-edit.sfldrop-sflfold.ts's createSflToggleLine). Indicators are never valid on CHGINPDFT, so
 * unlike most keyword lines this one never reserves columns 7-16 for them.
 */
function createChginpdftLine(): string {
    let line = '     A';
    while (line.length < 44) {
        line += ' ';
    };
    line += 'CHGINPDFT';
    return line;
};

/**
 * Inserts a new bare CHGINPDFT line at the given position.
 * @param editor - The active text editor
 * @param insertionPoint - Line index to insert the new keyword line at
 */
async function writeChginpdftLine(editor: vscode.TextEditor, insertionPoint: number): Promise<boolean> {
    const document = editor.document;
    const newLine = createChginpdftLine();
    const workspaceEdit = new vscode.WorkspaceEdit();

    const insertPos = new vscode.Position(insertionPoint, 0);
    if (insertPos.line >= document.lineCount) {
        workspaceEdit.insert(document.uri, insertPos, '\n' + newLine);
    } else {
        workspaceEdit.insert(document.uri, insertPos, newLine + '\n');
    };

    return applyWorkspaceEdit(workspaceEdit, 'set CHGINPDFT');
};

/**
 * Removes an existing bare CHGINPDFT keyword line entirely.
 * @param editor - The active text editor
 * @param existing - The CHGINPDFT attribute to remove
 */
async function removeChginpdftLine(editor: vscode.TextEditor, existing: DdsAttribute): Promise<boolean> {
    const document = editor.document;
    const lastLine = existing.lastLineIndex ?? existing.lineIndex;
    const workspaceEdit = new vscode.WorkspaceEdit();

    if (lastLine === document.lineCount - 1) {
        if (existing.lineIndex === 0) {
            workspaceEdit.delete(document.uri, new vscode.Range(0, 0, document.lineCount, 0));
        } else {
            const prevLineEnd = document.lineAt(existing.lineIndex - 1).range.end;
            workspaceEdit.delete(document.uri, new vscode.Range(prevLineEnd, document.positionAt(document.getText().length)));
        };
    } else {
        workspaceEdit.delete(document.uri, new vscode.Range(existing.lineIndex, 0, lastLine + 1, 0));
    };

    return applyWorkspaceEdit(workspaceEdit, 'remove CHGINPDFT');
};
