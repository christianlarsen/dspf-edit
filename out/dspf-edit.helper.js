"use strict";
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
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.helper.ts
*/
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
const dspf_edit_parser_1 = require("./dspf-edit.parser");
// Describes a "field" (returns row and column)
function describeDdsField(field) {
    if (field.kind !== 'field')
        return 'Not a field.';
    const length = field.length;
    const decimals = field.decimals;
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
// Describes a "constant" (returns row and column)
function describeDdsConstant(field) {
    if (field.kind !== 'constant')
        return 'Not a constant.';
    const row = field.row?.toString().padStart(2, '0') ?? '--';
    const col = field.column?.toString().padStart(2, '0') ?? '--';
    return `[${row},${col}]`;
}
;
// Describes a "record" (returns line with "attributes" of the)
function describeDdsRecord(field) {
    if (field.kind !== 'record')
        return 'Not a record.';
    return '';
}
;
// Describes a "file" (returns a blank string)
function describeDdsFile(field) {
    if (field.kind !== 'file')
        return 'Not a file.';
    return '';
}
;
// Returns the indicators formatted in a string
function formatDdsIndicators(indicators) {
    if (!indicators)
        return '';
    if (indicators.length === 0)
        return '';
    const indicatorStr = `[${indicators.map(ind => {
        const status = ind.active ? ' ' : 'N';
        const number = ind.number.toString().padStart(2, '0');
        return `${status}${number}`;
    }).join('')}]`;
    return indicatorStr;
}
;
// Returns attributes formatted in a string
function formatDdsAttributes(attributes) {
    if (!attributes || attributes.length === 0)
        return '';
    return attributes.map(attr => {
        const indicators = attr.indicators ? formatDdsIndicators(attr.indicators).trim() : '';
        return (indicators ? indicators + ' ' : '') + attr.value;
    }).join(', ');
}
;
function findEndLineIndex(document, startLineIndex) {
    let endLineIndex = startLineIndex;
    for (let i = startLineIndex; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
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
function isDdsFile(document) {
    const ddsExtensions = ['.dspf'];
    return ddsExtensions.some(ext => document.fileName.toLowerCase().endsWith(ext));
}
;
function parseSize(newSize) {
    const [intPart, decPart] = newSize.split(',');
    const length = parseInt(intPart, 10);
    const decimals = decPart ? parseInt(decPart, 10) : 0;
    return { length, decimals };
}
;
function recordExists(recordName) {
    let exists = false;
    if (dspf_edit_model_1.records.includes(recordName.toUpperCase())) {
        exists = true;
    }
    ;
    return exists;
}
;
function findOverlapsInRecord(record) {
    const overlaps = [];
    const elements = [
        ...record.fields.map(f => ({ ...f, kind: "field" })),
        ...record.constants.map(c => ({ ...c, kind: "constant" }))
    ];
    for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
            const e1 = elements[i];
            const e2 = elements[j];
            if (e1.row === e2.row) {
                const e1End = e1.col + e1.length - 1;
                const e2End = e2.col + e2.length - 1;
                if (e1.col <= e2End && e2.col <= e1End) {
                    overlaps.push({ a: e1, b: e2 });
                }
            }
        }
    }
    return overlaps;
}
;
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
function goToLine(lineNumber) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor.');
        return;
    }
    ;
    const position = new vscode.Position(lineNumber - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}
;
//# sourceMappingURL=dspf-edit.helper.js.map