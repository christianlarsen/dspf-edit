/*
	Christian Larsen, 2025
	"RPG structure"
	extension.ts
*/

import * as vscode from 'vscode';
import { parseDdsElements } from './dds-aid.helper';
import { DdsTreeProvider} from './dds-aid.providers';
import { changePosition } from './dds-aid.change-position';
import { centerPosition } from './dds-aid.center';
import { editConstant } from './dds-aid.edit-constant';

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
	changePosition(context);

	// "Center" command
	centerPosition(context);

	// "Edit-Constant" command
	editConstant(context);

};

export function deactivate() { }

