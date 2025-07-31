/*
	Christian Larsen, 2025
	"RPG structure"
	extension.ts
*/

import * as vscode from 'vscode';
import { parseDdsElements } from './dds-aid.helper';
import { DdsTreeProvider, DdsNode } from './dds-aid.providers';
import { fileSizeAttributes } from './dds-aid.model';

// Activate extension
export function activate(context: vscode.ExtensionContext) {

	// Registers the tree data provider
	const treeProvider = new DdsTreeProvider();
	vscode.window.registerTreeDataProvider('ddsStructureView', treeProvider);

	// Generates the DDS structure
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const text = editor.document.getText();
		treeProvider.setElements(parseDdsElements(text));
		treeProvider.refresh();
	};

	// If the document changes, the extension re-generate the DDS structure
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document === vscode.window.activeTextEditor?.document) {
				const text = event.document.getText();
				treeProvider.setElements(parseDdsElements(text));
				treeProvider.refresh();
			}
		})
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				const text = editor.document.getText();
				treeProvider.setElements(parseDdsElements(text));
				treeProvider.refresh();
			}
		})
	);

	// "View-Structure" command
	context.subscriptions.push(
		vscode.commands.registerCommand('dds-aid.view-structure', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const text = editor.document.getText();
				treeProvider.setElements(parseDdsElements(text));
				treeProvider.refresh();
			}
		})
	);

	// "Change-Position" command
	context.subscriptions.push(
		vscode.commands.registerCommand("dds-aid.change-position", async (node: DdsNode) => {
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
				placeHolder: String(element.row),
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
				placeHolder: String(element.column),
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

	// "Center" command
	context.subscriptions.push(
		vscode.commands.registerCommand("dds-aid.center", async (node: DdsNode) => {
			const element = node.ddsElement;

			if (element.kind !== "field" && element.kind !== "constant") {
				vscode.window.showWarningMessage("Only fields and constants can be centered.");
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
			// New "col"
			const newCol = Math.floor((fileSizeAttributes.maxCol - element.name.length) / 2) + 1;
			if (newCol < 1) {
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

export function deactivate() { }
