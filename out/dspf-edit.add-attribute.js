"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-attribute.ts
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
exports.addAttribute = addAttribute;
exports.getElementRecordName = getElementRecordName;
exports.findElementsWithAttributes = findElementsWithAttributes;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
// COMMAND REGISTRATION
/**
 * Registers the add attribute command for DDS fields and constants.
 * Allows users to interactively manage attributes for elements.
 * @param context - The VS Code extension context
 */
function addAttribute(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.add-attribute", async (node) => {
        await handleAddAttributeCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the add attribute command for a DDS field or constant.
 * Manages existing attributes and allows adding/removing attributes.
 * @param node - The DDS node containing the field or constant
 */
async function handleAddAttributeCommand(node) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        ;
        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Attributes can only be added to constants and fields.');
            return;
        }
        ;
        // Get current attributes from the element
        const currentAttributes = getCurrentAttributesForElement(node.ddsElement);
        // Get available attributes (excluding current ones)
        const availableAttributes = getAvailableAttributes(currentAttributes);
        // Show current attributes if any exist
        if (currentAttributes.length > 0) {
            const currentAttributesList = currentAttributes.join(', ');
            const action = await vscode.window.showQuickPick(['Add more attributes', 'Replace all attributes', 'Remove all attributes'], {
                title: `Current attributes: ${currentAttributesList}`,
                placeHolder: 'Choose how to manage attributes'
            });
            if (!action)
                return;
            if (action === 'Remove all attributes') {
                await removeAttributesFromElement(editor, node.ddsElement);
                return;
            }
            ;
            if (action === 'Replace all attributes') {
                await removeAttributesFromElement(editor, node.ddsElement);
                // Continue to add new attributes
            }
            ;
            // If "Add more attributes", continue with current logic
        }
        ;
        // Collect new attributes to add
        const selectedAttributes = await collectAttributesFromUser(availableAttributes);
        if (selectedAttributes.length === 0) {
            vscode.window.showInformationMessage('No attributes selected.');
            return;
        }
        ;
        // Apply the selected attributes to the element
        await addAttributesToElement(editor, node.ddsElement, selectedAttributes);
        vscode.window.showInformationMessage(`Added attributes ${selectedAttributes.join(', ')} to ${node.ddsElement.name}.`);
    }
    catch (error) {
        console.error('Error managing attributes:', error);
        vscode.window.showErrorMessage('An error occurred while managing attributes.');
    }
    ;
}
;
// ATTRIBUTES EXTRACTION FUNCTIONS
/**
 * Extracts current attributes from a DDS element.
 * @param element - The DDS element (field or constant)
 * @returns Array of current attributes codes
 */
function getCurrentAttributesForElement(element) {
    // Find the element in the fieldsPerRecords data
    const recordInfo = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo)
        return [];
    const elementNameWithoutQuotes = element.name.slice(1, -1);
    // Look in both fields and constants
    const elementInfo = [
        ...recordInfo.fields,
        ...recordInfo.constants
    ].find(item => item.name === elementNameWithoutQuotes);
    if (!elementInfo || !elementInfo.attributes)
        return [];
    // Extract DSPATR attributes
    const attributes = [];
    if (elementInfo) {
        elementInfo.attributes.forEach(attr => {
            const attributeMatch = attr.match(/^DSPATR\(([A-Z]{2})\)$/);
            if (attributeMatch) {
                attributes.push(attributeMatch[1]);
            }
        });
    }
    ;
    return attributes;
}
;
/**
 * Gets available attributes excluding those already selected.
 * @param currentAttributes - Array of currently selected attributes
 * @returns Array of available attributes
 */
function getAvailableAttributes(currentAttributes) {
    const allAttributes = ['HI', 'RI', 'CS', 'BL', 'ND', 'UL', 'PC'];
    return allAttributes.filter(attribute => !currentAttributes.includes(attribute));
}
;
// USER INTERACTION FUNCTIONS
/**
 * Collects attributes from user through interactive selection.
 * @param availableAttributes - Array of attributes available for selection
 * @returns Array of selected attributes
 */
async function collectAttributesFromUser(availableAttributes) {
    const selectedAttributes = [];
    let remainingAttributes = [...availableAttributes];
    while (remainingAttributes.length > 0) {
        const selectedAttribute = await vscode.window.showQuickPick(remainingAttributes, {
            title: `Add Attribute (${selectedAttributes.length} selected) - Press ESC to finish`,
            placeHolder: 'Select attribute from list'
        });
        if (!selectedAttribute)
            break;
        selectedAttributes.push(selectedAttribute);
        remainingAttributes = remainingAttributes.filter(c => c !== selectedAttribute);
    }
    ;
    return selectedAttributes;
}
;
// DDS MODIFICATION FUNCTIONS
/**
 * Adds attributes to a DDS element by inserting DSPATR lines after the element.
 * @param editor - The active text editor
 * @param element - The DDS element to add attributes to
 * @param attributes - Array of attribute codes to add
 */
async function addAttributesToElement(editor, element, attributes) {
    const insertionPoint = findElementInsertionPoint(editor, element);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for color attributes');
    }
    ;
    const attributeLines = createAttributeLines(attributes);
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    // Insert each attribute line
    let crInserted = false;
    for (let i = 0; i < attributeLines.length; i++) {
        const insertPos = new vscode.Position(insertionPoint + i, 0);
        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        }
        ;
        workspaceEdit.insert(uri, insertPos, attributeLines[i]);
        if (i < attributeLines.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        }
        ;
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Removes existing attributes from a DDS element.
 * @param editor - The active text editor
 * @param element - The DDS element to remove attributes from
 */
async function removeAttributesFromElement(editor, element) {
    const attributeLines = findExistingAttributeLines(editor, element);
    if (attributeLines.length === 0)
        return;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    // Remove attribute lines in reverse order to maintain line indices
    for (let i = attributeLines.length - 1; i >= 0; i--) {
        const lineIndex = attributeLines[i];
        const line = editor.document.lineAt(lineIndex);
        workspaceEdit.delete(uri, line.rangeIncludingLineBreak);
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
// LINE CREATION AND DETECTION FUNCTIONS
/**
 * Creates DDS attribute lines for attribute specifications.
 * @param attributes - Array of attribute codes
 * @returns Array of formatted DDS lines
 */
function createAttributeLines(attributes) {
    return attributes.map(attribute => {
        return `     A` + ' '.repeat(38) + `DSPATR(${attribute})`;
    });
}
;
/**
 * Finds the insertion point after a DDS element for adding attributes.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Line index for insertion or -1 if not found
 */
function findElementInsertionPoint(editor, element) {
    const elementLineIndex = element.lineIndex;
    // Look for the line after the element definition
    // Skip any existing attribute lines
    let insertionPoint = elementLineIndex + 1;
    // Skip existing attribute lines (lines that start with "     A" and have attributes)
    while (insertionPoint < editor.document.lineCount) {
        const line = editor.document.lineAt(insertionPoint).text;
        if (line.trim().startsWith('A ') && isAttributeLine(line)) {
            insertionPoint++;
        }
        else {
            break;
        }
        ;
    }
    ;
    return insertionPoint;
}
;
/**
 * Finds existing attribute lines for an element.
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Array of line indices containing attributes
 */
function findExistingAttributeLines(editor, element) {
    const attributeLines = [];
    const startLine = element.lineIndex + 1;
    // Look for DSPATR attribute lines after the element
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const line = editor.document.lineAt(i).text;
        // Stop if we hit a non-attribute line
        if (!line.trim().startsWith('A ') || !isAttributeLine(line)) {
            break;
        }
        ;
        // Check if this is a DSPATR attribute
        if (line.includes('DSPATR(')) {
            attributeLines.push(i);
        }
        ;
    }
    ;
    return attributeLines;
}
;
// UTILITY FUNCTIONS
/**
 * Determines if a line is a DDS attribute line.
 * @param line - The line text to check
 * @returns True if the line contains attribute definitions
 */
function isAttributeLine(line) {
    // Attribute lines typically have specific patterns
    // This is a simplified check - you might need to adjust based on your DDS format
    const trimmed = line.trim();
    return trimmed.startsWith('A ') && (trimmed.includes('COLOR(') ||
        trimmed.includes('DSPATR(') ||
        trimmed.includes('EDTCDE(') ||
        trimmed.includes('EDTWD(') ||
        // Add other attribute patterns as needed
        /[A-Z]+\(/.test(trimmed));
}
;
/**
 * Gets the record name for a given element.
 * This is a utility function that could be moved to a shared utilities module.
 * @param element - The DDS element
 * @returns The record name or empty string if not found
 */
function getElementRecordName(element) {
    return element.recordname || '';
}
;
/**
 * Finds all elements in a record that have attributes.
 * This could be useful for reporting or bulk operations.
 * @param recordName - The name of the record
 * @returns Array of element names that have attributes
 */
function findElementsWithAttributes(recordName) {
    const recordInfo = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo)
        return [];
    const elementsWithAttributes = [];
    [...recordInfo.fields, ...recordInfo.constants].forEach(element => {
        const hasAttribute = element.attributes?.some(attr => attr.match(/^DSPATR\([A-Z]{2}\)$/));
        if (hasAttribute) {
            elementsWithAttributes.push(element.name);
        }
        ;
    });
    return elementsWithAttributes;
}
;
//# sourceMappingURL=dspf-edit.add-attribute.js.map