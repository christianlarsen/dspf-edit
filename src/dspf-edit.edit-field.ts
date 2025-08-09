/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.edit-field.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fileSizeAttributes } from './dspf-edit.model';
import { parseSize } from './dspf-edit.helper';

export function editField(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.edit-field", async (node: DdsNode) => {
            const element = node.ddsElement;

            if (element.kind !== "field") {
                vscode.window.showWarningMessage("Only fields can be edit.");
                return;
            };

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("No active editor found.");
                return;
            };

            // New "name" for the field
            let newName = await vscode.window.showInputBox({
                title: `Set new name for ${element.name}`,
                value: element.name,
                validateInput: value => {
                    if (value.trim() === '') {
                        return "The field name cannot be empty.";
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

                    const col = element.column ?? 1;
                    const totalLength = value.length + 2;
                    if (col + totalLength - 1 > fileSizeAttributes.maxCol1) {
                        return "Text too long for screen size.";
                    };

                    return null;
                }
            });
            newName = newName?.toUpperCase();
            if (!newName) return;

            const newSize = await vscode.window.showInputBox({
                title: `Set size for ${newName}`,
                value: element.decimals && element.decimals > 0
                    ? `${element.length},${element.decimals}`
                    : `${element.length}`,
                validateInput: value => {
                    if (value.trim() === '') {
                        return "Size is required.";
                    };

                    const match = value.match(/^(\d+)(?:,(\d+))?$/);
                    if (!match) {
                        return "Size must be a number or in the form N or N,D.";
                    };

                    const total = parseInt(match[1], 10);
                    const decimals = match[2] ? parseInt(match[2], 10) : 0;

                    if (total <= 0) {
                        return "Size must be greater than 0.";
                    };

                    if (decimals < 0 || decimals >= total) {
                        return "Decimals must be smaller than total size.";
                    };

                    return null;
                }
            });

            if (!newSize) return;
            const { length, decimals } = parseSize(newSize);

            const lineIndex = element.lineIndex;
            const line = editor.document.lineAt(lineIndex).text;
            const paddedName = newName.padEnd(10, ' ').substring(0, 10); // Siempre 10 caracteres
            const updatedNameLine = line.substring(0, 18) + paddedName + line.substring(28);
            let updatedLine = updatedNameLine;
              
            const typeChar = updatedLine.substring(34, 35); 
            const isNumericType = ['Y', 'P', 'S', 'Z'].includes(typeChar);
            const sizeStr = String(length).padStart(2, ' ').substring(0, 2);
            updatedLine = updatedLine.substring(0, 32) + sizeStr + updatedLine.substring(34);
            if (isNumericType) {
                const decStr = String(decimals).padStart(2, ' ').substring(0, 2);
                updatedLine = updatedLine.substring(0, 35) + decStr + updatedLine.substring(37);
            };
            
            const workspaceEdit = new vscode.WorkspaceEdit();
            const uri = editor.document.uri;
            workspaceEdit.replace(uri, new vscode.Range(lineIndex, 0, lineIndex, line.length), updatedLine);
            await vscode.workspace.applyEdit(workspaceEdit);
        
        })
    );
};