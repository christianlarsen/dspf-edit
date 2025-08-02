/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.generate-structure.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from './dspf-edit.providers';
import { isDdsFile } from './dspf-edit.helper';
import { parseDocument } from './dspf-edit.parser';

export function generateStructure(treeProvider: DdsTreeProvider) {

	const editor = vscode.window.activeTextEditor;
	if (editor && isDdsFile(editor.document)) {
		const text = editor.document.getText();
		treeProvider.setElements(parseDocument(text));
		treeProvider.refresh();
	} else {
        treeProvider.setElements([]);
        treeProvider.refresh();
    };

};