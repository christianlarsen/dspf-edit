/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.generate-structure.ts
*/

import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { checkForEditorAndDocument, isDdsFile } from '../dspf-edit.utils/dspf-edit.helper';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';

export function generateStructure(treeProvider: DdsTreeProvider) {
    // Check for editor and document
    const { editor, document } = checkForEditorAndDocument();
    if (!document || !editor) {
        return;
    };
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