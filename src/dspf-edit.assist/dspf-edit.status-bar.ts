/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.status-bar.ts
*/

import * as vscode from "vscode";
import { columnInfoAt } from "./dspf-edit.column-parser";
import { readSettings, isDspfDocument } from "./dspf-edit.settings";

/**
 * Shows "DSPF | Col 27 | Length" style info for the active cursor position.
 * Only updates on cursor / editor changes — never on a timer.
 *
 * Aligned right on purpose: the schema-filter and pending-referenced-fields
 * items live on the left, so the two never compete for the same slot.
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      "dspf-edit.assist.columnStatus",
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.item.name = "DSPF column assistant";
    this.item.command = "dspf-edit.show-column-reference";
    this.item.tooltip = "DSPF column assistant — click for the full column reference";

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => this.update(e.textEditor)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.update(editor)),
    );
    this.update(vscode.window.activeTextEditor);
  }

  update(editor: vscode.TextEditor | undefined): void {
    const settings = readSettings();
    if (!editor || !isDspfDocument(editor.document) || !settings.statusBarEnabled) {
      this.item.hide();
      return;
    }

    const position = editor.selection.active;
    const raw = editor.document.lineAt(position.line).text;
    const info = columnInfoAt(raw, position.line, position.character);

    const text = settings.statusBarFormat
      .replace("{column}", String(info.column))
      .replace("{section}", info.region.label);

    this.item.text = settings.statusBarShowIcon ? `$(layout-panel-justify) ${text}` : text;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
