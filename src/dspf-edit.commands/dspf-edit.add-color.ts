/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-color.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { isAttributeLine, findElementInsertionPoint } from '../dspf-edit.utils/dspf-edit.helper';
import { ExtensionState } from '../dspf-edit.states/state';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';

// INTERFACES AND TYPES

interface ColorWithIndicators {
    color: string;
    indicators: string[];
    lineIndex?: number; 
    isInlineColor?: boolean; 
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
        const editor = ExtensionState.lastDdsEditor;
        const document = editor?.document ?? ExtensionState.lastDdsDocument;
        if (!document || !editor) {
            vscode.window.showErrorMessage('No DDS editor found.');
            return;
        };

        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Colors can only be added to constants and fields.');
            return;
        };

        // Get current colors from the element (both inline and separate lines)
        const currentColors = getCurrentColorsForElement(editor, node.ddsElement);
        
        // Get available colors (excluding current ones)
        let availableColors = getAvailableColors(currentColors.map(c => c.color));

        // Show current colors if any exist
        if (currentColors.length > 0) {
            const currentColorsList = currentColors.map(c => 
                `${c.color}${c.indicators.length > 0 ? `(${c.indicators.join(',')})` : ''}`
            ).join(', ');
            
            const action = await vscode.window.showQuickPick(
                ['Add more colors', 'Replace all colors', 'Remove all colors'],
                {
                    title: `Current colors: ${currentColorsList}`,
                    placeHolder: 'Choose how to manage colors'
                }
            );

            if (!action) return;

            if (action === 'Remove all colors') {
                await removeColorsFromElement(editor, node.ddsElement);
                return;
            };

            if (action === 'Replace all colors') {
                await removeColorsFromElement(editor, node.ddsElement);
                // Continue to add new colors
                availableColors = getAvailableColors([]);
            };
            // If "Add more colors", continue with current logic
        };

        // Collect new colors to add
        const selectedColors = await collectColorsWithIndicatorsFromUser(availableColors);
        
        if (selectedColors.length === 0) {
            vscode.window.showInformationMessage('No colors selected.');
            return;
        };

        // Apply the selected colors to the element
        await addColorsToElement(editor, node.ddsElement, selectedColors);
        
        const colorsSummary = selectedColors.map(c => 
            `${c.color}${c.indicators.length > 0 ? `(${c.indicators.join(',')})` : ''}`
        ).join(', ');
        
        vscode.window.showInformationMessage(
            `Added colors ${colorsSummary} to ${node.ddsElement.name}.`
        );

    } catch (error) {
        console.error('Error managing colors:', error);
        vscode.window.showErrorMessage('An error occurred while managing colors.');
    };
};

// COLOR EXTRACTION FUNCTIONS

/**
 * Extracts current color attributes from a DDS element, checking both inline and separate lines.
 * @param editor - The active text editor
 * @param element - The DDS element (field or constant)
 * @returns Array of current colors with their location info
 */
function getCurrentColorsForElement(editor: vscode.TextEditor, element: any): ColorWithIndicators[] {
    const colors: ColorWithIndicators[] = [];
    const isConstant = element.kind === 'constant';

    // For fields, check if there's a color in the same line (position 44+)
    if (!isConstant) {
        const fieldLine = editor.document.lineAt(element.lineIndex);
        const fieldLineText = fieldLine.text;
        
        if (fieldLineText.length > 44) {
            const colorPart = fieldLineText.substring(44).trim();
            if (colorPart.includes('COLOR(')) {
                const colorMatch = colorPart.match(/COLOR\(([A-Z]{3})\)/);
                if (colorMatch) {
                    const indicators = parseIndicatorsFromLine(fieldLineText);
                    colors.push({
                        color: colorMatch[1],
                        indicators: indicators,
                        lineIndex: element.lineIndex,
                        isInlineColor: true
                    });
                };
            };
        };
    };

    // Check subsequent lines for additional colors
    const startLine = element.lineIndex + 1;
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;

        // Stop if we hit a non-attribute line
        if (!lineText.trim().startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };

        // Check if this is a COLOR attribute
        if (lineText.includes('COLOR(')) {
            const colorMatch = lineText.match(/COLOR\(([A-Z]{3})\)/);
            if (colorMatch) {
                const indicators = parseIndicatorsFromLine(lineText);
                colors.push({
                    color: colorMatch[1],
                    indicators: indicators,
                    lineIndex: i,
                    isInlineColor: false
                });
            };
        };
    };

    return colors;
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

// USER INTERACTION FUNCTIONS

/**
 * Collects colors with indicators from user through interactive selection.
 * @param availableColors - Array of colors available for selection
 * @returns Array of selected colors with indicators
 */
async function collectColorsWithIndicatorsFromUser(availableColors: string[]): Promise<ColorWithIndicators[]> {
    const selectedColors: ColorWithIndicators[] = [];
    let remainingColors = [...availableColors];

    while (remainingColors.length > 0) {
        const selectedColor = await vscode.window.showQuickPick(
            remainingColors,
            {
                title: `Add Color (${selectedColors.length} selected) - Press ESC to finish`,
                placeHolder: 'Select color from list'
            }
        );

        if (!selectedColor) break;

        // Collect indicators for this color
        const indicators = await collectIndicatorsForColor(selectedColor);
        
        selectedColors.push({
            color: selectedColor,
            indicators: indicators
        });
        
        remainingColors = remainingColors.filter(c => c !== selectedColor);
    };

    return selectedColors;
};

/**
 * Collects conditioning indicators for a specific color.
 * @param color - The color code (e.g., 'BLU', 'RED')
 * @returns Array of indicator codes (max 3)
 */
async function collectIndicatorsForColor(color: string): Promise<string[]> {
    const indicators: string[] = [];
    
    while (indicators.length < 3) {
        const indicatorInput = await vscode.window.showInputBox({
            title: `Indicators for COLOR(${color}) - ${indicators.length}/3 added`,
            prompt: `Enter indicator ${indicators.length + 1} (e.g., '50', 'N50', or leave empty to finish)`,
            placeHolder: 'Indicator (1-99, optional N prefix)',
            validateInput: (value: string) => {
                if (!value.trim()) return null; // Empty is OK to finish
                if (!/^N?[0-9]{1,2}$/.test(value.trim())) {
                    return 'Invalid indicator format. Use format like: 50, N50, 5, N99';
                }
                const num = parseInt(value.replace('N', ''));
                if (num < 1 || num > 99) {
                    return 'Indicator number must be between 1 and 99';
                }
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

        // Validate and add indicator
        indicators.push(trimmedInput.toUpperCase());
    };

    return indicators;
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
): Promise<void> {
    const isConstant = element.kind === 'constant';
    const numberOfAttributes = getNumberOfAttributesForElement(element);
    const workspaceEdit = new vscode.WorkspaceEdit();
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

    await vscode.workspace.applyEdit(workspaceEdit);
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
async function removeColorsFromElement(editor: vscode.TextEditor, element: any): Promise<void> {
    const currentColors = getCurrentColorsForElement(editor, element);
    if (currentColors.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;
    const isConstant = element.kind === 'constant';

    // Separate inline colors from line colors
    const inlineColors = currentColors.filter(color => color.isInlineColor);
    const lineColors = currentColors.filter(color => !color.isInlineColor);

    // Handle inline color removal (for fields)
    if (!isConstant && inlineColors.length > 0) {
        const fieldLine = document.lineAt(element.lineIndex);
        const fieldLineText = fieldLine.text;
        
        // Remove everything from position 44 onwards
        const truncatedLine = fieldLineText.substring(0, 44).trimRight();
        workspaceEdit.replace(uri, fieldLine.range, truncatedLine);
    };

    // Handle separate color lines removal
    if (lineColors.length > 0) {
        const colorLineIndices = lineColors.map(color => color.lineIndex!);
        const deletionRanges = calculateColorDeletionRanges(document, colorLineIndices);
        
        // Apply deletions in reverse order to maintain offsets
        for (let i = deletionRanges.length - 1; i >= 0; i--) {
            const { startOffset, endOffset } = deletionRanges[i];
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
        };
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Calculates precise deletion ranges for standalone color lines.
 * Handles edge cases to prevent blank lines at the end of the file.
 * @param document - The text document
 * @param colorLines - Array of line indices containing standalone colors
 * @returns Array of deletion ranges with start and end offsets
 */
function calculateColorDeletionRanges(
    document: vscode.TextDocument, 
    colorLines: number[]
): { startOffset: number; endOffset: number }[] {
    const docText = document.getText();
    const docLength = docText.length;
    const ranges: { startOffset: number; endOffset: number }[] = [];
    
    // Group consecutive lines for more efficient deletion
    const lineGroups = groupConsecutiveLines(colorLines);
    
    for (const group of lineGroups) {
        const firstLine = group[0];
        const lastLine = group[group.length - 1];
        
        let startOffset: number;
        let endOffset: number;
        
        if (lastLine === document.lineCount - 1) {
            // Group includes the last line of the document
            if (firstLine === 0) {
                // Entire document is color lines - delete everything
                startOffset = 0;
                endOffset = docLength;
            } else {
                // Delete from end of previous line to end of file
                const prevLineEndPos = document.lineAt(firstLine - 1).range.end;
                startOffset = document.offsetAt(prevLineEndPos);
                endOffset = docLength;
            };
        } else {
            // Group is in the middle or at the beginning
            startOffset = document.offsetAt(new vscode.Position(firstLine, 0));
            
            // Include the line break after the last line of the group
            const afterGroupPos = document.lineAt(lastLine).rangeIncludingLineBreak.end;
            endOffset = document.offsetAt(afterGroupPos);
        };
        
        // Validate the range
        if (startOffset < endOffset && startOffset >= 0 && endOffset <= docLength) {
            ranges.push({ startOffset, endOffset });
        };
    };
    
    return ranges;
};

/**
 * Groups consecutive line numbers together for more efficient batch deletion.
 * @param lines - Array of line indices (should be sorted)
 * @returns Array of arrays, where each sub-array contains consecutive line numbers
 */
function groupConsecutiveLines(lines: number[]): number[][] {
    if (lines.length === 0) return [];
    
    // Ensure lines are sorted
    const sortedLines = [...lines].sort((a, b) => a - b);
    const groups: number[][] = [];
    let currentGroup: number[] = [sortedLines[0]];
    
    for (let i = 1; i < sortedLines.length; i++) {
        const currentLine = sortedLines[i];
        const previousLine = sortedLines[i - 1];
        
        if (currentLine === previousLine + 1) {
            // Consecutive line - add to current group
            currentGroup.push(currentLine);
        } else {
            // Non-consecutive line - start new group
            groups.push(currentGroup);
            currentGroup = [currentLine];
        };
    };
    
    // Don't forget the last group
    groups.push(currentGroup);
    
    return groups;
};

// LINE CREATION AND DETECTION FUNCTIONS

/**
 * Finds existing color attribute lines for an element.
 * This function is kept for backward compatibility but the logic has been moved to getCurrentColorsForElement.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Array of line indices containing color attributes
 */
function findExistingColorLines(editor: vscode.TextEditor, element: any): number[] {
    const colors = getCurrentColorsForElement(editor, element);
    return colors.map(color => color.lineIndex!);
};

/**
 * Parses indicators from a DDS line at positions 7-9, 10-12, 13-15.
 * @param lineText - The DDS line text
 * @returns Array of indicator codes found
 */
function parseIndicatorsFromLine(lineText: string): string[] {
    const indicators: string[] = [];

    // Check positions 7-9, 10-12, 13-15 (0-based: 6-8, 9-11, 12-14)
    const positions = [6, 9, 12];

    for (const pos of positions) {
        if (lineText.length > pos + 2) {
            const indicator = lineText.substring(pos, pos + 3).trim();
            if (indicator && /^N?[0-9]{1,2}$/.test(indicator)) {
                indicators.push(indicator);
            };
        };
    };

    return indicators;
};
