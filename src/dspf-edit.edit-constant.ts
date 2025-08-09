/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.edit-constant.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fileSizeAttributes } from './dspf-edit.model';
import { findEndLineIndex } from './dspf-edit.helper';

export function editConstant(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.edit-constant", async (node: DdsNode) => {
            const element = node.ddsElement;

            if (element.kind !== "constant") {
                vscode.window.showWarningMessage("Only constants can be edit.");
                return;
            };

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("No active editor found.");
                return;
            };

            // New "text" for the constant
            const valueNoQuotes = element.name.slice(1, -1);
            const newText = await vscode.window.showInputBox({
                title: `Set new text for ${element.name} (without quotes)`,
                value: valueNoQuotes,
                validateInput: value => {
                    if (value === '') {
                        return "The constant text cannot be empty.";
                    };
                    const col = element.column ?? 1;
                    const totalLength = value.length + 2;
                    if (col + totalLength - 1 > fileSizeAttributes.maxCol1) {
                        return `Text too long.`;
                    };
                    return null;
                }
            });
            if (!newText) return;

            const newValue = `'${newText}'`;
            const uri = editor.document.uri;
            const workspaceEdit = new vscode.WorkspaceEdit();

            let remainingText = newValue;
            let currentLineIndex = element.lineIndex;
            let endLineIndex = findEndLineIndex(editor.document, element.lineIndex);

            let firstLine = editor.document.lineAt(currentLineIndex).text;
            let fitsInLine = newValue.length <= 36;

            if (fitsInLine) {
                const updatedLine = firstLine.substring(0, 44) + newValue;

                workspaceEdit.delete(uri, new vscode.Range(element.lineIndex, 0, element.lineIndex + endLineIndex - element.lineIndex + 1, 0));
                workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), updatedLine + '\n');

            } else {
                let updatedLines: string[] = [];
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
                    } else {
                        const contLine = '     A' + ' '.repeat(38) + nextChunk.padEnd(35, ' ') + (remainingText.length > 0 ? '-' : ' ');
                        updatedLines.push(contLine);
                    };
                };
                workspaceEdit.delete(uri, new vscode.Range(element.lineIndex, 0, element.lineIndex + endLineIndex - element.lineIndex + 1, 0));
                workspaceEdit.insert(uri, new vscode.Position(element.lineIndex, 0), updatedLines.join('\n') + '\n');
            };
            await vscode.workspace.applyEdit(workspaceEdit);
        })
    );
};