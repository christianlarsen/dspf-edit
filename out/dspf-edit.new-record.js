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
function newRecord(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.new-record", async (node) => {
        const element = node.ddsElement;
        if (element.kind !== "record" && element.kind !== "file") {
            vscode.window.showWarningMessage("A record can be created only from file level or record level");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        // New name for new record
        let newName = await vscode.window.showInputBox({
            title: `Set new record name`,
            placeHolder: `RECORD`,
            validateInput: value => {
                if (value.trim() === '') {
                    return "The name cannot be empty.";
                }
                ;
                if (value.length > 10) {
                    return "The name must be 10 characters or fewer.";
                }
                ;
                if (/\s/.test(value)) {
                    return "The name cannot contain spaces.";
                }
                ;
                if (/^\d/.test(value)) {
                    return "The name cannot start with a number.";
                }
                ;
                if ((0, dspf_edit_helper_1.recordExists)(value)) {
                    return "Record name already exists.";
                }
                ;
                return null;
            }
        });
        newName = newName?.toUpperCase();
        if (!newName)
            return;
        // Type for new record
        // RECORD, WINDOW, SFL, SFLWDW
        const items = [
            { label: "RECORD", description: "Default record type" },
            { label: "WINDOW", description: "Window record" },
            { label: "SFL", description: "Subfile" },
            { label: "SFLWDW", description: "Subfile window" }
        ];
        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: "Select the record type",
            canPickMany: false,
            ignoreFocusOut: true
        });
        const newType = picked?.label || "RECORD";
        let startRow;
        let startCol;
        let numRows;
        let numCols;
        let newCtrlName;
        let newSflSiz;
        let newSflPag;
        // If type is "WINDOW" or "SFLWDW", we need the row,col,nrow,ncol
        if (newType === "WINDOW" || newType === "SFLWDW") {
            startRow = await vscode.window.showInputBox({
                prompt: "Enter starting row",
                placeHolder: "e.g. 15",
                validateInput: (value) => isNaN(Number(value)) ? "Must be a number" : undefined
            });
            startCol = await vscode.window.showInputBox({
                prompt: "Enter starting column",
                placeHolder: "e.g. 20",
                validateInput: (value) => isNaN(Number(value)) ? "Must be a number" : undefined
            });
            numRows = await vscode.window.showInputBox({
                prompt: "Enter number of rows",
                placeHolder: "e.g. 7",
                validateInput: (value) => isNaN(Number(value)) ? "Must be a number" : undefined
            });
            numCols = await vscode.window.showInputBox({
                prompt: "Enter number of columns",
                placeHolder: "e.g. 40",
                validateInput: (value) => isNaN(Number(value)) ? "Must be a number" : undefined
            });
        }
        ;
        if (newType === "SFL" || newType === "SFLWDW") {
            // New name for subfile control record
            newCtrlName = await vscode.window.showInputBox({
                title: `Set new subfile record name`,
                placeHolder: `SFLREC`,
                validateInput: value => {
                    if (value.trim() === '') {
                        return "The name cannot be empty.";
                    }
                    ;
                    if (value.length > 10) {
                        return "The name must be 10 characters or fewer.";
                    }
                    ;
                    if (/\s/.test(value)) {
                        return "The name cannot contain spaces.";
                    }
                    ;
                    if (/^\d/.test(value)) {
                        return "The name cannot start with a number.";
                    }
                    ;
                    if ((0, dspf_edit_helper_1.recordExists)(value)) {
                        return "Record name already exists.";
                    }
                    ;
                    return null;
                }
            });
            newCtrlName = newCtrlName?.toUpperCase();
            if (!newCtrlName)
                return;
            // Records in subfile
            newSflSiz = await vscode.window.showInputBox({
                title: `Set records in subfile`,
                placeHolder: `10`,
                validateInput: value => {
                    const num = Number(value.trim());
                    if (!value.trim()) {
                        return "Must enter a valid size.";
                    }
                    if (isNaN(num) || num < 1 || num > 9999) {
                        return "Value must be a number between 1 and 9999.";
                    }
                    return null;
                }
            });
            if (!newSflSiz)
                return;
            newSflSiz = Number(newSflSiz);
            // Records per page
            newSflPag = await vscode.window.showInputBox({
                title: `Set records per page`,
                placeHolder: `9`,
                validateInput: value => {
                    const num = Number(value.trim());
                    if (!value.trim()) {
                        return "Must enter a valid page size.";
                    }
                    if (isNaN(num) || num < 1 || num > 9999) {
                        return "Value must be a number between 1 and 9999.";
                    }
                    return null;
                }
            });
            if (!newSflPag)
                return;
            newSflPag = Number(newSflPag);
        }
        ;
        let lines = [];
        lines[0] = ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R' + ' ' + newName.padEnd(10, ' ');
        switch (newType) {
            case "WINDOW":
                // Adds the "WINDOW" with the defined sizes
                lines[1] = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'WINDOW(' + startRow?.toString() + ' ' +
                    startCol?.toString() + ' ' + numRows?.toString() + ' ' + numCols?.toString() + ')';
                break;
            case "SFL":
                lines[0] += ' '.repeat(16) + 'SFL';
                if (newCtrlName) {
                    lines[1] = ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R' + ' ' + newCtrlName.padEnd(10, ' ') +
                        ' '.repeat(16) + 'SFLCTL(' + newName.trim() + ')';
                }
                ;
                break;
            case "SFLWDW":
                lines[0] += ' '.repeat(16) + 'SFL';
                if (newCtrlName) {
                    lines[1] = ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R' + ' ' + newCtrlName.padEnd(10, ' ') +
                        ' '.repeat(16) + 'SFLCTL(' + newName.trim() + ')';
                    lines[2] = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'WINDOW(' + startRow?.toString() + ' ' +
                        startCol?.toString() + ' ' + numRows?.toString() + ' ' + numCols?.toString() + ')';
                    lines[3] = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'SFLSIZ(' + String(newSflSiz).padEnd(4, '0') + ')';
                    lines[4] = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'SFLPAG(' + String(newSflPag).padEnd(4, '0') + ')';
                }
                ;
                break;
        }
        ;
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uri = editor.document.uri;
        workspaceEdit.insert(uri, new vscode.Position(editor.document.lineCount, 0), '\n' + lines.join('\n'));
        await vscode.workspace.applyEdit(workspaceEdit);
    }));
}
;
//# sourceMappingURL=dspf-edit.new-record.js.map