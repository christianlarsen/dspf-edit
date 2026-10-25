/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-attribute.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './../dspf-edit.providers/dspf-edit.providers';
import { findElementInsertionPoint, checkForEditorAndDocument, applyWorkspaceEdit, formatIndicatorCondition } from './../dspf-edit.utils/dspf-edit.helper';
import { KeywordValue, KeywordValueSpec, manageKeywordValues, removeWholeKeyword } from './dspf-edit.conditioned-keywords';
import { fieldsPerRecords, DdsIndicator } from '../dspf-edit.model/dspf-edit.model';

// INTERFACES AND TYPES

interface AttributeWithIndicators {
    attribute: string;
    indicators: string[];
    lineIndex?: number;
    lastLineIndex?: number;
    isInlineAttribute?: boolean;
    /** The whole DSPATR() keyword text this attribute was read from — shared by every attribute
     * of a multi-attribute keyword such as DSPATR(UL HI). */
    keywordText?: string;
    /** The attribute's whole indicator condition spelled out, OR'd groups included. */
    conditionText?: string;
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
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Attributes can only be added to constants and fields.');
            return;
        };

        // One window for everything: check/uncheck attributes, set each one's indicators, remove
        // them (see dspf-edit.conditioned-keywords.ts).
        await manageKeywordValues(editor, node.ddsElement, ATTRIBUTE_SPEC);

    } catch (error) {
        console.error('Error managing attributes:', error);
        vscode.window.showErrorMessage('An error occurred while managing attributes.');
    };
};

// ATTRIBUTES WINDOW

const ATTRIBUTE_NAMES: Record<string, string> = {
    HI: 'High intensity',
    RI: 'Reverse image',
    CS: 'Column separators',
    BL: 'Blink',
    ND: 'Nondisplay',
    UL: 'Underline',
    PC: 'Position cursor',
    PR: 'Protect'
};

/** An existing attribute, as the shared window and its edits take it. */
function toKeywordValue(attr: AttributeWithIndicators): KeywordValue {
    return {
        code: attr.attribute,
        keywordText: attr.keywordText ?? `DSPATR(${attr.attribute})`,
        lineIndex: attr.lineIndex!,
        lastLineIndex: attr.lastLineIndex ?? attr.lineIndex!,
        conditionText: attr.conditionText ?? ''
    };
};

const ATTRIBUTE_SPEC: KeywordValueSpec = {
    keyword: 'DSPATR',
    codes: Object.keys(ATTRIBUTE_NAMES),
    noun: 'attribute',
    nounPlural: 'attributes',
    describe: code => ATTRIBUTE_NAMES[code] ? `${code} — ${ATTRIBUTE_NAMES[code]}` : code,
    read: element => getCurrentAttributesForElement(element).map(toKeywordValue),
    add: (editor, element, codes) => addAttributesToElement(editor, element, codes.map(attribute => ({ attribute, indicators: [] }))),
    removeAll: removeAttributesFromElement
};

// ATTRIBUTES EXTRACTION FUNCTIONS

/**
 * Formats a parsed indicator back into the "50"/"N50" string form the rest of this file's UI uses.
 * @param indicator - The indicator to format
 */
function formatIndicatorForDisplay(indicator: DdsIndicator): string {
    return `${indicator.active ? '' : 'N'}${indicator.number}`;
};

/**
 * Extracts current attributes from a DDS element, checking both inline and separate lines. Reads
 * from the element's own already-parsed `attributes` (populated by the parser for both fields and
 * constants, whether the DSPATR() keyword shares the element's own definition line — e.g. a
 * constant's "'9. End' DSPATR(UL) COLOR(RED)" — or sits on a separate line below it) rather than
 * re-scanning raw source text, which used to only ever check the element's own line for fields,
 * silently missing an inline attribute coded on a constant's own line.
 * @param element - The DDS element (field or constant)
 * @returns Array of current attributes with their location info
 */
function getCurrentAttributesForElement(element: any): AttributeWithIndicators[] {
    const attributes = (element.attributes || []) as { value: string; indicators?: DdsIndicator[]; lineIndex: number; lastLineIndex?: number }[];

    return attributes.reduce<AttributeWithIndicators[]>((result, attr) => {
        // DDS allows several attributes in one keyword, e.g. DSPATR(UL HI) — each one is listed
        // on its own, all pointing back to the same keyword text.
        const attributeMatch = attr.value.match(/^DSPATR\(\s*([A-Z]{2}(?:\s+[A-Z]{2})*)\s*\)$/);
        if (attributeMatch) {
            for (const code of attributeMatch[1].split(/\s+/)) {
                result.push({
                    attribute: code,
                    indicators: (attr.indicators || []).map(formatIndicatorForDisplay),
                    lineIndex: attr.lineIndex,
                    lastLineIndex: attr.lastLineIndex ?? attr.lineIndex,
                    isInlineAttribute: attr.lineIndex === element.lineIndex,
                    keywordText: attr.value,
                    conditionText: formatIndicatorCondition(attr.indicators)
                });
            };
        };
        return result;
    }, []);
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
 * Gets available attributes excluding those already selected.
 * @param currentAttributes - Array of currently selected attributes
 * @returns Array of available attributes
 */
function getAvailableAttributes(currentAttributes: string[]): string[] {
    const allAttributes: string[] = ['HI', 'RI', 'CS', 'BL', 'ND', 'UL', 'PC', 'PR'];
    return allAttributes.filter(attribute => !currentAttributes.includes(attribute));
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds display attributes to a DDS element (field or constant) either inline or as separate attribute lines.
 * Handles both inline attributes (position 44+) and multi-line attributes with indicators.
 * @param editor - The VSCode text editor instance containing the DDS source
 * @param element - The DDS element (field/constant) to add attributes to
 * @param attrToAdd - Array of attributes with indicators to be added to the element
 * @returns Promise that resolves when the edit operation is complete
 */
async function addAttributesToElement(
    editor: vscode.TextEditor,
    element: any,
    attrToAdd: AttributeWithIndicators[]
): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    buildAttributeEdits(workspaceEdit, editor, element, attrToAdd);
    return applyWorkspaceEdit(workspaceEdit, 'add the attributes');
};

/**
 * Appends the edits needed to add the given attributes to a single element into an existing
 * `WorkspaceEdit`, without creating or applying its own — lets callers batch edits for several
 * elements into one `WorkspaceEdit`/one `applyWorkspaceEdit` call (see `addAttributeToMultipleElements`).
 * @param workspaceEdit - The shared workspace edit to append to
 * @param editor - The active text editor
 * @param element - The DDS element to add attributes to
 * @param attrToAdd - Array of attributes with indicators to add
 */
function buildAttributeEdits(
    workspaceEdit: vscode.WorkspaceEdit,
    editor: vscode.TextEditor,
    element: any,
    attrToAdd: AttributeWithIndicators[]
): void {
    const isConstant = element.kind === 'constant';
    const numberOfAttributes = getNumberOfAttributesForElement(element);
    const uri = editor.document.uri;

    // Handle first-time attribute addition for fields (not constants)
    if (!isConstant && numberOfAttributes === 0 && attrToAdd.length > 0) {
        const firstAttribute = attrToAdd[0];
        
        // Add attributes inline if the first attribute has no indicators
        if (firstAttribute.indicators.length === 0) {
            // Add first attribute inline (position 44+)
            const fieldLine = editor.document.lineAt(element.lineIndex);
            const fieldLineText = fieldLine.text;
            
            // Ensure the line has at least 44 characters for proper DDS formatting
            const paddedLine = fieldLineText.padEnd(44, ' ');
            const firstAttributeText = createInlineAttributeText(firstAttribute);
            
            // Replace the entire line with the padded line + first attribute
            workspaceEdit.replace(
                uri,
                fieldLine.range,
                paddedLine + firstAttributeText
            );

            // Add remaining attributes as separate lines if any exist
            if (attrToAdd.length > 1) {
                const insertionPoint = findElementInsertionPoint(editor, element);
                if (insertionPoint === -1) {
                    throw new Error('Could not find insertion point for additional attributes');
                };

                let crInserted: boolean = false;
                for (let i = 1; i < attrToAdd.length; i++) {
                    const attributeLine = createAttributeLineWithIndicators(attrToAdd[i]);
                    const insertPos = new vscode.Position(insertionPoint, 0);
                    
                    // Insert carriage return if we're at the end of the document
                    if (!crInserted && insertPos.line >= editor.document.lineCount) {
                        workspaceEdit.insert(uri, insertPos, '\n');
                        crInserted = true;
                    };
                    
                    workspaceEdit.insert(uri, insertPos, attributeLine);
                    
                    // Add line break between attributes (except for the last one at document end)
                    if (i < attrToAdd.length - 1 || insertPos.line < editor.document.lineCount) {
                        workspaceEdit.insert(uri, insertPos, '\n');
                    };
                };
            };
        } else {
            // If the first attribute has indicators, all attributes go on separate lines
            const insertionPoint = findElementInsertionPoint(editor, element);
            if (insertionPoint === -1) {
                throw new Error('Could not find insertion point for attributes');
            };

            let crInserted: boolean = false;
            for (let i = 0; i < attrToAdd.length; i++) {
                const attributeLine = createAttributeLineWithIndicators(attrToAdd[i]);
                const insertPos = new vscode.Position(insertionPoint, 0);
                
                // Insert carriage return if we're at the end of the document
                if (!crInserted && insertPos.line >= editor.document.lineCount) {
                    workspaceEdit.insert(uri, insertPos, '\n');
                    crInserted = true;
                };
                
                workspaceEdit.insert(uri, insertPos, attributeLine);
                
                // Add line break between attributes (except for the last one at document end)
                if (i < attrToAdd.length - 1 || insertPos.line < editor.document.lineCount) {
                    workspaceEdit.insert(uri, insertPos, '\n');
                };
            };
        };
    } else {
        // Add all attributes as separate lines (existing behavior for constants or elements with existing attributes)
        const insertionPoint = findElementInsertionPoint(editor, element);
        if (insertionPoint === -1) {
            throw new Error('Could not find insertion point for attributes');
        };

        let crInserted: boolean = false;
        for (let i = 0; i < attrToAdd.length; i++) {
            const attributeLine = createAttributeLineWithIndicators(attrToAdd[i]);
            const insertPos = new vscode.Position(insertionPoint, 0);
            
            // Insert carriage return if we're at the end of the document
            if (!crInserted && insertPos.line >= editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
                crInserted = true;
            };
            
            workspaceEdit.insert(uri, insertPos, attributeLine);
            
            // Add line break between attributes (except for the last one at document end)
            if (i < attrToAdd.length - 1 || insertPos.line < editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
            };
        };
    };
};

/**
 * Adds the given attribute(s) to every element in `nodes` at once — a single shared `WorkspaceEdit`
 * applied in one step, so one undo restores the whole batch. Unlike the single-element flow
 * (`handleAddAttributeCommand`), this always adds (never offers replace/remove for existing
 * attributes) and never prompts for conditioning indicators, since indicators aren't a value that
 * makes sense shared across a group of differently-conditioned elements.
 * @param editor - The active text editor
 * @param nodes - The DDS nodes (fields/constants) to add attributes to
 */
export async function addAttributeToMultipleElements(editor: vscode.TextEditor, nodes: DdsNode[]): Promise<void> {
    const targets = nodes.filter(n => n.ddsElement.kind === 'field' || n.ddsElement.kind === 'constant');
    if (targets.length === 0) return;

    const selectedAttributes = await vscode.window.showQuickPick(getAvailableAttributes([]), {
        title: `Add Attribute to ${targets.length} elements`,
        placeHolder: 'Select one or more attributes to add',
        canPickMany: true,
        ignoreFocusOut: true
    });

    if (!selectedAttributes || selectedAttributes.length === 0) {
        vscode.window.showInformationMessage('No attributes selected.');
        return;
    };

    const attrToAdd: AttributeWithIndicators[] = selectedAttributes.map(attribute => ({ attribute, indicators: [] }));

    const workspaceEdit = new vscode.WorkspaceEdit();
    for (const node of targets) {
        buildAttributeEdits(workspaceEdit, editor, node.ddsElement, attrToAdd);
    };

    if (!(await applyWorkspaceEdit(workspaceEdit, 'add the attributes'))) return;
    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');

    vscode.window.showInformationMessage(
        `Added attributes ${selectedAttributes.join(', ')} to ${targets.length} elements.`
    );
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
async function removeAttributesFromElement(editor: vscode.TextEditor, element: any): Promise<boolean> {
    const currentAttributes = getCurrentAttributesForElement(element);
    if (currentAttributes.length === 0) return true;

    // Remove from the last line to the first: DDS allows other keywords (and, for a constant, its
    // own quoted value) to share a DSPATR's line(s), so removeKeywordTextFromLines strips just this
    // attribute's own text and re-flows whatever remains back onto as few lines as it now fits in —
    // which can itself delete or merge lines, shifting the line numbers of everything below it (but
    // never above). Working latest-to-earliest keeps every remaining attribute's own line index
    // valid when its turn comes, regardless of whether it's inline on the element's own definition
    // line or on a separate line below it.
    // A multi-attribute keyword such as DSPATR(UL HI) is listed once per attribute, but must only
    // be removed once.
    const keywords = currentAttributes.filter((attr, index) =>
        currentAttributes.findIndex(other => other.lineIndex === attr.lineIndex && other.keywordText === attr.keywordText) === index);

    for (const attr of keywords.sort((a, b) => b.lineIndex! - a.lineIndex!)) {
        if (!(await removeWholeKeyword(editor, element, toKeywordValue(attr)))) {
            return false;
        };
    };

    return true;
};
