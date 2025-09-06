/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.view-structure.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from './dspf-edit.providers';
import { isDdsFile } from './dspf-edit.helper';
import { parseDocument } from './dspf-edit.parser';
import { lastDdsDocument, lastDdsEditor } from './extension';

export function viewStructure(context: vscode.ExtensionContext, treeProvider: DdsTreeProvider) {

    context.subscriptions.push(
		vscode.commands.registerCommand('dds-aid.view-structure', () => {
			const editor = lastDdsEditor;
			const document = editor?.document ?? lastDdsDocument;
			if (!document || !editor) {
				vscode.window.showErrorMessage('No DDS editor found.');
				return;
			};
			
			if (editor && document && isDdsFile(document)) {
				const text = editor.document.getText();
				treeProvider.setElements(parseDocument(text));
				treeProvider.refresh();
			} else {
				treeProvider.setElements([]);
				treeProvider.refresh();
			};
		})
	);
};