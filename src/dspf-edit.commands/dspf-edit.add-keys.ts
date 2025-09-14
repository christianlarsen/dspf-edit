/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-keys.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { attributesFileLevel, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import {
    isAttributeLine, findElementInsertionPointRecordFirstLine, findElementInsertionPointFileFirstLine,
    handleDspsizWorkflow, DspsizConfig,
    checkForEditorAndDocument,
    groupConsecutiveLines
} from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

interface KeyCommandWithIndicators {
    type: 'CA' | 'CF';
    keyNumber: string;
    description: string;
    indicators: string[];
};

// COMMAND REGISTRATION

/**
 * Registers the add key command for DDS records.
 * Allows users to interactively manage key commands for records.
 * @param context - The VS Code extension context
 */
export function addKeyCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-key", async (node: DdsNode) => {
            await handleAddKeyCommandCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add key command for a DDS record.
 * Manages existing key commands with indicators and allows adding/removing commands.
 * @param node - The DDS node containing the record
 */
async function handleAddKeyCommandCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type - key commands can only be added to records
        if (node.ddsElement.kind !== 'record' && node.ddsElement.kind !== 'file') {
            vscode.window.showWarningMessage('Key commands can only be added to records or at file level.');
            return;
        };

        // Handle DSPSIZ specification if needed (only for file-level operations)
        let dspsizConfig: DspsizConfig | null = null;
        if (node.ddsElement.kind === 'file') {
            dspsizConfig = await handleDspsizWorkflow(editor, 'key command addition');
            if (dspsizConfig === undefined) {
                // User cancelled DSPSIZ configuration
                return;
            };
        };

        let currentKeyCommands: KeyCommandWithIndicators[] = [];

        switch (node.ddsElement.kind) {
            case 'record':
                // Get current key commands from the record
                currentKeyCommands = getCurrentKeyCommandsForRecord(node.ddsElement);
                break;
            case 'file':
                // Get current key commands from the file
                currentKeyCommands = getCurrentKeyCommandsForFile(node.ddsElement);
                break;
        };


        // Get available key numbers (excluding current ones)
        let availableKeys = getAvailableKeyNumbers(currentKeyCommands.map(k => k.keyNumber));

        // Show current key commands if any exist
        if (currentKeyCommands.length > 0) {
            const currentCommandsList = currentKeyCommands.map(k =>
                `${k.type}${k.keyNumber}${k.indicators.length > 0 ? `(${k.indicators.join(',')})` : ''} - ${k.description}`
            ).join('; ');

            const action = await vscode.window.showQuickPick(
                ['Add more key commands', 'Replace all key commands', 'Remove all key commands'],
                {
                    title: `Current key commands: ${currentCommandsList}`,
                    placeHolder: 'Choose how to manage key commands'
                }
            );

            if (!action) return;

            if (action === 'Remove all key commands') {
                switch (node.ddsElement.kind) {
                    case 'record':
                        await removeKeyCommandsFromRecord(editor, node.ddsElement);
                        break;
                    case 'file':
                        await removeKeyCommandsFromFile(editor);
                        break;
                };
                return;
            };

            if (action === 'Replace all key commands') {
                switch (node.ddsElement.kind) {
                    case 'record':
                        await removeKeyCommandsFromRecord(editor, node.ddsElement);
                        break;
                    case 'file':
                        await removeKeyCommandsFromFile(editor);
                        break;
                };
                // Continue to add new key commands
                availableKeys = getAvailableKeyNumbers([]);

            }
            // If "Add more key commands", continue with current logic
        };

        // Collect new key commands to add
        const selectedKeyCommands = await collectKeyCommandsWithIndicatorsFromUser(availableKeys);

        if (selectedKeyCommands.length === 0) {
            vscode.window.showInformationMessage('No key commands selected.');
            return;
        };

        switch (node.ddsElement.kind) {
            case 'record':
                // Apply the selected key commands to the record
                await addKeyCommandsToRecord(editor, node.ddsElement, selectedKeyCommands);
                break;
            case 'file':
                // Apply the selected key commands to the file
                await addKeyCommandsToFile(editor, selectedKeyCommands);
                break;
        };

        const commandsSummary = selectedKeyCommands.map(k =>
            `${k.type}${k.keyNumber}${k.indicators.length > 0 ? `(${k.indicators.join(',')})` : ''}`
        ).join(', ');

        // Create success message
        let successMessage: string;
        switch (node.ddsElement.kind) {
            case 'record':
                successMessage = `Added key commands ${commandsSummary} to record ${node.ddsElement.name}.`;
                break;
            case 'file':
                const dspsizMessage = dspsizConfig ? ' (with DSPSIZ specification)' : '';
                successMessage = `Added key commands ${commandsSummary} to file${dspsizMessage}.`;
                break;
            default:
                successMessage = `Added key commands ${commandsSummary}.`;
        };
    } catch (error) {
        console.error('Error managing key commands:', error);
        vscode.window.showErrorMessage('An error occurred while managing key commands.');
    };
};

// KEY COMMANDS EXTRACTION FUNCTIONS

/**
 * Extracts current key commands from a DDS record.
 * @param element - The DDS record element
 * @returns Array of current key commands
 */
function getCurrentKeyCommandsForRecord(element: any): KeyCommandWithIndicators[] {
    // Find the record in the fieldsPerRecords data
    const recordInfo = fieldsPerRecords.find(r => r.record === element.name);
    if (!recordInfo || !recordInfo.attributes) return [];

    const keyCommands: KeyCommandWithIndicators[] = [];

    recordInfo.attributes.forEach(attr => {
        const attribute = attr.value;

        // Match CA or CF commands: CA03(03 'End of program') or CF12(12 'Cancel')
        const commandMatch = attribute ? attribute.match(/^(CA|CF)(\d{2})\(\d{2}\s+'([^']{1,25})'\)$/) : false;
        if (commandMatch) {
            keyCommands.push({
                type: commandMatch[1] as 'CA' | 'CF',
                keyNumber: commandMatch[2],
                description: commandMatch[3],
                indicators: []
            });
        };
    });

    return keyCommands;
};

/**
 * Extracts current key commands from a DDS file (file level).
 * @param element - The DDS file element
 * @returns Array of current key commands
 */
function getCurrentKeyCommandsForFile(element: any): KeyCommandWithIndicators[] {
    // Find the record in the fieldsPerRecords data
    const fileInfo = attributesFileLevel;
    if (!fileInfo) return [];

    const keyCommands: KeyCommandWithIndicators[] = [];

    fileInfo.forEach(attr => {
        const attribute = attr.value;

        // Match CA or CF commands: CA03(03 'End of program') or CF12(12 'Cancel')
        const commandMatch = attribute ? attribute.match(/^(CA|CF)(\d{2})\(\d{2}\s+'([^']{1,25})'\)$/) : false;
        if (commandMatch) {
            keyCommands.push({
                type: commandMatch[1] as 'CA' | 'CF',
                keyNumber: commandMatch[2],
                description: commandMatch[3],
                indicators: []
            });
        };
    });

    return keyCommands;
};

/**
 * Gets available key numbers (01-24) excluding those already selected.
 * @param currentKeys - Array of currently selected key numbers
 * @returns Array of available key numbers
 */
function getAvailableKeyNumbers(currentKeys: string[]): string[] {
    const allKeys: string[] = [];

    // Generate key numbers 01-24
    for (let i = 1; i <= 24; i++) {
        const keyNum = i.toString().padStart(2, '0');
        allKeys.push(keyNum);
    };

    return allKeys.filter(key => !currentKeys.includes(key));
};

// USER INTERACTION FUNCTIONS

/**
 * Collects key commands with indicators from user through interactive selection.
 * @param availableKeys - Array of key numbers available for selection
 * @returns Array of selected key commands with indicators
 */
async function collectKeyCommandsWithIndicatorsFromUser(availableKeys: string[]): Promise<KeyCommandWithIndicators[]> {
    const selectedKeyCommands: KeyCommandWithIndicators[] = [];
    let remainingKeys = [...availableKeys];

    while (remainingKeys.length > 0) {
        const selectedKey = await vscode.window.showQuickPick(
            remainingKeys.map(key => ({
                label: `F${parseInt(key)}`,
                description: `Function key ${parseInt(key)}`,
                detail: `Key number: ${key}`
            })),
            {
                title: `Add Key Command (${selectedKeyCommands.length} selected) - Press ESC to finish`,
                placeHolder: 'Select function key from list'
            }
        );

        if (!selectedKey) break;

        const keyNumber = selectedKey.detail!.split(': ')[1];

        // Get command type (CA or CF)
        const commandType = await selectCommandType();
        if (!commandType) continue;

        // Get description
        const description = await collectKeyCommandDescription(keyNumber);
        if (!description) continue;

        // Collect indicators for this key command
        const indicators = await collectIndicatorsForKeyCommand(commandType, keyNumber);

        selectedKeyCommands.push({
            type: commandType,
            keyNumber: keyNumber,
            description: description,
            indicators: indicators
        });

        remainingKeys = remainingKeys.filter(k => k !== keyNumber);
    };

    return selectedKeyCommands;
};

/**
 * Allows user to select between CA (attention) and CF (function) command types.
 * @returns Selected command type or null if cancelled
 */
async function selectCommandType(): Promise<'CA' | 'CF' | null> {
    const commandTypes = [
        {
            label: 'CA',
            description: 'Command Attention',
            detail: 'Attention key - typically used for cancellation or exit functions'
        },
        {
            label: 'CF',
            description: 'Command Function',
            detail: 'Function key - typically used for processing or action functions'
        }
    ];

    const selection = await vscode.window.showQuickPick(commandTypes, {
        title: 'Select Command Type',
        placeHolder: 'Choose between CA (attention) or CF (function) key'
    });

    return (selection?.label as 'CA' | 'CF') || null;
};

/**
 * Collects description text for a key command.
 * @param keyNumber - The key number (01-24)
 * @returns Description text or null if cancelled
 */
async function collectKeyCommandDescription(keyNumber: string): Promise<string | null> {
    const description = await vscode.window.showInputBox({
        title: `Key Command F${parseInt(keyNumber)} - Description`,
        prompt: 'Enter description text for this key command (max 25 characters)',
        placeHolder: 'End of program',
        validateInput: validateKeyCommandDescription
    });

    return description?.trim() || null;
};

/**
 * Validates key command description according to DDS rules.
 * @param value - The description to validate
 * @returns Error message or null if valid
 */
function validateKeyCommandDescription(value: string): string | null {
    if (!value || value.trim() === '') {
        return "The description cannot be empty.";
    };

    const trimmedValue = value.trim();

    if (trimmedValue.length > 25) {
        return "The description must be 25 characters or fewer.";
    };

    // Check for single quotes which would break the DDS syntax
    if (trimmedValue.includes("'")) {
        return "The description cannot contain single quotes.";
    };

    return null;
};

/**
 * Collects conditioning indicators for a specific key command.
 * @param commandType - The command type (CA or CF)
 * @param keyNumber - The key number
 * @returns Array of indicator codes (max 3)
 */
async function collectIndicatorsForKeyCommand(commandType: string, keyNumber: string): Promise<string[]> {
    const indicators: string[] = [];

    while (indicators.length < 3) {
        const indicatorInput = await vscode.window.showInputBox({
            title: `Indicators for ${commandType}${keyNumber} - ${indicators.length}/3 added`,
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
                };
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

/**
 * Adds key commands with indicators to a DDS record by inserting command lines after the record.
 * @param editor - The active text editor
 * @param element - The DDS record to add key commands to
 * @param keyCommands - Array of key commands with indicators to add
 */
async function addKeyCommandsToRecord(
    editor: vscode.TextEditor,
    element: any,
    keyCommands: KeyCommandWithIndicators[]
): Promise<void> {
    const insertionPoint = findElementInsertionPointRecordFirstLine(editor, element);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for key commands');
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Insert each key command line
    let crInserted: boolean = false;
    for (let i = 0; i < keyCommands.length; i++) {
        const commandLine = createKeyCommandLineWithIndicators(keyCommands[i]);
        const insertPos = new vscode.Position(insertionPoint, 0);

        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        };

        workspaceEdit.insert(uri, insertPos, commandLine);
        if (i < keyCommands.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Adds key commands with indicators to a DDS file by inserting command lines in the first lines.
 * @param editor - The active text editor
 * @param keyCommands - Array of key commands with indicators to add
 */
async function addKeyCommandsToFile(
    editor: vscode.TextEditor,
    keyCommands: KeyCommandWithIndicators[]
): Promise<void> {
    const insertionPoint = findElementInsertionPointFileFirstLine(editor);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for key commands');
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Insert each key command line
    let crInserted: boolean = false;
    for (let i = 0; i < keyCommands.length; i++) {
        const commandLine = createKeyCommandLineWithIndicators(keyCommands[i]);
        const insertPos = new vscode.Position(insertionPoint, 0);

        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        };

        workspaceEdit.insert(uri, insertPos, commandLine);
        if (i < keyCommands.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Creates a DDS key command line with conditioning indicators.
 * @param keyCommandWithIndicators - The key command and its indicators
 * @returns Formatted DDS line with indicators in correct positions
 */
function createKeyCommandLineWithIndicators(keyCommandWithIndicators: KeyCommandWithIndicators): string {
    let line = '     A '; // Start with 'A' and spaces up to position 7

    // Add indicators
    for (let i = 0; i < 3; i++) {
        const startPos = 7 + (i * 3);
        if (i < keyCommandWithIndicators.indicators.length) {
            const indicator = keyCommandWithIndicators.indicators[i].padStart(3, ' ');
            line += indicator;
        };
    };

    while (line.length < 44) {
        line += ' ';
    };

    // Add the key command
    const { type, keyNumber, description } = keyCommandWithIndicators;
    line += `${type}${keyNumber}(${keyNumber} '${description}')`;

    return line;
};

/**
 * Removes existing key commands from a DDS record using precise character offsets.
 * Handles edge cases properly to avoid leaving blank lines at the end of the file.
 * @param editor - The active text editor
 * @param element - The DDS record to remove key commands from
 */
async function removeKeyCommandsFromRecord(editor: vscode.TextEditor, element: any): Promise<void> {
    const keyCommandLines = findExistingKeyCommandLines(editor, element);
    if (keyCommandLines.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;

    // All key command lines are standalone (not on the record definition line)
    const deletionRanges = calculateKeyCommandDeletionRanges(document, keyCommandLines);

    // Apply deletions in reverse order to maintain offsets
    for (let i = deletionRanges.length - 1; i >= 0; i--) {
        const { startOffset, endOffset } = deletionRanges[i];
        const startPos = document.positionAt(startOffset);
        const endPos = document.positionAt(endOffset);
        workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Removes existing key commands from a DDS file using precise character offsets.
 * Handles edge cases properly to avoid leaving blank lines at the end of the file.
 * @param editor - The active text editor
 */
async function removeKeyCommandsFromFile(editor: vscode.TextEditor): Promise<void> {
    const keyCommandLines = findExistingKeyCommandLinesInFile(editor);
    if (keyCommandLines.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;

    // All key command lines are standalone (not on the record definition line)
    const deletionRanges = calculateKeyCommandDeletionRanges(document, keyCommandLines);

    // Apply deletions in reverse order to maintain offsets
    for (let i = deletionRanges.length - 1; i >= 0; i--) {
        const { startOffset, endOffset } = deletionRanges[i];
        const startPos = document.positionAt(startOffset);
        const endPos = document.positionAt(endOffset);
        workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Calculates precise deletion ranges for standalone key command lines.
 * Handles edge cases to prevent blank lines at the end of the file.
 * @param document - The text document
 * @param keyCommandLines - Array of line indices containing key commands
 * @returns Array of deletion ranges with start and end offsets
 */
function calculateKeyCommandDeletionRanges(
    document: vscode.TextDocument,
    keyCommandLines: number[]
): { startOffset: number; endOffset: number }[] {
    const docText = document.getText();
    const docLength = docText.length;
    const ranges: { startOffset: number; endOffset: number }[] = [];

    // Group consecutive lines for more efficient deletion
    const lineGroups = groupConsecutiveLines(keyCommandLines);

    for (const group of lineGroups) {
        const firstLine = group[0];
        const lastLine = group[group.length - 1];

        let startOffset: number;
        let endOffset: number;

        if (lastLine === document.lineCount - 1) {
            // Group includes the last line of the document
            if (firstLine === 0) {
                // Entire document is key command lines - delete everything
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

// LINE CREATION AND DETECTION FUNCTIONS

/**
 * Finds existing key command lines for a record.
 * @param editor - The active text editor
 * @param element - The DDS record
 * @returns Array of line indices containing key commands
 */
function findExistingKeyCommandLines(editor: vscode.TextEditor, element: any): number[] {
    const keyCommandLines: number[] = [];
    const startLine = element.lineIndex + 1;

    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        const trimmedLine = lineText.trim();

        // Skip empty lines
        if (!trimmedLine) {
            continue;
        };

        // Skip comment lines (A*)
        if (trimmedLine.startsWith('A*')) {
            continue;
        };

        // Stop if we find a line that doesn't start with 'A ' or isn't an attribute line
        if (!trimmedLine.startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };

        if (lineText.match(/\b(CA|CF)\d{2}\(/)) {
            keyCommandLines.push(i);
        };
    };

    return keyCommandLines;
};

/**
 * Finds existing key command lines in file level.
 * @param editor - The active text editor
 * @returns Array of line indices containing key commands
 */
function findExistingKeyCommandLinesInFile(editor: vscode.TextEditor): number[] {
    const keyCommandLines: number[] = [];

    for (let i = 0; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;

        // Skip empty lines
        if (!lineText.trim()) {
            continue;
        };

        // Skip comment lines (A*)
        if (lineText.trimStart().startsWith('A*')) {
            continue;
        };

        // Stop if we hit a record definition (R in col 17)
        if (lineText.length > 16 && lineText[16] === 'R') {
            break;
        };

        // If this line has CAxx( or CFxx(
        if (lineText.match(/\b(CA|CF)\d{2}\(/)) {
            keyCommandLines.push(i);
            continue;
        };

        // If the previous line ended with a "-", check continuation
        if (i > 0) {
            const prevLine = editor.document.lineAt(i - 1).text;
            if (prevLine.length >= 80 && prevLine[79] === '-') {
                // Join previous + current to check CA/CF
                const combined = prevLine + lineText;
                if (combined.match(/\b(CA|CF)\d{2}\(/)) {
                    keyCommandLines.push(i - 1); // use the line where it starts
                };
            };
        };
    };

    return keyCommandLines;
};
