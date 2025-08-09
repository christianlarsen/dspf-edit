/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.new-record.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';

export function newRecord(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.new-record", async (node: DdsNode) => {
            const element = node.ddsElement;

            if (element.kind !== "record" && element.kind !== "file") {
                vscode.window.showWarningMessage("A record can be created only from file level or record level");
                return;
            };

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("No active editor found.");
                return;
            };

            // New name for new record
            let newName = await vscode.window.showInputBox({
                title: `Set new record name`,
                placeHolder: `RECORD`,
                validateInput: value => {
                    if (value.trim() === '') {
                        return "The name cannot be empty.";
                    };
                    if (value.length > 10) {
                        return "The name must be 10 characters or fewer.";
                    };
                    if (/\s/.test(value)) {
                        return "The name cannot contain spaces.";
                    };
                    if (/^\d/.test(value)) {
                        return "The name cannot start with a number.";
                    };
                    // ??? Check if name exists in other records... 
                    // ???

                    return null;
                }
            });
            newName = newName?.toUpperCase();
            if (!newName) return;

            // Type for new record
            // RECORD, WINDOW, SFL, SFLWDW
            const items: vscode.QuickPickItem[] = [
                { label: "RECORD", description: "Default record type" },
                { label: "WINDOW", description: "Window record" },
                { label: "SFL", description: "Subfile" },
                { label: "SFLWDW", description: "Subfile window" }
            ];

            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: "Select the record type",
                canPickMany: false,
                ignoreFocusOut: true
            });

            const newType = picked?.label || "RECORD";

            let startRow;
            let startCol;
            let numRows;
            let numCols;
            let newCtrlName;
            let newSflSiz;
            let newSflPag;

            // If type is "WINDOW" or "SFLWDW", we need the row,col,nrow,ncol
            if (newType === "WINDOW" || newType === "SFLWDW") {
                startRow = await vscode.window.showInputBox({
                    prompt: "Enter starting row",
                    placeHolder: "e.g. 15",
                    validateInput: (value) => isNaN(Number(value)) ? "Must be a number" : undefined
                });

                startCol = await vscode.window.showInputBox({
                    prompt: "Enter starting column",
                    placeHolder: "e.g. 20",
                    validateInput: (value) => isNaN(Number(value)) ? "Must be a number" : undefined
                });

                numRows = await vscode.window.showInputBox({
                    prompt: "Enter number of rows",
                    placeHolder: "e.g. 7",
                    validateInput: (value) => isNaN(Number(value)) ? "Must be a number" : undefined
                });

                numCols = await vscode.window.showInputBox({
                    prompt: "Enter number of columns",
                    placeHolder: "e.g. 40",
                    validateInput: (value) => isNaN(Number(value)) ? "Must be a number" : undefined
                });

            };
            if (newType === "SFL" || newType === "SFLWDW") {

                // New name for subfile control record
                newCtrlName = await vscode.window.showInputBox({
                    title: `Set new subfile record name`,
                    placeHolder: `SFLREC`,
                    validateInput: value => {
                        if (value.trim() === '') {
                            return "The name cannot be empty.";
                        };
                        if (value.length > 10) {
                            return "The name must be 10 characters or fewer.";
                        };
                        if (/\s/.test(value)) {
                            return "The name cannot contain spaces.";
                        };
                        if (/^\d/.test(value)) {
                            return "The name cannot start with a number.";
                        };
                        // ??? Check if name exists in other records... 
                        // ???

                        return null;
                    }
                });
                newCtrlName = newCtrlName?.toUpperCase();
                if (!newCtrlName) return;                

                // Records in subfile
                newSflSiz = await vscode.window.showInputBox({
                    title: `Set records in subfile`,
                    placeHolder: `10`,
                    validateInput: value => {
                        const num = Number(value.trim());
                        if (!value.trim()) {
                            return "Must enter a valid size.";
                        }
                        if (isNaN(num) || num < 1 || num > 9999) {
                            return "Value must be a number between 1 and 9999.";
                        }
                        return null;
                    }
                });
                if (!newSflSiz) return; 
                newSflSiz = Number(newSflSiz);

                // Records per page
                newSflPag = await vscode.window.showInputBox({
                    title: `Set records per page`,
                    placeHolder: `9`,
                    validateInput: value => {
                        const num = Number(value.trim());
                        if (!value.trim()) {
                            return "Must enter a valid page size.";
                        }
                        if (isNaN(num) || num < 1 || num > 9999) {
                            return "Value must be a number between 1 and 9999.";
                        }
                        return null;
                    }
                });
                if (!newSflPag) return; 
                newSflPag = Number(newSflPag);

            };

            let lines: string[] = [];
            lines[0] = ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R' + ' ' + newName.padEnd(10, ' ');

            switch (newType) {
                case "WINDOW":
                    // Adds the "WINDOW" with the defined sizes
                    lines[1] = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'WINDOW(' + startRow?.toString() + ' ' +
                        startCol?.toString() + ' ' + numRows?.toString() + ' ' + numCols?.toString() + ')';
                    break;

                case "SFL":
                    lines[0] += ' '.repeat(16) + 'SFL';
                    if (newCtrlName) {
                        lines[1] = ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R' + ' ' + newCtrlName.padEnd(10, ' ') +
                            ' '.repeat(16) + 'SFLCTL(' + newName.trim() + ')';
                    };
                    break;

                case "SFLWDW":
                    lines[0] += ' '.repeat(16) + 'SFL';
                    if (newCtrlName) {
                        lines[1] = ' '.repeat(5) + 'A' + ' '.repeat(10) + 'R' + ' ' + newCtrlName.padEnd(10, ' ') +
                            ' '.repeat(16) + 'SFLCTL(' + newName.trim() + ')';
                        lines[2] = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'WINDOW(' + startRow?.toString() + ' ' +
                            startCol?.toString() + ' ' + numRows?.toString() + ' ' + numCols?.toString() + ')';
                        lines[3] = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'SFLSIZ(' + String(newSflSiz).padEnd(4, '0') + ')';
                        lines[4] = ' '.repeat(5) + 'A' + ' '.repeat(38) + 'SFLPAG(' + String(newSflPag).padEnd(4, '0') + ')';
                    };
                    break;

            };
            const workspaceEdit = new vscode.WorkspaceEdit();
            const uri = editor.document.uri;
            workspaceEdit.insert(uri, new vscode.Position(editor.document.lineCount, 0), '\n' + lines.join('\n'));

            await vscode.workspace.applyEdit(workspaceEdit);

        })
    );
};