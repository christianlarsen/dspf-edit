/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.copy-record.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { recordExists } from './dspf-edit.helper';

export function copyRecord(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.copy-record", async (node: DdsNode) => {
            const element = node.ddsElement;

            if (element.kind !== "record") {
                vscode.window.showWarningMessage("Only records can be copied.");
                return;
            };

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("No active editor found.");
                return;
            };
            const document = editor.document;

            // New name for new record
            let newName = await vscode.window.showInputBox({
                title: `Set new record name`, 
                placeHolder: element.name,
                validateInput: value => {
                    if (value.trim() === '') {
                        return "The name cannot be empty.";
                    };
                    if (value.length > 10) {
                        return "The name must be 10 characters or fewer.";
                    };
                    if (value.trim().toUpperCase() === element.name.trim()) {
                        return `${value} cannot be the new name.`;
                    };
                    if (/\s/.test(value)) {
                        return "The name cannot contain spaces.";
                    };
                    if (/^\d/.test(value)) {
                        return "The name cannot start with a number.";
                    };
                    if (recordExists(value)) {
                        return "Record name already exists.";
                    };

                    return null;
                }
            });
            newName = newName?.toUpperCase();
            if (!newName) return;

            // First line of record to copy
            const lineIndex = element.lineIndex;
            // Looks for last line of record to copy
            // (looks for next "R" in position 17, or end of file)
            let endLineIndex = lineIndex;
            
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
            let lines : string[] = [];
            let nline = 0;
            for (let i = lineIndex; i < endLineIndex; i++) {
                lines[nline] = editor.document.lineAt(i).text;
                nline ++;
            };
            // Changes the record name
            lines[0] = lines[0].substring(0, 18) + newName.padEnd(10, ' ') + lines[0].substring(29);

            const workspaceEdit = new vscode.WorkspaceEdit();
            const uri = editor.document.uri;
            workspaceEdit.insert(uri, new vscode.Position(document.lineCount, 0), '\n' + lines.join('\n'));

            await vscode.workspace.applyEdit(workspaceEdit);
        
        })
    );
};