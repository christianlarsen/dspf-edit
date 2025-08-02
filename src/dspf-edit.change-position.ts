/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.change-position.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fileSizeAttributes } from './dspf-edit.model';

export function changePosition(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.change-position", async (node: DdsNode) => {
            const element = node.ddsElement;

            if (element.kind !== "field" && element.kind !== "constant") {
                vscode.window.showWarningMessage("Only fields and constants can be repositioned.");
                return;
            };

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("No active editor found.");
                return;
            };

            // New "row"
            const newRow = await vscode.window.showInputBox({
                title: `Set new row (1-${fileSizeAttributes.maxRow}) for ${element.name}`,
                value: String(element.row),
                validateInput: value => {
                    const num = Number(value);
                    if (!/^\d+$/.test(value)) {
                        return "Must be a number";
                    };
                    if (num < 1 || num > fileSizeAttributes.maxRow) {
                        return `Row must be between 1 and ${fileSizeAttributes.maxRow}`;
                    };
                    return null;
                }
            });
            if (!newRow) return;

            // New "col"
            const newCol = await vscode.window.showInputBox({
                title: `Set new column (1-${fileSizeAttributes.maxCol}) for ${element.name}`,
                value: String(element.column),
                validateInput: value => {
                    const num = Number(value);
                    if (!/^\d+$/.test(value)) {
                        return "Must be a number";
                    };
                    if (num < 1 || num > fileSizeAttributes.maxCol) {
                        return `Row must be between 1 and ${fileSizeAttributes.maxCol}`;
                    };
                    return null;
                }
            });
            if (!newCol) return;

            const lineIndex = element.lineIndex;
            const line = editor.document.lineAt(lineIndex).text;

            const formattedRow = newRow.padStart(3, ' ');
            const formattedCol = newCol.padStart(3, ' ');
            const updatedLine = line.substring(0, 38) + formattedRow + formattedCol + line.substring(44);

            const workspaceEdit = new vscode.WorkspaceEdit();
            const uri = editor.document.uri;

            workspaceEdit.replace(uri, new vscode.Range(lineIndex, 0, lineIndex, line.length), updatedLine);
            await vscode.workspace.applyEdit(workspaceEdit);

            vscode.window.showInformationMessage(
                `Moved ${element.name} to row ${newRow}, column ${newCol}`
            );
        })
    );

};