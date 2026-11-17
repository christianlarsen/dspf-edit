/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.subfile-columns.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument,
    findElementInsertionPoint,
    insertKeywordLines,
    replaceKeywordTextInLines
} from '../dspf-edit.utils/dspf-edit.helper';
import { removeWholeKeyword } from './dspf-edit.conditioned-keywords';

/**
 * SFLLIN(spaces), a record-level keyword of the subfile control record: the subfile is shown in
 * several columns of records (a horizontal subfile), `spaces` positions apart, attribute bytes
 * included. Records fill each column top to bottom before the next one (REC1 REC3 / REC2 REC4).
 * Per the DDS reference: option indicators aren't valid on it (display size condition names are,
 * one SFLLIN per size), and it isn't valid on a message subfile, with SFLCSRPRG, or when the
 * subfile record uses field selection.
 */

// INTERFACES AND TYPES

interface MenuItem extends vscode.QuickPickItem {
    action: 'change' | 'remove';
    attr?: DdsAttribute;
};

// COMMAND REGISTRATION

/**
 * Registers the "Subfile Columns" command for subfile control (SFLCTL) records.
 * @param context - The VS Code extension context
 */
export function subfileColumns(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.subfile-columns", async (node: DdsNode) => {
            await handleSubfileColumnsCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the "Subfile Columns" command: adds SFLLIN, changes its spacing, or removes it.
 * @param node - The DDS node the command was invoked from
 */
async function handleSubfileColumnsCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const record = node.ddsElement;
        const sflctlAttr = record.kind === 'record'
            ? record.attributes?.find(attr => /^SFLCTL\(/i.test(attr.value))
            : undefined;
        if (record.kind !== 'record' || !sflctlAttr) {
            vscode.window.showWarningMessage('Subfile columns can only be set on a subfile control (SFLCTL) record.');
            return;
        };

        const existing = (record.attributes ?? []).filter(attr => /^SFLLIN\(/i.test(attr.value));

        if (existing.length === 0) {
            const reason = whyNotAllowed(sflctlAttr.value, record.attributes);
            if (reason) {
                vscode.window.showWarningMessage(`Subfile columns can't be set on record ${record.name}: ${reason}`);
                return;
            };
            const spaces = await askSpaces(undefined);
            if (spaces === undefined) {
                return;
            };
            if (!(await insertKeywordLines(editor, findElementInsertionPoint(editor, record), `SFLLIN(${String(spaces).padStart(4, '0')})`))) {
                return;
            };
            await nudgeCursor();
            vscode.window.showInformationMessage(`Record ${record.name} now shows its subfile in columns, ${spaces} spaces apart.`);
            return;
        };

        const items: MenuItem[] = [
            ...existing.map(attr => ({
                action: 'change' as const,
                attr,
                label: '$(edit) Change spaces between columns...',
                description: `${spacesOf(attr) ?? '?'}${attr.displayFormat ? ` (${attr.displayFormat})` : ''}`
            })),
            { action: 'remove', label: '$(trash) Remove', description: 'Show the subfile in a single column' }
        ];
        const choice = await vscode.window.showQuickPick(items, {
            title: `Subfile Columns for ${record.name}`,
            placeHolder: 'The subfile is shown in several columns of records',
            ignoreFocusOut: true
        });
        if (!choice) {
            return;
        };

        if (choice.action === 'remove') {
            // Bottom-up, so earlier line numbers stay valid while removing.
            for (const attr of [...existing].sort((a, b) => b.lineIndex - a.lineIndex)) {
                const lastLineIndex = attr.lastLineIndex ?? attr.lineIndex;
                if (!(await removeWholeKeyword(editor, record, { keywordText: attr.value, lineIndex: attr.lineIndex, lastLineIndex }))) {
                    return;
                };
            };
            await nudgeCursor();
            vscode.window.showInformationMessage(`Record ${record.name} shows its subfile in a single column again.`);
            return;
        };

        const attr = choice.attr!;
        const spaces = await askSpaces(spacesOf(attr));
        if (spaces === undefined) {
            return;
        };
        if (!(await replaceKeywordTextInLines(editor, attr.lineIndex, attr.lastLineIndex ?? attr.lineIndex, attr.value, `SFLLIN(${String(spaces).padStart(4, '0')})`))) {
            return;
        };
        await nudgeCursor();
        vscode.window.showInformationMessage(`Subfile columns of record ${record.name} are now ${spaces} spaces apart.`);
    } catch (error) {
        console.error('Error managing SFLLIN:', error);
        vscode.window.showErrorMessage('An error occurred while managing the subfile columns.');
    };
};

// CHECKS

/**
 * Why the subfile can't be shown in columns, if it can't: the DDS reference doesn't allow SFLLIN on
 * a message subfile (SFLMSGRCD on the subfile record, or SFLPGMQ on the control record) or when a
 * field of the subfile record has SFLCSRPRG.
 * @param sflctlValue - The control record's SFLCTL(record) keyword
 * @param controlAttributes - The control record's own keywords
 */
function whyNotAllowed(sflctlValue: string, controlAttributes: DdsAttribute[] | undefined): string | undefined {
    const sflName = sflctlValue.match(/^SFLCTL\(\s*([A-Za-z0-9@#$]+)\s*\)$/i)?.[1];
    const sflRecord = sflName ? fieldsPerRecords.find(r => r.record.toUpperCase() === sflName.toUpperCase()) : undefined;

    const isMessageSubfile = (sflRecord?.attributes ?? []).some(attr => /^SFLMSGRCD\(/i.test(attr.value))
        || (controlAttributes ?? []).some(attr => /^SFLPGMQ\b/i.test(attr.value));
    if (isMessageSubfile) {
        return 'it is a message subfile.';
    };

    const cursorField = sflRecord?.fields.find(field => field.attributes.some(attr => /^SFLCSRPRG$/i.test(attr.value.trim())));
    if (cursorField) {
        return `field ${cursorField.name} of record ${sflRecord!.record} moves the cursor to the next record (SFLCSRPRG).`;
    };

    return undefined;
};

// USER INTERACTION

function spacesOf(attr: DdsAttribute): number | undefined {
    const match = attr.value.match(/^SFLLIN\(\s*(\d+)\s*\)$/i);
    return match ? parseInt(match[1], 10) : undefined;
};

/**
 * Asks how many positions apart the columns are.
 * @param current - The current value, when changing it
 * @returns The number of spaces, or undefined if cancelled
 */
async function askSpaces(current: number | undefined): Promise<number | undefined> {
    const input = await vscode.window.showInputBox({
        title: 'Subfile Columns - Spaces between columns',
        prompt: 'Positions between one column of records and the next, counting the attribute bytes',
        value: String(current ?? 5),
        ignoreFocusOut: true,
        validateInput: value => /^\d{1,2}$/.test(value.trim()) ? null : 'Enter a number from 0 to 99'
    });
    return input === undefined ? undefined : parseInt(input.trim(), 10);
};

/** Nudges the cursor so the tree and preview pick up the edit, as every command here does. */
async function nudgeCursor(): Promise<void> {
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');
};
