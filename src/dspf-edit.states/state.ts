/*
    Christian Larsen, 2025
    "RPG structure"
    states/state.ts
*/

import * as vscode from 'vscode';

export class ExtensionState {

    static lastDdsDocument: vscode.TextDocument | undefined;
    static lastDdsEditor: vscode.TextEditor | undefined;
    static updateTimeout: NodeJS.Timeout | undefined;
    static treeProvider: any;

    static clearTimeout() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        };
    };
};


