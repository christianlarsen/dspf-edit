/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.overlay-sflend.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument,
    findElementInsertionPoint,
    formatIndicatorCondition,
    insertKeywordLines,
    replaceKeywordTextInLines
} from '../dspf-edit.utils/dspf-edit.helper';
import { KeywordValue, removeWholeKeyword, changeKeywordValueIndicators } from './dspf-edit.conditioned-keywords';
import { addConditionedKeywordLine } from './dspf-edit.add-indicators';

/**
 * Two record-level keywords conditioned by option indicators: OVERLAY (on any record but a subfile
 * record: the record is shown without erasing the screen first) and SFLEND (on a subfile control
 * record: the "+" sign, More.../Bottom text or scroll bar at the end of the subfile).
 */

// INTERFACES AND TYPES

/** One row of a keyword's menu. */
interface RecordKeywordMenuItem extends vscode.QuickPickItem {
    action: 'add' | 'addWithIndicators' | 'changeIndicators' | 'changeType' | 'remove';
};

interface SflEndTypeItem extends vscode.QuickPickItem {
    value: string;
};

// COMMAND REGISTRATION

/**
 * Registers the "Overlay" and "Subfile End" commands for records.
 * @param context - The VS Code extension context
 */
export function addOverlaySflEnd(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.overlay", async (node: DdsNode) => {
            await handleOverlayCommand(node);
        }),
        vscode.commands.registerCommand("dspf-edit.subfile-end", async (node: DdsNode) => {
            await handleSubfileEndCommand(node);
        })
    );
};

// COMMAND HANDLERS

/**
 * Handles the "Overlay" command: adds OVERLAY to a record (always, or under indicators), changes
 * its indicators, or removes it.
 * @param node - The DDS node the command was invoked from
 */
async function handleOverlayCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const record = node.ddsElement;
        if (record.kind !== 'record' || hasRecordKeyword(record.attributes, 'SFL')) {
            vscode.window.showWarningMessage('OVERLAY can only be set on a record that is not a subfile record (SFL).');
            return;
        };

        const attr = findRecordKeyword(record.attributes, 'OVERLAY');
        const items: RecordKeywordMenuItem[] = attr
            ? [
                { action: 'changeIndicators', label: '$(edit) Change indicators...' },
                { action: 'remove', label: '$(trash) Remove' }
            ]
            : [
                { action: 'add', label: '$(add) Add', description: 'Always' },
                { action: 'addWithIndicators', label: '$(edit) Add with indicators...' }
            ];

        const choice = await vscode.window.showQuickPick(items, {
            title: `Overlay for ${record.name}${attr ? ` — ${describeCondition(attr)}` : ''}`,
            placeHolder: attr
                ? 'The record is shown without erasing the screen first'
                : 'Show the record without erasing the screen first',
            ignoreFocusOut: true
        });
        if (!choice) {
            return;
        };

        const insertionPoint = findElementInsertionPoint(editor, record);
        switch (choice.action) {
            case 'add':
                if (!(await insertKeywordLines(editor, insertionPoint, 'OVERLAY'))) return;
                break;
            case 'addWithIndicators':
                if (!(await addConditionedKeywordLine(editor, insertionPoint, 'OVERLAY'))) return;
                break;
            case 'changeIndicators':
                await changeKeywordValueIndicators(editor, record, toKeywordValue(attr!));
                return;
            case 'remove':
                if (!(await removeWholeKeyword(editor, record, toKeywordValue(attr!)))) return;
                vscode.window.showInformationMessage(`OVERLAY removed from record ${record.name}.`);
                break;
        };
        await nudgeCursor();
    } catch (error) {
        console.error('Error managing OVERLAY:', error);
        vscode.window.showErrorMessage('An error occurred while managing OVERLAY.');
    };
};

/**
 * Handles the "Subfile End" command on a subfile control record: adds SFLEND, changes how it shows
 * (*PLUS, *MORE, *SCRBAR) or its indicators, or removes it. The DDS reference requires an option
 * indicator on SFLEND, so it is never added without one.
 * @param node - The DDS node the command was invoked from
 */
async function handleSubfileEndCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        const record = node.ddsElement;
        if (record.kind !== 'record' || !record.attributes?.some(attr => /^SFLCTL\(/i.test(attr.value))) {
            vscode.window.showWarningMessage('SFLEND can only be set on a subfile control (SFLCTL) record.');
            return;
        };

        const attr = findRecordKeyword(record.attributes, 'SFLEND');
        if (!attr) {
            const type = await pickSflEndType(undefined);
            if (!type) {
                return;
            };
            if (!(await addConditionedKeywordLine(editor, findElementInsertionPoint(editor, record), `SFLEND(${type})`))) {
                vscode.window.showWarningMessage('SFLEND was not added: it needs an indicator, which tells whether the last record of the subfile is shown.');
                return;
            };
            await nudgeCursor();
            vscode.window.showInformationMessage(`SFLEND(${type}) set on record ${record.name}.`);
            return;
        };

        const currentType = sflEndType(attr.value);
        const choice = await vscode.window.showQuickPick<RecordKeywordMenuItem>([
            { action: 'changeType', label: '$(symbol-enum) Change how it shows...', description: currentType },
            { action: 'changeIndicators', label: '$(edit) Change indicators...', description: describeCondition(attr) },
            { action: 'remove', label: '$(trash) Remove' }
        ], {
            title: `Subfile End for ${record.name} — ${attr.value}`,
            placeHolder: 'Select what to change',
            ignoreFocusOut: true
        });
        if (!choice) {
            return;
        };

        if (choice.action === 'changeIndicators') {
            await changeKeywordValueIndicators(editor, record, { ...toKeywordValue(attr), requiresCondition: true });
            return;
        };

        if (choice.action === 'remove') {
            if (!(await removeWholeKeyword(editor, record, toKeywordValue(attr)))) return;
            await nudgeCursor();
            vscode.window.showInformationMessage(`SFLEND removed from record ${record.name}.`);
            return;
        };

        const type = await pickSflEndType(currentType);
        if (!type || type === currentType) {
            return;
        };
        if (!(await replaceKeywordTextInLines(editor, attr.lineIndex, attr.lastLineIndex ?? attr.lineIndex, attr.value, `SFLEND(${type})`))) {
            return;
        };
        await nudgeCursor();
        vscode.window.showInformationMessage(`SFLEND(${type}) set on record ${record.name}.`);
    } catch (error) {
        console.error('Error managing SFLEND:', error);
        vscode.window.showErrorMessage('An error occurred while managing SFLEND.');
    };
};

// SFLEND TYPE

/**
 * What SFLEND shows, its parameters as written, e.g. '*MORE' or '*SCRBAR *PLUS'. With none, the
 * DDS reference says *PLUS is used.
 */
function sflEndType(keywordText: string): string {
    const match = keywordText.match(/^SFLEND\(\s*([^)]*?)\s*\)$/i);
    return match && match[1] ? match[1].toUpperCase().replace(/\s+/g, ' ') : '*PLUS';
};

/**
 * Asks how SFLEND shows: *PLUS, *MORE or *SCRBAR, and for *SCRBAR what displays without graphics
 * show instead (*SCRBAR, the default, written as *SCRBAR alone).
 * @param currentType - The current type, to mark it, or undefined when adding
 * @returns The parameters to write, or undefined if cancelled
 */
async function pickSflEndType(currentType: string | undefined): Promise<string | undefined> {
    const current = (value: string) => currentType === value ? ' (current)' : '';
    const currentFirst = currentType?.split(' ')[0];

    const firstItems: SflEndTypeItem[] = [
        { value: '*PLUS', label: '*PLUS', description: `A plus sign (+) at the bottom right while there are more records${current('*PLUS')}` },
        { value: '*MORE', label: '*MORE', description: `"More..." or "Bottom" below the subfile, which takes one more line${current('*MORE')}` },
        { value: '*SCRBAR', label: '*SCRBAR', description: `A scroll bar on the last 3 columns of the subfile${currentFirst === '*SCRBAR' ? ' (current)' : ''}` }
    ];
    const first = await vscode.window.showQuickPick(firstItems, {
        title: 'Subfile End - How it shows',
        placeHolder: 'Select what tells that there are more records',
        ignoreFocusOut: true
    });
    if (!first || first.value !== '*SCRBAR') {
        return first?.value;
    };

    const second = await vscode.window.showQuickPick<SflEndTypeItem>([
        { value: '*SCRBAR', label: '*SCRBAR', description: `The scroll bar too (default)${current('*SCRBAR')}${current('*SCRBAR *SCRBAR')}` },
        { value: '*SCRBAR *PLUS', label: '*PLUS', description: `A plus sign (+)${current('*SCRBAR *PLUS')}` },
        { value: '*SCRBAR *MORE', label: '*MORE', description: `"More..." or "Bottom"${current('*SCRBAR *MORE')}` }
    ], {
        title: 'Subfile End - On displays without graphics',
        placeHolder: 'Select what displays that cannot show a scroll bar show instead',
        ignoreFocusOut: true
    });
    return second?.value;
};

// SMALL HELPERS

/** The record's own keyword with this name (e.g. 'OVERLAY', or 'SFLEND' for 'SFLEND(*MORE)'), if coded. */
function findRecordKeyword(attributes: DdsAttribute[] | undefined, name: string): DdsAttribute | undefined {
    return (attributes ?? []).find(attr => new RegExp(`^${name}(\\(|$)`, 'i').test(attr.value.trim()));
};

function hasRecordKeyword(attributes: DdsAttribute[] | undefined, name: string): boolean {
    return findRecordKeyword(attributes, name) !== undefined;
};

/** A record keyword, as the shared indicator edits take it: always whole, never split into values. */
function toKeywordValue(attr: DdsAttribute): KeywordValue {
    return {
        code: attr.value,
        keywordText: attr.value,
        lineIndex: attr.lineIndex,
        lastLineIndex: attr.lastLineIndex ?? attr.lineIndex,
        conditionText: formatIndicatorCondition(attr.indicators),
        wholeKeyword: true
    };
};

function describeCondition(attr: DdsAttribute): string {
    const condition = formatIndicatorCondition(attr.indicators);
    return condition ? `When ${condition}` : 'Always';
};

/** Nudges the cursor so the tree and preview pick up the edit, as every command here does. */
async function nudgeCursor(): Promise<void> {
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');
};
