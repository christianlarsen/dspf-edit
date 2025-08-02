"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.change-position.ts
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
exports.changePosition = changePosition;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
function changePosition(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.change-position", async (node) => {
        const element = node.ddsElement;
        if (element.kind !== "field" && element.kind !== "constant") {
            vscode.window.showWarningMessage("Only fields and constants can be repositioned.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        // New "row"
        const newRow = await vscode.window.showInputBox({
            title: `Set new row (1-${dspf_edit_model_1.fileSizeAttributes.maxRow}) for ${element.name}`,
            value: String(element.row),
            validateInput: value => {
                const num = Number(value);
                if (!/^\d+$/.test(value)) {
                    return "Must be a number";
                }
                ;
                if (num < 1 || num > dspf_edit_model_1.fileSizeAttributes.maxRow) {
                    return `Row must be between 1 and ${dspf_edit_model_1.fileSizeAttributes.maxRow}`;
                }
                ;
                return null;
            }
        });
        if (!newRow)
            return;
        // New "col"
        const newCol = await vscode.window.showInputBox({
            title: `Set new column (1-${dspf_edit_model_1.fileSizeAttributes.maxCol}) for ${element.name}`,
            value: String(element.column),
            validateInput: value => {
                const num = Number(value);
                if (!/^\d+$/.test(value)) {
                    return "Must be a number";
                }
                ;
                if (num < 1 || num > dspf_edit_model_1.fileSizeAttributes.maxCol) {
                    return `Row must be between 1 and ${dspf_edit_model_1.fileSizeAttributes.maxCol}`;
                }
                ;
                return null;
            }
        });
        if (!newCol)
            return;
        const lineIndex = element.lineIndex;
        const line = editor.document.lineAt(lineIndex).text;
        const formattedRow = newRow.padStart(3, ' ');
        const formattedCol = newCol.padStart(3, ' ');
        const updatedLine = line.substring(0, 38) + formattedRow + formattedCol + line.substring(44);
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uri = editor.document.uri;
        workspaceEdit.replace(uri, new vscode.Range(lineIndex, 0, lineIndex, line.length), updatedLine);
        await vscode.workspace.applyEdit(workspaceEdit);
        vscode.window.showInformationMessage(`Moved ${element.name} to row ${newRow}, column ${newCol}`);
    }));
}
;
//# sourceMappingURL=dspf-edit.change-position.js.map