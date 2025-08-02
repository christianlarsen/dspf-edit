/*
	Christian Larsen, 2025
	"RPG structure"
	dds-aid.view-structure.ts
*/

import * as vscode from 'vscode';
import { DdsNode, DdsTreeProvider } from './dds-aid.providers';
import { parseDdsElements } from './dds-aid.helper';

export function viewStructure(context: vscode.ExtensionContext, treeProvider: DdsTreeProvider) {

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
};