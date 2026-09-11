/*
	Christian Larsen, 2026
	"RPG structure"
	dspf-edit.record-codelens-provider.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from './dspf-edit.providers';
import { ExtensionState } from '../dspf-edit.states/state';

/**
 * Adds a "Preview (DSPF-edit)" CodeLens above each record definition, alongside whatever other
 * extensions (e.g. IBM i Renderer) may already put their own "Preview" CodeLens there — a separate
 * extension's CodeLens command can't be redirected to ours, so this offers a second, clearly
 * labeled lens that opens DSPF-edit's own preview panel for that record instead.
 */
export class DdsRecordCodeLensProvider implements vscode.CodeLensProvider {
	private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	constructor(private readonly treeProvider: DdsTreeProvider) {
		treeProvider.onDidChangeTreeData(() => this._onDidChangeCodeLenses.fire());
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		// Only the actively-tracked DDS document has a parsed element list to draw record
		// positions from (see ExtensionState.lastDdsDocument and the tree provider's single-document
		// model) — a background/inactive DDS document simply gets no lenses.
		if (document !== ExtensionState.lastDdsDocument) {
			return [];
		};

		const records = this.treeProvider.getElements().filter(el => el.kind === 'record');

		return records.map(record => new vscode.CodeLens(
			new vscode.Range(record.lineIndex, 0, record.lineIndex, 0),
			{
				title: 'Preview (DSPF-edit)',
				command: 'dspf-edit.preview-record-by-name',
				arguments: [record.name]
			}
		));
	}
}
