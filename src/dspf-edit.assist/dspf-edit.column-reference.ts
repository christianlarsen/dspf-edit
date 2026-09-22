/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.column-reference.ts
*/

import * as vscode from "vscode";
import { REGIONS } from "./dspf-edit.columns";

/**
 * Quick pick listing every DDS column region. Selecting one moves the
 * cursor to the start of that region on the current line.
 */
export async function showColumnReference(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  const items = REGIONS.map((region) => ({
    label: region.label,
    description:
      region.start === region.end
        ? `column ${region.start}`
        : `columns ${region.start}–${region.end}`,
    detail: region.purpose,
    region,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "DDS Column Reference",
    placeHolder: "Pick a region to jump to it on the current line",
    matchOnDetail: true,
  });

  if (picked && editor) {
    const line = editor.selection.active.line;
    const character = picked.region.start - 1;
    const lineLength = editor.document.lineAt(line).text.length;
    // Pad the line with spaces if it is shorter than the target column.
    if (lineLength < character) {
      await editor.edit((edit) => {
        edit.insert(new vscode.Position(line, lineLength), " ".repeat(character - lineLength));
      });
    }
    const position = new vscode.Position(line, character);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
  }
}
