/*
	Christian Larsen, 2025
	"RPG structure"
	extension.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from './dspf-edit.providers/dspf-edit.providers';
import { DdsRecordCodeLensProvider } from './dspf-edit.providers/dspf-edit.record-codelens-provider';
import { registerCommands } from './dspf-edit.commands/register-commands';
import { ExtensionState } from './dspf-edit.states/state';
import { initializeDocumentListeners } from './dspf-edit.listeners/listeners';

// Activate extension
export function activate(context: vscode.ExtensionContext) {

	// Store the extension context (needed by anything using its own persisted storage,
	// e.g. the preview's colors — see dspf-edit.utils/dspf-edit.preview-colors.ts)
	ExtensionState.context = context;

	// Create the tree data provider
	const treeProvider = new DdsTreeProvider();
	
	// Create the TreeView and register it
	const treeView = vscode.window.createTreeView('dspf-edit.schema-view', {
		treeDataProvider: treeProvider,
		dragAndDropController: treeProvider
	});
	
	// Set the TreeView instance in the provider (needed for expand/collapse)
	treeProvider.setTreeView(treeView);

	// Store references in the global state
	ExtensionState.treeProvider = treeProvider;

	// Add treeView to subscriptions for proper disposal
	context.subscriptions.push(treeView);

	initializeDocumentListeners(context, treeProvider);

	// "Preview (DSPF-edit)" CodeLens above each record, so it opens DSPF-edit's own preview
	// instead of (or alongside) another extension's "Preview" CodeLens on the same line.
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ language: 'dds.dspf' }, new DdsRecordCodeLensProvider(treeProvider))
	);

	// Register all commands
	registerCommands(context, treeProvider);
};

export function deactivate() {
	ExtensionState.clearTimeout();
};
