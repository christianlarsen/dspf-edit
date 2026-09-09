/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-error-messages.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { isAttributeLine, findElementInsertionPointRecordFirstLine, checkForEditorAndDocument, groupConsecutiveLines, applyWorkspaceEdit, removeKeywordTextFromLines } from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

interface ErrorMessageConfig {
    indicator: string;
    messageText: string;
    responseIndicator?: string;
    useResponseIndicator: boolean;
    /** The keyword's own text exactly as parsed (e.g. "ERRMSG('No stock' 31)") and its line range —
     * only set for an existing message read off the field, used to locate/remove it precisely
     * without disturbing sibling keywords or other messages. */
    raw?: string;
    lineIndex?: number;
    lastLineIndex?: number;
};

/** One row of the error-messages summary menu: an existing ERRMSG occurrence (`messageIndex` into
 * the current list), or one of the two trailing action rows. */
interface ErrorMessageMenuItem extends vscode.QuickPickItem {
    messageIndex: number;
    action?: 'addNew' | 'removeAll';
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

        // Show a summary menu — one row per existing message, editable/removable individually —
        // instead of the old "Add more/Replace all/Remove all" 3-choice picker. Unlike RANGE/COMP/
        // VALUES, ERRMSG can legitimately be coded more than once on the same field (the manual is
        // explicit: "You can specify ERRMSG ... more than once for a single field"), each with its
        // own trigger indicator, so a real list — not a mutually-exclusive set — is the right shape.
        if (currentErrorMessages.length > 0) {
            const choice = await showErrorMessageMenu(buildErrorMessageMenuItems(currentErrorMessages), field.name);
            if (!choice) return;

            if (choice.action === 'removeAll') {
                if (!(await removeErrorMessagesFromField(editor, field))) {
                    return;
                };
                await vscode.commands.executeCommand('cursorRight');
                await vscode.commands.executeCommand('cursorLeft');

                vscode.window.showInformationMessage(`Removed all error messages from field '${field.name}'.`);
                return;
            };

            if (choice.action === 'remove') {
                await removeOneErrorMessage(editor, field, currentErrorMessages[choice.messageIndex]);
                return;
            };

            if (choice.action === 'edit') {
                const existing = currentErrorMessages[choice.messageIndex];
                const updated = await collectOneErrorMessage(existing);
                if (!updated) return;

                if (!(await removeOneErrorMessage(editor, field, existing, true))) return;
                if (!(await addErrorMessagesToField(editor, field, [updated]))) return;
                await vscode.commands.executeCommand('cursorRight');
                await vscode.commands.executeCommand('cursorLeft');

                vscode.window.showInformationMessage(
                    `Updated error message (indicator ${updated.indicator}) on field '${field.name}'.`
                );
                return;
            };
            // choice.action === 'addNew' falls through to the add flow below
        };

        // Collect new error messages to add
        const selectedErrorMessages = await collectErrorMessagesFromUser();

        if (selectedErrorMessages.length === 0) {
            vscode.window.showInformationMessage('No error messages added.');
            return;
        };

        // Apply the selected error messages to the field
        if (!(await addErrorMessagesToField(editor, field, selectedErrorMessages))) {
            return;
        };
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
                    raw: attribute,
                    lineIndex: attrObj.lineIndex,
                    lastLineIndex: attrObj.lastLineIndex
                });
            };
        });
    };

    return errorMessages;
};

// ERROR MESSAGES SUMMARY MENU

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Change' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Builds the error-messages summary menu's rows: one per existing ERRMSG occurrence (its trigger
 * indicator + text, with edit + trash buttons), plus an "Add error message..." row, plus a
 * "Remove all" row when there's more than one message (with just one, its own trash button already
 * does the same thing).
 * @param currentMessages - The field's current error messages, from `getCurrentErrorMessages`
 */
function buildErrorMessageMenuItems(currentMessages: ErrorMessageConfig[]): ErrorMessageMenuItem[] {
    const items: ErrorMessageMenuItem[] = currentMessages.map((msg, index) => ({
        messageIndex: index,
        label: `IND ${msg.indicator} — "${msg.messageText}"`,
        description: msg.responseIndicator ? `Response: ${msg.responseIndicator}` : undefined,
        buttons: [EDIT_BUTTON, REMOVE_BUTTON]
    }));

    items.push({ messageIndex: -1, action: 'addNew', label: '$(add) Add error message...' });

    if (currentMessages.length > 1) {
        items.push({ messageIndex: -1, action: 'removeAll', label: '$(trash) Remove all error messages' });
    };

    return items;
};

/**
 * Shows the error-messages summary menu and resolves to what the user did: picked a row (or its
 * edit button) to change it (`action: 'edit'`), clicked a row's trash button to remove just that
 * one (`action: 'remove'`), or picked one of the trailing action rows (`'addNew'`/`'removeAll'`) —
 * undefined if dismissed. Needs the raw `createQuickPick` API rather than the simpler `showQuickPick`
 * helper, since only it exposes per-item buttons (`onDidTriggerItemButton`).
 * @param items - The menu's rows, from `buildErrorMessageMenuItems`
 * @param fieldName - The field's name, for the menu's title
 */
function showErrorMessageMenu(
    items: ErrorMessageMenuItem[],
    fieldName: string
): Promise<{ action: 'edit' | 'remove' | 'addNew' | 'removeAll'; messageIndex: number } | undefined> {
    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<ErrorMessageMenuItem>();
        quickPick.items = items;
        quickPick.title = `Error messages for ${fieldName}`;
        quickPick.placeholder = 'Select a message to change, use its buttons, or add a new one';
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: { action: 'edit' | 'remove' | 'addNew' | 'removeAll'; messageIndex: number } | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'edit', messageIndex: event.item.messageIndex });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            if (!picked) { finish(undefined); return; };
            finish({ action: picked.action ?? 'edit', messageIndex: picked.messageIndex });
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

/**
 * Removes just one existing error message (the summary menu's trash-button action, or the first
 * step of editing one), using the same precise keyword-text removal as single-attribute deletion —
 * only this message's own text is stripped from its line(s), leaving sibling keywords and other
 * messages untouched.
 * @param editor - The active text editor
 * @param field - The DDS field the message belongs to
 * @param message - The existing message to remove (must carry `raw`/`lineIndex`/`lastLineIndex`)
 * @param silent - Suppresses the cursor nudge + confirmation message (used when immediately
 * re-adding a replacement as part of "edit")
 */
async function removeOneErrorMessage(
    editor: vscode.TextEditor,
    field: any,
    message: ErrorMessageConfig,
    silent: boolean = false
): Promise<boolean> {
    if (message.raw === undefined || message.lineIndex === undefined || message.lastLineIndex === undefined) {
        return false;
    };

    const preserveFirstLine = message.lineIndex === field.lineIndex;
    if (!(await removeKeywordTextFromLines(editor, message.lineIndex, message.lastLineIndex, message.raw, preserveFirstLine))) {
        return false;
    };

    if (!silent) {
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');
        vscode.window.showInformationMessage(`Removed error message (indicator ${message.indicator}) from field '${field.name}'.`);
    };
    return true;
};

/**
 * Collects a changed error message, prefilled with its current indicator/text/response indicator.
 * @param current - The message's current value
 */
async function collectOneErrorMessage(current: ErrorMessageConfig): Promise<ErrorMessageConfig | null> {
    const indicator = await collectIndicatorForErrorMessage(current.indicator);
    if (!indicator) return null;

    const messageText = await collectErrorMessageText(current.messageText);
    if (!messageText) return null;

    const useResponseIndicator = await askUseResponseIndicator(current.useResponseIndicator);
    if (useResponseIndicator === undefined) return null;

    let responseIndicator: string | undefined | null;
    if (useResponseIndicator) {
        responseIndicator = await collectResponseIndicator(indicator, current.responseIndicator);
        if (!responseIndicator) return null;
    };
    if (responseIndicator === null) responseIndicator = undefined;

    return { indicator, messageText, responseIndicator, useResponseIndicator };
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
 * @param current - The message's current indicator, when changing an existing one
 * @returns Selected indicator or null if cancelled
 */
async function collectIndicatorForErrorMessage(current?: string): Promise<string | null> {
    const indicator = await vscode.window.showInputBox({
        title: 'Error Message Indicator',
        prompt: 'Enter the indicator that will trigger this error message (01-99)',
        value: current,
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
 * @param current - The message's current text, when changing an existing one
 * @returns Message text or null if cancelled
 */
async function collectErrorMessageText(current?: string): Promise<string | null> {
    const messageText = await vscode.window.showInputBox({
        title: 'Error Message Text',
        prompt: 'Enter the error message text to display',
        value: current,
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
 * @param current - Whether the message currently uses one, when changing an existing message
 * @returns true if yes, false if no, undefined if cancelled
 */
async function askUseResponseIndicator(current?: boolean): Promise<boolean | undefined> {
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
            title: current !== undefined ? `Response Indicator (current: ${current ? 'used' : 'not used'})` : 'Response Indicator',
            placeHolder: 'Choose whether to use a response indicator'
        }
    );

    if (!choice) return undefined;
    return choice.label === 'Use response indicator';
};

/**
 * Collects response indicator from user.
 * @param optionIndicator - The option indicator for reference
 * @param current - The message's current response indicator, when changing an existing one
 * @returns Response indicator or null if cancelled
 */
async function collectResponseIndicator(optionIndicator: string, current?: string): Promise<string | null> {
    const responseIndicator = await vscode.window.showInputBox({
        title: 'Response Indicator',
        prompt: `Enter response indicator (typically same as option indicator: ${optionIndicator})`,
        value: current ?? optionIndicator, // Default to same as option indicator
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
): Promise<boolean> {
    const insertionPoint = findElementInsertionPointRecordFirstLine(editor, field);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for error messages');
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const insertPos = new vscode.Position(insertionPoint, 0);

    // Flatten all error message lines (each message may span several continuation lines)
    const allLines: string[] = [];
    for (const errorMessage of errorMessages) {
        allLines.push(...createErrorMessageLines(errorMessage));
    };

    // Insert every line at the same anchor position; VS Code concatenates
    // same-position edits in the order they are added.
    if (insertPos.line >= editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPos, '\n');
    };

    for (let j = 0; j < allLines.length; j++) {
        workspaceEdit.insert(uri, insertPos, allLines[j]);
        if (j < allLines.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
    };

    return applyWorkspaceEdit(workspaceEdit, 'add the error messages');
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
async function removeErrorMessagesFromField(editor: vscode.TextEditor, field: any): Promise<boolean> {
    const errorMessageLines = findExistingErrorMessageLines(editor, field);
    if (errorMessageLines.length === 0) return true;

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

    return applyWorkspaceEdit(workspaceEdit, 'remove the error messages');
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

        // Skip comment lines (column 7 = '*', regardless of column 6 being 'A' or blank)
        if (lineText.length > 6 && lineText.charAt(6) === '*') continue;

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
