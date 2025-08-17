/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-buttons.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { getRecordSize, fieldsPerRecords } from './dspf-edit.model';

// COMMAND REGISTRATION

/**
 * Registers the add buttons command for DDS records.
 * Allows users to interactively add function key buttons to a record.
 * @param context - The VS Code extension context
 */
export function addButtons(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-buttons", async (node: DdsNode) => {
            await handleAddButtonsCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add buttons command for a DDS record.
 * Collects button definitions from user and adds them to the record.
 * @param node - The DDS node containing the record
 */
async function handleAddButtonsCommand(node: DdsNode): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        };

        // Validate that the node is a record
        if (node.ddsElement.kind !== 'record') {
            vscode.window.showWarningMessage('Buttons can only be added to records.');
            return;
        };

        // Collect button definitions from user
        const buttons = await collectButtonDefinitions();
        if (buttons.length === 0) {
            vscode.window.showInformationMessage('No buttons entered.');
            return;
        };

        // Get record information
        const recordInfo = getRecordInformation(node.ddsElement.name);
        if (!recordInfo) {
            vscode.window.showErrorMessage('Record size or info not found.');
            return;
        };

        // Calculate button layout
        const layout = calculateButtonLayout(buttons, recordInfo);

        // Generate and apply DDS lines
        await applyButtonsToRecord(editor, buttons, recordInfo, layout);

    } catch (error) {
        console.error('Error adding buttons:', error);
        vscode.window.showErrorMessage('An error occurred while adding buttons.');
    };
};

// BUTTON COLLECTION FUNCTIONS

/**
 * Collects button definitions interactively from the user.
 * @returns Array of button definitions sorted by F-key number
 */
async function collectButtonDefinitions(): Promise<ButtonDefinition[]> {
    const buttons: ButtonDefinition[] = [];

    while (true) {
        const key = await getFunctionKeyFromUser(buttons);
        if (!key) break;

        const label = await getButtonLabelFromUser(key);
        if (!label) {
            vscode.window.showWarningMessage(`Skipping ${key} — no label entered.`);
            continue;
        };

        buttons.push({
            key: key,
            label: label.trimEnd()
        });
    };

    // Sort buttons by numeric F-key order
    return sortButtonsByFKeyOrder(buttons);
};

/**
 * Gets a function key from the user with validation.
 * @param existingButtons - Already defined buttons to check for duplicates
 * @returns The function key or null if user wants to finish
 */
async function getFunctionKeyFromUser(existingButtons: ButtonDefinition[]): Promise<string | null> {
    const key = await vscode.window.showInputBox({
        prompt: 'Function key (F1..F24) — leave empty to finish',
        placeHolder: 'F1',
        validateInput: (value) => validateFunctionKey(value, existingButtons)
    });

    return key ? key.toUpperCase() : null;
};

/**
 * Gets a button label from the user with validation.
 * @param key - The function key this label is for
 * @returns The button label or null if cancelled
 */
async function getButtonLabelFromUser(key: string): Promise<string | null> {
    const label = await vscode.window.showInputBox({
        prompt: `Text for ${key}`,
        placeHolder: 'Help',
        validateInput: (value) => validateButtonLabel(value)
    });

    return label || null;
};

// VALIDATION FUNCTIONS

/**
 * Validates function key input.
 * @param value - The function key value to validate
 * @param existingButtons - Existing buttons to check for duplicates
 * @returns Error message or empty string if valid
 */
function validateFunctionKey(value: string, existingButtons: ButtonDefinition[]): string {
    if (!value) return '';

    const upper = value.toUpperCase();

    // Validate F-key format (F1 through F24)
    if (!/^F([1-9]|1\d|2[0-4])$/.test(upper)) {
        return 'Invalid function key. Use format F1..F24';
    };

    // Prevent duplicates
    if (existingButtons.some(b => b.key === upper)) {
        return `Function key ${upper} already used.`;
    };

    return '';
};

/**
 * Validates button label input.
 * @param value - The button label to validate
 * @returns Error message or empty string if valid
 */
function validateButtonLabel(value: string): string {
    if (!value.trim()) {
        return 'Button text cannot be empty';
    };
    if (value.startsWith(' ')) {
        return 'Button text cannot start with a space';
    };
    if (value.length > 34) {
        return 'Button text cannot exceed 34 characters';
    };
    return '';
};

// RECORD INFORMATION FUNCTIONS

/**
 * Gets comprehensive record information needed for button placement.
 * @param recordName - The name of the record
 * @returns Complete record information or null if not found
 */
function getRecordInformation(recordName: string): RecordInformation | null {
    const recordSize = getRecordSize(recordName);
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);

    if (!recordSize || !recordInfo) {
        return null;
    };

    return {
        name: recordName,
        size: recordSize,
        info: recordInfo,
        endLineIndex: recordInfo.endIndex + 1,
        visibleStart: recordInfo.size?.originRow ?? 0,
        maxColumns: recordInfo.size?.cols ?? 0
    };
};

// LAYOUT CALCULATION FUNCTIONS

/**
 * Calculates the optimal layout for buttons within the record.
 * @param buttons - Array of button definitions
 * @param recordInfo - Record information
 * @returns Layout information for button placement
 */
function calculateButtonLayout(buttons: ButtonDefinition[], recordInfo: RecordInformation): ButtonLayout {
    const startCol = 1;
    const spacing = 2; // Space between buttons
    let col = startCol;
    let rowsNeeded = 1;

    // Calculate how many rows are needed
    for (const btn of buttons) {
        const text = `${btn.key}=${btn.label}`;
        if (col + text.length > recordInfo.maxColumns - 1) {
            rowsNeeded++;
            col = startCol;
        };
        col += text.length + spacing;
    };
    
    // Calculate starting row RELATIVE to the record/window
    // The last button line should be at the second-to-last row of the record
    const targetRow = recordInfo.size.rows - 1; // Penultimate row (relative to record)
    const startRow = targetRow - (rowsNeeded - 1);

    return {
        startRow: startRow,
        startCol: startCol,
        rowsNeeded: rowsNeeded,
        spacing: spacing
    };
};

// DDS LINE GENERATION FUNCTIONS

/**
 * Applies the button definitions to the record by generating and inserting DDS lines.
 * @param editor - The active text editor
 * @param buttons - Array of button definitions
 * @param recordInfo - Record information
 * @param layout - Layout information
 */
async function applyButtonsToRecord(
    editor: vscode.TextEditor,
    buttons: ButtonDefinition[],
    recordInfo: RecordInformation,
    layout: ButtonLayout
): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const doc = editor.document;
    
    let currentRow = layout.startRow;
    let currentCol = layout.startCol;
    let crInserted = false;

    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const text = `${btn.key}=${btn.label}`;

        // Wrap to next row if text exceeds max columns
        if (currentCol + text.length > recordInfo.maxColumns - 1) {
            currentRow++;
            currentCol = layout.startCol;
        };

        // Create DDS line for this button
        const ddsLine = createButtonDdsLine(text, currentRow, currentCol + 1);
        const insertPos = new vscode.Position(recordInfo.endLineIndex, 0);

        // Ensure proper line breaks
        if (!crInserted && insertPos.line >= doc.lineCount) {
            edit.insert(doc.uri, insertPos, '\n');
            crInserted = true;
        };

        edit.insert(doc.uri, insertPos, ddsLine);

        // Add newline if more buttons remain or if not at end of document
        if (i < buttons.length - 1 || insertPos.line < doc.lineCount) {
            edit.insert(doc.uri, insertPos, '\n');
        };

        currentCol += text.length + layout.spacing;
    };

    await vscode.workspace.applyEdit(edit);
    vscode.window.showInformationMessage(`Added ${buttons.length} buttons to record ${recordInfo.name}.`);
};

/**
 * Creates a DDS line for a button constant.
 * @param text - The button text (e.g., "F1=Help")
 * @param row - The row position
 * @param col - The column position
 * @returns The formatted DDS line
 */
function createButtonDdsLine(text: string, row: number, col: number): string {
    const rowStr = String(row).padStart(2, ' ');
    const colStr = String(col).padStart(2, ' ');

    // Build DDS line with proper formatting
    // Format: "     A          [row][col]'[text]'"
    let ddsLine = ''.padEnd(45, ' ');
    ddsLine = ddsLine.substring(0, 5) + 'A' + ddsLine.substring(6);
    ddsLine = ddsLine.substring(0, 39) + rowStr + ddsLine.substring(41);
    ddsLine = ddsLine.substring(0, 42) + colStr + `'${text}'`;

    return ddsLine;
};

// UTILITY FUNCTIONS

/**
 * Sorts buttons by their F-key numeric order.
 * @param buttons - Array of button definitions to sort
 * @returns Sorted array of button definitions
 */
function sortButtonsByFKeyOrder(buttons: ButtonDefinition[]): ButtonDefinition[] {
    return buttons.sort((a, b) => {
        const numA = parseInt(a.key.substring(1), 10);
        const numB = parseInt(b.key.substring(1), 10);
        return numA - numB;
    });
};

/**
 * Finds the insertion point for adding new elements to a record.
 * This is a utility function that could be reused by other modules.
 * @param recordName - The name of the record
 * @returns The line index where new elements should be inserted
 */
export function findRecordInsertionPoint(recordName: string): number | null {
    const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
    return recordInfo ? recordInfo.endIndex + 1 : null;
};

// TYPE DEFINITIONS

/**
 * Represents a button definition with function key and label.
 */
interface ButtonDefinition {
    key: string;    // Function key (e.g., "F1", "F12")
    label: string;  // Button label text
};

/**
 * Contains comprehensive information about a record needed for button placement.
 */
interface RecordInformation {
    name: string;
    size: any;              // Record size information
    info: any;              // Additional record information
    endLineIndex: number;   // Line index where the record ends
    visibleStart: number;   // Starting row for visible area
    maxColumns: number;     // Maximum columns available
};

/**
 * Contains layout information for button placement.
 */
interface ButtonLayout {
    startRow: number;       // Starting row for first button
    startCol: number;       // Starting column for buttons
    rowsNeeded: number;     // Total rows needed for all buttons
    spacing: number;        // Space between buttons
};

