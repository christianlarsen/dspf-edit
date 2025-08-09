/*
  Christian Larsen, 2025
  "RPG structure"
  dspf-edit.goto-line.ts
*/

import * as vscode from 'vscode';

export function goToLineHandler(context: vscode.ExtensionContext): void {
	const disposable = vscode.commands.registerCommand('ddsEdit.goToLine', (lineNumber: number) => {
		const editor = vscode.window.activeTextEditor;
		
        if (!editor) {
            vscode.window.showWarningMessage("No active editor found.");
            return;
        };

		const position = new vscode.Position(lineNumber - 1, 0);
		editor.selection = new vscode.Selection(position, position);
		editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
	});

	context.subscriptions.push(disposable);
};