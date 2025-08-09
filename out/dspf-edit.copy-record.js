"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.copy-record.ts
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
exports.copyRecord = copyRecord;
const vscode = __importStar(require("vscode"));
const dspf_edit_helper_1 = require("./dspf-edit.helper");
function copyRecord(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.copy-record", async (node) => {
        const element = node.ddsElement;
        if (element.kind !== "record") {
            vscode.window.showWarningMessage("Only records can be copied.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        const document = editor.document;
        // New name for new record
        let newName = await vscode.window.showInputBox({
            title: `Set new record name`,
            placeHolder: element.name,
            validateInput: value => {
                if (value.trim() === '') {
                    return "The name cannot be empty.";
                }
                ;
                if (value.length > 10) {
                    return "The name must be 10 characters or fewer.";
                }
                ;
                if (value.trim().toUpperCase() === element.name.trim()) {
                    return `${value} cannot be the new name.`;
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
        // First line of record to copy
        const lineIndex = element.lineIndex;
        // Looks for last line of record to copy
        // (looks for next "R" in position 17, or end of file)
        let endLineIndex = lineIndex;
        for (let i = lineIndex + 1; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            const newRecordFound = line.startsWith("     A") &&
                line.charAt(16) === "R";
            if (!newRecordFound) {
                endLineIndex = i + 1;
            }
            else {
                break;
            }
            ;
        }
        ;
        let lines = [];
        let nline = 0;
        for (let i = lineIndex; i < endLineIndex; i++) {
            lines[nline] = editor.document.lineAt(i).text;
            nline++;
        }
        ;
        // Changes the record name
        lines[0] = lines[0].substring(0, 18) + newName.padEnd(10, ' ') + lines[0].substring(29);
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uri = editor.document.uri;
        workspaceEdit.insert(uri, new vscode.Position(document.lineCount, 0), '\n' + lines.join('\n'));
        await vscode.workspace.applyEdit(workspaceEdit);
    }));
}
;
//# sourceMappingURL=dspf-edit.copy-record.js.map