/*
	Christian Larsen, 2025
	"RPG structure"
	extension.ts
*/

import * as vscode from 'vscode';
import { parseDocument } from './dspf-edit.parser';
import { isDdsFile } from './dspf-edit.helper';
import { DdsTreeProvider} from './dspf-edit.providers';
import { changePosition } from './dspf-edit.change-position';
import { centerPosition } from './dspf-edit.center';
import { editConstant } from './dspf-edit.edit-constant';
import { editField } from './dspf-edit.edit-field';
import { viewStructure } from './dspf-edit.view-structure';
import { generateStructure } from './dspf-edit.generate-structure';
import { copyRecord } from './dspf-edit.copy-record';

// Activate extension
export function activate(context: vscode.ExtensionContext) {

	// Registers the tree data provider
	const treeProvider = new DdsTreeProvider();
	vscode.window.registerTreeDataProvider('ddsStructureView', treeProvider);

	// Generates the DDS structure
	generateStructure(treeProvider);

	// If the document changes, the extension re-generates the DDS structure
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document === vscode.window.activeTextEditor?.document &&
				isDdsFile(event.document)) {
				const text = event.document.getText();
				treeProvider.setElements(parseDocument(text));
				treeProvider.refresh();
			} else {
				treeProvider.setElements([]);
				treeProvider.refresh();
			};
		})
	);
	// If user changes active editor, the extension re-generates the DDS structure
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && isDdsFile(editor.document)) {
				const text = editor.document.getText();
				treeProvider.setElements(parseDocument(text));
				treeProvider.refresh();
		  	} else {
				treeProvider.setElements([]);
				treeProvider.refresh();
			};
		})
	);

	// Commands

	// "View-Structure" command
	viewStructure(context, treeProvider);

	// "Edit-Constant" command
	editConstant(context);

	// "Edit-Field" command
	editField(context);

	// "Change-Position" command
	changePosition(context);

	// "Center" command
	centerPosition(context);

	// "Copy-Record" command
	copyRecord(context);


};

export function deactivate() { }

