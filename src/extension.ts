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
import { registerColumnRuler } from './dspf-edit.listeners/dspf-edit.column-ruler';
import { PreviewColorsPanel } from './dspf-edit.webview/dspf-edit.preview-colors-panel';
import { setReferencedLengthResolver } from './dspf-edit.parser/dspf-edit.parser';
import { getResolvedRef } from './dspf-edit.ibmi/dspf-edit.ibmi-integration';
import { registerValidation } from './dspf-edit.validation/dspf-edit.validation';
import { registerMenuMemberCommands, onDidChangeMenuCommands } from './dspf-edit.commands/dspf-edit.menu-members';
import { RecordPreviewPanel } from './dspf-edit.webview/dspf-edit.record-preview-panel';
import { MenuCommandsPanel } from './dspf-edit.webview/dspf-edit.menu-commands-panel';
import { getMenuMemberKind } from './dspf-edit.utils/dspf-edit.menu';

// Activate extension
export function activate(context: vscode.ExtensionContext) {

	// Store the extension context (needed by anything using its own persisted storage,
	// e.g. the preview's colors — see dspf-edit.utils/dspf-edit.preview-colors.ts)
	ExtensionState.context = context;

	// Let the parser place "+n" positions after a referenced field using its resolved length
	// (must be set before the first parse, which initializeDocumentListeners triggers below)
	setReferencedLengthResolver((recordName, fieldName, overrides) => {
		const documentUri = ExtensionState.lastDdsDocument?.uri.toString();
		return documentUri ? getResolvedRef(documentUri, recordName, fieldName, overrides)?.length : undefined;
	});

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

	// Menus (MNUDDS + MNUCMD): opening the commands member opens the menu image
	registerMenuMemberCommands(context);
	// The preview shows each option's command on hover: re-render once they are read or edited
	context.subscriptions.push(onDidChangeMenuCommands(() => RecordPreviewPanel.refreshOverlays()));
	// "Menu Commands" (SDA's F10): from the tree, the preview's Commands button (with the member's URI), or
	// the command palette (the menu being worked with, or the menu member in the active editor)
	context.subscriptions.push(vscode.commands.registerCommand('dspf-edit.menu-commands', async (target?: unknown) => {
		const uri = target instanceof vscode.Uri
			? target
			: [ExtensionState.lastDdsDocument?.uri, vscode.window.activeTextEditor?.document.uri]
				.find(candidate => candidate !== undefined && getMenuMemberKind(candidate.path) !== undefined);
		if (!uri) {
			vscode.window.showWarningMessage('Open a menu (MNUDDS or MNUCMD member) to work with its commands.');
			return;
		};
		// Opening it beside the preview would drop the preview's Focus mode (as the Configuration panel would)
		if (RecordPreviewPanel.isFocusModeActive()) {
			vscode.window.showInformationMessage('Turn off Focus mode in the preview first to work with the menu commands.');
			return;
		};
		await MenuCommandsPanel.show(uri);
	}));

	// Warnings for source the compiler would reject or misread (for now, the indicator columns 7-16)
	registerValidation(context);

	// Column ruler above the line being edited (off by default; Shift+F4 or the Configuration panel)
	registerColumnRuler(context, () => PreviewColorsPanel.updateColumnRulerIfOpen());
};

export function deactivate() {
	ExtensionState.clearTimeout();
};
