/*
    Christian Larsen, 2025
    "RPG structure"
    listeners/listeners.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { generateStructure } from '../dspf-edit.commands/dspf-edit.generate-structure';
import { ExtensionState } from '../dspf-edit.states/state';
import { debounceUpdate, generateIfDds } from '../dspf-edit.utils/dspf-edit.helper';

export function initializeDocumentListeners(
    context: vscode.ExtensionContext,
    treeProvider: DdsTreeProvider
) {
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc && activeDoc.languageId === 'dds.dspf') {
        ExtensionState.lastDdsDocument = activeDoc;
        ExtensionState.lastDdsEditor = vscode.window.activeTextEditor;

        generateStructure(treeProvider);
        debounceUpdate(treeProvider, activeDoc);
    };

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                debounceUpdate(treeProvider, event.document);
            };
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            generateIfDds(treeProvider, editor?.document, vscode.window.activeTextEditor);
            
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            if (ExtensionState.lastDdsDocument && document === ExtensionState.lastDdsDocument) {
                ExtensionState.clearTimeout();
                treeProvider.cleanupDocumentFilter(document.uri.toString());
                ExtensionState.lastDdsDocument = undefined;
                ExtensionState.lastDdsEditor = undefined;
                treeProvider.setElements([]);
                treeProvider.refresh();
            };
        })
    );
};