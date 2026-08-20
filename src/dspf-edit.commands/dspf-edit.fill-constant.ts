/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.fill-constant.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsConstant, fieldsPerRecords, SYSTEM_FIELD_PLACEHOLDER } from '../dspf-edit.model/dspf-edit.model';
import { updateExistingConstant } from './dspf-edit.edit-constant';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

interface FillInformation {
    fillCharacter: string;
    fillEnd: string;
    totalSize : number;
};

/**
 * A field/constant offered as an alignment target for a fill — either on the same row, positioned
 * right after the constant's own text ("alignColumn": the fill ends exactly where it begins), or on
 * a different row ("matchWidth": the fill matches its total character width, for lining up a whole
 * column of menu-style lines that don't share a row).
 */
interface FillTarget {
    name: string;
    kind: 'field' | 'constant';
    row: number;
    col: number;
    mode: 'alignColumn' | 'matchWidth';
    size: number;
};

interface FillTargetPickItem extends vscode.QuickPickItem {
    target?: FillTarget;
};

// To "fill" a string like "Customer", then you should write,
// fillCharacter = '.' and fillEnd = ':', ... and the size (i.e. 10), so the resulting constant will be
// "Customer :"
// If you select size 15, then:
// "Customer .....:"

// COMMAND REGISTRATION

/**
 * Registers the fill constant command for DDS constants.
 * Allows users to fill a constant with a character (and end it with a different character).
 * @param context - The VS Code extension context
 */
export function fillConstant(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.fill-constant", async (node: DdsNode) => {
            await handleFillConstantCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the fill constant command for DDS constants.
 * Allows users to fill a constant with a character (and end it with a different character).
 * @param node - The DDS node containing the field or constant
 */
async function handleFillConstantCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type
        if (node.ddsElement.kind !== 'constant') {
            vscode.window.showWarningMessage('Only constants can be filled.');
            return;
        };

        // Collect information to fill the constant
        const fillInformation : (FillInformation | undefined) = await collectFillInformationFromUser(node.ddsElement as DdsConstant);

        if (fillInformation === undefined) {
            vscode.window.showInformationMessage('No fill information added.');
            return;
        };

        // Fill the constant with the collected information
        if (!(await fillElement(editor, node.ddsElement, fillInformation))) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        vscode.window.showInformationMessage(
            `${node.ddsElement.name} filled.`
        );

    } catch (error) {
        console.error('Error filling constant:', error);
        vscode.window.showErrorMessage('An error occurred while filling constant.');
    };
};

// USER INTERACTION FUNCTIONS

async function collectFillInformationFromUser(constant: DdsConstant): Promise<FillInformation | undefined> {

    // Step 1: fill character(s)
    const fillChar = await vscode.window.showInputBox({
        title: `Fill Constant with Characters`,
        prompt: `Enter character(s) to repeat after the constant (e.g., '.', '. ', ...)`,
        placeHolder: '.',
        validateInput: (value: string) => {
            if (!value.trim()) return 'Please enter at least one character';
            return undefined;
        }
    });
    if (!fillChar) return undefined;

    // Step 2: final character.
    const endChar = await vscode.window.showInputBox({
        title: `Final Character`,
        prompt: `Enter final character (e.g., ':', '-', ...)`,
        placeHolder: ':',
        validateInput: (value: string) => {
            if (!value.trim()) return 'Please enter a final character';
            if (value.length > 1) return 'Only one character is allowed here';
            return undefined;
        }
    });
    if (!endChar) return undefined;

    // Step 3: total size of the final constant — typed directly, or aligned to another field/
    // constant already on the same row, so the fill ends exactly where that one begins.
    const trimmedConstant = constant.name.slice(1, -1);
    const totalSize = await collectTotalSize(constant, trimmedConstant);
    if (totalSize === undefined) return undefined;

    return {
        fillCharacter: fillChar,
        fillEnd: endChar,
        totalSize
      };

};

/**
 * Finds every other field/constant that can serve as an alignment target for the fill: on the same
 * row, positioned after where its own text already ends ("alignColumn" — the fill ends exactly
 * where it begins, e.g. a label immediately before an input field); or on a different row
 * ("matchWidth" — the fill matches its total width instead, e.g. lining up a column of menu options
 * that each sit on their own row). A bare system-keyword constant (DATE, USER...) is never offered:
 * its stored name isn't its real display text, so neither its column nor its width means anything
 * useful here. Likewise a referenced field, whose length lives outside this source.
 * @param constant - The constant being filled
 * @param trimmedLength - Its own text length (without the surrounding quotes)
 */
function collectFillTargets(constant: DdsConstant, trimmedLength: number): FillTarget[] {
    const record = fieldsPerRecords.find(r => r.record === constant.recordname);
    if (!record) return [];

    const ownTextEndCol = constant.column + trimmedLength;
    const sameRow: FillTarget[] = [];
    const otherRows: FillTarget[] = [];

    for (const f of record.fields ?? []) {
        if (f.lineIndex === constant.lineIndex || f.referenced) continue;
        if (f.row === constant.row) {
            if (f.col > ownTextEndCol) {
                sameRow.push({ name: f.name, kind: 'field', row: f.row, col: f.col, mode: 'alignColumn', size: f.col - constant.column });
            };
        } else if (f.length > trimmedLength) {
            otherRows.push({ name: f.name, kind: 'field', row: f.row, col: f.col, mode: 'matchWidth', size: f.length });
        };
    };

    for (const c of record.constants ?? []) {
        if (c.lineIndex === constant.lineIndex || SYSTEM_FIELD_PLACEHOLDER[c.name.trim().toUpperCase()]) continue;
        if (c.row === constant.row) {
            if (c.col > ownTextEndCol) {
                sameRow.push({ name: c.name, kind: 'constant', row: c.row, col: c.col, mode: 'alignColumn', size: c.col - constant.column });
            };
        } else if (c.name.length > trimmedLength) {
            otherRows.push({ name: c.name, kind: 'constant', row: c.row, col: c.col, mode: 'matchWidth', size: c.name.length });
        };
    };

    sameRow.sort((a, b) => a.col - b.col);
    otherRows.sort((a, b) => a.row - b.row || a.col - b.col);

    return [...sameRow, ...otherRows];
};

/**
 * Collects the fill's total size: offers every field/constant that can serve as an alignment
 * target as a pick — same-row ones first — falling back to typing a number directly (the original
 * flow) when there's nothing to align to, or when the user picks that option explicitly.
 * @param constant - The constant being filled
 * @param trimmedConstant - Its own text (without the surrounding quotes)
 */
async function collectTotalSize(constant: DdsConstant, trimmedConstant: string): Promise<number | undefined> {
    const targets = collectFillTargets(constant, trimmedConstant.length);

    if (targets.length > 0) {
        const manualItem: FillTargetPickItem = { label: '$(edit) Enter a size manually…' };
        const picked = await vscode.window.showQuickPick<FillTargetPickItem>(
            [
                manualItem,
                ...targets.map((t): FillTargetPickItem => ({
                    label: `$(${t.kind === 'field' ? 'symbol-field' : 'symbol-string'}) ${t.name}`,
                    description: t.mode === 'alignColumn' ? `${t.kind}, column ${t.col}` : `${t.kind}, row ${t.row}`,
                    detail: t.mode === 'alignColumn'
                        ? `Fill up to column ${t.col} — total size ${t.size}`
                        : `Match its width — total size ${t.size}`,
                    target: t
                }))
            ],
            {
                title: 'Total Size of the Final Constant',
                placeHolder: 'Align the fill to another field/constant, or enter a size manually'
            }
        );
        if (!picked) return undefined;
        if (picked.target) {
            return picked.target.size;
        };
        // Fell through: the user picked "Enter a size manually" — continue below.
    };

    const totalSizeStr = await vscode.window.showInputBox({
        title: `Total Size of the Final Constant`,
        prompt: `Enter total size (must be greater than constant length = ${trimmedConstant.length})`,
        placeHolder: (trimmedConstant.length + 1).toString(),
        validateInput: (value: string) => {
            const num = parseInt(value.trim(), 10);
            if (isNaN(num)) return 'Please enter a valid number';
            if (num <= trimmedConstant.length) {
                return `Total size must be greater than ${trimmedConstant.length}`;
            };
            return undefined;
        }
    });
    if (!totalSizeStr) return undefined;

    return parseInt(totalSizeStr, 10);
};

// DDS MODIFICATION FUNCTIONS

/**
 * Fill constant by adding the fill information to the constant.
 * @param editor - The active text editor
 * @param constant - The constant to fill
 * @param fillInformation - Fill information
 */
async function fillElement(
    editor: vscode.TextEditor,
    constant: DdsConstant,
    fillInformation: FillInformation
): Promise<boolean> {
    const replacementPoint = constant.lineIndex;
    const constantToFill = constant.name.slice(1, -1);

    if (replacementPoint <= 0 || replacementPoint > editor.document.lineCount) {
        throw new Error('Could not find position of the constant.');
    };

    // Fill the constant.
    const filledConstant = fillConstantWithInfo(constantToFill, fillInformation);

    // Apply the constant update
    return updateExistingConstant(editor, constant, filledConstant);
};

// HELPER FUNCTIONS

function fillConstantWithInfo(constant: string, info: FillInformation): string {
    const { fillCharacter, fillEnd, totalSize } = info;

    // Available space for filling = totalSize - (constant length + final length)
    const availableSpace = totalSize - ((constant.length + 1) + fillEnd.length);
    if (availableSpace <= 0) {
        // If no space available, returns constant plus end
        return constant + fillEnd;
    };

    // Repeat until fill space
    let repeated = "";
    while (repeated.length < availableSpace) {
        repeated += fillCharacter;
    };

    // Cut at the exact length
    repeated = repeated.substring(0, availableSpace);

    return constant + ' ' + repeated + fillEnd;
};
