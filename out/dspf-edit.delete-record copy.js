"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.delete-record.ts
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
exports.deleteRecord = deleteRecord;
const vscode = __importStar(require("vscode"));
function deleteRecord(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.delete-record", async (node) => {
        const element = node.ddsElement;
        if (element.kind !== "record") {
            vscode.window.showWarningMessage("Only records can be deleted.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        const result = await vscode.window.showWarningMessage(`The record ${element.name} will be deleted.`, {
            modal: true
        }, 'Yes', 'No');
        if (result !== 'Yes') {
            return;
        }
        ;
        // First line of record to delete
        const lineIndex = element.lineIndex;
        // Looks for last line of record to delete
        // (looks for next "R" in position 17, or end of file)
        let endLineIndex = lineIndex;
        const document = editor.document;
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
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uri = editor.document.uri;
        workspaceEdit.delete(uri, new vscode.Range(element.lineIndex, 0, endLineIndex, 0));
        await vscode.workspace.applyEdit(workspaceEdit);
    }));
}
;
//# sourceMappingURL=dspf-edit.delete-record%20copy.js.map