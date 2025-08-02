/*
	Christian Larsen, 2025
	"RPG structure"
	dds-aid.view-structure.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from './dds-aid.providers';
import { isDdsFile } from './dds-aid.helper';
import { parseDdsElements } from './dds-aid.parser';

export function viewStructure(context: vscode.ExtensionContext, treeProvider: DdsTreeProvider) {

    context.subscriptions.push(
		vscode.commands.registerCommand('dds-aid.view-structure', () => {
			const editor = vscode.window.activeTextEditor;
			const document = editor?.document;
			if (editor && document && isDdsFile(document)) {
				const text = editor.document.getText();
				treeProvider.setElements(parseDdsElements(text));
				treeProvider.refresh();
			} else {
				treeProvider.setElements([]);
				treeProvider.refresh();
			};
		})
	);
};