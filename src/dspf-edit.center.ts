/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.center.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { fileSizeAttributes, DdsRecord } from './dspf-edit.model';
import { currentDdsElements } from './dspf-edit.parser';

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

            // Finds the size of the record where the field or constant is
            // Looks for a "WINDOW" attribute in the record "element.recordname"
            const windowSize = getRecordWindowSize(element.recordname);
            const maxCols = windowSize.cols;
            
            // Calculates the center position of the field/constant
            // New "row" (is the same)
            const newRow = element.row;
            let newCol;

            // New "col"
            switch(element.kind) {
                case 'constant' :
                    newCol = Math.floor((maxCols - (element.name.length - 2)) / 2) + 1;
                    break;
                case 'field' :
                    if (element.length) {
                        newCol = Math.floor((maxCols - element.length) / 2) + 1;
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
                `${element.name} centered in ${maxCols} columns`
            );
        })
    );
};

function getRecordWindowSize(recordName: string): { cols: number; rows: number } {

    const recordElement = currentDdsElements.find(el => 
        el.kind === 'record' && el.name === recordName
    ) as DdsRecord | undefined;
    
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
            };
        };
    };
    
    // If WINDOW not found, use default size
    return {
        rows: fileSizeAttributes.maxRow1,
        cols: fileSizeAttributes.maxCol1
    };
};