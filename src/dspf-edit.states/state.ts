/*
    Christian Larsen, 2025
    "RPG structure"
    states/state.ts
*/

import * as vscode from 'vscode';

export class ExtensionState {

    static context: vscode.ExtensionContext;
    static lastDdsDocument: vscode.TextDocument | undefined;
    static lastDdsEditor: vscode.TextEditor | undefined;
    static updateTimeout: NodeJS.Timeout | undefined;
    static treeProvider: any;
    /** Display format (e.g. "*DS4") selected in the open Screen Preview, if any — lets commands
     * run from the tree use it instead of asking which size to use. */
    static previewDisplayFormat: string | undefined;

    static clearTimeout() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        };
    };
};


