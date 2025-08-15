/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-color.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fieldsPerRecords } from './dspf-edit.model';

// COMMAND REGISTRATION

/**
 * Registers the add color command for DDS fields and constants.
 * Allows users to interactively manage color attributes for elements.
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
 * Manages existing colors and allows adding/removing color attributes.
 * @param node - The DDS node containing the field or constant
 */
async function handleAddColorCommand(node: DdsNode): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Colors can only be added to constants and fields.');
            return;
        }

        // Get current colors from the element
        const currentColors = getCurrentColorsForElement(node.ddsElement);
        
        // Get available colors (excluding current ones)
        const availableColors = getAvailableColors(currentColors);

        // Show current colors if any exist
        if (currentColors.length > 0) {
            const currentColorsList = currentColors.join(', ');
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
            };
            // If "Add more colors", continue with current logic
        };

        // Collect new colors to add
        const selectedColors = await collectColorsFromUser(availableColors);
        
        if (selectedColors.length === 0) {
            vscode.window.showInformationMessage('No colors selected.');
            return;
        };

        // Apply the selected colors to the element
        await addColorsToElement(editor, node.ddsElement, selectedColors);
        
        vscode.window.showInformationMessage(
            `Added colors ${selectedColors.join(', ')} to ${node.ddsElement.name}.`
        );

    } catch (error) {
        console.error('Error managing colors:', error);
        vscode.window.showErrorMessage('An error occurred while managing colors.');
    };
};

// COLOR EXTRACTION FUNCTIONS

/**
 * Extracts current color attributes from a DDS element.
 * @param element - The DDS element (field or constant)
 * @returns Array of current color codes
 */
function getCurrentColorsForElement(element: any): string[] {
    // Find the element in the fieldsPerRecords data
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return [];
    
    const elementNameWithoutQuotes = element.name.slice(1, -1);
    // Look in both fields and constants
    const elementInfo = [
        ...recordInfo.fields,
        ...recordInfo.constants
    ].find(item => item.name === elementNameWithoutQuotes);

    if (!elementInfo || !elementInfo.attributes) return [];

    // Extract COLOR attributes
    const colors: string[] = [];
    if (elementInfo) {
        elementInfo.attributes.forEach(attr => {
            const colorMatch = attr.match(/^COLOR\(([A-Z]{3})\)$/);
            if (colorMatch) {
                colors.push(colorMatch[1]);
            }
        });
    };

    return colors;
};

/**
 * Gets available colors excluding those already selected.
 * @param currentColors - Array of currently selected colors
 * @returns Array of available colors
 */
function getAvailableColors(currentColors: string[]): string[] {
    const allColors: string[] = ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'WHT', 'YLW'];
    return allColors.filter(color => !currentColors.includes(color));
};

// USER INTERACTION FUNCTIONS

/**
 * Collects colors from user through interactive selection.
 * @param availableColors - Array of colors available for selection
 * @returns Array of selected colors in order
 */
async function collectColorsFromUser(availableColors: string[]): Promise<string[]> {
    const selectedColors: string[] = [];
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

        selectedColors.push(selectedColor);
        remainingColors = remainingColors.filter(c => c !== selectedColor);
    };

    return selectedColors;
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds color attributes to a DDS element by inserting COLOR lines after the element.
 * @param editor - The active text editor
 * @param element - The DDS element to add colors to
 * @param colors - Array of color codes to add
 */
async function addColorsToElement(
    editor: vscode.TextEditor,
    element: any,
    colors: string[]
): Promise<void> {
    const insertionPoint = findElementInsertionPoint(editor, element);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for color attributes');
    };

    const colorLines = createColorAttributeLines(colors);
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Insert each color line
    let crInserted : boolean = false;    
    for (let i = 0; i < colorLines.length; i++) {
        const insertPos = new vscode.Position(insertionPoint + i, 0);
        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        };
        workspaceEdit.insert(uri, insertPos, colorLines[i]);
        if (i < colorLines.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Removes existing color attributes from a DDS element.
 * @param editor - The active text editor
 * @param element - The DDS element to remove colors from
 */
async function removeColorsFromElement(editor: vscode.TextEditor, element: any): Promise<void> {
    const colorLines = findExistingColorLines(editor, element);
    if (colorLines.length === 0) return;

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Remove color lines in reverse order to maintain line indices
    for (let i = colorLines.length - 1; i >= 0; i--) {
        const lineIndex = colorLines[i];
        const line = editor.document.lineAt(lineIndex);
        workspaceEdit.delete(uri, line.rangeIncludingLineBreak);
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

// LINE CREATION AND DETECTION FUNCTIONS

/**
 * Creates DDS attribute lines for color specifications.
 * @param colors - Array of color codes
 * @returns Array of formatted DDS lines
 */
function createColorAttributeLines(colors: string[]): string[] {
    return colors.map(color => {
        // Format: "     A            COLOR(XXX)"
        return `     A` + ' '.repeat(38) + `COLOR(${color})`;
    });
};

/**
 * Finds the insertion point after a DDS element for adding attributes.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Line index for insertion or -1 if not found
 */
function findElementInsertionPoint(editor: vscode.TextEditor, element: any): number {
    const elementLineIndex = element.lineIndex;
    
    // Look for the line after the element definition
    // Skip any existing attribute lines
    let insertionPoint = elementLineIndex + 1;
    
    // Skip existing attribute lines (lines that start with "     A" and have attributes)
    while (insertionPoint < editor.document.lineCount) {
        const line = editor.document.lineAt(insertionPoint).text;
        if (line.trim().startsWith('A ') && isAttributeLine(line)) {
            insertionPoint++;
        } else {
            break;
        };
    };
    
    return insertionPoint;
};

/**
 * Finds existing color attribute lines for an element.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Array of line indices containing color attributes
 */
function findExistingColorLines(editor: vscode.TextEditor, element: any): number[] {
    const colorLines: number[] = [];
    const startLine = element.lineIndex + 1;
    
    // Look for COLOR attribute lines after the element
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const line = editor.document.lineAt(i).text;
        
        // Stop if we hit a non-attribute line
        if (!line.trim().startsWith('A ') || !isAttributeLine(line)) {
            break;
        };
        
        // Check if this is a COLOR attribute
        if (line.includes('COLOR(')) {
            colorLines.push(i);
        };
    };
    
    return colorLines;
};

// UTILITY FUNCTIONS

/**
 * Determines if a line is a DDS attribute line.
 * @param line - The line text to check
 * @returns True if the line contains attribute definitions
 */
function isAttributeLine(line: string): boolean {
    // Attribute lines typically have specific patterns
    // This is a simplified check - you might need to adjust based on your DDS format
    const trimmed = line.trim();
    return trimmed.startsWith('A ') && (
        trimmed.includes('COLOR(') ||
        trimmed.includes('DSPATR(') ||
        trimmed.includes('EDTCDE(') ||
        trimmed.includes('EDTWD(') ||
        // Add other attribute patterns as needed
        /[A-Z]+\(/.test(trimmed)
    );
};

/**
 * Gets the record name for a given element.
 * This is a utility function that could be moved to a shared utilities module.
 * @param element - The DDS element
 * @returns The record name or empty string if not found
 */
export function getElementRecordName(element: any): string {
    return element.recordname || '';
};

/**
 * Finds all elements in a record that have color attributes.
 * This could be useful for reporting or bulk operations.
 * @param recordName - The name of the record
 * @returns Array of element names that have color attributes
 */
export function findElementsWithColors(recordName: string): string[] {
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo) return [];

    const elementsWithColors: string[] = [];
    
    [...recordInfo.fields, ...recordInfo.constants].forEach(element => {
        const hasColorAttribute = element.attributes?.some(attr => 
            attr.match(/^COLOR\([A-Z]{3}\)$/)
        );
        
        if (hasColorAttribute) {
            elementsWithColors.push(element.name);
        };
    });

    return elementsWithColors;
};



/*
export function addColor(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-color", async (node: DdsNode) => {

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found.');
                return;
            };
            if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
                return;
            };

            const listOfColors: string[] = ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'WHT', 'YLW'];
            let selectedColors: string[] = [];
            // Retrieves the colors already active for the constant/field and removes them
            // from the list, and add them to the selectedColors list.


            // ????

            // Collect colors to be active for the constant/field
            while (true) {
                const selectedColor =
                    await vscode.window.showQuickPick(
                        listOfColors,
                        {
                            title: 'Add Color (Press ESC to End)',
                            placeHolder: 'Select colour from list'
                        }
                    );
                if (selectedColor && selectedColor !== '') {
                    selectedColors.push(selectedColor);
                } else {
                    break;
                }
            };

            // One finished, the colors are added to the source file with this format "COLOR(BLU)"
            // in the same order they are inserted

            // ??????
        })
    );

};

*/