"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.center.ts
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
exports.centerPosition = centerPosition;
const vscode = __importStar(require("vscode"));
const dspf_edit_model_1 = require("./dspf-edit.model");
const dspf_edit_parser_1 = require("./dspf-edit.parser");
function centerPosition(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.center", async (node) => {
        const element = node.ddsElement;
        if (element.kind !== "field" && element.kind !== "constant") {
            vscode.window.showWarningMessage("Only fields and constants can be centered.");
            return;
        }
        ;
        if (element.kind === "field" && element.referenced === true) {
            vscode.window.showWarningMessage("Referenced fields cannot be centered.");
            return;
        }
        ;
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        }
        ;
        // Finds the size of the record where the field or constant is
        // Looks for a "WINDOW" attribute in the record "element.recordname"
        const windowSize = getRecordWindowSize(element.recordname);
        const maxCols = windowSize.cols;
        // Calculates the center position of the field/constant
        // New "row" (is the same)
        const newRow = element.row;
        let newCol;
        // New "col"
        switch (element.kind) {
            case 'constant':
                newCol = Math.floor((maxCols - (element.name.length - 2)) / 2) + 1;
                break;
            case 'field':
                if (element.length) {
                    newCol = Math.floor((maxCols - element.length) / 2) + 1;
                }
                else {
                    newCol = element.column;
                }
                break;
        }
        if (!newCol || newCol < 1) {
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
        vscode.window.showInformationMessage(`${element.name} centered in ${maxCols} columns`);
    }));
}
;
function getRecordWindowSize(recordName) {
    const recordElement = dspf_edit_parser_1.currentDdsElements.find(el => el.kind === 'record' && el.name === recordName);
    if (recordElement && recordElement.attributes) {
        // Search for WINDOW attribute in the record attributes
        for (const attribute of recordElement.attributes) {
            const windowMatch = attribute.value.match(/WINDOW\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\)/i);
            if (windowMatch) {
                // WINDOW(startRow startCol rows cols)
                return {
                    rows: parseInt(windowMatch[3], 10),
                    cols: parseInt(windowMatch[4], 10)
                };
            }
            ;
        }
        ;
    }
    ;
    // If WINDOW not found, use default size
    return {
        rows: dspf_edit_model_1.fileSizeAttributes.maxRow1,
        cols: dspf_edit_model_1.fileSizeAttributes.maxCol1
    };
}
;
//# sourceMappingURL=dspf-edit.center.js.map