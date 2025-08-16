/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-attribute.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fieldsPerRecords } from './dspf-edit.model';
import { isAttributeLine, createAttributeLines, findElementInsertionPoint } from './dspf-edit.helper';

// COMMAND REGISTRATION

interface AttributeWithIndicators {
    attribute: string;
    indicators: string[];
};

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

        // Get current attributes from the element
        const currentAttributes = getCurrentAttributesForElement(node.ddsElement);

        // Get available attributes (excluding current ones)
        const availableAttributes = getAvailableAttributes(currentAttributes.map(a => a.attribute));

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
 * Extracts current attributes from a DDS element.
 * @param element - The DDS element (field or constant)
 * @returns Array of current attributes codes
 */
function getCurrentAttributesForElement(element: any): AttributeWithIndicators[] {
    // Find the element in the fieldsPerRecords data
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return [];

    let elementNameWithoutQuotes: string = '';
    if (element.kind === 'constant') {
        elementNameWithoutQuotes = element.name.slice(1, -1);
    } else {
        elementNameWithoutQuotes = element.name;
    };

    // Look in both fields and constants
    const elementInfo = [
        ...recordInfo.fields,
        ...recordInfo.constants
    ].find(item => item.name === elementNameWithoutQuotes);

    if (!elementInfo || !elementInfo.attributes) return [];

    // Extract DSPATR attributes with indicators
    const attributes: AttributeWithIndicators[] = [];
    if (elementInfo) {
        elementInfo.attributes.forEach(attr => {
            const attributeMatch = attr.match(/^DSPATR\(([A-Z]{2})\)$/);
            if (attributeMatch) {
                attributes.push({
                    attribute: attributeMatch[1],
                    indicators: []
                });
            }
        });
    };

    return attributes;
};

/**
 * Gets available attributes excluding those already selected.
 * @param currentAttributes - Array of currently selected attributes
 * @returns Array of available attributes
 */
function getAvailableAttributes(currentAttributes: string[]): string[] {
    const allAttributes: string[] = ['HI', 'RI', 'CS', 'BL', 'ND', 'UL', 'PC'];
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
    }

    return indicators;
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds attributes with indicators to a DDS element by inserting DSPATR lines after the element.
 * @param editor - The active text editor
 * @param element - The DDS element to add attributes to
 * @param attributes - Array of attributes with indicators to add
 */
async function addAttributesToElement(
    editor: vscode.TextEditor,
    element: any,
    attributes: AttributeWithIndicators[]
): Promise<void> {
    const insertionPoint = findElementInsertionPoint(editor, element);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for attributes');
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const insertPos = new vscode.Position(insertionPoint, 0);

    // Insert each attribute line in REVERSE order at the SAME insertion point
    // This way each new attribute pushes the previous ones down naturally
    for (let i = attributes.length - 1; i >= 0; i--) {
        const attributeLine = createAttributeLineWithIndicators(attributes[i]);
        
        // Check if we need to add a newline at the end of the document
        if (insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
        
        // Insert the attribute line with a newline
        workspaceEdit.insert(uri, insertPos, attributeLine + '\n');
    };

    await vscode.workspace.applyEdit(workspaceEdit);
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
 * Handles edge cases properly to avoid leaving blank lines at the end of the file.
 * @param editor - The active text editor
 * @param element - The DDS element to remove attributes from
 */
async function removeAttributesFromElement(editor: vscode.TextEditor, element: any): Promise<void> {
    const attributeLines = findExistingAttributeLines(editor, element);
    if (attributeLines.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;

    // Group lines by type: element line vs standalone attribute lines
    const elementLineIndex = element.lineIndex;
    const standaloneAttributeLines = attributeLines.filter(lineIndex => lineIndex !== elementLineIndex);
    const hasElementLineAttribute = attributeLines.includes(elementLineIndex);

    // Handle standalone attribute lines using precise offsets
    if (standaloneAttributeLines.length > 0) {
        const deletionRanges = calculateAttributeDeletionRanges(document, standaloneAttributeLines);
        
        // Apply deletions in reverse order to maintain offsets
        for (let i = deletionRanges.length - 1; i >= 0; i--) {
            const { startOffset, endOffset } = deletionRanges[i];
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
        };
    };

    // Handle attribute on element line (just remove the attribute part)
    if (hasElementLineAttribute) {
        const line = document.lineAt(elementLineIndex);
        workspaceEdit.replace(
            uri,
            new vscode.Range(
                line.range.start.translate(0, 44), 
                line.range.end 
            ),
            ""
        );
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
            }
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
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Array of line indices containing attributes
 */
function findExistingAttributeLines(editor: vscode.TextEditor, element: any): number[] {
    const attributeLines: number[] = [];
    const isConstant = element.kind === 'constant';
    const startLine = isConstant ? element.lineIndex + 1 : element.lineIndex;

    // Look for DSPATR attribute lines after the element
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;

        // Special case: first line of a field can have attributes
        if (i === element.lineIndex && !isConstant) {
            if (lineText.includes('DSPATR(')) {
                attributeLines.push(i);
            };
            continue;
        };

        if (!lineText.trim().startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };

        // Check if this is a DSPATR attribute
        if (lineText.includes('DSPATR(')) {
            attributeLines.push(i);
        };
    };

    return attributeLines;
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
