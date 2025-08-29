/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-attribute.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { isAttributeLine, findElementInsertionPoint } from './dspf-edit.helper';
 
// INTERFACES AND TYPES

interface AttributeWithIndicators {
    attribute: string;
    indicators: string[];
    lineIndex?: number; 
    isInlineAttribute?: boolean; 
};

// COMMAND REGISTRATION

/**
 * Registers the add attribute command for DDS fields and constants.
 * Allows users to interactively manage attributes for elements.
 * @param context - The VS Code extension context
 */
export function addAttribute(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-attribute", async (node: DdsNode) => {
            await handleAddAttributeCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add attribute command for a DDS field or constant.
 * Manages existing attributes with indicators and allows adding/removing attributes.
 * @param node - The DDS node containing the field or constant
 */
async function handleAddAttributeCommand(node: DdsNode): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        };

        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Attributes can only be added to constants and fields.');
            return;
        };

        // Get current attributes from the element (both inline and separate lines)
        const currentAttributes = getCurrentAttributesForElement(editor, node.ddsElement);

        // Get available attributes (excluding current ones)
        let availableAttributes = getAvailableAttributes(currentAttributes.map(a => a.attribute));

        // Show current attributes if any exist
        if (currentAttributes.length > 0) {
            const currentAttributesList = currentAttributes.map(a =>
                `${a.attribute}${a.indicators.length > 0 ? `(${a.indicators.join(',')})` : ''}`
            ).join(', ');

            const action = await vscode.window.showQuickPick(
                ['Add more attributes', 'Replace all attributes', 'Remove all attributes'],
                {
                    title: `Current attributes: ${currentAttributesList}`,
                    placeHolder: 'Choose how to manage attributes'
                }
            );

            if (!action) return;

            if (action === 'Remove all attributes') {
                await removeAttributesFromElement(editor, node.ddsElement);
                return;
            };

            if (action === 'Replace all attributes') {
                await removeAttributesFromElement(editor, node.ddsElement);
                // Continue to add new attributes
                availableAttributes = getAvailableAttributes([]);
            };
            // If "Add more attributes", continue with current logic
        };

        // Collect new attributes to add
        const selectedAttributes = await collectAttributesWithIndicatorsFromUser(availableAttributes);

        if (selectedAttributes.length === 0) {
            vscode.window.showInformationMessage('No attributes selected.');
            return;
        };

        // Apply the selected attributes to the element
        await addAttributesToElement(editor, node.ddsElement, selectedAttributes);

        const attributesSummary = selectedAttributes.map(a =>
            `${a.attribute}${a.indicators.length > 0 ? `(${a.indicators.join(',')})` : ''}`
        ).join(', ');

        vscode.window.showInformationMessage(
            `Added attributes ${attributesSummary} to ${node.ddsElement.name}.`
        );

    } catch (error) {
        console.error('Error managing attributes:', error);
        vscode.window.showErrorMessage('An error occurred while managing attributes.');
    };
};

// ATTRIBUTES EXTRACTION FUNCTIONS

/**
 * Extracts current attributes from a DDS element, checking both inline and separate lines.
 * @param editor - The active text editor
 * @param element - The DDS element (field or constant)
 * @returns Array of current attributes with their location info
 */
function getCurrentAttributesForElement(editor: vscode.TextEditor, element: any): AttributeWithIndicators[] {
    const attributes: AttributeWithIndicators[] = [];
    const isConstant = element.kind === 'constant';

    // For fields, check if there's an attribute in the same line (position 44+)
    if (!isConstant) {
        const fieldLine = editor.document.lineAt(element.lineIndex);
        const fieldLineText = fieldLine.text;
        
        if (fieldLineText.length > 44) {
            const attributePart = fieldLineText.substring(44).trim();
            if (attributePart.includes('DSPATR(')) {
                const attributeMatch = attributePart.match(/DSPATR\(([A-Z]{2})\)/);
                if (attributeMatch) {
                    const indicators = parseIndicatorsFromLine(fieldLineText);
                    attributes.push({
                        attribute: attributeMatch[1],
                        indicators: indicators,
                        lineIndex: element.lineIndex,
                        isInlineAttribute: true
                    });
                };
            };
        };
    };

    // Check subsequent lines for additional attributes
    const startLine = element.lineIndex + 1;
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;

        // Stop if we hit a non-attribute line
        if (!lineText.trim().startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };

        // Check if this is a DSPATR attribute
        if (lineText.includes('DSPATR(')) {
            const attributeMatch = lineText.match(/DSPATR\(([A-Z]{2})\)/);
            if (attributeMatch) {
                const indicators = parseIndicatorsFromLine(lineText);
                attributes.push({
                    attribute: attributeMatch[1],
                    indicators: indicators,
                    lineIndex: i,
                    isInlineAttribute: false
                });
            };
        };
    };

    return attributes;
};

/**
 * Gets available attributes excluding those already selected.
 * @param currentAttributes - Array of currently selected attributes
 * @returns Array of available attributes
 */
function getAvailableAttributes(currentAttributes: string[]): string[] {
    const allAttributes: string[] = ['HI', 'RI', 'CS', 'BL', 'ND', 'UL', 'PC', 'PR'];
    return allAttributes.filter(attribute => !currentAttributes.includes(attribute));
};

// USER INTERACTION FUNCTIONS

/**
 * Collects attributes with indicators from user through interactive selection.
 * @param availableAttributes - Array of attributes available for selection
 * @returns Array of selected attributes with indicators
 */
async function collectAttributesWithIndicatorsFromUser(availableAttributes: string[]): Promise<AttributeWithIndicators[]> {
    const selectedAttributes: AttributeWithIndicators[] = [];
    let remainingAttributes = [...availableAttributes];

    while (remainingAttributes.length > 0) {
        const selectedAttribute = await vscode.window.showQuickPick(
            remainingAttributes,
            {
                title: `Add Attribute (${selectedAttributes.length} selected) - Press ESC to finish`,
                placeHolder: 'Select attribute from list'
            }
        );

        if (!selectedAttribute) break;

        // Collect indicators for this attribute
        const indicators = await collectIndicatorsForAttribute(selectedAttribute);

        selectedAttributes.push({
            attribute: selectedAttribute,
            indicators: indicators
        });

        remainingAttributes = remainingAttributes.filter(c => c !== selectedAttribute);
    };

    return selectedAttributes;
};

/**
 * Collects conditioning indicators for a specific attribute.
 * @param attribute - The attribute code (e.g., 'HI', 'RI')
 * @returns Array of indicator codes (max 3)
 */
async function collectIndicatorsForAttribute(attribute: string): Promise<string[]> {
    const indicators: string[] = [];

    while (indicators.length < 3) {
        const indicatorInput = await vscode.window.showInputBox({
            title: `Indicators for DSPATR(${attribute}) - ${indicators.length}/3 added`,
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

// Modifica la función addAttributesToElement:

async function addAttributesToElement(
    editor: vscode.TextEditor,
    element: any,
    attributes: AttributeWithIndicators[]
): Promise<void> {
    const isConstant = element.kind === 'constant';
    const currentAttributes = getCurrentAttributesForElement(editor, element);
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Para campos: solo agregar inline si NO hay atributos existentes Y el primer atributo NO tiene indicadores
    if (!isConstant && currentAttributes.length === 0 && attributes.length > 0) {
        const firstAttribute = attributes[0];
        
        // Solo agregar inline si el atributo NO tiene indicadores
        if (firstAttribute.indicators.length === 0) {
            // Add first attribute inline (position 44+)
            const fieldLine = editor.document.lineAt(element.lineIndex);
            const fieldLineText = fieldLine.text;
            
            // Ensure the line has at least 44 characters
            const paddedLine = fieldLineText.padEnd(44, ' ');
            const firstAttributeText = createInlineAttributeText(firstAttribute);
            
            // Replace the entire line with the padded line + first attribute
            workspaceEdit.replace(
                uri,
                fieldLine.range,
                paddedLine + firstAttributeText
            );

            // Add remaining attributes as separate lines if any
            if (attributes.length > 1) {
                const insertionPoint = findElementInsertionPoint(editor, element);
                if (insertionPoint === -1) {
                    throw new Error('Could not find insertion point for additional attributes');
                };

                let crInserted: boolean = false;
                for (let i = 1; i < attributes.length; i++) {
                    const attributeLine = createAttributeLineWithIndicators(attributes[i]);
                    const insertPos = new vscode.Position(insertionPoint, 0);
                    if (!crInserted && insertPos.line >= editor.document.lineCount) {
                        workspaceEdit.insert(uri, insertPos, '\n');
                        crInserted = true;
                    };
                    workspaceEdit.insert(uri, insertPos, attributeLine);
                    if (i < attributes.length - 1 || insertPos.line < editor.document.lineCount) {
                        workspaceEdit.insert(uri, insertPos, '\n');
                    };
                };
            };
        } else {
            // Si el primer atributo tiene indicadores, todos van en líneas separadas
            const insertionPoint = findElementInsertionPoint(editor, element);
            if (insertionPoint === -1) {
                throw new Error('Could not find insertion point for attributes');
            };

            let crInserted: boolean = false;
            for (let i = 0; i < attributes.length; i++) {
                const attributeLine = createAttributeLineWithIndicators(attributes[i]);
                const insertPos = new vscode.Position(insertionPoint, 0);
                if (!crInserted && insertPos.line >= editor.document.lineCount) {
                    workspaceEdit.insert(uri, insertPos, '\n');
                    crInserted = true;
                };
                workspaceEdit.insert(uri, insertPos, attributeLine);
                if (i < attributes.length - 1 || insertPos.line < editor.document.lineCount) {
                    workspaceEdit.insert(uri, insertPos, '\n');
                };
            };
        };
    } else {
        // Add all attributes as separate lines (existing behavior)
        const insertionPoint = findElementInsertionPoint(editor, element);
        if (insertionPoint === -1) {
            throw new Error('Could not find insertion point for attributes');
        };

        let crInserted: boolean = false;
        for (let i = 0; i < attributes.length; i++) {
            const attributeLine = createAttributeLineWithIndicators(attributes[i]);
            const insertPos = new vscode.Position(insertionPoint, 0);
            if (!crInserted && insertPos.line >= editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
                crInserted = true;
            };
            workspaceEdit.insert(uri, insertPos, attributeLine);
            if (i < attributes.length - 1 || insertPos.line < editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
            };
        };
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Creates inline attribute text for position 44+ on field line.
 * @param attributeWithIndicators - The attribute and its indicators
 * @returns Formatted attribute text for inline use
 */
function createInlineAttributeText(attributeWithIndicators: AttributeWithIndicators): string {
    return `DSPATR(${attributeWithIndicators.attribute})`;
};

/**
 * Creates a DDS attribute line with conditioning indicators.
 * @param attributeWithIndicators - The attribute and its indicators
 * @returns Formatted DDS line with indicators in correct positions
 */
function createAttributeLineWithIndicators(attributeWithIndicators: AttributeWithIndicators): string {
    let line = '     A '; // Start with 'A' and spaces up to position 7

    // Add indicators
    for (let i = 0; i < 3; i++) {
        const startPos = 7 + (i * 3);
        if (i < attributeWithIndicators.indicators.length) {
            const indicator = attributeWithIndicators.indicators[i].padStart(3, ' ');
            line += indicator;
        };
    };
    while (line.length < 44) {
        line += ' ';
    };

    // Add the DSPATR attribute
    line += `DSPATR(${attributeWithIndicators.attribute})`;

    return line;
};

/**
 * Removes existing attributes from a DDS element using precise character offsets.
 * Handles both inline attributes (position 44+) and separate attribute lines.
 * @param editor - The active text editor
 * @param element - The DDS element to remove attributes from
 */
async function removeAttributesFromElement(editor: vscode.TextEditor, element: any): Promise<void> {
    const currentAttributes = getCurrentAttributesForElement(editor, element);
    if (currentAttributes.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;
    const isConstant = element.kind === 'constant';

    // Separate inline attributes from line attributes
    const inlineAttributes = currentAttributes.filter(attr => attr.isInlineAttribute);
    const lineAttributes = currentAttributes.filter(attr => !attr.isInlineAttribute);

    // Handle inline attribute removal (for fields)
    if (!isConstant && inlineAttributes.length > 0) {
        const fieldLine = document.lineAt(element.lineIndex);
        const fieldLineText = fieldLine.text;
        
        // Remove everything from position 44 onwards
        const truncatedLine = fieldLineText.substring(0, 44).trimRight();
        workspaceEdit.replace(uri, fieldLine.range, truncatedLine);
    };

    // Handle separate attribute lines removal
    if (lineAttributes.length > 0) {
        const attributeLineIndices = lineAttributes.map(attr => attr.lineIndex!);
        const deletionRanges = calculateAttributeDeletionRanges(document, attributeLineIndices);
        
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
 * Calculates precise deletion ranges for standalone attribute lines.
 * Handles edge cases to prevent blank lines at the end of the file.
 * @param document - The text document
 * @param attributeLines - Array of line indices containing standalone attributes
 * @returns Array of deletion ranges with start and end offsets
 */
function calculateAttributeDeletionRanges(
    document: vscode.TextDocument, 
    attributeLines: number[]
): { startOffset: number; endOffset: number }[] {
    const docText = document.getText();
    const docLength = docText.length;
    const ranges: { startOffset: number; endOffset: number }[] = [];
    
    // Group consecutive lines for more efficient deletion
    const lineGroups = groupConsecutiveLines(attributeLines);
    
    for (const group of lineGroups) {
        const firstLine = group[0];
        const lastLine = group[group.length - 1];
        
        let startOffset: number;
        let endOffset: number;
        
        if (lastLine === document.lineCount - 1) {
            // Group includes the last line of the document
            if (firstLine === 0) {
                // Entire document is attribute lines - delete everything
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
 * Finds existing attribute lines for an element.
 * This function is kept for backward compatibility but the logic has been moved to getCurrentAttributesForElement.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Array of line indices containing attributes
 */
function findExistingAttributeLines(editor: vscode.TextEditor, element: any): number[] {
    const attributes = getCurrentAttributesForElement(editor, element);
    return attributes.map(attr => attr.lineIndex!);
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
