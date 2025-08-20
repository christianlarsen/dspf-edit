/*
	Christian Larsen, 2025
	"RPG structure"
	extension.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider} from './dspf-edit.providers';
import { changePosition } from './dspf-edit.change-position';
import { centerPosition } from './dspf-edit.center';
import { editConstant, addConstant } from './dspf-edit.edit-constant';
import { registerFieldCommands } from './dspf-edit.edit-field';
import { viewStructure } from './dspf-edit.view-structure';
import { generateStructure } from './dspf-edit.generate-structure';
import { copyRecord } from './dspf-edit.copy-record';
import { deleteRecord } from './dspf-edit.delete-record';
import { newRecord } from './dspf-edit.new-record';
import { goToLineHandler } from './dspf-edit.goto-line';
import { updateTreeProvider } from './dspf-edit.helper';
import { addButtons } from './dspf-edit.add-buttons';
import { addColor } from './dspf-edit.add-color';
import { addAttribute } from './dspf-edit.add-attribute';
import { addKeyCommand } from './dspf-edit.add-keys';
import { addValidityCheck } from './dspf-edit.add-validity-check';
import { editingKeywords } from './dspf-edit.add-editing-keywords';
import { addErrorMessage } from './dspf-edit.add-error-messages';

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
		{ name: 'addConstant', handler: addConstant as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'editConstant', handler: editConstant as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'registerFieldCommands', handler: registerFieldCommands as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'changePosition', handler: changePosition as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'centerPosition', handler: centerPosition as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'copyRecord', handler: copyRecord as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'deleteRecord', handler: deleteRecord as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'newRecord', handler: newRecord as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'goToLine', handler: goToLineHandler as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'addButtons', handler: addButtons as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'addColor', handler: addColor as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'addAttribute', handler: addAttribute as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'addKey', handler: addKeyCommand as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'addValidityCheck', handler: addValidityCheck as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'addEditingKeywords', handler: editingKeywords as (context: vscode.ExtensionContext) => void, needsTreeProvider: false },
		{ name: 'addErrorMessage', handler: addErrorMessage as (context: vscode.ExtensionContext) => void, needsTreeProvider: false }
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