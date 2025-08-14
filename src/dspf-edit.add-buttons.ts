/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-buttons.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { getRecordSize, fieldsPerRecords } from './dspf-edit.model';

export function addButtons(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-buttons", async (node: DdsNode) => {

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
              vscode.window.showErrorMessage('No active editor found.');
              return;
            };
            // Ensure the node represents a RECORD in the DDS structure
            if (node.ddsElement.kind !== 'record') {
                return;
            };

            // Will store all the buttons the user enters
            const buttons: { key: string; label: string }[] = [];

            // Interactive loop to collect function keys and labels
            while (true) {
                const key = await vscode.window.showInputBox({
                    prompt: 'Function key (F1..F24) — leave empty to finish',
                    placeHolder: 'F1',
                    validateInput: (value) => {
                        // Allow empty to finish
                        if (!value) return '';

                        const upper = value.toUpperCase();

                        // Must be in the form F1..F24
                        if (!/^F([1-9]|1\d|2[0-4])$/.test(upper)) {
                            return 'Invalid function key. Use format F1..F24';
                        };
                        // Avoid duplicates
                        if (buttons.some(b => b.key === upper)) {
                            return `Function key ${upper} already used.`;
                        };
                        return '';
                    }
                });
                // Exit when empty
                if (!key) break;

                const label = await vscode.window.showInputBox({
                    prompt: `Text for ${key.toUpperCase()}`,
                    placeHolder: 'Help',
                    validateInput: (value) => {
                        if (!value.trim()) return 'Button text cannot be empty';
                        if (value.startsWith(' ')) return 'Button text cannot start with a space';
                        if (value.length > 34) return 'Button text cannot exceed 34 characters';
                        return '';
                    }
                });
                if (!label) {
                    vscode.window.showWarningMessage(`Skipping ${key.toUpperCase()} — no label entered.`);
                    continue;
                }
                
                // Store the button info (trim only trailing spaces)
                buttons.push({
                    key: key.toUpperCase(),
                    label: label.trimEnd()
                });
            };

            if (buttons.length === 0) {
                vscode.window.showInformationMessage('No buttons entered.');
                return;
            };

            // Get record info
            const recordName = node.ddsElement.name;
            const recordSize = getRecordSize(recordName);
            const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
            if (!recordSize || !recordInfo) {
                vscode.window.showErrorMessage('Record size or info not found.');
                return;
            };

            // We'll insert new DDS lines after the record ends
            const recordLineEnd = recordInfo.endIndex + 1;
            // Visible origin row in DDS
            const visibleStart = recordInfo.size?.originRow ?? 0;
            // Start placing buttons near the bottom of the record
            let currentRow = visibleStart + (recordSize.rows - 2);

            // DDS column position (1-based visual)
            const startCol = 1;
            const maxCols = recordInfo.size?.cols ?? 0;

            let currentCol = startCol;
            const edit = new vscode.WorkspaceEdit();
            const doc = editor.document;
            let crInserted = false;
            let numButton = 0;

            // Loop through all entered buttons
            for (const btn of buttons) {
                numButton += 1;
                const text = `${btn.key.toUpperCase()}=${btn.label}`;
                
                // If text would exceed line width, move to next row
                if (currentCol + text.length > maxCols - 1) {
                    currentRow--;
                    currentCol = startCol;
                };

                // Build DDS line according to fixed column rules
                const rowStr = String(currentRow).padStart(2, ' ');
                const colStr = String(currentCol + 1).padStart(2, ' '); 
                // Start with 45 spaces so we have enough room to place things
                let ddsLine = ''.padEnd(45, ' ');
                
                // Place the fixed "A" at position 5 (zero-based)
                ddsLine = ddsLine.substring(0, 5) + 'A' + ddsLine.substring(6);
                // Place row number at position 39 (zero-based)
                ddsLine = ddsLine.substring(0, 39) + rowStr + ddsLine.substring(41);
                // Place col number at position 42 (zero-based) and append text immediately after
                ddsLine = ddsLine.substring(0, 42) + colStr + `'${text}'`;

                const insertPos = new vscode.Position(recordLineEnd, 0);
                
                // If inserting at the very end of the file, add a newline before
                if (!crInserted && insertPos.line >= doc.lineCount) {
                    edit.insert(doc.uri, insertPos, '\n');
                    crInserted = true;
                };

                // Inserts the "line"
                edit.insert(doc.uri, insertPos, ddsLine);
                
                // If more buttons remain, or we're not at the last line, add newline after
                if (numButton < buttons.length || insertPos.line < doc.lineCount) {
                    edit.insert(doc.uri, insertPos, '\n');
                };
                
                // Move column for next button (add 2 spaces between)
                currentCol += text.length + 2;
            };

            await vscode.workspace.applyEdit(edit);
        })
    );
};