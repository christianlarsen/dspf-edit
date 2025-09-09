/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.generate-structure.ts
*/

import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { isDdsFile } from '../dspf-edit.utils/dspf-edit.helper';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { ExtensionState } from '../dspf-edit.states/state';

export function generateStructure(treeProvider: DdsTreeProvider) {
	const editor = ExtensionState.lastDdsEditor;
	const document = editor?.document ?? ExtensionState.lastDdsDocument;
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