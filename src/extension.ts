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
// Activate extension
export function activate(context: vscode.ExtensionContext) {

	// Create the tree data provider
	const treeProvider = new DdsTreeProvider();
	
	// Create the TreeView and register it
	const treeView = vscode.window.createTreeView('dspf-edit.schema-view', { 
		treeDataProvider: treeProvider 
	});
	
	// Set the TreeView instance in the provider (needed for expand/collapse)
	treeProvider.setTreeView(treeView);

	// Store references in the global state
	ExtensionState.treeProvider = treeProvider;

	// Add treeView to subscriptions for proper disposal
	context.subscriptions.push(treeView);

	initializeDocumentListeners(context, treeProvider);
	
	// Register all commands
	registerCommands(context, treeProvider);
};

export function deactivate() {
	ExtensionState.clearTimeout();
};
