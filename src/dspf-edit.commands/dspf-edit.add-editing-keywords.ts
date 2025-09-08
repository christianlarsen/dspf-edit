/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-editing-keywords.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords } from '../dspf-edit.parser/dspf-edit.model';
import { isAttributeLine, findElementInsertionPoint } from '../dspf-edit.utils/dspf-edit.helper';
import { ExtensionState } from '../dspf-edit.states/state';

// INTERFACES AND TYPES

interface EditConfiguration {
    type: 'EDTCDE' | 'EDTWRD' | 'EDTMSK';
    value: string;
    modifier?: string; // For EDTCDE: * for asterisk fill, or currency symbol
};

interface EditCodeOption {
    code: string;
    description: string;
    category: 'Standard' | 'Credit' | 'Minus' | 'Special' | 'User-Defined';
    supportsAsterisk: boolean;
    supportsCurrency: boolean;
};

// COMMAND REGISTRATION

/**
 * Registers the edit field command for DDS fields.
 * Allows users to interactively manage field editing (EDTCDE, EDTWRD, EDTMSK).
 * @param context - The VS Code extension context
 */
export function editingKeywords(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-editing-keywords", async (node: DdsNode) => {
            await handleEditingKeywordsCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the edit field command for a DDS field.
 * Manages field editing options: EDTCDE, EDTWRD, and EDTMSK.
 * @param node - The DDS node containing the field
 */
async function handleEditingKeywordsCommand(node: DdsNode): Promise<void> {
    try {
        const editor = ExtensionState.lastDdsEditor;
        const document = editor?.document ?? ExtensionState.lastDdsDocument;
        if (!document || !editor) {
            vscode.window.showErrorMessage('No DDS editor found.');
            return;
        };

        // Validate element type - only fields can have editing
        if (node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Field editing can only be applied to fields.');
            return;
        };

        // Get field information
        const fieldInfo = getFieldInfo(node.ddsElement);
        if (!fieldInfo) {
            vscode.window.showErrorMessage('Could not determine field information for editing.');
            return;
        };

        // Get current editing configuration
        const currentEditing = getCurrentEditingForField(node.ddsElement);

        // Show current editing if exists
        if (currentEditing.length > 0) {
            const currentEditDisplay = currentEditing.map(edit => 
                `${edit.type}(${edit.value}${edit.modifier ? ' ' + edit.modifier : ''})`
            ).join(', ');

            const action = await vscode.window.showQuickPick(
                ['Replace field editing', 'Remove field editing'],
                {
                    title: `Current editing: ${currentEditDisplay}`,
                    placeHolder: 'Choose how to manage field editing'
                }
            );

            if (!action) return;

            if (action === 'Remove field editing') {
                await removeEditingFromField(editor, node.ddsElement);
                return;
            };

            if (action === 'Replace field editing') {
                await removeEditingFromField(editor, node.ddsElement);
                // Continue to add new editing
            };
        };

        // Ask user what type of editing they want
        const editingType = await vscode.window.showQuickPick([
            'EDTCDE - Edit Code (predefined formatting)',
            'EDTWRD - Edit Word (custom formatting patterns)',
            'EDTMSK - Edit Mask (field protection with EDTCDE/EDTWRD)'
        ], {
            title: `Select editing type for ${fieldInfo.name} (Type: ${fieldInfo.type})`,
            placeHolder: 'Choose editing method'
        });

        if (!editingType) return;

        let selectedEditing: EditConfiguration[] = [];

        if (editingType.startsWith('EDTCDE')) {
            // Validate field is numeric for EDTCDE
            if (!isNumericField(fieldInfo)) {
                vscode.window.showWarningMessage('Edit codes (EDTCDE) can only be applied to numeric fields (types P, S, B, F, I).');
                return;
            };
            const editCode = await collectEditCode(fieldInfo);
            if (editCode) selectedEditing.push(editCode);

        } else if (editingType.startsWith('EDTWRD')) {
            // Validate field is numeric for EDTWRD
            if (!isNumericField(fieldInfo)) {
                vscode.window.showWarningMessage('Edit words (EDTWRD) can only be applied to numeric fields (types P, S, B, F, I).');
                return;
            };
            const editWord = await collectEditWord(fieldInfo);
            if (editWord) selectedEditing.push(editWord);

        } else if (editingType.startsWith('EDTMSK')) {
            // EDTMSK requires EDTCDE or EDTWRD to be present
            vscode.window.showInformationMessage('EDTMSK requires EDTCDE or EDTWRD. You will be asked to specify both.');
            
            let baseEdit: EditConfiguration | null = null;
            
            const baseEditType = await vscode.window.showQuickPick([
                'EDTCDE - Edit Code',
                'EDTWRD - Edit Word'
            ], {
                title: 'EDTMSK requires a base editing keyword. Choose base editing:',
                placeHolder: 'Select EDTCDE or EDTWRD first'
            });

            if (!baseEditType) return;

            // Validate field is numeric for base editing
            if (!isNumericField(fieldInfo)) {
                vscode.window.showWarningMessage('EDTMSK base editing can only be applied to numeric fields (types P, S, B, F, I).');
                return;
            };

            if (baseEditType.startsWith('EDTCDE')) {
                baseEdit = await collectEditCode(fieldInfo);
            } else {
                baseEdit = await collectEditWord(fieldInfo);
            };

            if (!baseEdit) return;

            const editMask = await collectEditMask(baseEdit);
            if (editMask) {
                selectedEditing.push(baseEdit);
                selectedEditing.push(editMask);
            };
        };

        if (selectedEditing.length === 0) {
            vscode.window.showInformationMessage('No field editing selected.');
            return;
        };

        // Apply the selected editing to the field
        await addEditingToField(editor, node.ddsElement, selectedEditing);

        const editingSummary = selectedEditing.map(edit =>
            `${edit.type}(${edit.value}${edit.modifier ? ' ' + edit.modifier : ''})`
        ).join(' + ');

        vscode.window.showInformationMessage(
            `Applied field editing ${editingSummary} to ${node.ddsElement.name}.`
        );

    } catch (error) {
        console.error('Error managing field editing:', error);
        vscode.window.showErrorMessage('An error occurred while managing field editing.');
    };
};

// EDITING EXTRACTION FUNCTIONS

/**
 * Extracts current editing configuration from a DDS field.
 * @param element - The DDS field element
 * @returns Array of current editing configurations
 */
function getCurrentEditingForField(element: any): EditConfiguration[] {
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return [];

    const fieldInfo = recordInfo.fields.find(field => field.name === element.name);
    if (!fieldInfo || !fieldInfo.attributes) return [];

    const editing: EditConfiguration[] = [];

    fieldInfo.attributes.forEach(attrObj => {
        const attr = attrObj.value;
        // Check for EDTCDE
        const edtcdeMatch = attr.match(/^EDTCDE\(([^)]+)\)$/);
        if (edtcdeMatch) {
            const params = edtcdeMatch[1].trim().split(/\s+/);
            const code = params[0];
            const modifier = params.length > 1 ? params[1] : undefined;
            editing.push({ type: 'EDTCDE', value: code, modifier });
        };

        // Check for EDTWRD
        const edtwrdMatch = attr.match(/^EDTWRD\('([^']+)'\)$/);
        if (edtwrdMatch) {
            editing.push({ type: 'EDTWRD', value: edtwrdMatch[1] });
        };

        // Check for EDTMSK
        const edtmskMatch = attr.match(/^EDTMSK\('([^']+)'\)$/);
        if (edtmskMatch) {
            editing.push({ type: 'EDTMSK', value: edtmskMatch[1] });
        };
    });

    return editing;
};

/**
 * Gets field information including type and length.
 * @param element - The DDS field element
 * @returns Field information or null if not found
 */
function getFieldInfo(element: any): any {
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return null;

    return recordInfo.fields.find(field => field.name === element.name);
};

/**
 * Checks if a field is numeric and can have edit codes/words.
 * @param fieldInfo - Field information
 * @returns true if field is numeric
 */
function isNumericField(fieldInfo: any): boolean {
    const fieldType = fieldInfo.type || '';
    
    // All numeric types that support editing in DDS:
    // P = Packed decimal
    // S = Zoned decimal (signed)
    // B = Binary
    // F = Floating point
    // I = Integer (newer systems)
    // Y = Numeric-only (digits 0-9, no sign)
    // A = Alphanumeric (when used with numeric edit codes, treated as numeric)
    // H = Hexadecimal (binary data, can be numeric in some contexts)
    // L = Date (numeric representation)
    // T = Time (numeric representation)
    // Z = Timestamp (numeric representation)
    
    const numericTypes = [
        'P',  // Packed decimal
        'S',  // Zoned decimal (signed)
        'B',  // Binary
        'F',  // Floating point
        'I',  // Integer
        'Y',  // Numeric-only (digits 0-9, no sign)
        'L',  // Date (can have numeric edit)
        'T',  // Time (can have numeric edit)
        'Z'   // Timestamp (can have numeric edit)
    ];
    
    return numericTypes.includes(fieldType.toUpperCase());
};

/**
 * Alternative version with more detailed type checking
 * @param fieldInfo - Field information including type and other attributes
 * @returns true if field is numeric and supports edit codes/words
 */
function isNumericFieldDetailed(fieldInfo: any): boolean {
    const fieldType = (fieldInfo.type || '').toUpperCase();
    
    // Primary numeric types that always support editing
    const primaryNumericTypes = ['P', 'S', 'B', 'F', 'I', 'Y'];
    
    if (primaryNumericTypes.includes(fieldType)) {
        return true;
    };
    
    // Date/Time types that can have numeric editing
    const dateTimeTypes = ['L', 'T', 'Z'];
    if (dateTimeTypes.includes(fieldType)) {
        return true;
    };
    
    // Special case: Alphanumeric fields (A) can be treated as numeric
    // if they have numeric edit codes or are defined with numeric usage
    if (fieldType === 'A') {
        // Check if field has numeric-related attributes
        const attributes = fieldInfo.attributes || [];
        const hasNumericEdit = attributes.some((attr: string) => 
            /^(EDTCDE|EDTWRD)\s*\(/.test(attr.toUpperCase())
        );
        return hasNumericEdit;
    };
    
    // Hexadecimal fields (H) are typically not editable as numeric,
    // but in some contexts they might be
    if (fieldType === 'H') {
        return false; // Usually false, but can be customized based on needs
    };
    
    return false;
};

// EDIT CODE DEFINITIONS

/**
 * Gets all available edit codes with their descriptions and capabilities.
 * @returns Array of edit code options
 */
function getAvailableEditCodes(): EditCodeOption[] {
    return [
        // Standard codes (1-4)
        { code: '1', description: 'Commas, decimals, no sign, zero as .00/0', category: 'Standard', supportsAsterisk: true, supportsCurrency: true },
        { code: '2', description: 'Commas, decimals, no sign, zero as blanks', category: 'Standard', supportsAsterisk: true, supportsCurrency: true },
        { code: '3', description: 'Commas, no decimals, no sign, zero as .00/0', category: 'Standard', supportsAsterisk: true, supportsCurrency: true },
        { code: '4', description: 'Commas, no decimals, no sign, zero as blanks', category: 'Standard', supportsAsterisk: true, supportsCurrency: true },

        // Credit codes (A-D) - show CR for negative
        { code: 'A', description: 'Commas, decimals, CR for negative, zero as .00/0', category: 'Credit', supportsAsterisk: true, supportsCurrency: true },
        { code: 'B', description: 'Commas, decimals, CR for negative, zero as blanks', category: 'Credit', supportsAsterisk: true, supportsCurrency: true },
        { code: 'C', description: 'Commas, no decimals, CR for negative, zero as .00/0', category: 'Credit', supportsAsterisk: true, supportsCurrency: true },
        { code: 'D', description: 'Commas, no decimals, CR for negative, zero as blanks', category: 'Credit', supportsAsterisk: true, supportsCurrency: true },

        // Minus codes (J-Q) - show - for negative
        { code: 'J', description: 'Commas, decimals, minus for negative, zero as .00/0', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'K', description: 'Commas, decimals, minus for negative, zero as blanks', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'L', description: 'Commas, no decimals, minus for negative, zero as .00/0', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'M', description: 'Commas, no decimals, minus for negative, zero as blanks', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'N', description: 'Commas, decimals, leading minus, zero as .00/0', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'O', description: 'Commas, decimals, leading minus, zero as blanks', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'P', description: 'Commas, no decimals, leading minus, zero as .00/0', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'Q', description: 'Commas, no decimals, leading minus, zero as blanks', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },

        // Special codes
        { code: 'W', description: 'Date format with slashes, suppresses leftmost zeros', category: 'Special', supportsAsterisk: false, supportsCurrency: false },
        { code: 'Y', description: 'Date format with slashes, different zero suppression', category: 'Special', supportsAsterisk: false, supportsCurrency: false },
        { code: 'Z', description: 'Remove sign, suppress leading zeros', category: 'Special', supportsAsterisk: false, supportsCurrency: false },

        // User-defined codes
        { code: '5', description: 'User-defined edit code QEDIT5', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false },
        { code: '6', description: 'User-defined edit code QEDIT6', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false },
        { code: '7', description: 'User-defined edit code QEDIT7', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false },
        { code: '8', description: 'User-defined edit code QEDIT8', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false },
        { code: '9', description: 'User-defined edit code QEDIT9', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false }
    ];
};

// USER INTERACTION FUNCTIONS

/**
 * Collects edit code configuration from user.
 * @param fieldInfo - Field information
 * @returns Selected edit code configuration
 */
async function collectEditCode(fieldInfo: any): Promise<EditConfiguration | null> {
    const availableEditCodes = getAvailableEditCodes();
    
    // Group edit codes by category for better organization
    const categories = ['Standard', 'Credit', 'Minus', 'Special', 'User-Defined'];
    const editCodeItems: string[] = [];

    categories.forEach(category => {
        editCodeItems.push(`--- ${category} Edit Codes ---`);
        const codesInCategory = availableEditCodes.filter(ec => ec.category === category);
        codesInCategory.forEach(ec => {
            editCodeItems.push(`${ec.code} - ${ec.description}`);
        });
    });

    const selectedItem = await vscode.window.showQuickPick(editCodeItems, {
        title: `Select Edit Code for ${fieldInfo.name} (Type: ${fieldInfo.type})`,
        placeHolder: 'Choose an edit code'
    });

    if (!selectedItem || selectedItem.startsWith('---')) return null;

    const selectedCode = selectedItem.split(' - ')[0];
    const editCodeOption = availableEditCodes.find(ec => ec.code === selectedCode);
    
    if (!editCodeOption) return null;

    const editConfig: EditConfiguration = {
        type: 'EDTCDE',
        value: selectedCode
    };

    // Ask for modifiers if supported
    if (editCodeOption.supportsAsterisk || editCodeOption.supportsCurrency) {
        const modifierOptions = ['No modifier'];
        
        if (editCodeOption.supportsAsterisk) {
            modifierOptions.push('* (Asterisk fill)');
        };
        
        if (editCodeOption.supportsCurrency) {
            modifierOptions.push('$ (Floating currency symbol)');
            modifierOptions.push('Other currency symbol...');
        };

        const selectedModifier = await vscode.window.showQuickPick(modifierOptions, {
            title: `Select modifier for EDTCDE(${selectedCode})`,
            placeHolder: 'Choose a modifier (optional)'
        });

        if (selectedModifier && selectedModifier !== 'No modifier') {
            if (selectedModifier === '* (Asterisk fill)') {
                editConfig.modifier = '*';
            } else if (selectedModifier === '$ (Floating currency symbol)') {
                editConfig.modifier = '$';
            } else if (selectedModifier === 'Other currency symbol...') {
                const customSymbol = await vscode.window.showInputBox({
                    title: 'Custom Currency Symbol',
                    prompt: 'Enter the currency symbol (must match QCURSYM system value)',
                    placeHolder: 'e.g., €, £, ¥',
                    validateInput: (value: string) => {
                        if (!value.trim()) return 'Currency symbol is required';
                        if (value.trim().length > 1) return 'Currency symbol should be a single character';
                        return null;
                    }
                });

                if (customSymbol === undefined) return null;
                editConfig.modifier = customSymbol.trim();
            };
        };
    };

    return editConfig;
};

/**
 * Collects edit word configuration from user.
 * @param fieldInfo - Field information
 * @returns Selected edit word configuration
 */
async function collectEditWord(fieldInfo: any): Promise<EditConfiguration | null> {
    const editWordPattern = await vscode.window.showInputBox({
        title: `Edit Word for ${fieldInfo.name}`,
        prompt: `Enter edit word pattern (Field: ${fieldInfo.length} digits, ${fieldInfo.decimals || 0} decimals)`,
        placeHolder: `Examples: '   0.  ' (decimal), '   $0.  ' (currency), '( ) -    ' (phone)`,
        validateInput: (value: string) => {
            if (!value.trim()) return 'Edit word pattern is required';
            if (!value.startsWith('\'') || !value.endsWith('\'')) {
                return 'Edit word must be enclosed in single quotes';
            };
            const pattern = value.slice(1, -1);
            if (!pattern) return 'Edit word pattern cannot be empty';
            
            // Basic validation: count blanks and zero-suppression characters
            const digitPositions = (pattern.match(/[ 0]/g) || []).length;
            const fieldLength = parseInt(fieldInfo.length) || 0;
            
            if (digitPositions > 0 && digitPositions !== fieldLength) {
                return `Must have ${fieldLength} digit positions (blanks + zero chars), found ${digitPositions}`;
            };
            
            return null;
        }
    });

    if (editWordPattern === undefined) return null;

    return {
        type: 'EDTWRD',
        value: editWordPattern
    };
};

/**
 * Collects edit mask configuration from user.
 * @param baseEdit - The base editing configuration (EDTCDE or EDTWRD)
 * @returns Selected edit mask configuration
 */
async function collectEditMask(baseEdit: EditConfiguration): Promise<EditConfiguration | null> {
    const editMaskPattern = await vscode.window.showInputBox({
        title: `Edit Mask for ${baseEdit.type}(${baseEdit.value})`,
        prompt: `Define protection: & for protected areas, blank for user input areas`,
        placeHolder: `Examples: '& &  & ' (phone), '  &  & ' (date), '&   .  ' (currency)`,
        validateInput: (value: string) => {
            if (!value.trim()) return 'Edit mask pattern is required';
            if (!value.startsWith('\'') || !value.endsWith('\'')) {
                return 'Edit mask must be enclosed in single quotes';
            };
            const pattern = value.slice(1, -1);
            if (!pattern) return 'Edit mask pattern cannot be empty';
            
            // Basic validation: should only contain & and spaces
            if (!/^[& ]*$/.test(pattern)) {
                return 'Edit mask can only contain ampersands (&) and spaces ( )';
            };
            
            return null;
        }
    });

    if (editMaskPattern === undefined) return null;

    return {
        type: 'EDTMSK',
        value: editMaskPattern
    };
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds editing configuration to a DDS field.
 * @param editor - The active text editor
 * @param element - The DDS field to add editing to
 * @param editing - Array of editing configurations to add
 */
async function addEditingToField(
    editor: vscode.TextEditor,
    element: any,
    editing: EditConfiguration[]
): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const fieldLine = editor.document.lineAt(element.lineIndex);
    const fieldLineText = fieldLine.text;

    // Check if field already has attributes on the field line
    const hasAttributesOnFieldLine = hasExistingAttributes(fieldLineText);
    
    // Check if field has any attribute lines following it
    const hasAttributeLines = hasExistingAttributeLines(editor, element);

    if (!hasAttributesOnFieldLine && !hasAttributeLines) {
        // No existing attributes - add first editing to the field line itself
        await addFirstEditingToFieldLine(editor, element, editing[0], workspaceEdit, uri);
        
        // Add remaining editing keywords as separate lines if any
        if (editing.length > 1) {
            const insertionPoint = findElementInsertionPoint(editor, element);
            if (insertionPoint !== -1) {
                await addAdditionalEditingLines(editing.slice(1), insertionPoint, workspaceEdit, uri, editor);
            };
        };
    } else {
        // Field already has attributes - add all editing as separate lines
        const insertionPoint = findElementInsertionPoint(editor, element);
        if (insertionPoint === -1) {
            throw new Error('Could not find insertion point for field editing');
        };
        await addAdditionalEditingLines(editing, insertionPoint, workspaceEdit, uri, editor);
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Checks if a field line already has attributes/keywords.
 * @param fieldLineText - The text of the field line
 * @returns true if field line has attributes
 */
function hasExistingAttributes(fieldLineText: string): boolean {
    // Check if line has content beyond position 44 (where keywords start)
    if (fieldLineText.length <= 44) return false;
    
    // Check for common attribute patterns beyond position 44
    const attributesPart = fieldLineText.substring(44).trim();
    return attributesPart.length > 0 && !attributesPart.startsWith("'");
};

/**
 * Checks if a field has existing attribute lines following it.
 * @param editor - The text editor
 * @param element - The DDS field element
 * @returns true if field has attribute lines
 */
function hasExistingAttributeLines(editor: vscode.TextEditor, element: any): boolean {
    const startLine = element.lineIndex + 1;
    
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        
        // Stop at next field or record
        if (!lineText.trim().startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };
        
        // Found at least one attribute line
        return true;
    };
    
    return false;
};

/**
 * Adds the first editing keyword to the field line itself.
 * @param editor - The text editor
 * @param element - The field element
 * @param editing - The editing configuration
 * @param workspaceEdit - The workspace edit
 * @param uri - The document URI
 */
async function addFirstEditingToFieldLine(
    editor: vscode.TextEditor,
    element: any,
    editing: EditConfiguration,
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri
): Promise<void> {
    const fieldLine = editor.document.lineAt(element.lineIndex);
    const fieldLineText = fieldLine.text;
    
    // Ensure line is at least 44 characters (pad with spaces if needed)
    let updatedLine = fieldLineText;
    while (updatedLine.length < 44) {
        updatedLine += ' ';
    };

    // Add the editing keyword
    const editingText = createEditingKeywordText(editing);
    updatedLine += editingText;

    // Replace the entire line
    workspaceEdit.replace(uri, fieldLine.range, updatedLine);
};

/**
 * Adds additional editing keywords as separate attribute lines.
 * @param editing - Array of editing configurations
 * @param insertionPoint - The line index where to insert
 * @param workspaceEdit - The workspace edit
 * @param uri - The document URI
 * @param editor - The text editor
 */
async function addAdditionalEditingLines(
    editing: EditConfiguration[],
    insertionPoint: number,
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri,
    editor: vscode.TextEditor
): Promise<void> {
    let crInserted: boolean = false;
    
    for (let i = 0; i < editing.length; i++) {
        const editingLine = createEditingLine(editing[i]);
        const insertPos = new vscode.Position(insertionPoint, 0);
        
        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        };
        
        workspaceEdit.insert(uri, insertPos, editingLine);
        
        if (i < editing.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
    };
};

/**
 * Creates editing keyword text (without the 'A' prefix and positioning).
 * @param editConfig - The editing configuration
 * @returns Keyword text
 */
function createEditingKeywordText(editConfig: EditConfiguration): string {
    if (editConfig.type === 'EDTCDE') {
        let params = editConfig.value;
        if (editConfig.modifier) {
            params += ' ' + editConfig.modifier;
        };
        return `EDTCDE(${params})`;
    } else if (editConfig.type === 'EDTWRD') {
        return `EDTWRD(${editConfig.value})`;
    } else if (editConfig.type === 'EDTMSK') {
        return `EDTMSK(${editConfig.value})`;
    };
    return '';
};

/**
 * Creates a DDS editing line (complete line with 'A' prefix and positioning).
 * @param editConfig - The editing configuration
 * @returns Formatted DDS line
 */
function createEditingLine(editConfig: EditConfiguration): string {
    let line = '     A'; // Start with 'A' 

    // Pad to position 44 for keywords
    while (line.length < 44) {
        line += ' ';
    };

    // Add the editing keyword and parameters
    line += createEditingKeywordText(editConfig);

    return line;
};

/**
 * Removes existing editing from a DDS field.
 * @param editor - The active text editor
 * @param element - The DDS field to remove editing from
 */
async function removeEditingFromField(editor: vscode.TextEditor, element: any): Promise<void> {
    const editingLines = findExistingEditingLines(editor, element);
    if (editingLines.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;

    // Group lines by type: field line vs standalone editing lines
    const fieldLineIndex = element.lineIndex;
    const standaloneEditingLines = editingLines.filter(lineIndex => lineIndex !== fieldLineIndex);
    const hasFieldLineEditing = editingLines.includes(fieldLineIndex);

    // Handle standalone editing lines
    if (standaloneEditingLines.length > 0) {
        const deletionRanges = calculateEditingDeletionRanges(document, standaloneEditingLines);
        
        // Apply deletions in reverse order to maintain offsets
        for (let i = deletionRanges.length - 1; i >= 0; i--) {
            const { startOffset, endOffset } = deletionRanges[i];
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
        };
    };

    // Handle editing on field line (just remove the editing parts)
    if (hasFieldLineEditing) {
        const line = document.lineAt(fieldLineIndex);
        const lineText = line.text;
        const cleanedText = lineText
            .replace(/EDTCDE\([^)]*\)/g, '')
            .replace(/EDTWRD\([^)]*\)/g, '')
            .replace(/EDTMSK\([^)]*\)/g, '')
            .trimEnd();
        workspaceEdit.replace(uri, line.range, cleanedText);
    };

    await vscode.workspace.applyEdit(workspaceEdit);

    vscode.window.showInformationMessage(`Removed field editing from ${element.name}.`);
};

/**
 * Calculates precise deletion ranges for standalone editing lines.
 * @param document - The text document
 * @param editingLines - Array of line indices containing editing
 * @returns Array of deletion ranges with start and end offsets
 */
function calculateEditingDeletionRanges(
    document: vscode.TextDocument, 
    editingLines: number[]
): { startOffset: number; endOffset: number }[] {
    const docText = document.getText();
    const docLength = docText.length;
    const ranges: { startOffset: number; endOffset: number }[] = [];
    
    // Group consecutive lines for more efficient deletion
    const lineGroups = groupConsecutiveLines(editingLines);
    
    for (const group of lineGroups) {
        const firstLine = group[0];
        const lastLine = group[group.length - 1];
        
        let startOffset: number;
        let endOffset: number;
        
        if (lastLine === document.lineCount - 1) {
            if (firstLine === 0) {
                startOffset = 0;
                endOffset = docLength;
            } else {
                const prevLineEndPos = document.lineAt(firstLine - 1).range.end;
                startOffset = document.offsetAt(prevLineEndPos);
                endOffset = docLength;
            };
        } else {
            startOffset = document.offsetAt(new vscode.Position(firstLine, 0));
            const afterGroupPos = document.lineAt(lastLine).rangeIncludingLineBreak.end;
            endOffset = document.offsetAt(afterGroupPos);
        };
        
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
    
    const sortedLines = [...lines].sort((a, b) => a - b);
    const groups: number[][] = [];
    let currentGroup: number[] = [sortedLines[0]];
    
    for (let i = 1; i < sortedLines.length; i++) {
        const currentLine = sortedLines[i];
        const previousLine = sortedLines[i - 1];
        
        if (currentLine === previousLine + 1) {
            currentGroup.push(currentLine);
        } else {
            groups.push(currentGroup);
            currentGroup = [currentLine];
        };
    };
    
    groups.push(currentGroup);
    return groups;
};

// LINE DETECTION FUNCTIONS

/**
 * Finds existing editing lines for a field.
 * @param editor - The active text editor
 * @param element - The DDS field
 * @returns Array of line indices containing editing keywords
 */
function findExistingEditingLines(editor: vscode.TextEditor, element: any): number[] {
    const editingLines: number[] = [];
    const startLine = element.lineIndex;

    // Look for editing lines after the field
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;

        // Special case: first line of a field can have editing
        if (i === element.lineIndex) {
            if (lineText.match(/(EDTCDE|EDTWRD|EDTMSK)\(/)) {
                editingLines.push(i);
            }
            continue;
        };

        if (!lineText.trim().startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };

        // Check if this is an editing attribute
        if (lineText.match(/(EDTCDE|EDTWRD|EDTMSK)\(/)) {
            editingLines.push(i);
        };
    };

    return editingLines;
};