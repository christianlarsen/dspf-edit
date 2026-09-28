/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.toggles.ts
*/

import * as vscode from "vscode";
import { DEFAULT_GUIDE_COLUMNS } from "./dspf-edit.columns";
import { DSPF_LANGUAGE_ID } from "./dspf-edit.settings";

/**
 * Toggles the column guides. They are native `editor.rulers` scoped to the
 * display file language, so no decorations are drawn and no other file type is
 * affected.
 */
export async function toggleColumnGuides(): Promise<void> {
  const config = vscode.workspace.getConfiguration("editor", {
    languageId: DSPF_LANGUAGE_ID,
  });
  const inspection = config.inspect<number[]>("rulers");
  const current = inspection?.globalLanguageValue ?? inspection?.defaultLanguageValue ?? [];
  const next = current.length > 0 ? [] : [...DEFAULT_GUIDE_COLUMNS];

  await config.update("rulers", next, vscode.ConfigurationTarget.Global, true);

  vscode.window.setStatusBarMessage(
    next.length > 0 ? "DSPF column guides on" : "DSPF column guides off",
    2000,
  );
}

/** Toggles the current-section highlight. */
export async function toggleSectionHighlight(): Promise<void> {
  const config = vscode.workspace.getConfiguration("dspf-edit.assist");
  const current = config.get<boolean>("highlight.enabled", true);
  await config.update("highlight.enabled", !current, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(
    !current ? "DSPF section highlight on" : "DSPF section highlight off",
    2000,
  );
}
