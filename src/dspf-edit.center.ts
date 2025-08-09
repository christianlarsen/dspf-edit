/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.center.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fileSizeAttributes } from './dspf-edit.model';

export function centerPosition(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.center", async (node: DdsNode) => {
            const element = node.ddsElement;

            if (element.kind !== "field" && element.kind !== "constant") {
                vscode.window.showWarningMessage("Only fields and constants can be centered.");
                return;
            };
            if (element.kind === "field" && element.referenced === true) {
                vscode.window.showWarningMessage("Referenced fields cannot be centered.");
                return;
            };
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("No active editor found.");
                return;
            };

            // Calculates the center position of the field/constant
            // New "row" (is the same)
            const newRow = element.row;
            let newCol;
            // New "col"
            switch(element.kind) {
                case 'constant' :
                    newCol = Math.floor((fileSizeAttributes.maxCol1 - element.name.length) / 2) + 1;
                    break;
                case 'field' :
                    if (element.length) {
                        newCol = Math.floor((fileSizeAttributes.maxCol1 - element.length) / 2) + 1;
                    } else {
                        newCol = element.column;
                    }
                    break;
            }
            if (!newCol || newCol < 1) {
                return;
            };

            const lineIndex = element.lineIndex;
            const line = editor.document.lineAt(lineIndex).text;

            const formattedRow = String(newRow).padStart(3, ' ');
            const formattedCol = String(newCol).padStart(3, ' ');
            const updatedLine = line.substring(0, 38) + formattedRow + formattedCol + line.substring(44);

            const workspaceEdit = new vscode.WorkspaceEdit();
            const uri = editor.document.uri;

            workspaceEdit.replace(uri, new vscode.Range(lineIndex, 0, lineIndex, line.length), updatedLine);
            await vscode.workspace.applyEdit(workspaceEdit);

            vscode.window.showInformationMessage(
                `${element.name} centered`
            );
        })
    );
};