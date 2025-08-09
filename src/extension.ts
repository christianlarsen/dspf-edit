/*
	Christian Larsen, 2025
	"RPG structure"
	extension.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider} from './dspf-edit.providers';
import { changePosition } from './dspf-edit.change-position';
import { centerPosition } from './dspf-edit.center';
import { editConstant } from './dspf-edit.edit-constant';
import { editField } from './dspf-edit.edit-field';
import { viewStructure } from './dspf-edit.view-structure';
import { generateStructure } from './dspf-edit.generate-structure';
import { copyRecord } from './dspf-edit.copy-record';
import { deleteRecord } from './dspf-edit.delete-record';
import { newRecord } from './dspf-edit.new-record';
import { goToLineHandler } from './dspf-edit.goto-line';
import { updateTreeProvider } from './dspf-edit.helper';

let updateTimeout: NodeJS.Timeout | undefined;

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
			if (event.document === vscode.window.activeTextEditor?.document) {
				debounceUpdate(treeProvider, event.document);
			}
		})
	);

	// If user changes active editor, the extension re-generates the DDS structure
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			debounceUpdate(treeProvider, editor?.document);
		})
	);

	interface CommandConfig {
		name: string;
		handler: ((context: vscode.ExtensionContext) => void) | ((context: vscode.ExtensionContext, treeProvider: DdsTreeProvider) => void);
		needsTreeProvider: boolean;
	};

	const commands: CommandConfig[] = [
		{ name: 'viewStructure', handler: viewStructure as (context: vscode.ExtensionContext, treeProvider: DdsTreeProvider) => void, needsTreeProvider: true },
		{ name: 'editConstant', handler: editConstant as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'editField', handler: editField as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'changePosition', handler: changePosition as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'centerPosition', handler: centerPosition as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'copyRecord', handler: copyRecord as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'deleteRecord', handler: deleteRecord as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'newRecord', handler: newRecord as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'goToLine', handler: goToLineHandler as (context: vscode.ExtensionContext) => void, needsTreeProvider: false }
	];

	// Register all commands
	commands.forEach(cmd => {
		if (cmd.needsTreeProvider) {
			(cmd.handler as (context: vscode.ExtensionContext, treeProvider: DdsTreeProvider) => void)(context, treeProvider);
		} else {
			(cmd.handler as (context: vscode.ExtensionContext) => void)(context);
		}
	});

};

export function deactivate() {
	if (updateTimeout) {
		clearTimeout(updateTimeout);
		updateTimeout = undefined;
	};
};

function debounceUpdate(treeProvider: DdsTreeProvider, document?: vscode.TextDocument) {
	if (updateTimeout) {
		clearTimeout(updateTimeout);
	}
	updateTimeout = setTimeout(() => {
		updateTreeProvider(treeProvider, document);
	}, 150); 
};