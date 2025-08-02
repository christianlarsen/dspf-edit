/*
	Christian Larsen, 2025
	"RPG structure"
	dds-aid.generate-structure.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from './dds-aid.providers';
import { isDdsFile } from './dds-aid.helper';
import { parseDocument } from './dds-aid.parser';

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