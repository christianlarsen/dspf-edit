"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-color.ts
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.addColor = addColor;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
const dspf_edit_helper_1 = require("./dspf-edit.helper");
;
// COMMAND REGISTRATION
/**
 * Registers the add color command for DDS fields and constants.
 * Allows users to interactively manage color attributes and indicators for elements.
 * @param context - The VS Code extension context
 */
function addColor(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.add-color", async (node) => {
        await handleAddColorCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the add color command for a DDS field or constant.
 * Manages existing colors with indicators and allows adding/removing color attributes.
 * @param node - The DDS node containing the field or constant
 */
async function handleAddColorCommand(node) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        ;
        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Colors can only be added to constants and fields.');
            return;
        }
        ;
        // Get current colors from the element
        const currentColors = getCurrentColorsForElement(node.ddsElement);
        // Get available colors (excluding current ones)
        let availableColors = getAvailableColors(currentColors.map(c => c.color));
        // Show current colors if any exist
        if (currentColors.length > 0) {
            const currentColorsList = currentColors.map(c => `${c.color}${c.indicators.length > 0 ? `(${c.indicators.join(',')})` : ''}`).join(', ');
            const action = await vscode.window.showQuickPick(['Add more colors', 'Replace all colors', 'Remove all colors'], {
                title: `Current colors: ${currentColorsList}`,
                placeHolder: 'Choose how to manage colors'
            });
            if (!action)
                return;
            if (action === 'Remove all colors') {
                await removeColorsFromElement(editor, node.ddsElement);
                return;
            }
            ;
            if (action === 'Replace all colors') {
                await removeColorsFromElement(editor, node.ddsElement);
                // Continue to add new colors
                availableColors = getAvailableColors([]);
            }
            ;
            // If "Add more colors", continue with current logic
        }
        ;
        // Collect new colors to add
        const selectedColors = await collectColorsWithIndicatorsFromUser(availableColors);
        if (selectedColors.length === 0) {
            vscode.window.showInformationMessage('No colors selected.');
            return;
        }
        ;
        // Apply the selected colors to the element
        await addColorsToElement(editor, node.ddsElement, selectedColors);
        const colorsSummary = selectedColors.map(c => `${c.color}${c.indicators.length > 0 ? `(${c.indicators.join(',')})` : ''}`).join(', ');
        vscode.window.showInformationMessage(`Added colors ${colorsSummary} to ${node.ddsElement.name}.`);
    }
    catch (error) {
        console.error('Error managing colors:', error);
        vscode.window.showErrorMessage('An error occurred while managing colors.');
    }
    ;
}
;
// COLOR EXTRACTION FUNCTIONS
/**
 * Extracts current color attributes with indicators from a DDS element.
 * @param element - The DDS element (field or constant)
 * @returns Array of current colors with their indicators
 */
function getCurrentColorsForElement(element) {
    // Find the element in the fieldsPerRecords data
    const recordInfo = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo)
        return [];
    let elementNameWithoutQuotes = '';
    if (element.kind === 'constant') {
        elementNameWithoutQuotes = element.name.slice(1, -1);
    }
    else {
        elementNameWithoutQuotes = element.name;
    }
    ;
    // Look in both fields and constants
    const elementInfo = [
        ...recordInfo.fields,
        ...recordInfo.constants
    ].find(item => item.name === elementNameWithoutQuotes);
    if (!elementInfo || !elementInfo.attributes)
        return [];
    // Extract COLOR attributes with indicators
    const colors = [];
    if (elementInfo) {
        elementInfo.attributes.forEach(attr => {
            const colorMatch = attr.match(/^COLOR\(([A-Z]{3})\)$/);
            if (colorMatch) {
                colors.push({
                    color: colorMatch[1],
                    indicators: []
                });
            }
        });
    }
    ;
    return colors;
}
;
/**
 * Gets available colors excluding those already selected.
 * @param currentColors - Array of currently selected color codes
 * @returns Array of available colors
 */
function getAvailableColors(currentColors) {
    const allColors = ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'WHT', 'YLW'];
    return allColors.filter(color => !currentColors.includes(color));
}
;
// USER INTERACTION FUNCTIONS
/**
 * Collects colors with indicators from user through interactive selection.
 * @param availableColors - Array of colors available for selection
 * @returns Array of selected colors with indicators
 */
async function collectColorsWithIndicatorsFromUser(availableColors) {
    const selectedColors = [];
    let remainingColors = [...availableColors];
    while (remainingColors.length > 0) {
        const selectedColor = await vscode.window.showQuickPick(remainingColors, {
            title: `Add Color (${selectedColors.length} selected) - Press ESC to finish`,
            placeHolder: 'Select color from list'
        });
        if (!selectedColor)
            break;
        // Collect indicators for this color
        const indicators = await collectIndicatorsForColor(selectedColor);
        selectedColors.push({
            color: selectedColor,
            indicators: indicators
        });
        remainingColors = remainingColors.filter(c => c !== selectedColor);
    }
    ;
    return selectedColors;
}
;
/**
 * Collects conditioning indicators for a specific color.
 * @param color - The color code (e.g., 'BLU', 'RED')
 * @returns Array of indicator codes (max 3)
 */
async function collectIndicatorsForColor(color) {
    const indicators = [];
    while (indicators.length < 3) {
        const indicatorInput = await vscode.window.showInputBox({
            title: `Indicators for COLOR(${color}) - ${indicators.length}/3 added`,
            prompt: `Enter indicator ${indicators.length + 1} (e.g., '50', 'N50', or leave empty to finish)`,
            placeHolder: 'Indicator (1-99, optional N prefix)',
            validateInput: (value) => {
                if (!value.trim())
                    return null; // Empty is OK to finish
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
        }
        ;
        const trimmedInput = indicatorInput.trim();
        if (!trimmedInput) {
            // User finished entering indicators
            break;
        }
        ;
        // Validate and add indicator
        indicators.push(trimmedInput.toUpperCase());
    }
    ;
    return indicators;
}
;
// DDS MODIFICATION FUNCTIONS
/**
 * Adds color attributes with indicators to a DDS element by inserting COLOR lines after the element.
 * @param editor - The active text editor
 * @param element - The DDS element to add colors to
 * @param colors - Array of colors with indicators to add
 */
async function addColorsToElement(editor, element, colors) {
    const insertionPoint = (0, dspf_edit_helper_1.findElementInsertionPoint)(editor, element);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for color attributes');
    }
    ;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    // Insert each color line
    let crInserted = false;
    for (let i = 0; i < colors.length; i++) {
        const attributeLine = createColorLineWithIndicators(colors[i]);
        const insertPos = new vscode.Position(insertionPoint, 0); // +i ???
        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        }
        ;
        workspaceEdit.insert(uri, insertPos, attributeLine);
        if (i < colors.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        }
        ;
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Creates a DDS color line with conditioning indicators.
 * @param colorWithIndicators - The color and its indicators
 * @returns Formatted DDS line with indicators in correct positions
 */
function createColorLineWithIndicators(colorWithIndicators) {
    let line = '     A '; // Start with 'A' and spaces up to position 7
    // Add indicators
    for (let i = 0; i < 3; i++) {
        if (i < colorWithIndicators.indicators.length) {
            const indicator = colorWithIndicators.indicators[i].padStart(3, ' ');
            line += indicator;
        }
        else {
            line += '   '; // Three spaces if no indicator
        }
        ;
    }
    ;
    // Ensure line is long enough for the COLOR keyword (starts around position 45)
    while (line.length < 44) {
        line += ' ';
    }
    ;
    // Add the COLOR attribute
    line += `COLOR(${colorWithIndicators.color})`;
    return line;
}
;
/**
 * Removes existing color attributes from a DDS element using precise character offsets.
 * Handles edge cases properly to avoid leaving blank lines at the end of the file.
 * @param editor - The active text editor
 * @param element - The DDS element to remove colors from
 */
async function removeColorsFromElement(editor, element) {
    const colorLines = findExistingColorLines(editor, element);
    if (colorLines.length === 0)
        return;
    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;
    // Group lines by type: element line vs standalone color lines
    const elementLineIndex = element.lineIndex;
    const standaloneColorLines = colorLines.filter(lineIndex => lineIndex !== elementLineIndex);
    const hasElementLineColor = colorLines.includes(elementLineIndex);
    // Handle standalone color lines using precise offsets
    if (standaloneColorLines.length > 0) {
        const deletionRanges = calculateColorDeletionRanges(document, standaloneColorLines);
        // Apply deletions in reverse order to maintain offsets
        for (let i = deletionRanges.length - 1; i >= 0; i--) {
            const { startOffset, endOffset } = deletionRanges[i];
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
        }
        ;
    }
    ;
    // Handle color on element line (just remove the color part)
    if (hasElementLineColor) {
        const line = document.lineAt(elementLineIndex);
        workspaceEdit.replace(uri, new vscode.Range(line.range.start.translate(0, 44), line.range.end), "");
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Calculates precise deletion ranges for standalone color lines.
 * Handles edge cases to prevent blank lines at the end of the file.
 * @param document - The text document
 * @param colorLines - Array of line indices containing standalone colors
 * @returns Array of deletion ranges with start and end offsets
 */
function calculateColorDeletionRanges(document, colorLines) {
    const docText = document.getText();
    const docLength = docText.length;
    const ranges = [];
    // Group consecutive lines for more efficient deletion
    const lineGroups = groupConsecutiveLines(colorLines);
    for (const group of lineGroups) {
        const firstLine = group[0];
        const lastLine = group[group.length - 1];
        let startOffset;
        let endOffset;
        if (lastLine === document.lineCount - 1) {
            // Group includes the last line of the document
            if (firstLine === 0) {
                // Entire document is color lines - delete everything
                startOffset = 0;
                endOffset = docLength;
            }
            else {
                // Delete from end of previous line to end of file
                const prevLineEndPos = document.lineAt(firstLine - 1).range.end;
                startOffset = document.offsetAt(prevLineEndPos);
                endOffset = docLength;
            }
            ;
        }
        else {
            // Group is in the middle or at the beginning
            startOffset = document.offsetAt(new vscode.Position(firstLine, 0));
            // Include the line break after the last line of the group
            const afterGroupPos = document.lineAt(lastLine).rangeIncludingLineBreak.end;
            endOffset = document.offsetAt(afterGroupPos);
        }
        ;
        // Validate the range
        if (startOffset < endOffset && startOffset >= 0 && endOffset <= docLength) {
            ranges.push({ startOffset, endOffset });
        }
        ;
    }
    ;
    return ranges;
}
;
/**
 * Groups consecutive line numbers together for more efficient batch deletion.
 * @param lines - Array of line indices (should be sorted)
 * @returns Array of arrays, where each sub-array contains consecutive line numbers
 */
function groupConsecutiveLines(lines) {
    if (lines.length === 0)
        return [];
    // Ensure lines are sorted
    const sortedLines = [...lines].sort((a, b) => a - b);
    const groups = [];
    let currentGroup = [sortedLines[0]];
    for (let i = 1; i < sortedLines.length; i++) {
        const currentLine = sortedLines[i];
        const previousLine = sortedLines[i - 1];
        if (currentLine === previousLine + 1) {
            // Consecutive line - add to current group
            currentGroup.push(currentLine);
        }
        else {
            // Non-consecutive line - start new group
            groups.push(currentGroup);
            currentGroup = [currentLine];
        }
        ;
    }
    ;
    // Don't forget the last group
    groups.push(currentGroup);
    return groups;
}
;
// LINE CREATION AND DETECTION FUNCTIONS
/**
 * Finds existing color attribute lines for an element.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Array of line indices containing color attributes
 */
function findExistingColorLines(editor, element) {
    const colorLines = [];
    const isConstant = element.kind === 'constant';
    const startLine = isConstant ? element.lineIndex + 1 : element.lineIndex;
    // Look for COLOR attribute lines after the element
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        // Special case: first line of a field can have attributes
        if (i === element.lineIndex && !isConstant) {
            if (lineText.includes('COLOR(')) {
                colorLines.push(i);
            }
            ;
            continue;
        }
        ;
        if (!lineText.trim().startsWith('A ') || !(0, dspf_edit_helper_1.isAttributeLine)(lineText)) {
            break;
        }
        ;
        // Check if this is a COLOR attribute
        if (lineText.includes('COLOR(')) {
            colorLines.push(i);
        }
        ;
    }
    ;
    return colorLines;
}
;
/**
 * Parses indicators from a DDS line at positions 7-9, 10-12, 13-15.
 * @param lineText - The DDS line text
 * @returns Array of indicator codes found
 */
function parseIndicatorsFromLine(lineText) {
    const indicators = [];
    // Check positions 7-9, 10-12, 13-15 (0-based: 6-8, 9-11, 12-14)
    const positions = [6, 9, 12];
    for (const pos of positions) {
        if (lineText.length > pos + 2) {
            const indicator = lineText.substring(pos, pos + 3).trim();
            if (indicator && /^N?[0-9]{1,2}$/.test(indicator)) {
                indicators.push(indicator);
            }
            ;
        }
        ;
    }
    ;
    return indicators;
}
;
//# sourceMappingURL=dspf-edit.add-color.js.map