"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.helper.ts
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
exports.describeDdsField = describeDdsField;
exports.describeDdsConstant = describeDdsConstant;
exports.describeDdsRecord = describeDdsRecord;
exports.describeDdsFile = describeDdsFile;
exports.formatDdsIndicators = formatDdsIndicators;
exports.formatDdsAttributes = formatDdsAttributes;
exports.findEndLineIndex = findEndLineIndex;
exports.isDdsFile = isDdsFile;
exports.parseSize = parseSize;
exports.recordExists = recordExists;
exports.findOverlapsInRecord = findOverlapsInRecord;
exports.updateTreeProvider = updateTreeProvider;
exports.goToLine = goToLine;
exports.isAttributeLine = isAttributeLine;
exports.createAttributeLines = createAttributeLines;
exports.findElementInsertionPoint = findElementInsertionPoint;
exports.findElementInsertionPointRecordFirstLine = findElementInsertionPointRecordFirstLine;
exports.getElementRecordName = getElementRecordName;
exports.findElementsWithAttribute = findElementsWithAttribute;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
const dspf_edit_parser_1 = require("./dspf-edit.parser");
// FIELD DESCRIPTION FUNCTIONS
/**
 * Describes a DDS field element, returning its size, type, and position information.
 * @param field - The DDS element to describe
 * @returns A formatted string describing the field's properties
 */
function describeDdsField(field) {
    if (field.kind !== 'field')
        return 'Not a field.';
    const length = field.length;
    const decimals = field.decimals;
    // Format size string with decimals if present
    const sizeText = decimals && decimals > 0 ? `(${length}:${decimals})` : `(${length})`;
    const type = field.type;
    if (field.hidden) {
        return `${sizeText}${type} (Hidden)`;
    }
    else if (field.referenced) {
        const row = field.row?.toString().padStart(2, '0') ?? '--';
        const col = field.column?.toString().padStart(2, '0') ?? '--';
        return `(Referenced) [${col},${row}]`;
    }
    else {
        const row = field.row?.toString().padStart(2, '0') ?? '--';
        const col = field.column?.toString().padStart(2, '0') ?? '--';
        return `${sizeText}${type} [${col},${row}]`;
    }
    ;
}
;
/**
 * Describes a DDS constant element, returning its position information.
 * @param field - The DDS element to describe (should be a constant)
 * @returns A formatted string with the constant's row and column position
 */
function describeDdsConstant(field) {
    if (field.kind !== 'constant')
        return 'Not a constant.';
    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `[${row},${col}]`;
}
;
/**
 * Describes a DDS record element.
 * @param field - The DDS element to describe (should be a record)
 * @returns Currently returns an empty string (placeholder for future implementation)
 */
function describeDdsRecord(field) {
    if (field.kind !== 'record')
        return 'Not a record.';
    return '';
}
;
/**
 * Describes a DDS file element.
 * @param field - The DDS element to describe (should be a file)
 * @returns Currently returns an empty string (placeholder for future implementation)
 */
function describeDdsFile(field) {
    if (field.kind !== 'file')
        return 'Not a file.';
    return '';
}
;
// FORMATTING FUNCTIONS
/**
 * Formats DDS indicators into a readable string representation.
 * @param indicators - Array of DDS indicators to format
 * @returns A formatted string showing indicators with their active/inactive status
 */
function formatDdsIndicators(indicators) {
    if (!indicators || indicators.length === 0)
        return '';
    const indicatorStr = `[${indicators.map(ind => {
        const status = ind.active ? ' ' : 'N';
        const number = ind.number.toString().padStart(2, '0');
        return `${status}${number}`;
    }).join('')}]`;
    return indicatorStr;
}
;
/**
 * Formats DDS attributes into a readable string representation.
 * @param attributes - Array of DDS attributes to format
 * @returns A comma-separated string of formatted attributes with their indicators
 */
function formatDdsAttributes(attributes) {
    if (!attributes || attributes.length === 0)
        return '';
    return attributes.map(attr => {
        const indicators = attr.indicators ? formatDdsIndicators(attr.indicators).trim() : '';
        return (indicators ? indicators + ' ' : '') + attr.value;
    }).join(', ');
}
;
// DOCUMENT ANALYSIS FUNCTIONS
/**
 * Finds the end line index for a multi-line DDS constant that spans multiple lines.
 * @param document - The VS Code text document
 * @param startLineIndex - The starting line index to search from
 * @returns The index of the last line that belongs to the continued constant
 */
function findEndLineIndex(document, startLineIndex) {
    let endLineIndex = startLineIndex;
    for (let i = startLineIndex; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        // Check if this is a continued constant line
        // DDS constants that continue have "     A" at the start and "-" at position 79
        const isContinuedConstant = line.startsWith("     A") &&
            line.charAt(79) === "-";
        if (isContinuedConstant) {
            endLineIndex = i + 1;
        }
        else {
            break;
        }
        ;
    }
    ;
    return endLineIndex;
}
;
/**
 * Determines if a document is a DDS file based on its extension.
 * @param document - The VS Code text document to check
 * @returns True if the document has a DDS file extension
 */
function isDdsFile(document) {
    const ddsExtensions = ['.dspf'];
    return ddsExtensions.some(ext => document.fileName.toLowerCase().endsWith(ext));
}
;
// UTILITY FUNCTIONS
/**
 * Parses a size string into length and decimal components.
 * @param newSize - Size string in format "length" or "length,decimals"
 * @returns Object containing parsed length and decimals values
 */
function parseSize(newSize) {
    const [intPart, decPart] = newSize.split(',');
    const length = parseInt(intPart, 10);
    const decimals = decPart ? parseInt(decPart, 10) : 0;
    return { length, decimals };
}
;
/**
 * Checks if a record with the given name exists in the records array.
 * @param recordName - The name of the record to check
 * @returns True if the record exists (case-insensitive comparison)
 */
function recordExists(recordName) {
    return dspf_edit_model_1.records.includes(recordName.toUpperCase());
}
;
// OVERLAP DETECTION FUNCTIONS
/**
 * Finds overlapping fields and constants within a record.
 * Two elements overlap if they are on the same row and their column ranges intersect.
 * @param record - The record to analyze for overlaps
 * @returns Array of overlap pairs containing the overlapping elements
 */
function findOverlapsInRecord(record) {
    const overlaps = [];
    // Combine fields and constants into a single array for comparison
    const elements = [
        ...record.fields.map(f => ({ ...f, kind: "field" })),
        ...record.constants.map(c => ({ ...c, kind: "constant" }))
    ];
    // Compare each pair of elements
    for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
            const e1 = elements[i];
            const e2 = elements[j];
            // Only check elements on the same row
            if (e1.row === e2.row) {
                const e1End = e1.col + e1.length - 1;
                const e2End = e2.col + e2.length - 1;
                // Check if column ranges overlap
                if (e1.col <= e2End && e2.col <= e1End) {
                    overlaps.push({ a: e1, b: e2 });
                }
                ;
            }
            ;
        }
        ;
    }
    ;
    return overlaps;
}
;
// VS CODE INTEGRATION FUNCTIONS
/**
 * Updates the DDS tree provider with parsed elements from the current document.
 * Handles errors gracefully by showing error messages and clearing the tree.
 * @param treeProvider - The DDS tree provider to update
 * @param document - Optional VS Code document to parse (uses active editor if not provided)
 */
function updateTreeProvider(treeProvider, document) {
    try {
        if (document && isDdsFile(document)) {
            const text = document.getText();
            const elements = (0, dspf_edit_parser_1.parseDocument)(text);
            treeProvider.setElements(elements);
        }
        else {
            treeProvider.setElements([]);
        }
        ;
        treeProvider.refresh();
    }
    catch (error) {
        console.error('Error updating DDS tree:', error);
        vscode.window.showErrorMessage('Error parsing DDS file');
        treeProvider.setElements([]);
        treeProvider.refresh();
    }
    ;
}
;
/**
 * Navigates to a specific line number in the active text editor.
 * Centers the view on the target line and positions the cursor at the beginning.
 * @param lineNumber - The line number to navigate to (1-based)
 */
function goToLine(lineNumber) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor.');
        return;
    }
    ;
    // Convert to 0-based line number for VS Code API
    const position = new vscode.Position(lineNumber - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}
;
/**
 * Determines if a line is a DDS attribute line.
 * @param line - The line text to check
 * @returns True if the line contains attribute definitions
 */
function isAttributeLine(line) {
    // If line is a "record", returns false
    if (line.length > 15 && line[15] === 'R') {
        return false;
    }
    ;
    // If there is a field, returns false    
    const fieldName = line.substring(18, 27).trim();
    if (fieldName != '') {
        return false;
    }
    ;
    // Rest of cases
    // Checks for COLOR, DSPATR, EDTCDE... ???
    const trimmed = line.trim();
    return trimmed.startsWith('A ') && (trimmed.includes('COLOR(') ||
        trimmed.includes('DSPATR(') ||
        trimmed.includes('EDTCDE(') ||
        trimmed.includes('EDTWD(') ||
        trimmed.includes('REFFLD(') ||
        trimmed.includes('ERRMSG(') ||
        trimmed.includes('CF') ||
        trimmed.includes('CA') ||
        trimmed.includes('VALUES') ||
        trimmed.includes('SFLRCDNBR') ||
        // Add other attribute patterns as needed
        /[A-Z]+\(/.test(trimmed));
}
;
/**
 * Creates DDS attribute lines for attribute specifications.
 * @param attributeCode - Attribute code
 * @param attributes - Array of attribute codes
 * @returns Array of formatted DDS lines
 */
function createAttributeLines(attributeCode, attributes) {
    return attributes.map(attribute => {
        return `     A` + ' '.repeat(38) + `${attributeCode}(${attribute})`;
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
 * Finds the insertion point after a DDS record for adding attributes (must be the first line after the
 * record declaration)
 * @param editor - The active text editor
 * @param element - The DDS element
 * @returns Line index for insertion or -1 if not found
 */
function findElementInsertionPointRecordFirstLine(editor, element) {
    const elementLineIndex = element.lineIndex;
    // Look for the line after the element definition
    // Skip any existing attribute lines
    let insertionPoint = elementLineIndex + 1;
    // Skip existing attribute lines (lines that start with "     A" and have attributes)
    while (insertionPoint < editor.document.lineCount) {
        const line = editor.document.lineAt(insertionPoint).text;
        if (line.trim().startsWith('A*')) {
            insertionPoint++;
            continue;
        }
        ;
        if (line.trim().startsWith('A ')) {
            break;
        }
        ;
    }
    ;
    return insertionPoint;
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
 * Finds all elements in a record that have an attribute code.
 * This could be useful for reporting or bulk operations.
 * @param recordName - The name of the record
 * @param attributeCode - Attribute code
 * @returns Array of element names that have attributes
 */
function findElementsWithAttribute(recordName, attributeCode) {
    const recordInfo = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === recordName);
    if (!recordInfo)
        return [];
    const elementsWithAttributes = [];
    [...recordInfo.fields, ...recordInfo.constants].forEach(element => {
        const hasAttribute = element.attributes?.some(attr => {
            const matchStr = `/^${attributeCode}\([A-Z]{3}\)$/`;
            attr.match(matchStr);
        });
        if (hasAttribute) {
            elementsWithAttributes.push(element.name);
        }
        ;
    });
    return elementsWithAttributes;
}
;
//# sourceMappingURL=dspf-edit.helper.js.map