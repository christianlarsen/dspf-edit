/*
	Christian Larsen, 2025
	"RPG structure"
	extension.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from './dspf-edit.providers/dspf-edit.providers';

import { registerCommands } from './dspf-edit.commands/register-commands';
import { ExtensionState } from './dspf-edit.states/state';
import { initializeDocumentListeners } from './dspf-edit.listeners/listeners';

// Activate extension
export function activate(context: vscode.ExtensionContext) {

	// Registers the tree data provider
	const treeProvider = new DdsTreeProvider();
	vscode.window.registerTreeDataProvider('dspf-edit.schema-view', treeProvider);

	// Stores references in the global state
	ExtensionState.treeProvider = treeProvider;

	initializeDocumentListeners(context, treeProvider);
	
	// Register all commands
	registerCommands(context, treeProvider);

};

export function deactivate() {
	ExtensionState.clearTimeout();
};
