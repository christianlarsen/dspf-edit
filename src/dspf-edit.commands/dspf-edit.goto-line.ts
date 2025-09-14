/*
  Christian Larsen, 2025
  "RPG structure"
  dspf-edit.goto-line.ts
*/

import * as vscode from 'vscode';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';

export function goToLineHandler(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('ddsEdit.goToLine', (lineNumber: number) => {

    // Check for editor and document
    const { editor, document } = checkForEditorAndDocument();
    if (!document || !editor) {
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