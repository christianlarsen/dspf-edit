"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-indicators.ts
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
exports.addIndicators = addIndicators;
const vscode = __importStar(require("vscode"));
;
;
// COMMAND REGISTRATION
/**
 * Registers the manage indicators command for DDS fields and constants (and attributes of them)
 * Allows users to interactively manage conditioning indicators for elements.
 * Limited to maximum 3 indicators per field.
 * @param context - The VS Code extension context
 */
function addIndicators(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.add-indicators", async (node) => {
        await handleAddIndicatorsCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the manage indicators command for a DDS field or constant (and attributes of them)
 * Manages existing indicators and allows adding/removing/modifying indicators.
 * Limited to maximum 3 indicators per field (positions 8-16 in DDS).
 * @param node - The DDS node containing the field or constant
 */
async function handleAddIndicatorsCommand(node) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        ;
        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field' &&
            node.ddsElement.kind !== 'constantAttribute' && node.ddsElement.kind !== 'fieldAttribute') {
            vscode.window.showWarningMessage('Indicators can only be managed for constants, fields or their attributes');
            return;
        }
        ;
        // Special handling for inline field attributes
        if (node.ddsElement.kind === 'fieldAttribute') {
            const inlineInfo = getInlineAttributeInfo(editor, node.ddsElement);
            if (inlineInfo.isInline) {
                await handleInlineAttributeIndicators(editor, node.ddsElement, inlineInfo);
                return;
            }
            ;
        }
        ;
        // Get current indicators from the element
        const currentIndicators = getCurrentIndicatorsForElement(editor, node.ddsElement);
        // Show current indicators if any exist
        let action;
        if (currentIndicators.length > 0) {
            const currentIndicatorsSummary = formatIndicatorsSummary(currentIndicators);
            action = await vscode.window.showQuickPick(['Add more indicators', 'Replace all indicators', 'Remove all indicators', 'Modify existing indicators'], {
                title: `Current indicators: ${currentIndicatorsSummary}`,
                placeHolder: 'Choose how to manage indicators'
            });
            if (!action)
                return;
            if (action === 'Remove all indicators') {
                await removeIndicatorsFromElement(editor, node.ddsElement);
                (node.ddsElement.kind === 'constant' || node.ddsElement.kind === 'field') ?
                    vscode.window.showInformationMessage(`Removed all indicators from ${node.ddsElement.name}.`) :
                    vscode.window.showInformationMessage(`Removed all indicators from attribute.`);
                return;
            }
            ;
            if (action === 'Replace all indicators') {
                await removeIndicatorsFromElement(editor, node.ddsElement);
                // Continue to add new indicators
            }
            ;
            if (action === 'Modify existing indicators') {
                await modifyExistingIndicators(editor, node.ddsElement, currentIndicators);
                return;
            }
            ;
            if (action === 'Add more indicators' && currentIndicators.length >= 3) {
                vscode.window.showWarningMessage('Maximum of 3 indicators per field reached.');
                return;
            }
            ;
        }
        ;
        // Collect new indicators to add
        const maxNewIndicators = 3 - (action === 'Add more indicators' ? currentIndicators.length : 0);
        const newIndicators = await collectIndicatorsFromUser(maxNewIndicators);
        if (newIndicators.length === 0) {
            vscode.window.showInformationMessage('No indicators selected.');
            return;
        }
        ;
        // Combine with existing indicators if adding more
        const allIndicators = action === 'Add more indicators' ? [...currentIndicators, ...newIndicators] : newIndicators;
        // Apply the selected indicators to the element
        await setIndicatorsForElement(editor, node.ddsElement, allIndicators);
        const indicatorsSummary = formatIndicatorsSummary(allIndicators);
        const actionText = action === 'Add more indicators' ? 'Added' : 'Set';
        vscode.window.showInformationMessage((node.ddsElement.kind === 'constant' || node.ddsElement.kind === 'field') ?
            `${actionText} indicators ${indicatorsSummary} for ${node.ddsElement.name}.` :
            `${actionText} indicators ${indicatorsSummary} for attribute`);
    }
    catch (error) {
        console.error('Error managing indicators:', error);
        vscode.window.showErrorMessage('An error occurred while managing indicators.');
    }
    ;
}
;
// INLINE ATTRIBUTE HANDLING
/**
 * Gets information about inline attributes for field attributes.
 * @param editor - The active text editor
 * @param element - The field attribute element
 * @returns Inline attribute information
 */
function getInlineAttributeInfo(editor, element) {
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
        }
        ;
    }
    ;
    return {
        attributeText: '',
        fieldLineIndex: fieldLineIndex,
        isInline: false
    };
}
;
/**
 * Handles indicators for inline field attributes by moving them to separate lines.
 * @param editor - The active text editor
 * @param element - The field attribute element
 * @param inlineInfo - Information about the inline attribute
 */
async function handleInlineAttributeIndicators(editor, element, inlineInfo) {
    // Inform the user about what will happen
    const proceed = await vscode.window.showWarningMessage('To add indicators to this attribute, it must be moved to a separate line. The attribute will no longer be inline with the field.', 'Continue', 'Cancel');
    if (proceed !== 'Continue')
        return;
    // Get indicators to add
    const indicators = await collectIndicatorsFromUser(3);
    if (indicators.length === 0) {
        vscode.window.showInformationMessage('No indicators selected.');
        return;
    }
    ;
    // Move the attribute to a separate line with indicators
    await moveInlineAttributeToSeparateLine(editor, inlineInfo, indicators);
    const indicatorsSummary = formatIndicatorsSummary(indicators);
    vscode.window.showInformationMessage(`Moved attribute to separate line and added indicators: ${indicatorsSummary}`);
}
;
/**
 * Moves an inline attribute to a separate line with indicators.
 * @param editor - The active text editor
 * @param inlineInfo - Information about the inline attribute
 * @param indicators - Indicators to add to the attribute
 */
async function moveInlineAttributeToSeparateLine(editor, inlineInfo, indicators) {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const fieldLineIndex = inlineInfo.fieldLineIndex;
    // 1. Remove the attribute from the field line (truncate at position 44)
    const fieldLine = editor.document.lineAt(fieldLineIndex);
    const fieldLineText = fieldLine.text;
    const truncatedFieldLine = fieldLineText.substring(0, 44).trimRight();
    workspaceEdit.replace(uri, fieldLine.range, truncatedFieldLine);
    // 2. Create new attribute line with indicators
    const attributeLine = createAttributeLineWithIndicators(inlineInfo.attributeText, indicators);
    const insertPos = new vscode.Position(fieldLineIndex + 1, 0);
    // Check if we need to add a newline at the end of the file
    if (insertPos.line >= editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPos, '\n');
    }
    ;
    workspaceEdit.insert(uri, insertPos, attributeLine);
    // Add newline after the attribute if we're not at the end
    if (insertPos.line < editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPos, '\n');
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Creates an attribute line with indicators.
 * @param attributeText - The attribute text (e.g., 'DSPATR(HI)', 'COLOR(RED)')
 * @param indicators - The indicators to add
 * @returns Formatted DDS line with attribute and indicators
 */
function createAttributeLineWithIndicators(attributeText, indicators) {
    let line = '     A '; // Start with 'A' and spaces up to position 7
    // Add indicators in positions 8-16 (0-based: 7-15)
    for (let i = 0; i < 3; i++) {
        const startPos = 7 + (i * 3);
        if (i < indicators.length) {
            const indicator = indicators[i];
            const indicatorText = (indicator.isNegated ? 'N' : ' ') + indicator.value.padStart(2, '0');
            line += indicatorText;
        }
        else {
            line += '   '; // Three spaces if no indicator
        }
        ;
    }
    ;
    // Pad to position 44
    while (line.length < 44) {
        line += ' ';
    }
    ;
    // Add the attribute
    line += attributeText;
    return line;
}
;
// INDICATORS EXTRACTION FUNCTIONS
/**
 * Extracts current indicators from a DDS element.
 * Only looks at the main element line (no continuation lines).
 * @param editor - The active text editor
 * @param element - The DDS element (field or constant)
 * @returns Array of current indicators
 */
function getCurrentIndicatorsForElement(editor, element) {
    const elementLineIndex = element.lineIndex;
    const lineText = editor.document.lineAt(elementLineIndex).text;
    return parseIndicatorsFromLine(lineText);
}
;
/**
 * Formats indicators into a readable summary string.
 * @param indicators - Array of indicators
 * @returns Formatted summary string
 */
function formatIndicatorsSummary(indicators) {
    if (indicators.length === 0)
        return 'None';
    return indicators.map(ind => `${ind.isNegated ? 'N' : ''}${ind.value}`).join(', ');
}
;
// USER INTERACTION FUNCTIONS
/**
 * Collects indicators from user through interactive selection.
 * Limited to maximum 3 indicators total.
 * @param maxIndicators - Maximum number of indicators that can be added
 * @returns Array of selected indicators
 */
async function collectIndicatorsFromUser(maxIndicators = 3) {
    const indicators = [];
    while (indicators.length < maxIndicators) {
        const indicatorInput = await vscode.window.showInputBox({
            title: `Add Indicator ${indicators.length + 1}/${maxIndicators} (Press ESC to finish)`,
            prompt: `Enter indicator (e.g., '50', 'N50', '01', 'N99', or leave empty to finish)`,
            placeHolder: 'Indicator (01-99, optional N prefix)',
            validateInput: (value) => {
                if (!value.trim())
                    return null; // Empty is OK to finish
                if (!/^N?([0-9]{1,2})$/.test(value.trim())) {
                    return 'Invalid indicator format. Use format like: 50, N50, 01, N99';
                }
                ;
                const num = parseInt(value.replace(/^N/, ''));
                if (num < 1 || num > 99) {
                    return 'Indicator number must be between 01 and 99';
                }
                ;
                // Check for duplicates
                const cleanValue = value.trim().toUpperCase();
                if (indicators.some(ind => ind.indicator === cleanValue)) {
                    return 'This indicator is already added';
                }
                ;
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
        // Parse indicator
        const isNegated = trimmedInput.startsWith('N');
        const value = trimmedInput.replace(/^N/, '').padStart(2, '0');
        indicators.push({
            position: indicators.length + 1,
            indicator: trimmedInput.toUpperCase(),
            isNegated,
            value
        });
    }
    ;
    return indicators;
}
;
/**
 * Modifies existing indicators for an element.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @param currentIndicators - Current indicators
 */
async function modifyExistingIndicators(editor, element, currentIndicators) {
    const indicatorChoices = currentIndicators.map((indicator, index) => `Position ${index + 1}: ${indicator.isNegated ? 'N' : ''}${indicator.value}`);
    const selectedIndicator = await vscode.window.showQuickPick([...indicatorChoices, 'Add new indicator', 'Clear all and start over'], {
        title: 'Select indicator to modify',
        placeHolder: 'Choose an indicator to modify or select an action'
    });
    if (!selectedIndicator)
        return;
    if (selectedIndicator === 'Clear all and start over') {
        await removeIndicatorsFromElement(editor, element);
        const newIndicators = await collectIndicatorsFromUser(3);
        if (newIndicators.length > 0) {
            await setIndicatorsForElement(editor, element, newIndicators);
        }
        ;
    }
    else if (selectedIndicator === 'Add new indicator') {
        if (currentIndicators.length >= 3) {
            vscode.window.showWarningMessage('Maximum of 3 indicators per field reached.');
            return;
        }
        ;
        const newIndicators = await collectIndicatorsFromUser(3 - currentIndicators.length);
        if (newIndicators.length > 0) {
            const allIndicators = [...currentIndicators, ...newIndicators];
            await setIndicatorsForElement(editor, element, allIndicators);
        }
        ;
    }
    else {
        const indicatorIndex = indicatorChoices.indexOf(selectedIndicator);
        if (indicatorIndex >= 0) {
            const action = await vscode.window.showQuickPick(['Change indicator value', 'Remove this indicator'], {
                title: `Modify: ${selectedIndicator}`,
                placeHolder: 'Choose action'
            });
            if (action === 'Remove this indicator') {
                const newIndicators = currentIndicators.filter((_, index) => index !== indicatorIndex);
                await setIndicatorsForElement(editor, element, newIndicators);
                vscode.window.showInformationMessage('Indicator removed.');
            }
            else if (action === 'Change indicator value') {
                const newValue = await vscode.window.showInputBox({
                    title: `Change indicator at position ${indicatorIndex + 1}`,
                    prompt: `Enter new indicator value (e.g., '50', 'N50', '01', 'N99')`,
                    value: currentIndicators[indicatorIndex].indicator,
                    validateInput: (value) => {
                        if (!value.trim())
                            return 'Indicator value is required';
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
                    currentIndicators[indicatorIndex] = {
                        position: indicatorIndex + 1,
                        indicator: newValue.toUpperCase(),
                        isNegated,
                        value
                    };
                    await setIndicatorsForElement(editor, element, currentIndicators);
                    vscode.window.showInformationMessage('Indicator updated.');
                }
                ;
            }
            ;
        }
        ;
    }
    ;
}
;
// DDS MODIFICATION FUNCTIONS
/**
 * Sets indicators for a DDS element by modifying the element line.
 * @param editor - The active text editor
 * @param element - The DDS element to set indicators for
 * @param indicators - Array of indicators to set (max 3)
 */
async function setIndicatorsForElement(editor, element, indicators) {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const elementLineIndex = element.lineIndex;
    // Modify the element line with new indicators
    const elementLine = editor.document.lineAt(elementLineIndex);
    const newLine = setIndicatorsOnLine(elementLine.text, indicators);
    workspaceEdit.replace(uri, elementLine.range, newLine);
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Removes all indicators from a DDS element.
 * @param editor - The active text editor
 * @param element - The DDS element to remove indicators from
 */
async function removeIndicatorsFromElement(editor, element) {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const elementLineIndex = element.lineIndex;
    // Remove indicators from the main element line
    const elementLine = editor.document.lineAt(elementLineIndex);
    const cleanedLine = removeIndicatorsFromLine(elementLine.text);
    workspaceEdit.replace(uri, elementLine.range, cleanedLine);
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
// LINE CREATION AND PARSING FUNCTIONS
/**
 * Sets indicators on a DDS line, replacing any existing indicators.
 * @param lineText - The existing line text
 * @param indicators - The indicators to set (max 3)
 * @returns Modified line text
 */
function setIndicatorsOnLine(lineText, indicators) {
    let line = lineText.padEnd(80, ' ');
    // Clear existing indicators first (positions 7-16, 0-based: 6-15)
    line = line.substring(0, 6) + '          ' + line.substring(16);
    // Set new indicators in positions 8-16 (0-based: 7-15)
    for (let i = 0; i < Math.min(indicators.length, 3); i++) {
        const startPos = 7 + (i * 3); // Positions 8-10, 11-13, 14-16 (0-based: 7-9, 10-12, 13-15)
        const indicator = indicators[i];
        const indicatorText = (indicator.isNegated ? 'N' : ' ') + indicator.value.padStart(2, '0');
        if (line.length > startPos + 2) {
            line = line.substring(0, startPos) + indicatorText + line.substring(startPos + 3);
        }
        ;
    }
    ;
    return line.trimEnd();
}
;
/**
 * Removes indicators from a DDS line.
 * @param lineText - The line text to clean
 * @returns Cleaned line text
 */
function removeIndicatorsFromLine(lineText) {
    if (lineText.length < 17)
        return lineText;
    // Clear positions 7-16 (condition and indicators, 0-based: 6-15)
    return (lineText.substring(0, 6) + '          ' + lineText.substring(16)).trimEnd();
}
;
/**
 * Parses indicators from a DDS line.
 * @param lineText - The DDS line text
 * @returns Array of parsed indicators
 */
function parseIndicatorsFromLine(lineText) {
    const indicators = [];
    if (lineText.length < 17)
        return indicators;
    // Parse positions 8-16 (0-based: 7-15)
    for (let i = 0; i < 3; i++) {
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
            }
            ;
        }
        ;
    }
    ;
    return indicators;
}
;
// HELPER FUNCTIONS
/**
 * Checks if a DDS line has available space for indicator conditioning.
 * @param lineText - The DDS line text
 * @returns True if there's space for indicators
 */
function hasAvailableIndicatorSpace(lineText) {
    if (lineText.length < 17)
        return true;
    // Check if positions 7-16 are empty or contain only spaces (0-based: 6-15)
    const conditionArea = lineText.substring(6, 16);
    return conditionArea.trim() === '';
}
;
//# sourceMappingURL=dspf-edit.add-indicators.js.map