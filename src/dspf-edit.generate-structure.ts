/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.generate-structure.ts
*/

import { DdsTreeProvider } from './dspf-edit.providers';
import { isDdsFile } from './dspf-edit.helper';
import { parseDocument } from './dspf-edit.parser';
import { lastDdsDocument, lastDdsEditor } from './extension';

export function generateStructure(treeProvider: DdsTreeProvider) {
	const editor = lastDdsEditor;
	const document = editor?.document ?? lastDdsDocument;
	if (!document || !editor) {
		treeProvider.setElements([]);
		treeProvider.refresh();
		return;
	};
	
	if (editor && isDdsFile(editor.document)) {
		const text = editor.document.getText();
		treeProvider.setElements(parseDocument(text));
		treeProvider.refresh();
	} else {
        treeProvider.setElements([]);
        treeProvider.refresh();
    };
};