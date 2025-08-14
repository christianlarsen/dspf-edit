"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-buttons.ts
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
exports.addButtons = addButtons;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
function addButtons(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.add-buttons", async (node) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        ;
        if (node.ddsElement.kind !== 'record') {
            return;
        }
        ;
        const buttons = [];
        while (true) {
            const key = await vscode.window.showInputBox({
                prompt: 'Function key (F1..F24) — leave empty to finish',
                placeHolder: 'F1',
                validateInput: (value) => {
                    if (!value)
                        return '';
                    const upper = value.toUpperCase();
                    if (!/^F([1-9]|1\d|2[0-4])$/.test(upper)) {
                        return 'Invalid function key. Use format F1..F24';
                    }
                    ;
                    if (buttons.some(b => b.key === upper)) {
                        return `Function key ${upper} already used.`;
                    }
                    ;
                    return '';
                }
            });
            if (!key)
                break;
            const label = await vscode.window.showInputBox({
                prompt: `Text for ${key.toUpperCase()}`,
                placeHolder: 'Help',
                validateInput: (value) => {
                    if (!value.trim())
                        return 'Button text cannot be empty';
                    if (value.startsWith(' '))
                        return 'Button text cannot start with a space';
                    if (value.length > 34)
                        return 'Button text cannot exceed 34 characters';
                    return '';
                }
            });
            if (!label) {
                vscode.window.showWarningMessage(`Skipping ${key.toUpperCase()} — no label entered.`);
                continue;
            }
            buttons.push({
                key: key.toUpperCase(),
                label: label.trimEnd()
            });
        }
        ;
        if (buttons.length === 0) {
            vscode.window.showInformationMessage('No buttons entered.');
            return;
        }
        ;
        const recordName = node.ddsElement.name;
        const recordSize = (0, dspf_edit_model_1.getRecordSize)(recordName);
        const recordInfo = dspf_edit_model_1.fieldsPerRecords.find(r => r.record === recordName);
        if (!recordSize || !recordInfo) {
            vscode.window.showErrorMessage('Record size or info not found.');
            return;
        }
        ;
        const recordLineEnd = recordInfo.endIndex + 1;
        const visibleStart = recordInfo.size?.originRow ?? 0;
        let currentRow = visibleStart + (recordSize.rows - 2);
        const startCol = 1;
        const maxCols = recordInfo.size?.cols ?? 0;
        let currentCol = startCol;
        const edit = new vscode.WorkspaceEdit();
        const doc = editor.document;
        let crInserted = false;
        let numButton = 0;
        for (const btn of buttons) {
            numButton += 1;
            const text = `${btn.key.toUpperCase()}=${btn.label}`;
            if (currentCol + text.length > maxCols - 1) {
                currentRow--;
                currentCol = startCol;
            }
            ;
            const rowStr = String(currentRow).padStart(2, ' ');
            const colStr = String(currentCol + 1).padStart(2, ' ');
            let ddsLine = ''.padEnd(45, ' ');
            ddsLine = ddsLine.substring(0, 5) + 'A' + ddsLine.substring(6);
            ddsLine = ddsLine.substring(0, 39) + rowStr + ddsLine.substring(41);
            ddsLine = ddsLine.substring(0, 42) + colStr + `'${text}'`;
            const insertPos = new vscode.Position(recordLineEnd, 0);
            // If inserting in the last line of the document, then adds a '\n'
            if (!crInserted && insertPos.line >= doc.lineCount) {
                edit.insert(doc.uri, insertPos, '\n');
                crInserted = true;
            }
            ;
            // Inserts the "line"
            edit.insert(doc.uri, insertPos, ddsLine);
            // If there is more buttons to add, or insert possition line is less than the last line, then inserts a new '\n'
            if (numButton < buttons.length || insertPos.line < doc.lineCount) {
                edit.insert(doc.uri, insertPos, '\n');
            }
            ;
            currentCol += text.length + 2;
        }
        ;
        await vscode.workspace.applyEdit(edit);
    }));
}
;
//# sourceMappingURL=dspf-edit.add-buttons.js.map