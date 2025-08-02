/*
	Christian Larsen, 2025
	"RPG structure"
	extension.ts
*/

import * as vscode from 'vscode';
import { parseDocument } from './dds-aid.parser';
import { isDdsFile } from './dds-aid.helper';
import { DdsTreeProvider} from './dds-aid.providers';
import { changePosition } from './dds-aid.change-position';
import { centerPosition } from './dds-aid.center';
import { editConstant } from './dds-aid.edit-constant';
import { viewStructure } from './dds-aid.view-structure';
import { generateStructure } from './dds-aid.generate-structure';

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

	// "Change-Position" command
	changePosition(context);

	// "Center" command
	centerPosition(context);


};

export function deactivate() { }

