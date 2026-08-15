/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.move-record.ts
*/

import * as vscode from 'vscode';
import { checkForEditorAndDocument, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';

// TYPES

/**
 * Boundaries of a record's block of lines (definition line through its last field/constant/
 * attribute line), matching the convention used by dspf-edit.delete-record.ts.
 */
interface RecordBoundaries {
    startLine: number;
    endLine: number;
    isLastRecord: boolean;
};

// BOUNDARY DETECTION

/**
 * Determines if a line represents the start of a new DDS record.
 * @param line - The line text to check
 */
function isRecordDefinitionLine(line: string): boolean {
    // DDS record format: positions 1-5 are spaces, position 6 is 'A', position 17 is 'R'
    return line.startsWith("     A") && line.length > 16 && line.charAt(16) === "R";
};

/**
 * Finds the start and end (inclusive) boundaries of the record beginning at `startLine`, by
 * scanning forward for the next record definition line or the end of the file.
 * @param document - The DDS source document
 * @param startLine - Line index of the record's own definition line
 */
function findRecordBoundaries(document: vscode.TextDocument, startLine: number): RecordBoundaries {
    let endLine = startLine;
    let isLastRecord = true;

    for (let i = startLine + 1; i < document.lineCount; i++) {
        if (isRecordDefinitionLine(document.lineAt(i).text)) {
            endLine = i - 1;
            isLastRecord = false;
            break;
        };
        endLine = i;
    };

    return { startLine, endLine, isLastRecord };
};

/**
 * Extracts a record's name from its definition line — columns 19-28 (1-indexed), the same ones
 * copy-record.ts's replaceRecordNameInLine writes to.
 * @param line - The record definition line's raw text
 */
function getRecordNameFromDefinitionLine(line: string): string {
    return line.substring(18, 28).trim();
};

// SFL/SFLCTL ORDER VALIDATION

/**
 * DDS requires an SFL (subfile) record to be defined before the SFLCTL (subfile control) record
 * that references it via SFLCTL(name) — order matters, though adjacency doesn't, so this only
 * checks the dragged record's own SFL/SFLCTL relationship. A record merely moving to somewhere
 * between an already-correctly-ordered pair is unaffected.
 * @param sourceName - Name of the record being moved
 * @param targetLine - Where it's being moved to (line index to insert before, or 'end')
 * @returns A message to show the user if the move would break that ordering, else undefined
 */
function validateSflOrder(sourceName: string, targetLine: number | 'end'): string | undefined {
    const upperSourceName = sourceName.toUpperCase();
    const recordInfo = fieldsPerRecords.find(r => r.record.toUpperCase() === upperSourceName);
    const attributes = recordInfo?.attributes ?? [];

    // Moving an SFLCTL record: it must stay after the SFL record it references.
    const sflCtlAttr = attributes.find(a => a.value.toUpperCase().startsWith('SFLCTL('));
    if (sflCtlAttr) {
        const referencedName = sflCtlAttr.value.match(/SFLCTL\(([A-Za-z0-9@#$]+)\)/i)?.[1]?.toUpperCase();
        const referenced = referencedName ? fieldsPerRecords.find(r => r.record.toUpperCase() === referencedName) : undefined;

        if (referenced && (targetLine === 'end' ? false : targetLine <= referenced.startIndex)) {
            return `Cannot move '${sourceName}' there: its subfile record '${referenced.record}' must stay defined before it.`;
        };
    };

    // Moving an SFL record: it must stay before the SFLCTL record that references it.
    const isSfl = attributes.some(a => a.value.toUpperCase() === 'SFL');
    if (isSfl) {
        const controller = fieldsPerRecords.find(r =>
            (r.attributes ?? []).some(a => a.value.toUpperCase() === `SFLCTL(${upperSourceName})`)
        );

        if (controller && (targetLine === 'end' || targetLine > controller.startIndex)) {
            return `Cannot move '${sourceName}' there: it's a subfile record that must stay defined before '${controller.record}'.`;
        };
    };

    return undefined;
};

// MOVE EXECUTION

/**
 * Moves a whole record (its definition line plus every field/constant/attribute line up to the
 * next record or EOF) to just before `targetLine`, or to the end of the file when `targetLine` is
 * 'end'. Used by the tree view's drag-and-drop reordering of records — see DdsTreeProvider's
 * handleDrag/handleDrop in dspf-edit.providers.ts.
 * @param sourceStartLine - Line index of the record definition being moved
 * @param targetLine - Line index of the record to move it before, or 'end' to move it after the
 * last record in the file
 * @returns Whether the move was applied (false on a no-op drop or a failed edit)
 */
export async function moveRecordInSource(sourceStartLine: number, targetLine: number | 'end'): Promise<boolean> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!editor || !document) {
            return false;
        };

        const source = findRecordBoundaries(document, sourceStartLine);

        // Dropped onto itself (or into its own body) — nothing to do.
        if (targetLine !== 'end' && targetLine >= source.startLine && targetLine <= source.endLine) {
            return false;
        };
        // Already the last record — "move to end" would be a no-op.
        if (targetLine === 'end' && source.isLastRecord) {
            return false;
        };

        const sourceName = getRecordNameFromDefinitionLine(document.lineAt(source.startLine).text);
        const sflOrderError = validateSflOrder(sourceName, targetLine);
        if (sflOrderError) {
            vscode.window.showWarningMessage(sflOrderError);
            return false;
        };

        const recordLines: string[] = [];
        for (let i = source.startLine; i <= source.endLine; i++) {
            recordLines.push(document.lineAt(i).text);
        };

        const workspaceEdit = new vscode.WorkspaceEdit();
        const uri = document.uri;

        // Deletion side: same "is this the last record in the file" handling as
        // delete-record.ts's calculateDeletionOffsets, so removing the source doesn't leave a
        // dangling blank line (or eat the newline before it) when it was the last record.
        let deleteStart: vscode.Position;
        let deleteEnd: vscode.Position;
        if (source.isLastRecord) {
            deleteStart = source.startLine === 0
                ? new vscode.Position(0, 0)
                : document.lineAt(source.startLine - 1).range.end;
            deleteEnd = document.positionAt(document.getText().length);
        } else {
            deleteStart = new vscode.Position(source.startLine, 0);
            deleteEnd = document.lineAt(source.endLine).rangeIncludingLineBreak.end;
        };
        workspaceEdit.delete(uri, new vscode.Range(deleteStart, deleteEnd));

        // Insertion side: both this and the deletion above are computed against the same
        // pre-edit document and applied together in one WorkspaceEdit, so VS Code resolves the
        // move correctly regardless of whether the target comes before or after the source.
        if (targetLine === 'end') {
            // Same convention as copy-record.ts's insertCopiedRecord: a leading newline (not a
            // trailing one) since we're appending after content that itself has no trailing EOL.
            const insertPos = new vscode.Position(document.lineCount, 0);
            workspaceEdit.insert(uri, insertPos, '\n' + recordLines.join('\n'));
        } else {
            const insertPos = new vscode.Position(targetLine, 0);
            workspaceEdit.insert(uri, insertPos, recordLines.join('\n') + '\n');
        };

        return await applyWorkspaceEdit(workspaceEdit, 'move the record');

    } catch (error) {
        console.error('Error moving record:', error);
        vscode.window.showErrorMessage('An error occurred while moving the record.');
        return false;
    };
};
