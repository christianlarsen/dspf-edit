/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-color.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { getRecordSize, fieldsPerRecords } from './dspf-edit.model';

export function addColor(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-color", async (node: DdsNode) => {

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found.');
                return;
            };
            if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
                return;
            };

            const listOfColors: string[] = ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'WHT', 'YLW'];
            let selectedColors: string[] = [];
            // Retrieves the colors already active for the constant/field and removes them
            // from the list, and add them to the selectedColors list.


            // ????

            // Collect colors to be active for the constant/field
            while (true) {
                const selectedColor =
                    await vscode.window.showQuickPick(
                        listOfColors,
                        {
                            title: 'Add Color (Press ESC to End)',
                            placeHolder: 'Select colour from list'
                        }
                    );
                if (selectedColor && selectedColor !== '') {
                    selectedColors.push(selectedColor);
                } else {
                    break;
                }
            };

            // One finished, the colors are added to the source file with this format "COLOR(BLU)"
            // in the same order they are inserted

            // ??????
        })
    );

};