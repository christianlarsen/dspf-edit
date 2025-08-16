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
 * Manages existing attributes and allows adding/removing attributes.
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
        const availableAttributes = getAvailableAttributes(currentAttributes);

        // Show current attributes if any exist
        if (currentAttributes.length > 0) {
            const currentAttributesList = currentAttributes.join(', ');
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
        const selectedAttributes = await collectAttributesFromUser(availableAttributes);
        
        if (selectedAttributes.length === 0) {
            vscode.window.showInformationMessage('No attributes selected.');
            return;
        };

        // Apply the selected attributes to the element
        await addAttributesToElement(editor, node.ddsElement, selectedAttributes);
        
        vscode.window.showInformationMessage(
            `Added attributes ${selectedAttributes.join(', ')} to ${node.ddsElement.name}.`
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
function getCurrentAttributesForElement(element: any): string[] {
    // Find the element in the fieldsPerRecords data
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return [];
    
    let elementNameWithoutQuotes : string = '';
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

    // Extract DSPATR attributes
    const attributes: string[] = [];
    if (elementInfo) {
        elementInfo.attributes.forEach(attr => {
            const attributeMatch = attr.match(/^DSPATR\(([A-Z]{2})\)$/);
            if (attributeMatch) {
                attributes.push(attributeMatch[1]);
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
 * Collects attributes from user through interactive selection.
 * @param availableAttributes - Array of attributes available for selection
 * @returns Array of selected attributes
 */
async function collectAttributesFromUser(availableAttributes: string[]): Promise<string[]> {
    const selectedAttributes: string[] = [];
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

        selectedAttributes.push(selectedAttribute);
        remainingAttributes = remainingAttributes.filter(c => c !== selectedAttribute);
    };

    return selectedAttributes;
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds attributes to a DDS element by inserting DSPATR lines after the element.
 * @param editor - The active text editor
 * @param element - The DDS element to add attributes to
 * @param attributes - Array of attribute codes to add
 */
async function addAttributesToElement(
    editor: vscode.TextEditor,
    element: any,
    attributes: string[]
): Promise<void> {
    const insertionPoint = findElementInsertionPoint(editor, element);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for attributes');
    };

    const attributeLines = createAttributeLines('DSPATR', attributes);
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Insert each attribute line
    let crInserted : boolean = false;    
    for (let i = 0; i < attributeLines.length; i++) {
        const insertPos = new vscode.Position(insertionPoint + i, 0);
        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        };
        workspaceEdit.insert(uri, insertPos, attributeLines[i]);
        if (i < attributeLines.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Removes existing attributes from a DDS element.
 * @param editor - The active text editor
 * @param element - The DDS element to remove attributes from
 */
async function removeAttributesFromElement(editor: vscode.TextEditor, element: any): Promise<void> {
    const attributeLines = findExistingAttributeLines(editor, element);
    if (attributeLines.length === 0) return;

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Remove attribute lines in reverse order to maintain line indices
    for (let i = attributeLines.length - 1; i >= 0; i--) {
        const lineIndex = attributeLines[i];
        const line = editor.document.lineAt(lineIndex);
        if (element.lineIndex === lineIndex) {
            const newLine = line.text.slice(0, 44);
            workspaceEdit.replace(
                uri,
                new vscode.Range(
                    line.range.start.translate(0, 44), 
                    line.range.end 
                ),
                ""
            );
        } else {
            workspaceEdit.delete(uri, line.rangeIncludingLineBreak);
        };
    };

    await vscode.workspace.applyEdit(workspaceEdit);
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
