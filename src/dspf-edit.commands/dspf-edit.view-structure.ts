/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.view-structure.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { checkForEditorAndDocument, isDdsFile } from '../dspf-edit.utils/dspf-edit.helper';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';

export function viewStructure(context: vscode.ExtensionContext, treeProvider: DdsTreeProvider) {

    context.subscriptions.push(
		vscode.commands.registerCommand('dds-aid.view-structure', () => {
			// Check for editor and document
			const { editor, document } = checkForEditorAndDocument();
			if (!document || !editor) {
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