/*
  Christian Larsen, 2025
  "RPG structure"
  dspf-edit.goto-line.ts
*/

import * as vscode from 'vscode';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';
import { RecordPreviewPanel } from '../dspf-edit.webview/dspf-edit.record-preview-panel';

export function goToLineHandler(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('ddsEdit.goToLine', async (lineNumber: number) => {

    // Check for editor and document
    const { editor, document } = checkForEditorAndDocument();
    if (!document || !editor) {
        return;
    };

    const position = new vscode.Position(lineNumber - 1, 0);

    // Skips stealing focus (and surfacing the source editor's group) when the preview panel's
    // focus mode is on, so clicking a tree item doesn't undo the maximized preview.
    if (RecordPreviewPanel.isFocusModeActive()) {
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      return;
    };

    if (vscode.window.activeTextEditor !== editor) {
      await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn });
    };

    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

  });

  context.subscriptions.push(disposable);
};