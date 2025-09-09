/*
  Christian Larsen, 2025
  "RPG structure"
  dspf-edit.goto-line.ts
*/

import * as vscode from 'vscode';
import { ExtensionState } from '../dspf-edit.states/state';

export function goToLineHandler(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('ddsEdit.goToLine', (lineNumber: number) => {

    const editor = ExtensionState.lastDdsEditor;

    if (!editor) {
      vscode.window.showWarningMessage("No DDS editor available.");
      return;
    };

    if (vscode.window.activeTextEditor !== editor) {
      vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn });
    };

    const position = new vscode.Position(lineNumber - 1, 0);
    const range = new vscode.Range(position, position);

    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

  });

  context.subscriptions.push(disposable);
};