"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-error-messages.ts
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
exports.addErrorMessage = addErrorMessage;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
const dspf_edit_helper_1 = require("./dspf-edit.helper");
;
// COMMAND REGISTRATION
/**
 * Registers the add error message command for DDS fields.
 * Allows users to interactively manage error messages for input fields.
 * @param context - The VS Code extension context
 */
function addErrorMessage(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.add-error-message", async (node) => {
        await handleAddErrorMessageCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the add error message command for a DDS field.
 * Validates field type and manages existing error messages.
 * @param node - The DDS node containing the field
 */
async function handleAddErrorMessageCommand(node) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        ;
        // Validate element type - error messages can only be added to input-capable fields
        if (node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Error messages can only be added to fields.');
            return;
        }
        ;
        // Validate field usage - only input (I) and both (B) fields can have error messages
        const field = node.ddsElement;
        if (!isInputCapableField(field)) {
            vscode.window.showWarningMessage(`Error messages can only be added to input-capable fields (usage 'I' or 'B'). ` +
                `Field '${field.name}' has usage '${field.usage}'.`);
            return;
        }
        ;
        // Get current error messages from the field
        const currentErrorMessages = getCurrentErrorMessages(field);
        // Show current error messages if any exist
        if (currentErrorMessages.length > 0) {
            const currentMessagesList = currentErrorMessages.map(msg => `${msg.indicator}: "${msg.messageText}"${msg.responseIndicator ? ` (Response: ${msg.responseIndicator})` : ''}`).join('; ');
            const action = await vscode.window.showQuickPick(['Add more error messages', 'Replace all error messages', 'Remove all error messages'], {
                title: `Current error messages: ${currentMessagesList}`,
                placeHolder: 'Choose how to manage error messages'
            });
            if (!action)
                return;
            if (action === 'Remove all error messages') {
                await removeErrorMessagesFromField(editor, field);
                vscode.window.showInformationMessage(`Removed all error messages from field '${field.name}'.`);
                return;
            }
            ;
            if (action === 'Replace all error messages') {
                await removeErrorMessagesFromField(editor, field);
            }
            ;
            // If "Add more error messages", continue with current logic
        }
        ;
        // Collect new error messages to add
        const selectedErrorMessages = await collectErrorMessagesFromUser();
        if (selectedErrorMessages.length === 0) {
            vscode.window.showInformationMessage('No error messages added.');
            return;
        }
        ;
        // Apply the selected error messages to the field
        await addErrorMessagesToField(editor, field, selectedErrorMessages);
        const messagesSummary = selectedErrorMessages.map(msg => `${msg.indicator}: "${msg.messageText}"`).join(', ');
        vscode.window.showInformationMessage(`Added ${selectedErrorMessages.length} error message(s) to field '${field.name}': ${messagesSummary}`);
    }
    catch (error) {
        console.error('Error managing error messages:', error);
        vscode.window.showErrorMessage('An error occurred while managing error messages.');
    }
    ;
}
;
// VALIDATION FUNCTIONS
/**
 * Checks if a field is input-capable and can have error messages.
 * @param field - The DDS field to check
 * @returns true if field can have error messages
 */
function isInputCapableField(field) {
    const usage = field.usage?.toUpperCase();
    // Only Input (I) and Both (B) fields can have error messages
    return usage === 'I' || usage === 'B';
}
;
// ERROR MESSAGE EXTRACTION FUNCTIONS
/**
 * Extracts current error messages from a DDS field.
 * @param field - The DDS field element
 * @returns Array of current error message configurations
 */
function getCurrentErrorMessages(field) {
    // Find the record containing this field
    const recordInfo = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === field.recordname);
    if (!recordInfo)
        return [];
    const elementInfo = [
        ...recordInfo.fields
    ].find(item => item.name === field.name);
    if (!elementInfo || !elementInfo.attributes)
        return [];
    // Extract ERRMSG attributes 
    const errorMessages = [];
    if (elementInfo) {
        elementInfo.attributes.forEach(attr => {
            const attribute = attr;
            // Match ERRMSG patterns:
            // ERRMSG('message text')
            // ERRMSG('message text' response-indicator)
            const errmsgMatch = attribute ? attribute.match(/^ERRMSG\('([^']+)'\s*(\d{2})?\)$/) : null;
            if (errmsgMatch) {
                errorMessages.push({
                    indicator: errmsgMatch[2],
                    messageText: errmsgMatch[1],
                    responseIndicator: errmsgMatch[3],
                    useResponseIndicator: !!errmsgMatch[3]
                });
            }
            ;
        });
    }
    ;
    return errorMessages;
}
;
// USER INTERACTION FUNCTIONS
/**
 * Collects error messages from user through interactive selection.
 * @returns Array of selected error message configurations
 */
async function collectErrorMessagesFromUser() {
    const selectedErrorMessages = [];
    while (true) {
        // Get indicator for this error message
        const indicator = await collectIndicatorForErrorMessage();
        if (!indicator)
            break; // User cancelled
        // Get message text
        const messageText = await collectErrorMessageText();
        if (!messageText)
            continue; // User cancelled or invalid input
        // Ask if user wants to use response indicator
        const useResponseIndicator = await askUseResponseIndicator();
        if (useResponseIndicator === undefined)
            continue; // User cancelled
        let responseIndicator;
        if (useResponseIndicator) {
            responseIndicator = await collectResponseIndicator(indicator);
            if (!responseIndicator)
                continue; // User cancelled
        }
        ;
        if (responseIndicator === null)
            responseIndicator = undefined;
        selectedErrorMessages.push({
            indicator,
            messageText,
            responseIndicator,
            useResponseIndicator
        });
        // Ask if user wants to add more messages
        const addMore = await vscode.window.showQuickPick(['Add another error message', 'Finish adding messages'], {
            title: `Added ${selectedErrorMessages.length} error message(s)`,
            placeHolder: 'Add more messages or finish?'
        });
        if (addMore !== 'Add another error message')
            break;
    }
    ;
    return selectedErrorMessages;
}
;
/**
 * Collects conditioning indicator for an error message.
 * @returns Selected indicator or null if cancelled
 */
async function collectIndicatorForErrorMessage() {
    const indicator = await vscode.window.showInputBox({
        title: 'Error Message Indicator',
        prompt: 'Enter the indicator that will trigger this error message (01-99)',
        placeHolder: '31',
        validateInput: (value) => {
            if (!value.trim())
                return 'Indicator is required';
            if (!/^\d{2}$/.test(value.trim())) {
                return 'Indicator must be a 2-digit number (01-99)';
            }
            ;
            const num = parseInt(value.trim());
            if (num < 1 || num > 99) {
                return 'Indicator must be between 01 and 99';
            }
            ;
            return null;
        }
    });
    return indicator?.trim().padStart(2, '0') || null;
}
;
/**
 * Collects error message text from user.
 * @returns Message text or null if cancelled
 */
async function collectErrorMessageText() {
    const messageText = await vscode.window.showInputBox({
        title: 'Error Message Text',
        prompt: 'Enter the error message text to display',
        placeHolder: 'No stock available',
        validateInput: validateErrorMessageText
    });
    return messageText?.trim() || null;
}
;
/**
 * Validates error message text according to DDS rules.
 * @param value - The message text to validate
 * @returns Error message or null if valid
 */
function validateErrorMessageText(value) {
    if (!value || value.trim() === '') {
        return "Error message text cannot be empty";
    }
    ;
    const trimmedValue = value.trim();
    // Check for single quotes which would break the DDS syntax
    if (trimmedValue.includes("'")) {
        return "Error message text cannot contain single quotes";
    }
    ;
    // Practical length limit (can be longer due to continuation lines)
    if (trimmedValue.length > 200) {
        return "Error message text should be 200 characters or fewer";
    }
    ;
    return null;
}
;
/**
 * Asks user if they want to use a response indicator.
 * @returns true if yes, false if no, undefined if cancelled
 */
async function askUseResponseIndicator() {
    const choice = await vscode.window.showQuickPick([
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
    ], {
        title: 'Response Indicator',
        placeHolder: 'Choose whether to use a response indicator'
    });
    if (!choice)
        return undefined;
    return choice.label === 'Use response indicator';
}
;
/**
 * Collects response indicator from user.
 * @param optionIndicator - The option indicator for reference
 * @returns Response indicator or null if cancelled
 */
async function collectResponseIndicator(optionIndicator) {
    const responseIndicator = await vscode.window.showInputBox({
        title: 'Response Indicator',
        prompt: `Enter response indicator (typically same as option indicator: ${optionIndicator})`,
        value: optionIndicator, // Default to same as option indicator
        placeHolder: optionIndicator,
        validateInput: (value) => {
            if (!value.trim())
                return 'Response indicator is required';
            if (!/^\d{2}$/.test(value.trim())) {
                return 'Response indicator must be a 2-digit number (01-99)';
            }
            ;
            const num = parseInt(value.trim());
            if (num < 1 || num > 99) {
                return 'Response indicator must be between 01 and 99';
            }
            ;
            return null;
        }
    });
    return responseIndicator?.trim().padStart(2, '0') || null;
}
;
// DDS MODIFICATION FUNCTIONS
/**
 * Adds error messages to a DDS field by inserting ERRMSG lines after the field.
 * @param editor - The active text editor
 * @param field - The DDS field to add error messages to
 * @param errorMessages - Array of error message configurations to add
 */
async function addErrorMessagesToField(editor, field, errorMessages) {
    const insertionPoint = (0, dspf_edit_helper_1.findElementInsertionPointRecordFirstLine)(editor, field);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for error messages');
    }
    ;
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    // Insert each error message line
    let currentInsertionPoint = insertionPoint;
    for (let i = 0; i < errorMessages.length; i++) {
        const errorMessageLines = createErrorMessageLines(errorMessages[i]);
        for (let j = 0; j < errorMessageLines.length; j++) {
            const insertPos = new vscode.Position(currentInsertionPoint, 0);
            // Insert line break before the content if we're not at end of file
            if (currentInsertionPoint < editor.document.lineCount) {
                workspaceEdit.insert(uri, insertPos, '\n');
            }
            ;
            workspaceEdit.insert(uri, insertPos, errorMessageLines[j]);
        }
        ;
        currentInsertionPoint++; // Move insertion point for next error message
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Creates DDS error message lines, handling long text that needs continuation.
 * @param errorMessage - The error message configuration
 * @returns Array of DDS lines (may be multiple lines for long messages)
 */
function createErrorMessageLines(errorMessage) {
    const lines = [];
    const { indicator, messageText, responseIndicator, useResponseIndicator } = errorMessage;
    // Create the base ERRMSG syntax
    let errmsgContent = `ERRMSG('${messageText}'`;
    if (useResponseIndicator && responseIndicator) {
        errmsgContent += ` ${responseIndicator}`;
    }
    errmsgContent += ')';
    // Calculate available space for the ERRMSG content
    // Format: "     A NN                            ERRMSG(...)"
    //         "12345678901234567890123456789012345678901234567890" (positions)
    //                  ^^ indicator position
    //                                              ^ start of ERRMSG at position 44
    const basePrefix = '     A ' + indicator.padStart(2, '0') + ' '.repeat(35);
    const availableWidth = 80; // Standard DDS line width
    const contentStartPos = 44;
    const maxContentLength = availableWidth - contentStartPos;
    if (errmsgContent.length <= maxContentLength) {
        // Single line
        lines.push(basePrefix + errmsgContent);
    }
    else {
        // Multi-line with continuation
        const words = messageText.split(' ');
        let currentLine = '';
        let firstLine = true;
        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const testErrmsg = `ERRMSG('${testLine}'${useResponseIndicator && responseIndicator ? ` ${responseIndicator}` : ''})`;
            if (testErrmsg.length <= maxContentLength || currentLine === '') {
                currentLine = testLine;
            }
            else {
                // Current word doesn't fit, output current line with continuation
                const lineErrmsg = `ERRMSG('${currentLine}' +`;
                if (firstLine) {
                    lines.push(basePrefix + lineErrmsg);
                    firstLine = false;
                }
                else {
                    lines.push('     A' + ' '.repeat(37) + lineErrmsg);
                }
                ;
                currentLine = word;
            }
            ;
        }
        ;
        // Output final line
        const finalErrmsg = `'${currentLine}'${useResponseIndicator && responseIndicator ? ` ${responseIndicator}` : ''})`;
        if (firstLine) {
            // Everything fit in first line after all
            lines.push(basePrefix + `ERRMSG(${finalErrmsg}`);
        }
        else {
            lines.push('     A' + ' '.repeat(37) + finalErrmsg);
        }
        ;
    }
    ;
    return lines;
}
;
/**
 * Removes existing error messages from a DDS field.
 * @param editor - The active text editor
 * @param field - The DDS field to remove error messages from
 */
async function removeErrorMessagesFromField(editor, field) {
    const errorMessageLines = findExistingErrorMessageLines(editor, field);
    if (errorMessageLines.length === 0)
        return;
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
    }
    ;
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
/**
 * Finds existing error message lines for a field.
 * @param editor - The active text editor
 * @param field - The DDS field
 * @returns Array of line indices containing error messages
 */
function findExistingErrorMessageLines(editor, field) {
    const errorMessageLines = [];
    const startLine = field.lineIndex + 1;
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        const trimmedLine = lineText.trim();
        // Skip empty lines
        if (!trimmedLine)
            continue;
        // Skip comment lines (A*)
        if (trimmedLine.startsWith('A*'))
            continue;
        // Stop if we find a line that doesn't start with 'A ' or isn't an attribute line
        if (!trimmedLine.startsWith('A ') || !(0, dspf_edit_helper_1.isAttributeLine)(lineText)) {
            break;
        }
        ;
        // Check for ERRMSG keyword
        if (lineText.match(/\bERRMSG\s*\(/)) {
            errorMessageLines.push(i);
            // Check for continuation lines (lines ending with '+')
            let continuationLine = i + 1;
            while (continuationLine < editor.document.lineCount &&
                editor.document.lineAt(i).text.trim().endsWith('+')) {
                const contLineText = editor.document.lineAt(continuationLine).text;
                if (contLineText.trim().startsWith('A ')) {
                    errorMessageLines.push(continuationLine);
                    continuationLine++;
                }
                else {
                    break;
                }
                ;
            }
            ;
        }
        ;
    }
    ;
    return errorMessageLines;
}
;
/**
 * Calculates precise deletion ranges for error message lines.
 * @param document - The text document
 * @param errorMessageLines - Array of line indices containing error messages
 * @returns Array of deletion ranges with start and end offsets
 */
function calculateErrorMessageDeletionRanges(document, errorMessageLines) {
    const ranges = [];
    const docLength = document.getText().length;
    // Group consecutive lines for efficient deletion
    const lineGroups = groupConsecutiveLines(errorMessageLines);
    for (const group of lineGroups) {
        const firstLine = group[0];
        const lastLine = group[group.length - 1];
        let startOffset;
        let endOffset;
        if (lastLine === document.lineCount - 1) {
            // Group includes the last line
            if (firstLine === 0) {
                // Entire document is error message lines
                startOffset = 0;
                endOffset = docLength;
            }
            else {
                // Delete from end of previous line to end of file
                const prevLineEndPos = document.lineAt(firstLine - 1).range.end;
                startOffset = document.offsetAt(prevLineEndPos);
                endOffset = docLength;
            }
            ;
        }
        else {
            // Group is in the middle or at the beginning
            startOffset = document.offsetAt(new vscode.Position(firstLine, 0));
            const afterGroupPos = document.lineAt(lastLine).rangeIncludingLineBreak.end;
            endOffset = document.offsetAt(afterGroupPos);
        }
        ;
        if (startOffset < endOffset && startOffset >= 0 && endOffset <= docLength) {
            ranges.push({ startOffset, endOffset });
        }
        ;
    }
    ;
    return ranges;
}
;
/**
 * Groups consecutive line numbers for efficient batch deletion.
 * @param lines - Array of line indices (should be sorted)
 * @returns Array of arrays containing consecutive line numbers
 */
function groupConsecutiveLines(lines) {
    if (lines.length === 0)
        return [];
    const sortedLines = [...lines].sort((a, b) => a - b);
    const groups = [];
    let currentGroup = [sortedLines[0]];
    for (let i = 1; i < sortedLines.length; i++) {
        const currentLine = sortedLines[i];
        const previousLine = sortedLines[i - 1];
        if (currentLine === previousLine + 1) {
            currentGroup.push(currentLine);
        }
        else {
            groups.push(currentGroup);
            currentGroup = [currentLine];
        }
        ;
    }
    ;
    groups.push(currentGroup);
    return groups;
}
;
//# sourceMappingURL=dspf-edit.add-error-messages.js.map