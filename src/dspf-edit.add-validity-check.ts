/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-validity-check.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fieldsPerRecords } from './dspf-edit.model';
import { isAttributeLine, findElementInsertionPoint } from './dspf-edit.helper';

// INTERFACES AND TYPES

interface ValidityCheck {
    type: 'RANGE' | 'COMP' | 'VALUES';
    parameters: string[];
};

interface CompParameters {
    operator: 'EQ' | 'NE' | 'LT' | 'NL' | 'GT' | 'NG' | 'LE' | 'GE';
    value: string;
};

// COMMAND REGISTRATION

/**
 * Registers the add validity check command for DDS fields.
 * Allows users to interactively manage validity checks for fields.
 * @param context - The VS Code extension context
 */
export function addValidityCheck(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-validity-check", async (node: DdsNode) => {
            await handleAddValidityCheckCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add validity check command for a DDS field.
 * Manages existing validity checks and allows adding/removing checks.
 * @param node - The DDS node containing the field
 */
async function handleAddValidityCheckCommand(node: DdsNode): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        };

        // Validate element type - only fields can have validity checks
        if (node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Validity checks can only be added to fields.');
            return;
        };

        // Only "input" and "input/output" fields cam have validity checks
        if (node.ddsElement.type === 'O') {
            vscode.window.showWarningMessage('Validity checks cannot be added to output fields.');
            return;
        };

        // Get current validity checks from the field
        const currentValidityChecks = getCurrentValidityChecksForField(node.ddsElement);

        // Show current validity checks if any exist
        if (currentValidityChecks.length > 0) {
            const currentChecksList = currentValidityChecks.map(vc =>
                `${vc.type}(${vc.parameters.join(' ')})`
            ).join(', ');

            const action = await vscode.window.showQuickPick(
                ['Add more validity checks', 'Replace all validity checks', 'Remove all validity checks'],
                {
                    title: `Current validity checks: ${currentChecksList}`,
                    placeHolder: 'Choose how to manage validity checks'
                }
            );

            if (!action) return;

            if (action === 'Remove all validity checks') {
                await removeValidityChecksFromField(editor, node.ddsElement);
                return;
            };

            if (action === 'Replace all validity checks') {
                await removeValidityChecksFromField(editor, node.ddsElement);
                // Continue to add new validity checks
            };
            // If "Add more validity checks", continue with current logic
        };

        // Get field information to determine valid options
        const fieldInfo = getFieldInfo(node.ddsElement);
        if (!fieldInfo) {
            vscode.window.showErrorMessage('Could not determine field type for validity checks.');
            return;
        };

        // Collect new validity checks to add
        const selectedValidityChecks = await collectValidityChecksFromUser(fieldInfo);

        if (selectedValidityChecks.length === 0) {
            vscode.window.showInformationMessage('No validity checks selected.');
            return;
        };

        // Apply the selected validity checks to the field
        await addValidityChecksToField(editor, node.ddsElement, selectedValidityChecks);

        const checksSummary = selectedValidityChecks.map(vc =>
            `${vc.type}(${vc.parameters.join(' ')})`
        ).join(', ');

        vscode.window.showInformationMessage(
            `Added validity checks ${checksSummary} to ${node.ddsElement.name}.`
        );

    } catch (error) {
        console.error('Error managing validity checks:', error);
        vscode.window.showErrorMessage('An error occurred while managing validity checks.');
    };
};

// VALIDITY CHECKS EXTRACTION FUNCTIONS

/**
 * Extracts current validity checks from a DDS field.
 * @param element - The DDS field element
 * @returns Array of current validity checks
 */
function getCurrentValidityChecksForField(element: any): ValidityCheck[] {
    // Find the field in the fieldsPerRecords data
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return [];

    const fieldInfo = recordInfo.fields.find(field => field.name === element.name);
    if (!fieldInfo || !fieldInfo.attributes) return [];

    // Extract validity check attributes
    const validityChecks: ValidityCheck[] = [];
    
    fieldInfo.attributes.forEach(attrObj => {
        const attr = attrObj.value;
        // Check for RANGE
        const rangeMatch = attr.match(/^RANGE\(([^)]+)\)$/);
        if (rangeMatch) {
            const params = rangeMatch[1].split(' ').filter(p => p.trim());
            validityChecks.push({
                type: 'RANGE',
                parameters: params
            });
        };

        // Check for COMP
        const compMatch = attr.match(/^COMP\(([^)]+)\)$/);
        if (compMatch) {
            const params = compMatch[1].split(' ').filter(p => p.trim());
            validityChecks.push({
                type: 'COMP',
                parameters: params
            });
        };

        // Check for VALUES
        const valuesMatch = attr.match(/^VALUES\(([^)]+)\)$/);
        if (valuesMatch) {
            const params = valuesMatch[1].split(' ').filter(p => p.trim());
            validityChecks.push({
                type: 'VALUES',
                parameters: params
            });
        };
    });

    return validityChecks;
};

/**
 * Gets field information including type and length for validity checks.
 * @param element - The DDS field element
 * @returns Field information or null if not found
 */
function getFieldInfo(element: any): any {
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return null;

    return recordInfo.fields.find(field => field.name === element.name);
};

// USER INTERACTION FUNCTIONS

/**
 * Collects validity checks from user through interactive selection.
 * @param fieldInfo - Field information to determine valid options
 * @returns Array of selected validity checks 
 */
async function collectValidityChecksFromUser(fieldInfo: any): Promise<ValidityCheck[]> {
    const selectedValidityChecks: ValidityCheck[] = [];

    while (true) {
        const availableOptions = ['RANGE - Validation range', 'COMP - Value comparison', 'VALUES - Valid values list', 'Finish adding checks'];
        
        const selectedOption = await vscode.window.showQuickPick(
            availableOptions,
            {
                title: `Add Validity Check (${selectedValidityChecks.length} selected)`,
                placeHolder: 'Select validity check type'
            }
        );

        if (!selectedOption || selectedOption === 'Finish adding checks') break;

        let validityCheck: ValidityCheck | null = null;

        if (selectedOption.startsWith('RANGE')) {
            validityCheck = await collectRangeParameters(fieldInfo);
        } else if (selectedOption.startsWith('COMP')) {
            validityCheck = await collectCompParameters(fieldInfo);
        } else if (selectedOption.startsWith('VALUES')) {
            validityCheck = await collectValuesParameters(fieldInfo);
        };

        if (validityCheck) {
            selectedValidityChecks.push(validityCheck);
        };
    };

    return selectedValidityChecks;
};

/**
 * Collects RANGE parameters from user.
 * @param fieldInfo - Field information
 * @returns RANGE validity check or null if cancelled
 */
async function collectRangeParameters(fieldInfo: any): Promise<ValidityCheck | null> {
    const fieldType = fieldInfo.type || 'A';
    const isNumeric = ['P', 'S', 'B', 'F', 'I'].includes(fieldType);

    const fromValue = await vscode.window.showInputBox({
        title: 'RANGE - From Value',
        prompt: `Enter the starting value for the range (Field type: ${fieldType})`,
        placeHolder: isNumeric ? 'e.g., 0, -100' : 'e.g., A, AA',
        validateInput: (value: string) => {
            if (!value.trim()) return 'From value is required';
            return null;
        }
    });

    if (fromValue === undefined) return null;

    const toValue = await vscode.window.showInputBox({
        title: 'RANGE - To Value',
        prompt: `Enter the ending value for the range (Field type: ${fieldType})`,
        placeHolder: isNumeric ? 'e.g., 1000, 999' : 'e.g., Z, ZZ',
        validateInput: (value: string) => {
            if (!value.trim()) return 'To value is required';
            return null;
        }
    });

    if (toValue === undefined) return null;

    return {
        type: 'RANGE',
        parameters: [fromValue.trim(), toValue.trim()]
    };
};

/**
 * Collects COMP parameters from user.
 * @param fieldInfo - Field information
 * @returns COMP validity check or null if cancelled
 */
async function collectCompParameters(fieldInfo: any): Promise<ValidityCheck | null> {
    const operators = [
        'EQ - Equal to',
        'NE - Not equal to',
        'LT - Less than',
        'NL - Not less than',
        'GT - Greater than',
        'NG - Not greater than',
        'LE - Less than or equal',
        'GE - Greater than or equal'
    ];

    const selectedOperator = await vscode.window.showQuickPick(
        operators,
        {
            title: 'COMP - Select Operator',
            placeHolder: 'Choose comparison operator'
        }
    );

    if (!selectedOperator) return null;

    const operator = selectedOperator.split(' - ')[0] as CompParameters['operator'];

    const value = await vscode.window.showInputBox({
        title: `COMP - Comparison Value (${operator})`,
        prompt: `Enter the value to compare against (Field type: ${fieldInfo.type || 'A'})`,
        placeHolder: 'e.g., 0, 100, A',
        validateInput: (value: string) => {
            if (!value.trim()) return 'Comparison value is required';
            return null;
        }
    });

    if (value === undefined) return null;

    return {
        type: 'COMP',
        parameters: [operator, value.trim()]
    };
};

/**
 * Collects VALUES parameters from user.
 * @param fieldInfo - Field information
 * @returns VALUES validity check or null if cancelled
 */
async function collectValuesParameters(fieldInfo: any): Promise<ValidityCheck | null> {
    const values = await vscode.window.showInputBox({
        title: 'VALUES - Valid Values List',
        prompt: `Enter valid values separated by spaces (Field type: ${fieldInfo.type || 'A'})`,
        placeHolder: 'e.g., 0 1 2 or A B C',
        validateInput: (value: string) => {
            if (!value.trim()) return 'At least one valid value is required';
            const valueList = value.trim().split(/\s+/);
            if (valueList.length === 0) return 'At least one valid value is required';
            return null;
        }
    });

    if (values === undefined) return null;

    const valuesList = values.trim().split(/\s+/).filter(v => v.trim());

    return {
        type: 'VALUES',
        parameters: valuesList
    };
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds validity checks to a DDS field by inserting validity check lines after the field.
 * @param editor - The active text editor
 * @param element - The DDS field to add validity checks to
 * @param validityChecks - Array of validity checks to add
 */
async function addValidityChecksToField(
    editor: vscode.TextEditor,
    element: any,
    validityChecks: ValidityCheck[]
): Promise<void> {
    const insertionPoint = findElementInsertionPoint(editor, element);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for validity checks');
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Insert each validity check line
    let crInserted: boolean = false;
    for (let i = 0; i < validityChecks.length; i++) {
        const validityCheckLine = createValidityCheckLine(validityChecks[i]);
        const insertPos = new vscode.Position(insertionPoint, 0);
        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        };
        workspaceEdit.insert(uri, insertPos, validityCheckLine);
        if (i < validityChecks.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Creates a DDS validity check line.
 * @param validityCheck - The validity check
 * @returns Formatted DDS line in correct positions
 */
function createValidityCheckLine(validityCheck: ValidityCheck): string {
    let line = '     A '; // Start with 'A' and spaces up to position 7

    while (line.length < 44) {
        line += ' ';
    };

    // Add the validity check keyword and parameters
    line += `${validityCheck.type}(${validityCheck.parameters.join(' ')})`;

    return line;
};

/**
 * Removes existing validity checks from a DDS field using precise character offsets.
 * Handles edge cases properly to avoid leaving blank lines at the end of the file.
 * @param editor - The active text editor
 * @param element - The DDS field to remove validity checks from
 */
async function removeValidityChecksFromField(editor: vscode.TextEditor, element: any): Promise<void> {
    const validityCheckLines = findExistingValidityCheckLines(editor, element);
    if (validityCheckLines.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;

    // Group lines by type: field line vs standalone validity check lines
    const fieldLineIndex = element.lineIndex;
    const standaloneValidityCheckLines = validityCheckLines.filter(lineIndex => lineIndex !== fieldLineIndex);
    const hasFieldLineValidityCheck = validityCheckLines.includes(fieldLineIndex);

    // Handle standalone validity check lines using precise offsets
    if (standaloneValidityCheckLines.length > 0) {
        const deletionRanges = calculateValidityCheckDeletionRanges(document, standaloneValidityCheckLines);
        
        // Apply deletions in reverse order to maintain offsets
        for (let i = deletionRanges.length - 1; i >= 0; i--) {
            const { startOffset, endOffset } = deletionRanges[i];
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(endOffset);
            workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
        };
    };

    // Handle validity check on field line (just remove the validity check part)
    if (hasFieldLineValidityCheck) {
        const line = document.lineAt(fieldLineIndex);
        // Remove validity check keywords from the end of the line
        const lineText = line.text;
        const cleanedText = lineText.replace(/(RANGE|COMP|VALUES)\([^)]*\)/g, '').trimEnd();
        workspaceEdit.replace(uri, line.range, cleanedText);
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Calculates precise deletion ranges for standalone validity check lines.
 * Handles edge cases to prevent blank lines at the end of the file.
 * @param document - The text document
 * @param validityCheckLines - Array of line indices containing standalone validity checks
 * @returns Array of deletion ranges with start and end offsets
 */
function calculateValidityCheckDeletionRanges(
    document: vscode.TextDocument, 
    validityCheckLines: number[]
): { startOffset: number; endOffset: number }[] {
    const docText = document.getText();
    const docLength = docText.length;
    const ranges: { startOffset: number; endOffset: number }[] = [];
    
    // Group consecutive lines for more efficient deletion
    const lineGroups = groupConsecutiveLines(validityCheckLines);
    
    for (const group of lineGroups) {
        const firstLine = group[0];
        const lastLine = group[group.length - 1];
        
        let startOffset: number;
        let endOffset: number;
        
        if (lastLine === document.lineCount - 1) {
            // Group includes the last line of the document
            if (firstLine === 0) {
                // Entire document is validity check lines - delete everything
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
 * Finds existing validity check lines for a field.
 * @param editor - The active text editor
 * @param element - The DDS field
 * @returns Array of line indices containing validity checks
 */
function findExistingValidityCheckLines(editor: vscode.TextEditor, element: any): number[] {
    const validityCheckLines: number[] = [];
    const startLine = element.lineIndex;

    // Look for validity check lines after the field
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;

        // Special case: first line of a field can have validity checks
        if (i === element.lineIndex) {
            if (lineText.match(/(RANGE|COMP|VALUES)\(/)) {
                validityCheckLines.push(i);
            };
            continue;
        };

        if (!lineText.trim().startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };

        // Check if this is a validity check attribute
        if (lineText.match(/(RANGE|COMP|VALUES)\(/)) {
            validityCheckLines.push(i);
        };
    };

    return validityCheckLines;
};
