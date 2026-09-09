/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-indicators.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { checkForEditorAndDocument, applyWorkspaceEdit } from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

interface IndicatorAssignment {
    position: number;       // 1-3 (positions 8-10, 11-13, 14-16 in DDS line)
    indicator: string;      // e.g., '50', 'N50', '23', 'N01'
    isNegated: boolean;     // true if has 'N' prefix
    value: string;          // raw value without N prefix
};

interface InlineAttributeInfo {
    attributeText: string;
    fieldLineIndex: number;
    isInline: boolean;
};

/** One physical DDS line's worth of indicators, plus its column-7 marker. */
interface IndicatorLineSpec {
    indicators: IndicatorAssignment[];
    marker: ' ' | 'O';
};

/** One row of the indicators summary menu: an existing OR'd AND-group (`groupIndex` into the
 * current condition), or one of the two trailing action rows. */
interface IndicatorMenuItem extends vscode.QuickPickItem {
    groupIndex: number;
    action?: 'addOr' | 'removeAll';
};

// CONSTANTS

/** DDS indicator slots per line (positions 8-16: three 3-character slots). */
const INDICATORS_PER_LINE = 3;

/**
 * Maximum ANDed indicators DDS allows for a single condition (see "Condition for display files
 * (positions 7 through 16)" in the DDS reference: "a maximum of nine indicators for each
 * condition"). Beyond 3 (one line's worth), the extra indicators are written on continuation
 * lines above the element's own line, marked with a blank/'A' in position 7 — see
 * createIndicatorContinuationLine / applyGroupsToElement.
 */
const MAX_AND_INDICATORS = 9;

/**
 * Maximum OR'd conditions DDS allows for a single field/constant/keyword (see the DDS reference:
 * "nine conditions for each field or keyword"). Each condition is itself an AND-group of up to
 * MAX_AND_INDICATORS indicators — position 7 'O' starts a new one.
 */
const MAX_OR_CONDITIONS = 9;

// COMMAND REGISTRATION

/**
 * Registers the manage indicators command for DDS fields and constants (and attributes of them)
 * Allows users to interactively manage conditioning indicators for elements: up to
 * MAX_AND_INDICATORS ANDed per condition, and up to MAX_OR_CONDITIONS OR'd conditions.
 * @param context - The VS Code extension context
 */
export function addIndicators(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-indicators", async (node: DdsNode) => {
            await handleAddIndicatorsCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the manage indicators command for a DDS field or constant (and attributes of them).
 * Reads the element's full condition — every OR'd AND-group, spanning continuation lines above the
 * element's own line — and lets the user add/remove indicators or whole OR'd conditions, or modify
 * individual ones.
 * @param node - The DDS node containing the field or constant
 */
async function handleAddIndicatorsCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field' &&
            node.ddsElement.kind !== 'constantAttribute' && node.ddsElement.kind !== 'fieldAttribute') {
            vscode.window.showWarningMessage('Indicators can only be managed for constants, fields or their attributes');
            return;
        };

        // Special handling for inline field attributes
        if (node.ddsElement.kind === 'fieldAttribute') {
            const inlineInfo = getInlineAttributeInfo(editor, node.ddsElement);
            if (inlineInfo.isInline) {
                await handleInlineAttributeIndicators(editor, node.ddsElement, inlineInfo);
                return;
            };
        };

        const elementName = elementDisplayName(node.ddsElement);

        // Read the element's full condition: every OR'd AND-group, including continuation lines
        const { groups } = findIndicatorConditionBlock(editor, node.ddsElement.lineIndex);

        // Show a summary menu — one row per existing OR'd condition, editable/removable
        // individually — instead of the old flat "Add AND/Add OR/Modify/Remove a group/Replace
        // all/Remove all" 6-choice picker.
        if (groups.length > 0) {
            const choice = await showIndicatorMenu(buildIndicatorMenuItems(groups), elementName);
            if (!choice) return;

            if (choice.action === 'removeAll') {
                if (!(await applyGroupsToElement(editor, node.ddsElement, []))) {
                    return;
                };
                await refreshEditorView();
                vscode.window.showInformationMessage(`Removed all indicators from ${elementName}.`);
                return;
            };

            if (choice.action === 'remove') {
                const remaining = groups.filter((_, i) => i !== choice.groupIndex);
                if (!(await applyGroupsToElement(editor, node.ddsElement, remaining))) {
                    return;
                };
                await refreshEditorView();
                vscode.window.showInformationMessage(`Removed OR condition from ${elementName}.`);
                return;
            };

            if (choice.action === 'edit') {
                if (!(await modifyGroup(editor, node.ddsElement, groups, choice.groupIndex))) {
                    return;
                };
                await refreshEditorView();
                return;
            };

            // choice.action === 'addOr'
            if (groups.length >= MAX_OR_CONDITIONS) {
                vscode.window.showWarningMessage(`Maximum of ${MAX_OR_CONDITIONS} OR'd conditions reached (DDS limit).`);
                return;
            };
            const newGroup = await collectIndicatorsFromUser(MAX_AND_INDICATORS);
            if (newGroup.length === 0) {
                vscode.window.showInformationMessage('No indicators selected.');
                return;
            };
            if (!(await applyGroupsToElement(editor, node.ddsElement, [...groups, newGroup]))) {
                return;
            };
            await refreshEditorView();
            vscode.window.showInformationMessage(`Added OR condition (${formatIndicatorsSummary(newGroup)}) to ${elementName}.`);
            return;
        };

        // No condition yet: collect a single fresh AND group.
        const newGroup = await collectIndicatorsFromUser(MAX_AND_INDICATORS);
        if (newGroup.length === 0) {
            vscode.window.showInformationMessage('No indicators selected.');
            return;
        };

        if (!(await applyGroupsToElement(editor, node.ddsElement, [newGroup]))) {
            return;
        };
        await refreshEditorView();
        vscode.window.showInformationMessage(`Set indicators (${formatIndicatorsSummary(newGroup)}) for ${elementName}.`);

    } catch (error) {
        console.error('Error managing indicators:', error);
        vscode.window.showErrorMessage('An error occurred while managing indicators.');
    };
};

// SMALL SHARED HELPERS

/** Refreshes the tree/preview after an edit — the cheapest way to force a re-parse of the document. */
async function refreshEditorView(): Promise<void> {
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');
};

/** A short name for an element to use in user-facing messages. */
function elementDisplayName(element: any): string {
    return (element.kind === 'constant' || element.kind === 'field') ? element.name : 'attribute';
};

// INDICATORS SUMMARY MENU

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Modify' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Builds the indicators summary menu's rows: one per existing OR'd AND-group (formatted as e.g.
 * "51, N61, 53", with edit + trash buttons), plus an "Add OR condition..." row, plus a "Remove all"
 * row when there's more than one group (with just one, its own trash button already does the same
 * thing).
 * @param groups - The element's current OR'd AND-groups, from `findIndicatorConditionBlock`
 */
function buildIndicatorMenuItems(groups: IndicatorAssignment[][]): IndicatorMenuItem[] {
    const items: IndicatorMenuItem[] = groups.map((group, index) => ({
        groupIndex: index,
        label: groups.length > 1 ? `Condition ${index + 1}: ${formatIndicatorsSummary(group)}` : formatIndicatorsSummary(group),
        buttons: [EDIT_BUTTON, REMOVE_BUTTON]
    }));

    items.push({ groupIndex: -1, action: 'addOr', label: '$(add) Add OR condition...' });

    if (groups.length > 1) {
        items.push({ groupIndex: -1, action: 'removeAll', label: '$(trash) Remove all indicators' });
    };

    return items;
};

/**
 * Shows the indicators summary menu and resolves to what the user did: picked a row (or its edit
 * button) to modify that OR'd condition (`action: 'edit'`), clicked a row's trash button to remove
 * just that one (`action: 'remove'`), or picked one of the trailing action rows
 * (`'addOr'`/`'removeAll'`) — undefined if dismissed. Needs the raw `createQuickPick` API rather
 * than the simpler `showQuickPick` helper, since only it exposes per-item buttons
 * (`onDidTriggerItemButton`).
 * @param items - The menu's rows, from `buildIndicatorMenuItems`
 * @param elementName - The element's name, for the menu's title
 */
function showIndicatorMenu(
    items: IndicatorMenuItem[],
    elementName: string
): Promise<{ action: 'edit' | 'remove' | 'addOr' | 'removeAll'; groupIndex: number } | undefined> {
    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<IndicatorMenuItem>();
        quickPick.items = items;
        quickPick.title = `Indicators for ${elementName}`;
        quickPick.placeholder = 'Select a condition to modify, use its buttons, or add an OR condition';
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: { action: 'edit' | 'remove' | 'addOr' | 'removeAll'; groupIndex: number } | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'edit', groupIndex: event.item.groupIndex });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            if (!picked) { finish(undefined); return; };
            finish({ action: picked.action ?? 'edit', groupIndex: picked.groupIndex });
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

// INLINE ATTRIBUTE HANDLING

/**
 * Gets information about inline attributes for field attributes.
 * @param editor - The active text editor
 * @param element - The field attribute element
 * @returns Inline attribute information
 */
function getInlineAttributeInfo(editor: vscode.TextEditor, element: any): InlineAttributeInfo {
    // For field attributes, we need to check if the attribute is inline
    // This assumes the element has a reference to its parent field
    const fieldLineIndex = element.fieldLineIndex || element.lineIndex;
    const fieldLine = editor.document.lineAt(fieldLineIndex);
    const fieldLineText = fieldLine.text;

    // Check if there's an attribute at position 44+
    if (fieldLineText.length > 44) {
        const attributePart = fieldLineText.substring(44).trim();
        if (/\b(DSPATR|COLOR)\(/i.test(attributePart)) {
            return {
                attributeText: attributePart,
                fieldLineIndex: fieldLineIndex,
                isInline: true
            };
        };
    };

    return {
        attributeText: '',
        fieldLineIndex: fieldLineIndex,
        isInline: false
    };
};

/**
 * Handles indicators for inline field attributes by moving them to separate lines. Once on its own
 * line, the attribute gains full OR support too — this initial move only sets up a single AND
 * condition (up to MAX_AND_INDICATORS); use the main "Indicators" action again afterward to add an
 * OR'd condition to it.
 * @param editor - The active text editor
 * @param element - The field attribute element
 * @param inlineInfo - Information about the inline attribute
 */
async function handleInlineAttributeIndicators(
    editor: vscode.TextEditor,
    element: any,
    inlineInfo: InlineAttributeInfo
): Promise<void> {
    // Inform the user about what will happen
    const proceed = await vscode.window.showWarningMessage(
        'To add indicators to this attribute, it must be moved to a separate line. The attribute will no longer be inline with the field.',
        'Continue', 'Cancel'
    );

    if (proceed !== 'Continue') return;

    // Get indicators to add
    const indicators = await collectIndicatorsFromUser(MAX_AND_INDICATORS);
    if (indicators.length === 0) {
        vscode.window.showInformationMessage('No indicators selected.');
        return;
    };

    // Move the attribute to a separate line with indicators
    if (!(await moveInlineAttributeToSeparateLine(editor, inlineInfo, indicators))) {
        return;
    };

    const indicatorsSummary = formatIndicatorsSummary(indicators);
    vscode.window.showInformationMessage(
        `Moved attribute to separate line and added indicators: ${indicatorsSummary}`
    );
};

/**
 * Moves an inline attribute to a separate line with indicators.
 * @param editor - The active text editor
 * @param inlineInfo - Information about the inline attribute
 * @param indicators - Indicators to add to the attribute
 */
async function moveInlineAttributeToSeparateLine(
    editor: vscode.TextEditor,
    inlineInfo: InlineAttributeInfo,
    indicators: IndicatorAssignment[]
): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const fieldLineIndex = inlineInfo.fieldLineIndex;

    // 1. Remove the attribute from the field line (truncate at position 44)
    const fieldLine = editor.document.lineAt(fieldLineIndex);
    const fieldLineText = fieldLine.text;
    const truncatedFieldLine = fieldLineText.substring(0, 44).trimRight();

    workspaceEdit.replace(uri, fieldLine.range, truncatedFieldLine);

    // 2. Create the new attribute line, preceded by any AND-continuation lines needed for
    // indicators beyond INDICATORS_PER_LINE (the attribute line itself always carries the last,
    // terminal chunk — see splitIndicatorsIntoLineChunks).
    const { continuationChunks, terminalChunk } = splitIndicatorsIntoLineChunks(indicators);
    const continuationText = continuationChunks.map(chunk => createIndicatorContinuationLine(chunk) + '\n').join('');
    const attributeLine = continuationText + createAttributeLineWithIndicators(inlineInfo.attributeText, terminalChunk);
    const insertPos = new vscode.Position(fieldLineIndex + 1, 0);

    // Check if we need to add a newline at the end of the file
    if (insertPos.line >= editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPos, '\n');
    };

    workspaceEdit.insert(uri, insertPos, attributeLine);

    // Add newline after the attribute if we're not at the end
    if (insertPos.line < editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPos, '\n');
    };

    return applyWorkspaceEdit(workspaceEdit, 'move the attribute');
};

/**
 * Creates an attribute line with indicators.
 * @param attributeText - The attribute text (e.g., 'DSPATR(HI)', 'COLOR(RED)')
 * @param indicators - The indicators to add
 * @returns Formatted DDS line with attribute and indicators
 */
function createAttributeLineWithIndicators(attributeText: string, indicators: IndicatorAssignment[]): string {
    let line = '     A '; // Start with 'A' and spaces up to position 7

    // Add indicators in positions 8-16 (0-based: 7-15)
    for (let i = 0; i < INDICATORS_PER_LINE; i++) {
        const startPos = 7 + (i * 3);
        if (i < indicators.length) {
            const indicator = indicators[i];
            const indicatorText = (indicator.isNegated ? 'N' : ' ') + indicator.value.padStart(2, '0');
            line += indicatorText;
        } else {
            line += '   '; // Three spaces if no indicator
        };
    };

    // Pad to position 44
    while (line.length < 44) {
        line += ' ';
    };

    // Add the attribute
    line += attributeText;

    return line;
};

/**
 * Creates a pure indicator continuation line: just up to INDICATORS_PER_LINE indicators in
 * positions 8-16, nothing else. Position 7 carries the marker: blank continues the current AND
 * group (DDS treats it the same as an explicit 'A'), 'O' starts a new OR'd group. See "Condition
 * for display files (positions 7 through 16)" in the DDS reference.
 * @param indicators - Up to INDICATORS_PER_LINE indicators for this line
 * @param marker - Blank to continue the AND group, 'O' to start a new OR'd one
 * @returns Formatted DDS continuation line
 */
function createIndicatorContinuationLine(indicators: IndicatorAssignment[], marker: ' ' | 'O' = ' '): string {
    let line = '     A' + marker; // Sequence number area + form type (col 6) + condition marker (col 7)

    for (let i = 0; i < INDICATORS_PER_LINE; i++) {
        if (i < indicators.length) {
            const indicator = indicators[i];
            line += (indicator.isNegated ? 'N' : ' ') + indicator.value.padStart(2, '0');
        } else {
            line += '   ';
        };
    };

    return line.trimEnd();
};

// INDICATORS EXTRACTION FUNCTIONS

/**
 * True when a line is a pure indicator continuation line: it carries its own indicators
 * (positions 8-16) but nothing else at all — no name, no position, no keyword. This is stricter
 * than the DDS rule technically requires (it only cares about the keyword zone, columns 45-80),
 * but matches exactly what createIndicatorContinuationLine generates, and is the same minimal
 * style any hand-written continuation line follows in practice.
 * @param lineText - The line's raw text
 */
function isPureIndicatorContinuationLine(lineText: string): boolean {
    // A short/blank line's substring(16) is just '', same as a longer line with nothing but
    // trailing blanks past column 16 — no separate length check needed (see parseIndicatorsFromLine).
    if (lineText[6] === '*') return false;
    if (parseIndicatorsFromLine(lineText).length === 0) return false;
    return lineText.substring(16).trim() === '';
};

/**
 * Reads an element's full indicator condition: its own line plus any indicator-only continuation
 * lines directly above it (see isPureIndicatorContinuationLine), resolved into OR'd AND-groups
 * exactly as DDS defines them — position 7 'O' starts a new group, blank/'A' continues the current
 * one. An 'O' on what would be the very first line of the whole block is invalid DDS and treated as
 * blank, matching the parser's own resolver (see dspf-edit.parser.ts's resolveLineIndicators).
 * @param editor - The active text editor
 * @param elementLineIndex - Line index of the field/constant/keyword the condition applies to
 * @returns Where the block starts (elementLineIndex itself when there's no continuation), and the
 * condition as an array of OR'd AND-groups (empty when unconditioned)
 */
function findIndicatorConditionBlock(
    editor: vscode.TextEditor,
    elementLineIndex: number
): { startLine: number; groups: IndicatorAssignment[][] } {
    const entries: { marker: string; indicators: IndicatorAssignment[] }[] = [];
    let startLine = elementLineIndex;

    for (let i = elementLineIndex - 1; i >= 0; i--) {
        const lineText = editor.document.lineAt(i).text;
        if (!isPureIndicatorContinuationLine(lineText)) break;

        entries.unshift({ marker: lineText[6], indicators: parseIndicatorsFromLine(lineText) });
        startLine = i;
    };

    const ownLineText = editor.document.lineAt(elementLineIndex).text;
    entries.push({
        marker: ownLineText.length > 6 ? ownLineText[6] : ' ',
        indicators: parseIndicatorsFromLine(ownLineText)
    });

    const groups: IndicatorAssignment[][] = [];
    for (const entry of entries) {
        if (entry.marker === 'O' && groups.length > 0) {
            groups.push([...entry.indicators]);
        } else {
            if (groups.length === 0) groups.push([]);
            groups[groups.length - 1].push(...entry.indicators);
        };
    };

    return { startLine, groups: groups.filter(group => group.length > 0) };
};

/**
 * Formats a single AND-group into a readable summary string.
 * @param indicators - Array of indicators
 * @returns Formatted summary string
 */
function formatIndicatorsSummary(indicators: IndicatorAssignment[]): string {
    if (indicators.length === 0) return 'None';

    return indicators.map(ind => `${ind.isNegated ? 'N' : ''}${ind.value}`).join(', ');
};

// USER INTERACTION FUNCTIONS

/**
 * Collects indicators from user through interactive selection.
 * @param maxIndicators - Maximum number of indicators that can be added
 * @returns Array of selected indicators
 */
async function collectIndicatorsFromUser(maxIndicators: number = MAX_AND_INDICATORS): Promise<IndicatorAssignment[]> {
    const indicators: IndicatorAssignment[] = [];

    while (indicators.length < maxIndicators) {
        const indicatorInput = await vscode.window.showInputBox({
            title: `Add Indicator ${indicators.length + 1}/${maxIndicators} (Press ESC to finish)`,
            prompt: `Enter indicator (e.g., '50', 'N50', '01', 'N99', or leave empty to finish)`,
            placeHolder: 'Indicator (01-99, optional N prefix)',
            validateInput: (value: string) => {
                if (!value.trim()) return null; // Empty is OK to finish
                if (!/^N?([0-9]{1,2})$/.test(value.trim())) {
                    return 'Invalid indicator format. Use format like: 50, N50, 01, N99';
                };
                const num = parseInt(value.replace(/^N/, ''));
                if (num < 1 || num > 99) {
                    return 'Indicator number must be between 01 and 99';
                };
                // Check for duplicates
                const cleanValue = value.trim().toUpperCase();
                if (indicators.some(ind => ind.indicator === cleanValue)) {
                    return 'This indicator is already added';
                };
                return null;
            }
        });

        if (indicatorInput === undefined) {
            // User cancelled
            return [];
        };

        const trimmedInput = indicatorInput.trim();
        if (!trimmedInput) {
            // User finished entering indicators
            break;
        };

        // Parse indicator
        const isNegated = trimmedInput.startsWith('N');
        const value = trimmedInput.replace(/^N/, '').padStart(2, '0');

        indicators.push({
            position: indicators.length + 1,
            indicator: trimmedInput.toUpperCase(),
            isNegated,
            value
        });
    };

    return indicators;
};

/**
 * Modifies one of an element's OR'd AND-groups — which one is already chosen (its summary menu
 * row), so this goes straight to the per-indicator flow: add a new indicator, change or remove an
 * existing one, or clear the whole group and start over.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @param groups - The element's current OR'd AND-groups
 * @param groupIndex - Which group to modify
 */
async function modifyGroup(
    editor: vscode.TextEditor,
    element: any,
    groups: IndicatorAssignment[][],
    groupIndex: number
): Promise<boolean> {
    const currentIndicators = groups[groupIndex];
    const indicatorChoices = currentIndicators.map((indicator, index) =>
        `Position ${index + 1}: ${indicator.isNegated ? 'N' : ''}${indicator.value}`
    );

    const selectedIndicator = await vscode.window.showQuickPick(
        [...indicatorChoices, 'Add new indicator', 'Clear all and start over'],
        {
            title: 'Select indicator to modify',
            placeHolder: 'Choose an indicator to modify or select an action'
        }
    );

    if (!selectedIndicator) return true;

    // Applies a new indicator list for just this one OR'd group. Emptying a group removes the
    // whole OR condition, rather than leaving a dangling AND group with nothing in it.
    const applyGroupChange = (newIndicatorsForGroup: IndicatorAssignment[]): Promise<boolean> => {
        const updatedGroups = newIndicatorsForGroup.length > 0
            ? groups.map((g, i) => i === groupIndex ? newIndicatorsForGroup : g)
            : groups.filter((_, i) => i !== groupIndex);
        return applyGroupsToElement(editor, element, updatedGroups);
    };

    if (selectedIndicator === 'Clear all and start over') {
        const newIndicators = await collectIndicatorsFromUser(MAX_AND_INDICATORS);
        if (!(await applyGroupChange(newIndicators))) {
            return false;
        };
    } else if (selectedIndicator === 'Add new indicator') {
        if (currentIndicators.length >= MAX_AND_INDICATORS) {
            vscode.window.showWarningMessage(`Maximum of ${MAX_AND_INDICATORS} ANDed indicators reached (DDS limit).`);
            return true;
        };
        const newIndicators = await collectIndicatorsFromUser(MAX_AND_INDICATORS - currentIndicators.length);
        if (newIndicators.length > 0) {
            if (!(await applyGroupChange([...currentIndicators, ...newIndicators]))) {
                return false;
            };
        };
    } else {
        const indicatorIndex = indicatorChoices.indexOf(selectedIndicator);
        if (indicatorIndex >= 0) {
            const action = await vscode.window.showQuickPick(
                ['Change indicator value', 'Remove this indicator'],
                {
                    title: `Modify: ${selectedIndicator}`,
                    placeHolder: 'Choose action'
                }
            );

            if (action === 'Remove this indicator') {
                const newIndicators = currentIndicators.filter((_, index) => index !== indicatorIndex);
                if (!(await applyGroupChange(newIndicators))) {
                    return false;
                };
                vscode.window.showInformationMessage('Indicator removed.');
            } else if (action === 'Change indicator value') {
                const newValue = await vscode.window.showInputBox({
                    title: `Change indicator at position ${indicatorIndex + 1}`,
                    prompt: `Enter new indicator value (e.g., '50', 'N50', '01', 'N99')`,
                    value: currentIndicators[indicatorIndex].indicator,
                    validateInput: (value: string) => {
                        if (!value.trim()) return 'Indicator value is required';
                        if (!/^N?([0-9]{1,2})$/.test(value.trim())) {
                            return 'Invalid indicator format. Use format like: 50, N50, 01, N99';
                        }
                        const num = parseInt(value.replace(/^N/, ''));
                        if (num < 1 || num > 99) {
                            return 'Indicator number must be between 01 and 99';
                        }
                        // Check for duplicates (excluding current position)
                        const cleanValue = value.trim().toUpperCase();
                        if (currentIndicators.some((ind, idx) => idx !== indicatorIndex && ind.indicator === cleanValue)) {
                            return 'This indicator is already used in another position';
                        }
                        return null;
                    }
                });

                if (newValue) {
                    const isNegated = newValue.startsWith('N');
                    const value = newValue.replace(/^N/, '').padStart(2, '0');

                    const updatedIndicators = [...currentIndicators];
                    updatedIndicators[indicatorIndex] = {
                        position: indicatorIndex + 1,
                        indicator: newValue.toUpperCase(),
                        isNegated,
                        value
                    };

                    if (!(await applyGroupChange(updatedIndicators))) {
                        return false;
                    };
                    vscode.window.showInformationMessage('Indicator updated.');
                };
            };
        };
    };
    return true;
};

// DDS MODIFICATION FUNCTIONS

/**
 * Splits a single AND-group into the continuation lines needed above the element's own line
 * (INDICATORS_PER_LINE each) plus the terminal chunk that goes on the element's own line — per
 * DDS rules, the field/constant/keyword itself must be on the same line as the last set of
 * indicators. Front-loads full lines first, so e.g. 5 indicators become a 3-indicator
 * continuation line plus a 2-indicator terminal line. Used only by the inline-attribute path,
 * which manages a single condition — applyGroupsToElement uses flattenGroupsIntoLineSpecs instead,
 * to also place OR markers between groups.
 * @param indicators - The AND-group (already capped at MAX_AND_INDICATORS)
 */
function splitIndicatorsIntoLineChunks(
    indicators: IndicatorAssignment[]
): { continuationChunks: IndicatorAssignment[][]; terminalChunk: IndicatorAssignment[] } {
    if (indicators.length <= INDICATORS_PER_LINE) {
        return { continuationChunks: [], terminalChunk: indicators };
    };

    const lastChunkSize = indicators.length % INDICATORS_PER_LINE || INDICATORS_PER_LINE;
    const splitAt = indicators.length - lastChunkSize;

    const continuationChunks: IndicatorAssignment[][] = [];
    for (let i = 0; i < splitAt; i += INDICATORS_PER_LINE) {
        continuationChunks.push(indicators.slice(i, i + INDICATORS_PER_LINE));
    };

    return { continuationChunks, terminalChunk: indicators.slice(splitAt) };
};

/**
 * Lays out a full condition — one or more OR'd AND-groups — as the sequence of physical lines it
 * needs: each group is chunked into its own lines of up to INDICATORS_PER_LINE, and the first line
 * of every group after the first is marked 'O' (all others stay blank, DDS's default AND-continue)
 * — a new OR'd group can never share a physical line with the one before it.
 * @param groups - Non-empty OR'd AND-groups (each itself non-empty)
 */
function flattenGroupsIntoLineSpecs(groups: IndicatorAssignment[][]): IndicatorLineSpec[] {
    const specs: IndicatorLineSpec[] = [];

    groups.forEach((group, groupIndex) => {
        for (let i = 0; i < group.length; i += INDICATORS_PER_LINE) {
            specs.push({
                indicators: group.slice(i, i + INDICATORS_PER_LINE),
                marker: (groupIndex > 0 && i === 0) ? 'O' : ' '
            });
        };
    });

    return specs;
};

/**
 * Sets an element's full indicator condition — one or more OR'd AND-groups — rewriting whatever
 * indicator block currently precedes it (if any — see findIndicatorConditionBlock) to match. An
 * empty `groups` array removes all conditioning, continuation lines included.
 * @param editor - The active text editor
 * @param element - The DDS element to set the condition for
 * @param groups - The full OR'd AND-groups to apply (empty groups are dropped)
 */
async function applyGroupsToElement(
    editor: vscode.TextEditor,
    element: any,
    groups: IndicatorAssignment[][]
): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const elementLineIndex = element.lineIndex;
    const { startLine } = findIndicatorConditionBlock(editor, elementLineIndex);

    const specs = flattenGroupsIntoLineSpecs(groups.filter(group => group.length > 0));
    const continuationSpecs = specs.slice(0, -1);
    const terminalSpec = specs[specs.length - 1];

    // Replace whatever indicator block currently precedes the element (a zero-length range when
    // there isn't one) with the freshly-generated one — naturally also removes a now-unneeded block.
    const blockRange = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(elementLineIndex, 0));
    const continuationText = continuationSpecs.map(spec => createIndicatorContinuationLine(spec.indicators, spec.marker) + '\n').join('');
    workspaceEdit.replace(uri, blockRange, continuationText);

    const elementLine = editor.document.lineAt(elementLineIndex);
    const newLine = setIndicatorsOnLine(elementLine.text, terminalSpec?.indicators ?? [], terminalSpec?.marker ?? ' ');
    workspaceEdit.replace(uri, elementLine.range, newLine);

    return applyWorkspaceEdit(workspaceEdit, 'set the indicators');
};

// LINE CREATION AND PARSING FUNCTIONS

/**
 * Sets indicators (and the column-7 marker) on a DDS line, replacing whatever was there. Only ever
 * called with a single line's worth (at most INDICATORS_PER_LINE) — anything beyond that belongs on
 * continuation lines instead (see createIndicatorContinuationLine / applyGroupsToElement).
 * @param lineText - The existing line text
 * @param indicators - The indicators to set on this line (at most INDICATORS_PER_LINE)
 * @param marker - Blank for an unconditioned/AND-continuing line, 'O' when this line starts a new
 * OR'd group and happens to also be the element's own (terminal) line
 * @returns Modified line text
 */
function setIndicatorsOnLine(lineText: string, indicators: IndicatorAssignment[], marker: ' ' | 'O' = ' '): string {
    let line = lineText.padEnd(80, ' ');

    // Clear existing marker + indicators first (positions 7-16, 0-based: 6-15), then write the marker.
    line = line.substring(0, 6) + marker + '         ' + line.substring(16);

    // Set new indicators in positions 8-16 (0-based: 7-15)
    for (let i = 0; i < Math.min(indicators.length, INDICATORS_PER_LINE); i++) {
        const startPos = 7 + (i * 3); // Positions 8-10, 11-13, 14-16 (0-based: 7-9, 10-12, 13-15)
        const indicator = indicators[i];
        const indicatorText = (indicator.isNegated ? 'N' : ' ') + indicator.value.padStart(2, '0');

        if (line.length > startPos + 2) {
            line = line.substring(0, startPos) + indicatorText + line.substring(startPos + 3);
        };
    };

    return line.trimEnd();
};

/**
 * Parses indicators from a DDS line.
 * @param lineText - The DDS line text
 * @returns Array of parsed indicators
 */
function parseIndicatorsFromLine(lineText: string): IndicatorAssignment[] {
    const indicators: IndicatorAssignment[] = [];

    // No upfront length check: a real DDS source line is only as long as it needs to be — a plain
    // indicator-only continuation line (e.g. "     A  51N61") can be as short as 13 characters, and
    // the per-slot length check below already safely skips whichever slots that line is too short
    // to contain.
    // Parse positions 8-16 (0-based: 7-15)
    for (let i = 0; i < INDICATORS_PER_LINE; i++) {
        const startPos = 7 + (i * 3);
        if (lineText.length > startPos + 2) {
            const indicatorText = lineText.substring(startPos, startPos + 3);
            const isNegated = indicatorText[0] === 'N';
            const value = indicatorText.substring(1).trim();

            if (value && /^\d{1,2}$/.test(value)) {
                indicators.push({
                    position: i + 1,
                    indicator: (isNegated ? 'N' : '') + value.padStart(2, '0'),
                    isNegated,
                    value: value.padStart(2, '0')
                });
            };
        };
    };

    return indicators;
};
