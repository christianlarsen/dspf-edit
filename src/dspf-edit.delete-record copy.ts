/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.delete-record.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';

export function deleteRecord(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.delete-record", async (node: DdsNode) => {
            const element = node.ddsElement;

            if (element.kind !== "record") {
                vscode.window.showWarningMessage("Only records can be deleted.");
                return;
            };

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("No active editor found.");
                return;
            };

            const result = await vscode.window.showWarningMessage(
                `The record ${element.name} will be deleted.`,
                {
                    modal : true
                },
                'Yes',
                'No'
            );
            if (result !== 'Yes') {
                return;
            }; 

            // First line of record to delete
            const lineIndex = element.lineIndex;
            // Looks for last line of record to delete
            // (looks for next "R" in position 17, or end of file)
            let endLineIndex = lineIndex;
            const document = editor.document;

            for (let i = lineIndex+1; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
        
                const newRecordFound =
                    line.startsWith("     A") &&
                    line.charAt(16) === "R";
        
                if (!newRecordFound) {
                    endLineIndex = i + 1;
                } else {
                    break;
                };
            };

            const workspaceEdit = new vscode.WorkspaceEdit();
            const uri = editor.document.uri;
            workspaceEdit.delete(uri, new vscode.Range(element.lineIndex, 0, endLineIndex, 0));

            await vscode.workspace.applyEdit(workspaceEdit);
        
        })
    );
};