"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    extension.ts
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const dds_aid_helper_1 = require("./dds-aid.helper");
const dds_aid_providers_1 = require("./dds-aid.providers");
const dds_aid_model_1 = require("./dds-aid.model");
// Activate extension
function activate(context) {
    // Registers the tree data provider
    const treeProvider = new dds_aid_providers_1.DdsTreeProvider();
    vscode.window.registerTreeDataProvider('ddsStructureView', treeProvider);
    // Generates the DDS structure
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const text = editor.document.getText();
        treeProvider.setElements((0, dds_aid_helper_1.parseDdsElements)(text));
        treeProvider.refresh();
    }
    ;
    // If the document changes, the extension re-generate the DDS structure
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document) {
            const text = event.document.getText();
            treeProvider.setElements((0, dds_aid_helper_1.parseDdsElements)(text));
            treeProvider.refresh();
        }
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            const text = editor.document.getText();
            treeProvider.setElements((0, dds_aid_helper_1.parseDdsElements)(text));
            treeProvider.refresh();
        }
    }));
    // "View-Structure" command
    context.subscriptions.push(vscode.commands.registerCommand('dds-aid.view-structure', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const text = editor.document.getText();
            treeProvider.setElements((0, dds_aid_helper_1.parseDdsElements)(text));
            treeProvider.refresh();
        }
    }));
    // "Change-Position" command
    context.subscriptions.push(vscode.commands.registerCommand("dds-aid.change-position", async (node) => {
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
            title: `Set new row (1-${dds_aid_model_1.fileSizeAttributes.maxRow}) for ${element.name}`,
            placeHolder: String(element.row),
            validateInput: value => {
                const num = Number(value);
                if (!/^\d+$/.test(value)) {
                    return "Must be a number";
                }
                ;
                if (num < 1 || num > dds_aid_model_1.fileSizeAttributes.maxRow) {
                    return `Row must be between 1 and ${dds_aid_model_1.fileSizeAttributes.maxRow}`;
                }
                ;
                return null;
            }
        });
        if (!newRow)
            return;
        // New "col"
        const newCol = await vscode.window.showInputBox({
            title: `Set new column (1-${dds_aid_model_1.fileSizeAttributes.maxCol}) for ${element.name}`,
            placeHolder: String(element.column),
            validateInput: value => {
                const num = Number(value);
                if (!/^\d+$/.test(value)) {
                    return "Must be a number";
                }
                ;
                if (num < 1 || num > dds_aid_model_1.fileSizeAttributes.maxCol) {
                    return `Row must be between 1 and ${dds_aid_model_1.fileSizeAttributes.maxCol}`;
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
    // "Center" command
    context.subscriptions.push(vscode.commands.registerCommand("dds-aid.center", async (node) => {
        const element = node.ddsElement;
        if (element.kind !== "field" && element.kind !== "constant") {
            vscode.window.showWarningMessage("Only fields and constants can be centered.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        // Calculates the center position of the field/constant
        // New "row" (is the same)
        const newRow = element.row;
        // New "col"
        const newCol = Math.floor((dds_aid_model_1.fileSizeAttributes.maxCol - element.name.length) / 2) + 1;
        if (newCol < 1) {
            return;
        }
        ;
        const lineIndex = element.lineIndex;
        const line = editor.document.lineAt(lineIndex).text;
        const formattedRow = String(newRow).padStart(3, ' ');
        const formattedCol = String(newCol).padStart(3, ' ');
        const updatedLine = line.substring(0, 38) + formattedRow + formattedCol + line.substring(44);
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uri = editor.document.uri;
        workspaceEdit.replace(uri, new vscode.Range(lineIndex, 0, lineIndex, line.length), updatedLine);
        await vscode.workspace.applyEdit(workspaceEdit);
        vscode.window.showInformationMessage(`Moved ${element.name} centered`);
    }));
}
;
function deactivate() { }
//# sourceMappingURL=extension.js.map