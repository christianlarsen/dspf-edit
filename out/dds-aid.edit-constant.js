"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dds-aid.edit-constant.ts
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
exports.editConstant = editConstant;
const vscode = __importStar(require("vscode"));
const dds_aid_model_1 = require("./dds-aid.model");
const dds_aid_helper_1 = require("./dds-aid.helper");
function editConstant(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dds-aid.edit-constant", async (node) => {
        const element = node.ddsElement;
        if (element.kind !== "constant") {
            vscode.window.showWarningMessage("Only constants can be edit.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        // New "text" for the constant
        const valueNoQuotes = element.name.slice(1, -1);
        const newText = await vscode.window.showInputBox({
            title: `Set new text for ${element.name} (without quotes)`,
            value: valueNoQuotes,
            validateInput: value => {
                if (value === '') {
                    return "The constant text cannot be empty.";
                }
                ;
                const col = element.column ?? 1;
                const totalLength = value.length + 2;
                if (col + totalLength - 1 > dds_aid_model_1.fileSizeAttributes.maxCol) {
                    return `Text too long.`;
                }
                ;
                return null;
            }
        });
        if (!newText)
            return;
        const newValue = `'${newText}'`;
        const uri = editor.document.uri;
        const workspaceEdit = new vscode.WorkspaceEdit();
        let remainingText = newValue;
        let currentLineIndex = element.lineIndex;
        let endLineIndex = (0, dds_aid_helper_1.findEndLineIndex)(editor.document, element.lineIndex);
        let firstLine = editor.document.lineAt(currentLineIndex).text;
        let fitsInLine = newValue.length <= 36;
        if (fitsInLine) {
            const updatedLine = firstLine.substring(0, 44) + newValue;
            workspaceEdit.delete(uri, new vscode.Range(element.lineIndex, 0, element.lineIndex + endLineIndex - element.lineIndex + 1, 0));
            workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), updatedLine + '\n');
        }
        else {
            let updatedLines = [];
            const baseLine = firstLine.substring(0, 44);
            let textPortion = remainingText.substring(0, 35);
            remainingText = remainingText.substring(35);
            let fullLine = baseLine + textPortion.padEnd(35, ' ') + '-';
            updatedLines.push(fullLine);
            while (remainingText.length > 0) {
                currentLineIndex++;
                const nextChunk = remainingText.substring(0, 35);
                remainingText = remainingText.substring(35);
                if (remainingText.trim() === "'") {
                    const contLine = '     A' + ' '.repeat(38) + nextChunk.padEnd(35, ' ') + "'";
                    remainingText = '';
                    updatedLines.push(contLine);
                }
                else {
                    const contLine = '     A' + ' '.repeat(38) + nextChunk.padEnd(35, ' ') + (remainingText.length > 0 ? '-' : ' ');
                    updatedLines.push(contLine);
                }
                ;
            }
            ;
            workspaceEdit.delete(uri, new vscode.Range(element.lineIndex, 0, element.lineIndex + endLineIndex - element.lineIndex + 1, 0));
            workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), updatedLines.join('\n') + '\n');
        }
        ;
        await vscode.workspace.applyEdit(workspaceEdit);
    }));
}
;
//# sourceMappingURL=dds-aid.edit-constant.js.map