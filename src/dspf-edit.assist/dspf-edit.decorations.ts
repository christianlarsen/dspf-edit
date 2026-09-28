/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.decorations.ts
*/

import * as vscode from "vscode";
import { regionAt } from "./dspf-edit.columns";
import { readSettings, isDspfDocument } from "./dspf-edit.settings";

function toRgba(hex: string, opacity: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return "";
  }
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Highlights only the column section under the cursor — never the whole line.
 * Decoration types are created once and reused; updates touch only the
 * editor whose cursor moved.
 */
export class DecorationManager implements vscode.Disposable {
  private highlightType: vscode.TextEditorDecorationType | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.createTypes();
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => this.update(e.textEditor)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.update(editor);
        }
      }),
    );
    if (vscode.window.activeTextEditor) {
      this.update(vscode.window.activeTextEditor);
    }
  }

  /** Re-create decoration types after a settings change, then re-apply. */
  refresh(): void {
    this.createTypes();
    for (const editor of vscode.window.visibleTextEditors) {
      this.update(editor);
    }
  }

  private createTypes(): void {
    this.highlightType?.dispose();
    const settings = readSettings();
    const custom = toRgba(settings.highlightColor, settings.highlightOpacity);
    this.highlightType = vscode.window.createTextEditorDecorationType({
      backgroundColor: custom !== "" ? custom : new vscode.ThemeColor("editor.wordHighlightBackground"),
      borderRadius: "2px",
    });
  }

  update(editor: vscode.TextEditor): void {
    if (!this.highlightType) {
      return;
    }
    if (!isDspfDocument(editor.document)) {
      return;
    }
    const settings = readSettings();
    if (!settings.highlightEnabled) {
      editor.setDecorations(this.highlightType, []);
      return;
    }

    const position = editor.selection.active;
    const region = regionAt(position.character + 1);
    if (region.id === "beyond") {
      editor.setDecorations(this.highlightType, []);
      return;
    }

    const lineLength = editor.document.lineAt(position.line).text.length;
    const start = Math.min(region.start - 1, lineLength);
    const end = Math.min(region.end, lineLength);
    if (start >= end) {
      editor.setDecorations(this.highlightType, []);
      return;
    }

    const range = new vscode.Range(position.line, start, position.line, end);
    editor.setDecorations(this.highlightType, [
      { range, hoverMessage: undefined },
    ]);
  }

  dispose(): void {
    this.highlightType?.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
