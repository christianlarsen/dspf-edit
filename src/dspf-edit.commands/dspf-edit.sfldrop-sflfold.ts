/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.sfldrop-sflfold.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsAttribute, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument,
    findElementInsertionPointRecordFirstLine,
    formatDdsIndicators,
    applyWorkspaceEdit
} from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

type ToggleType = 'SFLDROP' | 'SFLFOLD';

/** Current state of one of the two keywords, as found on the SFLCTL record's own attributes. */
interface SflToggleState {
    toggleType: ToggleType;
    attr?: DdsAttribute;
    commandKeyType?: 'CA' | 'CF';
    commandKeyNumber?: string;
};

/** One row of the SFLDROP/SFLFOLD summary menu. */
interface SflToggleMenuItem extends vscode.QuickPickItem {
    toggleType: ToggleType;
};

// COMMAND REGISTRATION

/**
 * Registers the "Subfile Drop/Fold" command for subfile control (SFLCTL) records. Shows a summary
 * menu listing SFLDROP and SFLFOLD with their current value, letting the user jump straight to
 * setting/changing whichever one they want, or remove one directly via its own trash button — same
 * pattern as "Editing Keywords" (dspf-edit.add-editing-keywords.ts).
 * @param context - The VS Code extension context
 */
export function addSflDropSflFold(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-sfldrop-sflfold", async (node: DdsNode) => {
            await handleAddSflDropSflFoldCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the "Subfile Drop/Fold" command for a subfile control (SFLCTL) record.
 * @param node - The DDS node the command was invoked from
 */
async function handleAddSflDropSflFoldCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        if (node.ddsElement.kind !== 'record') {
            vscode.window.showWarningMessage('SFLDROP/SFLFOLD can only be set on a subfile control (SFLCTL) record.');
            return;
        };
        const recordName = node.ddsElement.name;
        const recordLineIndex = node.ddsElement.lineIndex;

        const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
        const isSflCtl = recordInfo?.attributes?.some(attr => attr.value.toUpperCase().startsWith('SFLCTL(')) ?? false;
        if (!isSflCtl) {
            vscode.window.showWarningMessage('SFLDROP/SFLFOLD can only be set on a subfile control (SFLCTL) record.');
            return;
        };

        const states = getCurrentToggles(recordInfo?.attributes);

        const choice = await showToggleMenu(buildToggleMenuItems(states), recordName);
        if (!choice) {
            return;
        };
        const state = states.find(s => s.toggleType === choice.toggleType)!;

        if (choice.action === 'remove') {
            if (!(await removeToggle(editor, state))) {
                return;
            };
            vscode.window.showInformationMessage(`${state.toggleType} removed from record ${recordName}.`);
            return;
        };

        const commandType = await selectCommandType();
        if (!commandType) {
            return;
        };

        const keyNumber = await selectKeyNumber(commandType, state.toggleType);
        if (!keyNumber) {
            return;
        };

        const indicators = await collectIndicators(commandType, keyNumber);

        if (!(await writeToggle(editor, state, recordLineIndex, commandType, keyNumber, indicators))) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        vscode.window.showInformationMessage(`${state.toggleType}(${commandType}${keyNumber}) set on record ${recordName}.`);
    } catch (error) {
        console.error('Error managing SFLDROP/SFLFOLD:', error);
        vscode.window.showErrorMessage('An error occurred while managing SFLDROP/SFLFOLD.');
    };
};

// SUMMARY MENU

/** Formats a toggle's current value exactly as it reads in DDS source, e.g. "CF10 [ 41]", or "(not set)". */
function formatToggleValue(state: SflToggleState): string {
    if (!state.commandKeyType || !state.commandKeyNumber) {
        return '(not set)';
    };
    const indicators = formatDdsIndicators(state.attr?.indicators);
    return `${state.commandKeyType}${state.commandKeyNumber}${indicators ? ' ' + indicators : ''}`;
};

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Set/change' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Builds the "Subfile Drop/Fold" summary menu's 2 rows (SFLDROP, SFLFOLD), each showing its
 * currently assigned command key (and any conditioning indicator) or "(not set)", with an edit
 * button (always) and a trash button (only when something's actually assigned).
 * @param states - The record's current SFLDROP/SFLFOLD state, from getCurrentToggles
 */
function buildToggleMenuItems(states: SflToggleState[]): SflToggleMenuItem[] {
    const labels: Record<ToggleType, string> = {
        SFLDROP: 'SFLDROP — Truncate subfile',
        SFLFOLD: 'SFLFOLD — Fold subfile'
    };

    return states.map(state => ({
        toggleType: state.toggleType,
        label: labels[state.toggleType],
        description: formatToggleValue(state),
        buttons: state.commandKeyType ? [EDIT_BUTTON, REMOVE_BUTTON] : [EDIT_BUTTON]
    }));
};

/**
 * Shows the SFLDROP/SFLFOLD summary menu and resolves to what the user did: picked a row (or its
 * edit button) to set/change (`action: 'select'`), or clicked a row's trash button to remove it
 * (`action: 'remove'`) — undefined if dismissed. Needs the raw `createQuickPick` API rather than the
 * simpler `showQuickPick` helper, since only it exposes per-item buttons (`onDidTriggerItemButton`).
 * @param items - The menu's rows, from `buildToggleMenuItems`
 * @param recordName - The SFLCTL record's name, for the menu's title
 */
function showToggleMenu(items: SflToggleMenuItem[], recordName: string): Promise<{ action: 'select' | 'remove'; toggleType: ToggleType } | undefined> {
    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<SflToggleMenuItem>();
        quickPick.items = items;
        quickPick.title = `Subfile Drop/Fold for ${recordName}`;
        quickPick.placeholder = 'Select a keyword to set/change, or use its buttons';
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: { action: 'select' | 'remove'; toggleType: ToggleType } | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'select', toggleType: event.item.toggleType });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            finish(picked ? { action: 'select', toggleType: picked.toggleType } : undefined);
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

// STATE EXTRACTION

/**
 * Finds the SFLCTL record's own SFLDROP()/SFLFOLD() keywords, if coded, parsing out the command key
 * each is assigned to.
 * @param attributes - The record's own attributes to scan
 */
function getCurrentToggles(attributes: DdsAttribute[] | undefined): SflToggleState[] {
    return (['SFLDROP', 'SFLFOLD'] as ToggleType[]).map(toggleType => {
        const attr = (attributes ?? []).find(a => new RegExp(`^${toggleType}\\(`, 'i').test(a.value));
        const match = attr?.value.match(/^SFL(?:DROP|FOLD)\(\s*(CA|CF)(\d{2})\s*\)$/i);
        if (!attr || !match) {
            return { toggleType };
        };
        return {
            toggleType,
            attr,
            commandKeyType: match[1].toUpperCase() as 'CA' | 'CF',
            commandKeyNumber: match[2]
        };
    });
};

// USER INTERACTION FUNCTIONS

/**
 * Allows the user to select between CA (attention) and CF (function) command types.
 * @returns Selected command type or null if cancelled
 */
async function selectCommandType(): Promise<'CA' | 'CF' | null> {
    const commandTypes = [
        {
            label: 'CA',
            description: 'Command Attention',
            detail: 'Attention key - typically used for cancellation or exit functions'
        },
        {
            label: 'CF',
            description: 'Command Function',
            detail: 'Function key - typically used for processing or action functions'
        }
    ];

    const selection = await vscode.window.showQuickPick(commandTypes, {
        title: 'Select Command Type',
        placeHolder: 'Choose between CA (attention) or CF (function) key'
    });

    return (selection?.label as 'CA' | 'CF') || null;
};

/**
 * Allows the user to pick which function key (01-24) the keyword is assigned to.
 * @param commandType - The command type already chosen (CA or CF)
 * @param toggleType - Which keyword this is for (only used for the picker title)
 */
async function selectKeyNumber(commandType: 'CA' | 'CF', toggleType: ToggleType): Promise<string | null> {
    const keys = Array.from({ length: 24 }, (_, i) => (i + 1).toString().padStart(2, '0'));

    const selected = await vscode.window.showQuickPick(
        keys.map(key => ({
            label: `F${parseInt(key)}`,
            description: `Function key ${parseInt(key)}`,
            detail: `Key number: ${key}`
        })),
        {
            title: `${toggleType} - Select the ${commandType} key it's assigned to`,
            placeHolder: 'Select function key from list'
        }
    );

    return selected ? selected.detail!.split(': ')[1] : null;
};

/**
 * Collects up to 3 conditioning indicators for the keyword, same input convention as command keys
 * (see collectIndicatorsForKeyCommand in dspf-edit.add-keys.ts).
 * @param commandType - The command type already chosen (CA or CF)
 * @param keyNumber - The key number already chosen
 */
async function collectIndicators(commandType: string, keyNumber: string): Promise<string[]> {
    const indicators: string[] = [];

    while (indicators.length < 3) {
        const indicatorInput = await vscode.window.showInputBox({
            title: `Indicators for ${commandType}${keyNumber} - ${indicators.length}/3 added`,
            prompt: `Enter indicator ${indicators.length + 1} (e.g., '50', 'N50', or leave empty to finish)`,
            placeHolder: 'Indicator (1-99, optional N prefix)',
            validateInput: (value: string) => {
                if (!value.trim()) return null;
                if (!/^N?[0-9]{1,2}$/.test(value.trim())) {
                    return 'Invalid indicator format. Use format like: 50, N50, 5, N99';
                }
                const num = parseInt(value.replace('N', ''));
                if (num < 1 || num > 99) {
                    return 'Indicator number must be between 1 and 99';
                };
                return null;
            }
        });

        if (indicatorInput === undefined) {
            return [];
        };

        const trimmedInput = indicatorInput.trim();
        if (!trimmedInput) {
            break;
        };

        indicators.push(trimmedInput.toUpperCase());
    };

    return indicators;
};

// DDS MODIFICATION FUNCTIONS

/**
 * Builds the DDS line for a SFLDROP()/SFLFOLD() keyword, with its conditioning indicators (if any)
 * in the usual columns 8-16, same layout convention as createKeyCommandLineWithIndicators.
 * @param toggleType - Which keyword to write
 * @param commandType - CA or CF
 * @param keyNumber - The key number (01-24)
 * @param indicators - Conditioning indicators to place before the keyword (max 3)
 */
function createSflToggleLine(
    toggleType: ToggleType,
    commandType: 'CA' | 'CF',
    keyNumber: string,
    indicators: string[]
): string {
    let line = '     A ';

    for (let i = 0; i < 3; i++) {
        if (i < indicators.length) {
            line += indicators[i].padStart(3, ' ');
        };
    };

    while (line.length < 44) {
        line += ' ';
    };

    line += `${toggleType}(${commandType}${keyNumber})`;

    return line;
};

/**
 * Writes (adds or replaces) a SFLDROP/SFLFOLD keyword line for a subfile control record.
 * @param editor - The active text editor
 * @param state - The current state of the keyword being edited
 * @param recordLineIndex - The SFLCTL record's own `R` line, used to place a brand-new line
 * @param commandType - CA or CF
 * @param keyNumber - The key number (01-24)
 * @param indicators - Conditioning indicators to apply
 */
async function writeToggle(
    editor: vscode.TextEditor,
    state: SflToggleState,
    recordLineIndex: number,
    commandType: 'CA' | 'CF',
    keyNumber: string,
    indicators: string[]
): Promise<boolean> {
    const document = editor.document;
    const uri = document.uri;
    const newLine = createSflToggleLine(state.toggleType, commandType, keyNumber, indicators);
    const workspaceEdit = new vscode.WorkspaceEdit();

    if (state.attr) {
        // Replace the existing keyword line(s) in place.
        const lastLine = state.attr.lastLineIndex ?? state.attr.lineIndex;
        const range = new vscode.Range(state.attr.lineIndex, 0, lastLine, document.lineAt(lastLine).text.length);
        workspaceEdit.replace(uri, range, newLine);
    } else {
        // Insert a brand-new keyword line right after the record definition.
        const insertionPoint = findElementInsertionPointRecordFirstLine(editor, { lineIndex: recordLineIndex });
        if (insertionPoint === -1) {
            vscode.window.showErrorMessage('Could not find insertion point for the keyword.');
            return false;
        };

        const insertPos = new vscode.Position(insertionPoint, 0);
        if (insertPos.line >= document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n' + newLine);
        } else {
            workspaceEdit.insert(uri, insertPos, newLine + '\n');
        };
    };

    return applyWorkspaceEdit(workspaceEdit, `set ${state.toggleType}`);
};

/**
 * Removes an existing SFLDROP/SFLFOLD keyword line entirely.
 * @param editor - The active text editor
 * @param state - The current state of the keyword being removed
 */
async function removeToggle(editor: vscode.TextEditor, state: SflToggleState): Promise<boolean> {
    if (!state.attr) {
        return true;
    };

    const document = editor.document;
    const lastLine = state.attr.lastLineIndex ?? state.attr.lineIndex;
    const workspaceEdit = new vscode.WorkspaceEdit();

    if (lastLine === document.lineCount - 1) {
        if (state.attr.lineIndex === 0) {
            workspaceEdit.delete(document.uri, new vscode.Range(0, 0, document.lineCount, 0));
        } else {
            const prevLineEnd = document.lineAt(state.attr.lineIndex - 1).range.end;
            workspaceEdit.delete(document.uri, new vscode.Range(prevLineEnd, document.positionAt(document.getText().length)));
        };
    } else {
        workspaceEdit.delete(document.uri, new vscode.Range(state.attr.lineIndex, 0, lastLine + 1, 0));
    };

    return applyWorkspaceEdit(workspaceEdit, `remove ${state.toggleType}`);
};
