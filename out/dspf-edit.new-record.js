"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.new-record.ts
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
exports.newRecord = newRecord;
const vscode = __importStar(require("vscode"));
const dspf_edit_helper_1 = require("./dspf-edit.helper");
;
;
;
;
// COMMAND REGISTRATION
/**
 * Registers the new record command for DDS files.
 * Allows users to create new records with various types and configurations.
 * @param context - The VS Code extension context
 */
function newRecord(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.new-record", async (node) => {
        await handleNewRecordCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the new record command creation workflow.
 * Validates context, collects user input, and creates the appropriate record type.
 * @param node - The DDS node from which to create the new record
 */
async function handleNewRecordCommand(node) {
    try {
        const element = node.ddsElement;
        // Validate element type - records can only be created from file or record level
        if (element.kind !== "record" && element.kind !== "file") {
            vscode.window.showWarningMessage("A record can be created only from file level or record level");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return;
        }
        ;
        // Collect record configuration from user
        const recordConfig = await collectRecordConfiguration();
        if (!recordConfig) {
            // User cancelled the operation
            return;
        }
        ;
        // Generate DDS lines for the new record
        const recordLines = generateRecordLines(recordConfig);
        // Insert the new record into the document
        await insertNewRecord(editor, recordLines);
        // Show success message
        const recordTypeLabel = getRecordTypeLabel(recordConfig.type);
        vscode.window.showInformationMessage(`Successfully created ${recordTypeLabel} record '${recordConfig.name}'.`);
    }
    catch (error) {
        console.error('Error creating new record:', error);
        vscode.window.showErrorMessage('An error occurred while creating the new record.');
    }
    ;
}
;
// USER INPUT COLLECTION FUNCTIONS
/**
 * Collects complete record configuration from user through interactive dialogs.
 * @returns Complete record configuration or null if user cancelled
 */
async function collectRecordConfiguration() {
    // Step 1: Get record name
    const recordName = await collectRecordName();
    if (!recordName)
        return null;
    // Step 2: Get record type
    const recordType = await collectRecordType();
    if (!recordType)
        return null;
    // Step 3: Collect type-specific configuration
    let windowConfig;
    let subfileConfig;
    if (recordType === 'WINDOW' || recordType === 'SFLWDW') {
        windowConfig = await collectWindowConfiguration();
        if (!windowConfig)
            return null;
    }
    ;
    if (recordType === 'SFL' || recordType === 'SFLWDW') {
        subfileConfig = await collectSubfileConfiguration();
        if (!subfileConfig)
            return null;
    }
    ;
    if (windowConfig === null) {
        windowConfig = undefined;
    }
    ;
    if (subfileConfig === null) {
        subfileConfig = undefined;
    }
    ;
    return {
        name: recordName,
        type: recordType,
        windowConfig,
        subfileConfig
    };
}
;
/**
 * Collects and validates the new record name from user input.
 * @returns Valid record name or null if cancelled
 */
async function collectRecordName() {
    const recordName = await vscode.window.showInputBox({
        title: 'Create New Record - Step 1/4',
        prompt: 'Enter the new record name',
        placeHolder: 'RECORD',
        validateInput: validateRecordName
    });
    return recordName?.toUpperCase() || null;
}
;
/**
 * Validates record name according to DDS rules.
 * @param value - The record name to validate
 * @returns Error message or null if valid
 */
function validateRecordName(value) {
    if (!value || value.trim() === '') {
        return "The record name cannot be empty.";
    }
    ;
    const trimmedValue = value.trim();
    if (trimmedValue.length > 10) {
        return "The record name must be 10 characters or fewer.";
    }
    ;
    if (/\s/.test(trimmedValue)) {
        return "The record name cannot contain spaces.";
    }
    ;
    if (/^\d/.test(trimmedValue)) {
        return "The record name cannot start with a number.";
    }
    ;
    if (!/^[A-Za-z][A-Za-z0-9@#$]*$/.test(trimmedValue)) {
        return "Invalid characters in record name. Use letters, numbers, @, #, $.";
    }
    ;
    if ((0, dspf_edit_helper_1.recordExists)(trimmedValue.toUpperCase())) {
        return "Record name already exists.";
    }
    ;
    return null;
}
;
/**
 * Collects record type selection from user.
 * @returns Selected record type or null if cancelled
 */
async function collectRecordType() {
    const recordTypes = [
        {
            label: "RECORD",
            description: "Standard DDS record format",
            detail: "Basic record for data display and input"
        },
        {
            label: "WINDOW",
            description: "Window overlay record",
            detail: "Creates a window with specified position and size"
        },
        {
            label: "SFL",
            description: "Subfile record",
            detail: "Creates subfile with control record for list processing"
        },
        {
            label: "SFLWDW",
            description: "Subfile window record",
            detail: "Creates subfile within a window overlay"
        }
    ];
    const selection = await vscode.window.showQuickPick(recordTypes, {
        title: 'Create New Record - Step 2/4',
        placeHolder: "Select the record type",
        canPickMany: false,
        ignoreFocusOut: true
    });
    return selection?.label || null;
}
;
/**
 * Collects complete window configuration including dimensions and title.
 * @returns Window configuration or null if cancelled
 */
async function collectWindowConfiguration() {
    // Collect window dimensions
    const dimensions = await collectWindowDimensions();
    if (!dimensions)
        return null;
    // Collect window title
    const title = await collectWindowTitle(dimensions.numCols);
    if (title === null)
        return null; // User cancelled
    return {
        dimensions,
        title: title || undefined
    };
}
;
/**
 * Collects window dimensions for WINDOW and SFLWDW record types.
 * @returns Window dimensions or null if cancelled
 */
async function collectWindowDimensions() {
    const startRow = await vscode.window.showInputBox({
        title: 'Window Configuration - Position',
        prompt: "Enter starting row (1-24)",
        placeHolder: "15",
        validateInput: (value) => validateNumericRange(value, 1, 24, "Row")
    });
    if (!startRow)
        return null;
    const startCol = await vscode.window.showInputBox({
        title: 'Window Configuration - Position',
        prompt: "Enter starting column (1-80)",
        placeHolder: "20",
        validateInput: (value) => validateNumericRange(value, 1, 80, "Column")
    });
    if (!startCol)
        return null;
    const numRows = await vscode.window.showInputBox({
        title: 'Window Configuration - Size',
        prompt: "Enter number of rows (1-24)",
        placeHolder: "7",
        validateInput: (value) => validateNumericRange(value, 1, 24, "Number of rows")
    });
    if (!numRows)
        return null;
    const numCols = await vscode.window.showInputBox({
        title: 'Window Configuration - Size',
        prompt: "Enter number of columns (1-80)",
        placeHolder: "40",
        validateInput: (value) => validateNumericRange(value, 1, 80, "Number of columns")
    });
    if (!numCols)
        return null;
    return {
        startRow: Number(startRow),
        startCol: Number(startCol),
        numRows: Number(numRows),
        numCols: Number(numCols)
    };
}
;
/**
 * Collects window title with validation against window width.
 * @param windowWidth - Maximum allowed title length
 * @returns Window title or null if cancelled, empty string if no title
 */
async function collectWindowTitle(windowWidth) {
    const title = await vscode.window.showInputBox({
        title: 'Window Configuration - Title',
        prompt: `Enter window title (max ${windowWidth} characters, leave empty for no title)`,
        placeHolder: 'Window Title',
        validateInput: (value) => validateWindowTitle(value, windowWidth)
    });
    if (title === undefined)
        return null; // User cancelled
    return title.trim();
}
;
/**
 * Validates window title length against window width.
 * @param value - Title to validate
 * @param maxLength - Maximum allowed length
 * @returns Error message or null if valid
 */
function validateWindowTitle(value, maxLength) {
    if (!value || value.trim() === '') {
        return null; // Empty title is valid
    }
    ;
    const trimmedValue = value.trim();
    if (trimmedValue.length > maxLength) {
        return `Title cannot exceed ${maxLength} characters (window width).`;
    }
    ;
    return null;
}
;
/**
 * Collects subfile configuration for SFL and SFLWDW record types.
 * @returns Subfile configuration or null if cancelled
 */
async function collectSubfileConfiguration() {
    const controlRecordName = await vscode.window.showInputBox({
        title: 'Subfile Configuration - Control Record',
        prompt: 'Enter the subfile control record name',
        placeHolder: 'SFLCTL',
        validateInput: validateRecordName
    });
    if (!controlRecordName)
        return null;
    const size = await vscode.window.showInputBox({
        title: 'Subfile Configuration - Size',
        prompt: 'Enter total records in subfile (1-9999)',
        placeHolder: '10',
        validateInput: (value) => validateNumericRange(value, 1, 9999, "Subfile size")
    });
    if (!size)
        return null;
    const page = await vscode.window.showInputBox({
        title: 'Subfile Configuration - Page Size',
        prompt: 'Enter records per page (1-9999)',
        placeHolder: '9',
        validateInput: (value) => validateNumericRange(value, 1, 9999, "Page size")
    });
    if (!page)
        return null;
    return {
        controlRecordName: controlRecordName.toUpperCase(),
        size: Number(size),
        page: Number(page)
    };
}
;
// VALIDATION HELPER FUNCTIONS
/**
 * Validates numeric input within a specified range.
 * @param value - Input value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fieldName - Field name for error messages
 * @returns Error message or null if valid
 */
function validateNumericRange(value, min, max, fieldName) {
    if (!value || value.trim() === '') {
        return `${fieldName} cannot be empty.`;
    }
    ;
    const num = Number(value.trim());
    if (isNaN(num)) {
        return `${fieldName} must be a valid number.`;
    }
    ;
    if (num < min || num > max) {
        return `${fieldName} must be between ${min} and ${max}.`;
    }
    ;
    return null;
}
;
// RECORD GENERATION FUNCTIONS
/**
 * Generates DDS lines for the specified record configuration.
 * @param config - Complete record configuration
 * @returns Array of formatted DDS lines
 */
function generateRecordLines(config) {
    const lines = [];
    // Generate main record line
    lines.push(generateMainRecordLine(config));
    // Generate type-specific lines
    switch (config.type) {
        case 'WINDOW':
            if (config.windowConfig) {
                lines.push(generateWindowLine(config.windowConfig.dimensions));
                if (config.windowConfig.title) {
                    lines.push(...generateWindowTitleLines(config.windowConfig.title));
                }
                lines.push(...generateWindowBorderLines());
            }
            break;
        case 'SFL':
            if (config.subfileConfig) {
                lines.push(generateSubfileControlLine(config.name, config.subfileConfig));
            }
            break;
        case 'SFLWDW':
            if (config.subfileConfig && config.windowConfig) {
                lines.push(generateSubfileControlLine(config.name, config.subfileConfig));
                lines.push(generateWindowLine(config.windowConfig.dimensions));
                if (config.windowConfig.title) {
                    lines.push(...generateWindowTitleLines(config.windowConfig.title));
                }
                lines.push(...generateWindowBorderLines());
                lines.push(generateSubfileSizeLine(config.subfileConfig.size));
                lines.push(generateSubfilePageLine(config.subfileConfig.page));
            }
            break;
    }
    return lines;
}
;
/**
 * Generates the main record definition line.
 * @param config - Record configuration
 * @returns Formatted main record line
 */
function generateMainRecordLine(config) {
    let line = ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R ' + config.name.padEnd(10, ' ');
    // Add SFL keyword for subfile records
    if (config.type === 'SFL' || config.type === 'SFLWDW') {
        line += ' '.repeat(16) + 'SFL';
    }
    return line;
}
;
/**
 * Generates a window specification line.
 * @param dimensions - Window dimensions
 * @returns Formatted window line
 */
function generateWindowLine(dimensions) {
    return ' '.repeat(5) + 'A' + ' '.repeat(38) + 'WINDOW(' +
        dimensions.startRow + ' ' +
        dimensions.startCol + ' ' +
        dimensions.numRows + ' ' +
        dimensions.numCols + ')';
}
;
/**
 * Generates window title lines, handling line wrapping if needed.
 * @param title - Window title text
 * @returns Array of formatted title lines
 */
function generateWindowTitleLines(title) {
    const maxLineLength = 80;
    const basePrefix = ' '.repeat(5) + 'A' + ' '.repeat(38);
    const keyword = "WDWTITLE('";
    const suffix = "')";
    const lines = [];
    let remaining = title;
    let firstLine = true;
    while (remaining.length > 0) {
        if (firstLine) {
            const available = maxLineLength - (basePrefix.length + keyword.length + suffix.length);
            if (remaining.length <= available) {
                lines.push(basePrefix + keyword + remaining + suffix);
                break;
            }
            else {
                const part = remaining.substring(0, available);
                lines.push(basePrefix + keyword + part + '-');
                remaining = remaining.substring(available);
                firstLine = false;
            }
            ;
        }
        else {
            const available = maxLineLength - (basePrefix.length + suffix.length);
            if (remaining.length <= available) {
                lines.push(basePrefix + remaining + suffix);
                break;
            }
            else {
                const part = remaining.substring(0, available);
                lines.push(basePrefix + part + '-');
                remaining = remaining.substring(available);
            }
            ;
        }
        ;
    }
    ;
    return lines;
}
;
/**
 * Generates window border specification lines.
 * @returns Array of formatted window border lines
 */
function generateWindowBorderLines() {
    return [
        '     A                                      WDWBORDER((*COLOR BLU) (*DSPATR RI)-',
        "     A                                       (*CHAR '        ')) "
    ];
}
;
/**
 * Generates a subfile control record line.
 * @param subfileName - Name of the subfile record
 * @param config - Subfile configuration
 * @returns Formatted subfile control line
 */
function generateSubfileControlLine(subfileName, config) {
    return ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R ' + config.controlRecordName.padEnd(10, ' ') +
        ' '.repeat(16) + 'SFLCTL(' + subfileName.trim() + ')';
}
;
/**
 * Generates a subfile size specification line.
 * @param size - Subfile size
 * @returns Formatted SFLSIZ line
 */
function generateSubfileSizeLine(size) {
    return ' '.repeat(5) + 'A' + ' '.repeat(38) + 'SFLSIZ(' + String(size).padStart(4, '0') + ')';
}
;
/**
 * Generates a subfile page specification line.
 * @param page - Page size
 * @returns Formatted SFLPAG line
 */
function generateSubfilePageLine(page) {
    return ' '.repeat(5) + 'A' + ' '.repeat(38) + 'SFLPAG(' + String(page).padStart(4, '0') + ')';
}
;
// DOCUMENT INSERTION FUNCTIONS
/**
 * Inserts the new record lines into the document at the end.
 * @param editor - The active text editor
 * @param lines - Array of DDS lines to insert
 */
async function insertNewRecord(editor, lines) {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const insertPosition = new vscode.Position(editor.document.lineCount, 0);
    // Create the complete record text with proper line breaks
    const recordText = '\n' + lines.join('\n');
    workspaceEdit.insert(uri, insertPosition, recordText);
    await vscode.workspace.applyEdit(workspaceEdit);
}
;
// UTILITY FUNCTIONS
/**
 * Gets user-friendly label for record type.
 * @param type - Record type
 * @returns Human-readable record type label
 */
function getRecordTypeLabel(type) {
    const labels = {
        'RECORD': 'standard',
        'WINDOW': 'window',
        'SFL': 'subfile',
        'SFLWDW': 'subfile window'
    };
    return labels[type] || 'unknown';
}
;
//# sourceMappingURL=dspf-edit.new-record.js.map