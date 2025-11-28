/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-error-messages.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { isAttributeLine, findElementInsertionPointRecordFirstLine, checkForEditorAndDocument, groupConsecutiveLines } from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

interface ErrorMessageConfig {
    indicator: string;
    messageText: string;
    responseIndicator?: string;
    useResponseIndicator: boolean;
};

// COMMAND REGISTRATION

/**
 * Registers the add error message command for DDS fields.
 * Allows users to interactively manage error messages for input fields.
 * @param context - The VS Code extension context
 */
export function addErrorMessage(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-error-message", async (node: DdsNode) => {
            await handleAddErrorMessageCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add error message command for a DDS field.
 * Validates field type and manages existing error messages.
 * @param node - The DDS node containing the field
 */
async function handleAddErrorMessageCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type - error messages can only be added to input-capable fields
        if (node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Error messages can only be added to fields.');
            return;
        };

        // Validate field usage - only input (I) and both (B) fields can have error messages
        const field = node.ddsElement;
        if (!isInputCapableField(field)) {
            vscode.window.showWarningMessage(
                `Error messages can only be added to input-capable fields (usage 'I' or 'B'). ` +
                `Field '${field.name}' has usage '${field.usage}'.`
            );
            return;
        };

        // Get current error messages from the field
        const currentErrorMessages = getCurrentErrorMessages(field);

        // Show current error messages if any exist
        if (currentErrorMessages.length > 0) {
            const currentMessagesList = currentErrorMessages.map(msg =>
                `${msg.indicator}: "${msg.messageText}"${msg.responseIndicator ? ` (Response: ${msg.responseIndicator})` : ''}`
            ).join('; ');

            const action = await vscode.window.showQuickPick(
                ['Add more error messages', 'Replace all error messages', 'Remove all error messages'],
                {
                    title: `Current error messages: ${currentMessagesList}`,
                    placeHolder: 'Choose how to manage error messages'
                }
            );

            if (!action) return;

            if (action === 'Remove all error messages') {
                await removeErrorMessagesFromField(editor, field);
                await vscode.commands.executeCommand('cursorRight');
                await vscode.commands.executeCommand('cursorLeft');
                
                vscode.window.showInformationMessage(`Removed all error messages from field '${field.name}'.`);
                return;
            };

            if (action === 'Replace all error messages') {
                await removeErrorMessagesFromField(editor, field);
            };
            // If "Add more error messages", continue with current logic
        };

        // Collect new error messages to add
        const selectedErrorMessages = await collectErrorMessagesFromUser();

        if (selectedErrorMessages.length === 0) {
            vscode.window.showInformationMessage('No error messages added.');
            return;
        };

        // Apply the selected error messages to the field
        await addErrorMessagesToField(editor, field, selectedErrorMessages);
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        const messagesSummary = selectedErrorMessages.map(msg =>
            `${msg.indicator}: "${msg.messageText}"`
        ).join(', ');

        vscode.window.showInformationMessage(
            `Added ${selectedErrorMessages.length} error message(s) to field '${field.name}': ${messagesSummary}`
        );

    } catch (error) {
        console.error('Error managing error messages:', error);
        vscode.window.showErrorMessage('An error occurred while managing error messages.');
    };
};

// VALIDATION FUNCTIONS

/**
 * Checks if a field is input-capable and can have error messages.
 * @param field - The DDS field to check
 * @returns true if field can have error messages
 */
function isInputCapableField(field: any): boolean {
    const usage = field.usage?.toUpperCase();
    // Only Input (I) and Both (B) fields can have error messages
    return usage === 'I' || usage === 'B';
};

// ERROR MESSAGE EXTRACTION FUNCTIONS

/**
 * Extracts current error messages from a DDS field.
 * @param field - The DDS field element
 * @returns Array of current error message configurations
 */
function getCurrentErrorMessages(field: any): ErrorMessageConfig[] {
    // Find the record containing this field
    const recordInfo = fieldsPerRecords.find(r => r.record === field.recordname);
    if (!recordInfo) return [];

    const elementInfo = [
        ...recordInfo.fields
    ].find(item => item.name === field.name);
    if (!elementInfo || !elementInfo.attributes) return [];

    // Extract ERRMSG attributes 
    const errorMessages: ErrorMessageConfig[] = [];
    if (elementInfo) {
        elementInfo.attributes.forEach(attrObj => {
            const attribute = attrObj.value;

            // Match ERRMSG patterns:
            // ERRMSG('message text')
            // ERRMSG('message text' response-indicator)
            
            const errmsgMatch = attribute ? attribute.match(/^ERRMSG\('([^']+)'\s*(\d{2})?\)$/) : null;
            if (errmsgMatch) {
                errorMessages.push({
                    indicator: (attrObj.indicators) ? (attrObj.indicators[0].number).toString() : '',
                    messageText: errmsgMatch[1],
                    responseIndicator: errmsgMatch[2],
                    useResponseIndicator: !!errmsgMatch[2],
                });
            };
        });
    };

    return errorMessages;
};

// USER INTERACTION FUNCTIONS

/**
 * Collects error messages from user through interactive selection.
 * @returns Array of selected error message configurations
 */
async function collectErrorMessagesFromUser(): Promise<ErrorMessageConfig[]> {
    const selectedErrorMessages: ErrorMessageConfig[] = [];

    while (true) {
        // Get indicator for this error message
        const indicator = await collectIndicatorForErrorMessage();
        if (!indicator) break; // User cancelled

        // Get message text
        const messageText = await collectErrorMessageText();
        if (!messageText) continue; // User cancelled or invalid input

        // Ask if user wants to use response indicator
        const useResponseIndicator = await askUseResponseIndicator();
        if (useResponseIndicator === undefined) continue; // User cancelled

        let responseIndicator: string | undefined | null;
        if (useResponseIndicator) {
            responseIndicator = await collectResponseIndicator(indicator);
            if (!responseIndicator) continue; // User cancelled
        };

        if (responseIndicator === null) responseIndicator = undefined;

        selectedErrorMessages.push({
            indicator,
            messageText,
            responseIndicator,
            useResponseIndicator
        });

        // Ask if user wants to add more messages
        const addMore = await vscode.window.showQuickPick(
            ['Add another error message', 'Finish adding messages'],
            {
                title: `Added ${selectedErrorMessages.length} error message(s)`,
                placeHolder: 'Add more messages or finish?'
            }
        );

        if (addMore !== 'Add another error message') break;
    };

    return selectedErrorMessages;
};

/**
 * Collects conditioning indicator for an error message.
 * @returns Selected indicator or null if cancelled
 */
async function collectIndicatorForErrorMessage(): Promise<string | null> {
    const indicator = await vscode.window.showInputBox({
        title: 'Error Message Indicator',
        prompt: 'Enter the indicator that will trigger this error message (01-99)',
        placeHolder: '31',
        validateInput: (value: string) => {
            if (!value.trim()) return 'Indicator is required';
            if (!/^\d{2}$/.test(value.trim())) {
                return 'Indicator must be a 2-digit number (01-99)';
            };
            const num = parseInt(value.trim());
            if (num < 1 || num > 99) {
                return 'Indicator must be between 01 and 99';
            };
            return null;
        }
    });

    return indicator?.trim().padStart(2, '0') || null;
};

/**
 * Collects error message text from user.
 * @returns Message text or null if cancelled
 */
async function collectErrorMessageText(): Promise<string | null> {
    const messageText = await vscode.window.showInputBox({
        title: 'Error Message Text',
        prompt: 'Enter the error message text to display',
        placeHolder: 'No stock available',
        validateInput: validateErrorMessageText
    });

    return messageText?.trim() || null;
};

/**
 * Validates error message text according to DDS rules.
 * @param value - The message text to validate
 * @returns Error message or null if valid
 */
function validateErrorMessageText(value: string): string | null {
    if (!value || value.trim() === '') {
        return "Error message text cannot be empty";
    };

    const trimmedValue = value.trim();

    // Check for single quotes which would break the DDS syntax
    if (trimmedValue.includes("'")) {
        return "Error message text cannot contain single quotes";
    };

    // Practical length limit (can be longer due to continuation lines)
    if (trimmedValue.length > 200) {
        return "Error message text should be 200 characters or fewer";
    };

    return null;
};

/**
 * Asks user if they want to use a response indicator.
 * @returns true if yes, false if no, undefined if cancelled
 */
async function askUseResponseIndicator(): Promise<boolean | undefined> {
    const choice = await vscode.window.showQuickPick(
        [
            {
                label: 'Use response indicator',
                description: 'Error message with response indicator for program handling',
                detail: 'ERRMSG(\'message text\' response-indicator)'
            },
            {
                label: 'No response indicator',
                description: 'Simple error message without response handling',
                detail: 'ERRMSG(\'message text\')'
            }
        ],
        {
            title: 'Response Indicator',
            placeHolder: 'Choose whether to use a response indicator'
        }
    );

    if (!choice) return undefined;
    return choice.label === 'Use response indicator';
};

/**
 * Collects response indicator from user.
 * @param optionIndicator - The option indicator for reference
 * @returns Response indicator or null if cancelled
 */
async function collectResponseIndicator(optionIndicator: string): Promise<string | null> {
    const responseIndicator = await vscode.window.showInputBox({
        title: 'Response Indicator',
        prompt: `Enter response indicator (typically same as option indicator: ${optionIndicator})`,
        value: optionIndicator, // Default to same as option indicator
        placeHolder: optionIndicator,
        validateInput: (value: string) => {
            if (!value.trim()) return 'Response indicator is required';
            if (!/^\d{2}$/.test(value.trim())) {
                return 'Response indicator must be a 2-digit number (01-99)';
            };
            const num = parseInt(value.trim());
            if (num < 1 || num > 99) {
                return 'Response indicator must be between 01 and 99';
            };
            return null;
        }
    });

    return responseIndicator?.trim().padStart(2, '0') || null;
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds error messages to a DDS field by inserting ERRMSG lines after the field.
 * @param editor - The active text editor
 * @param field - The DDS field to add error messages to
 * @param errorMessages - Array of error message configurations to add
 */
async function addErrorMessagesToField(
    editor: vscode.TextEditor,
    field: any,
    errorMessages: ErrorMessageConfig[]
): Promise<void> {
    const insertionPoint = findElementInsertionPointRecordFirstLine(editor, field);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for error messages');
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    // Insert each error message line
    let crInserted : boolean = false;    
    let currentInsertionPoint = insertionPoint;
    for (let i = 0; i < errorMessages.length; i++) {
        const errorMessageLines = createErrorMessageLines(errorMessages[i]);
        
        for (let j = 0; j < errorMessageLines.length; j++) {
            const insertPos = new vscode.Position(currentInsertionPoint, 0);

            if (!crInserted && insertPos.line >= editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
                crInserted = true;
            };
            workspaceEdit.insert(uri, insertPos, errorMessageLines[j]);
            if (i < errorMessages.length - 1 || insertPos.line < editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
            };
        };        
        currentInsertionPoint++; // Move insertion point for next error message
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Creates DDS error message lines, handling long text that needs continuation.
 * @param errorMessage - The error message configuration
 * @returns Array of DDS lines (may be multiple lines for long messages)
 */
function createErrorMessageLines(errorMessage: ErrorMessageConfig): string[] {
    const lines: string[] = [];
    const { indicator, messageText, responseIndicator, useResponseIndicator } = errorMessage;

    // Build the complete ERRMSG content
    let errmsgStart = "ERRMSG('";
    let errmsgEnd = "')";
    if (useResponseIndicator && responseIndicator) {
        errmsgEnd = `' ${responseIndicator})`;
    };

    // Calculate available space from position 44 to 79 (36 characters)
    const maxContentLength = 36; // positions 44-79 inclusive
    const firstLinePrefix = '     A  ' + indicator.padStart(2, '0') + ' '.repeat(34); // indicator at position 8
    const continuationPrefix = '     A' + ' '.repeat(38); // no indicator, start at position 44

    // Check if the complete ERRMSG fits in one line
    const completeErrmsg = errmsgStart + messageText + errmsgEnd;
    
    if (completeErrmsg.length <= maxContentLength) {
        // Single line - everything fits
        lines.push(firstLinePrefix + completeErrmsg);
        return lines;
    };

    // Multi-line handling - build the complete content first, then split by character limit
    const fullContent = errmsgStart + messageText + errmsgEnd;
    
    let remainingContent = fullContent;
    let isFirstLine = true;
    
    while (remainingContent.length > 0) {
        let currentLineContent: string;
        
        if (remainingContent.length <= maxContentLength) {
            // Last piece fits completely
            currentLineContent = remainingContent;
            remainingContent = '';
        } else {
            // Need to split - take what fits and add continuation marker
            currentLineContent = remainingContent.substring(0, maxContentLength - 1) + '-';
            remainingContent = remainingContent.substring(maxContentLength - 1);
        };
        
        if (isFirstLine) {
            lines.push(firstLinePrefix + currentLineContent);
            isFirstLine = false;
        } else {
            lines.push(continuationPrefix + currentLineContent);
        };
    };

    return lines;
};

/**
 * Removes existing error messages from a DDS field.
 * @param editor - The active text editor
 * @param field - The DDS field to remove error messages from
 */
async function removeErrorMessagesFromField(editor: vscode.TextEditor, field: any): Promise<void> {
    const errorMessageLines = findExistingErrorMessageLines(editor, field);
    if (errorMessageLines.length === 0) return;

    const document = editor.document;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = document.uri;

    // Calculate deletion ranges and apply in reverse order
    const deletionRanges = calculateErrorMessageDeletionRanges(document, errorMessageLines);

    for (let i = deletionRanges.length - 1; i >= 0; i--) {
        const { startOffset, endOffset } = deletionRanges[i];
        const startPos = document.positionAt(startOffset);
        const endPos = document.positionAt(endOffset);
        workspaceEdit.delete(uri, new vscode.Range(startPos, endPos));
    };

    await vscode.workspace.applyEdit(workspaceEdit);
};

/**
 * Finds existing error message lines for a field.
 * @param editor - The active text editor
 * @param field - The DDS field
 * @returns Array of line indices containing error messages
 */
function findExistingErrorMessageLines(editor: vscode.TextEditor, field: any): number[] {
    const errorMessageLines: number[] = [];
    const startLine = field.lineIndex + 1;

    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        const trimmedLine = lineText.trim();

        // Skip empty lines
        if (!trimmedLine) continue;

        // Skip comment lines (A*)
        if (trimmedLine.startsWith('A*')) continue;

        // Stop if we find a line that doesn't start with 'A ' or isn't an attribute line
        if (!trimmedLine.startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };

        // Check for ERRMSG keyword
        if (lineText.match(/\bERRMSG\s*\(/)) {
            errorMessageLines.push(i);
            
            // Check for continuation lines (lines ending with '+')
            let continuationLine = i + 1;
            let start = i;
            while (continuationLine < editor.document.lineCount && 
                   editor.document.lineAt(start).text.trim().endsWith('-')) {
                const contLineText = editor.document.lineAt(continuationLine).text;
                if (contLineText.trim().startsWith('A ')) {
                    errorMessageLines.push(continuationLine);
                    continuationLine++;
                    start++;
                } else {
                    break;
                };
            };
        };
    };

    return errorMessageLines;
};

/**
 * Calculates precise deletion ranges for error message lines.
 * @param document - The text document
 * @param errorMessageLines - Array of line indices containing error messages
 * @returns Array of deletion ranges with start and end offsets
 */
function calculateErrorMessageDeletionRanges(
    document: vscode.TextDocument,
    errorMessageLines: number[]
): { startOffset: number; endOffset: number }[] {
    const ranges: { startOffset: number; endOffset: number }[] = [];
    const docLength = document.getText().length;

    // Group consecutive lines for efficient deletion
    const lineGroups = groupConsecutiveLines(errorMessageLines);

    for (const group of lineGroups) {
        const firstLine = group[0];
        const lastLine = group[group.length - 1];

        let startOffset: number;
        let endOffset: number;

        if (lastLine === document.lineCount - 1) {
            // Group includes the last line
            if (firstLine === 0) {
                // Entire document is error message lines
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
            const afterGroupPos = document.lineAt(lastLine).rangeIncludingLineBreak.end;
            endOffset = document.offsetAt(afterGroupPos);
        };

        if (startOffset < endOffset && startOffset >= 0 && endOffset <= docLength) {
            ranges.push({ startOffset, endOffset });
        };
    };

    return ranges;
};
