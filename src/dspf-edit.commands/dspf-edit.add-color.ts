/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-color.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { findElementInsertionPoint, checkForEditorAndDocument, applyWorkspaceEdit, formatIndicatorCondition } from '../dspf-edit.utils/dspf-edit.helper';
import { KeywordValue, KeywordValueSpec, manageKeywordValues, removeWholeKeyword } from './dspf-edit.conditioned-keywords';
import { fieldsPerRecords, DdsIndicator } from '../dspf-edit.model/dspf-edit.model';

// INTERFACES AND TYPES

interface ColorWithIndicators {
    color: string;
    indicators: string[];
    lineIndex?: number;
    lastLineIndex?: number;
    isInlineColor?: boolean;
    /** The color's whole indicator condition spelled out, OR'd groups included. */
    conditionText?: string;
};

// COMMAND REGISTRATION

/**
 * Registers the add color command for DDS fields and constants.
 * Allows users to interactively manage color attributes and indicators for elements.
 * @param context - The VS Code extension context
 */
export function addColor(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-color", async (node: DdsNode) => {
            await handleAddColorCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add color command for a DDS field or constant.
 * Manages existing colors with indicators and allows adding/removing color attributes.
 * @param node - The DDS node containing the field or constant
 */
async function handleAddColorCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Colors can only be added to constants and fields.');
            return;
        };

        // One window for everything: check/uncheck colors, set each one's indicators, remove them
        // (see dspf-edit.conditioned-keywords.ts). An element can well have several colors, each
        // one applying under its own indicators.
        await manageKeywordValues(editor, node.ddsElement, COLOR_SPEC);

    } catch (error) {
        console.error('Error managing colors:', error);
        vscode.window.showErrorMessage('An error occurred while managing colors.');
    };
};

// COLORS WINDOW

const COLOR_NAMES: Record<string, string> = {
    BLU: 'Blue',
    GRN: 'Green',
    PNK: 'Pink',
    RED: 'Red',
    TRQ: 'Turquoise',
    WHT: 'White',
    YLW: 'Yellow'
};

/** An existing color, as the shared window and its edits take it. */
function toKeywordValue(color: ColorWithIndicators): KeywordValue {
    return {
        code: color.color,
        keywordText: `COLOR(${color.color})`,
        lineIndex: color.lineIndex!,
        lastLineIndex: color.lastLineIndex ?? color.lineIndex!,
        conditionText: color.conditionText ?? ''
    };
};

const COLOR_SPEC: KeywordValueSpec = {
    keyword: 'COLOR',
    codes: Object.keys(COLOR_NAMES),
    noun: 'color',
    nounPlural: 'colors',
    describe: code => COLOR_NAMES[code] ? `${code} — ${COLOR_NAMES[code]}` : code,
    read: element => getCurrentColorsForElement(element).map(toKeywordValue),
    add: (editor, element, codes) => addColorsToElement(editor, element, codes.map(color => ({ color, indicators: [] }))),
    removeAll: removeColorsFromElement
};

// COLOR EXTRACTION FUNCTIONS

/**
 * Formats a parsed indicator back into the "50"/"N50" string form the rest of this file's UI uses.
 * @param indicator - The indicator to format
 */
function formatIndicatorForDisplay(indicator: DdsIndicator): string {
    return `${indicator.active ? '' : 'N'}${indicator.number}`;
};

/**
 * Extracts current color attributes from a DDS element, checking both inline and separate lines.
 * Reads from the element's own already-parsed `attributes` (populated by the parser for both
 * fields and constants, whether the COLOR() keyword shares the element's own definition line —
 * e.g. a constant's "'9. End' DSPATR(UL) COLOR(RED)" — or sits on a separate line below it) rather
 * than re-scanning raw source text, which used to only ever check the element's own line for
 * fields, silently missing an inline color coded on a constant's own line.
 * @param element - The DDS element (field or constant)
 * @returns Array of current colors with their location info
 */
function getCurrentColorsForElement(element: any): ColorWithIndicators[] {
    const attributes = (element.attributes || []) as { value: string; indicators?: DdsIndicator[]; lineIndex: number; lastLineIndex?: number }[];

    return attributes.reduce<ColorWithIndicators[]>((colors, attr) => {
        const colorMatch = attr.value.match(/^COLOR\(([A-Z]{3})\)$/);
        if (colorMatch) {
            colors.push({
                color: colorMatch[1],
                indicators: (attr.indicators || []).map(formatIndicatorForDisplay),
                lineIndex: attr.lineIndex,
                lastLineIndex: attr.lastLineIndex ?? attr.lineIndex,
                isInlineColor: attr.lineIndex === element.lineIndex,
                conditionText: formatIndicatorCondition(attr.indicators)
            });
        };
        return colors;
    }, []);
};

/**
 * Gets available colors excluding those already selected.
 * @param currentColors - Array of currently selected color codes
 * @returns Array of available colors
 */
function getAvailableColors(currentColors: string[]): string[] {
    const allColors: string[] = ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'WHT', 'YLW'];
    return allColors.filter(color => !currentColors.includes(color));
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds color attributes with indicators to a DDS element.
 * For fields: if no existing colors, adds first one inline (position 44+).
 * If colors already exist, adds to separate lines after existing ones.
 * @param editor - The active text editor
 * @param element - The DDS element to add colors to
 * @param colors - Array of colors with indicators to add
 */
async function addColorsToElement(
    editor: vscode.TextEditor,
    element: any,
    colorsToAdd: ColorWithIndicators[]
): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    buildColorEdits(workspaceEdit, editor, element, colorsToAdd);
    return applyWorkspaceEdit(workspaceEdit, 'add the colors');
};

/**
 * Appends the edits needed to add the given colors to a single element into an existing
 * `WorkspaceEdit`, without creating or applying its own — lets callers batch edits for several
 * elements into one `WorkspaceEdit`/one `applyWorkspaceEdit` call (see `addColorToMultipleElements`).
 * @param workspaceEdit - The shared workspace edit to append to
 * @param editor - The active text editor
 * @param element - The DDS element to add colors to
 * @param colorsToAdd - Array of colors with indicators to add
 */
function buildColorEdits(
    workspaceEdit: vscode.WorkspaceEdit,
    editor: vscode.TextEditor,
    element: any,
    colorsToAdd: ColorWithIndicators[]
): void {
    const isConstant = element.kind === 'constant';
    const numberOfAttributes = getNumberOfAttributesForElement(element);
    const uri = editor.document.uri;

    // For fields: if no existing colors, add first one inline
    if (!isConstant && numberOfAttributes === 0 && colorsToAdd.length > 0) {
        // Add first color inline (position 44+)
        const fieldLine = editor.document.lineAt(element.lineIndex);
        const fieldLineText = fieldLine.text;
        
        // Ensure the line has at least 44 characters
        const paddedLine = fieldLineText.padEnd(44, ' ');
        const firstColorText = createInlineColorText(colorsToAdd[0]);
        
        // Replace the entire line with the padded line + first color
        workspaceEdit.replace(
            uri,
            fieldLine.range,
            paddedLine + firstColorText
        );

        // Add remaining colors as separate lines if any
        if (colorsToAdd.length > 1) {
            const insertionPoint = findElementInsertionPoint(editor, element);
            if (insertionPoint === -1) {
                throw new Error('Could not find insertion point for additional colors');
            };

            let crInserted: boolean = false;
            for (let i = 1; i < colorsToAdd.length; i++) {
                const colorLine = createColorLineWithIndicators(colorsToAdd[i]);
                const insertPos = new vscode.Position(insertionPoint, 0);
                if (!crInserted && insertPos.line >= editor.document.lineCount) {
                    workspaceEdit.insert(uri, insertPos, '\n');
                    crInserted = true;
                };
                workspaceEdit.insert(uri, insertPos, colorLine);
                if (i < colorsToAdd.length - 1 || insertPos.line < editor.document.lineCount) {
                    workspaceEdit.insert(uri, insertPos, '\n');
                };
            };
        };
    } else {
        // Add all colors as separate lines (existing behavior)
        const insertionPoint = findElementInsertionPoint(editor, element);
        if (insertionPoint === -1) {
            throw new Error('Could not find insertion point for color attributes');
        };

        let crInserted: boolean = false;
        for (let i = 0; i < colorsToAdd.length; i++) {
            const colorLine = createColorLineWithIndicators(colorsToAdd[i]);
            const insertPos = new vscode.Position(insertionPoint, 0);
            if (!crInserted && insertPos.line >= editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
                crInserted = true;
            };
            workspaceEdit.insert(uri, insertPos, colorLine);
            if (i < colorsToAdd.length - 1 || insertPos.line < editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
            };
        };
    };
};

/**
 * Adds the given color(s) to every element in `nodes` at once — a single shared `WorkspaceEdit`
 * applied in one step, so one undo restores the whole batch. Unlike the single-element flow
 * (`handleAddColorCommand`), this always adds (never offers replace/remove for existing colors)
 * and never prompts for conditioning indicators, since indicators aren't a value that makes sense
 * shared across a group of differently-conditioned elements.
 * @param editor - The active text editor
 * @param nodes - The DDS nodes (fields/constants) to add colors to
 */
export async function addColorToMultipleElements(editor: vscode.TextEditor, nodes: DdsNode[]): Promise<void> {
    const targets = nodes.filter(n => n.ddsElement.kind === 'field' || n.ddsElement.kind === 'constant');
    if (targets.length === 0) return;

    const selectedColors = await vscode.window.showQuickPick(getAvailableColors([]), {
        title: `Add Color to ${targets.length} elements`,
        placeHolder: 'Select one or more colors to add',
        canPickMany: true,
        ignoreFocusOut: true
    });

    if (!selectedColors || selectedColors.length === 0) {
        vscode.window.showInformationMessage('No colors selected.');
        return;
    };

    const colorsToAdd: ColorWithIndicators[] = selectedColors.map(color => ({ color, indicators: [] }));

    const workspaceEdit = new vscode.WorkspaceEdit();
    for (const node of targets) {
        buildColorEdits(workspaceEdit, editor, node.ddsElement, colorsToAdd);
    };

    if (!(await applyWorkspaceEdit(workspaceEdit, 'add the colors'))) return;
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');

    vscode.window.showInformationMessage(
        `Added colors ${selectedColors.join(', ')} to ${targets.length} elements.`
    );
};

function getNumberOfAttributesForElement(element: any): number | undefined {
    // If element doesn't have required properties, return undefined
    if (!element.name || !element.recordname) {
        return undefined;
    };

    // Find the record that contains this element
    const recordEntry = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordEntry) {
        return undefined;
    };

    // Determine if we're looking for a field or constant
    const isConstant = element.kind === 'constant';
    const targetArray = isConstant ? recordEntry.constants : recordEntry.fields;

    // Find the specific field/constant by name
    const targetElement = targetArray.find(item => item.name === element.name);
    if (!targetElement) {
        return undefined;
    };

    // Return the attributes directly from the structure
    return (targetElement.attributes.length) || 0;
};

/**
 * Creates inline color text for position 44+ on field line.
 * @param colorWithIndicators - The color and its indicators
 * @returns Formatted color text for inline use
 */
function createInlineColorText(colorWithIndicators: ColorWithIndicators): string {
    return `COLOR(${colorWithIndicators.color})`;
};

/**
 * Creates a DDS color line with conditioning indicators.
 * @param colorWithIndicators - The color and its indicators
 * @returns Formatted DDS line with indicators in correct positions
 */
function createColorLineWithIndicators(colorWithIndicators: ColorWithIndicators): string {
    let line = '     A '; // Start with 'A' and spaces up to position 7

    // Add indicators
    for (let i = 0; i < 3; i++) {
        if (i < colorWithIndicators.indicators.length) {
            const indicator = colorWithIndicators.indicators[i].padStart(3, ' ');
            line += indicator;
        } else {
            line += '   '; // Three spaces if no indicator
        };
    };
    
    // Ensure line is long enough for the COLOR keyword (starts around position 44)
    while (line.length < 44) {
        line += ' ';
    };

    // Add the COLOR attribute
    line += `COLOR(${colorWithIndicators.color})`;

    return line;
};

/**
 * Removes existing color attributes from a DDS element.
 * Handles both inline colors (position 44+) and separate color lines.
 * @param editor - The active text editor
 * @param element - The DDS element to remove colors from
 */
async function removeColorsFromElement(editor: vscode.TextEditor, element: any): Promise<boolean> {
    const currentColors = getCurrentColorsForElement(element);
    if (currentColors.length === 0) return true;

    // Remove from the last line to the first: DDS allows other keywords (and, for a constant, its
    // own quoted value) to share a color's line(s), so removeKeywordTextFromLines strips just this
    // color's own text and re-flows whatever remains back onto as few lines as it now fits in —
    // which can itself delete or merge lines, shifting the line numbers of everything below it (but
    // never above). Working latest-to-earliest keeps every remaining color's own line index valid
    // when its turn comes, regardless of whether it's inline on the element's own definition line
    // or on a separate line below it.
    for (const color of [...currentColors].sort((a, b) => b.lineIndex! - a.lineIndex!)) {
        if (!(await removeWholeKeyword(editor, element, toKeywordValue(color)))) {
            return false;
        };
    };

    return true;
};
