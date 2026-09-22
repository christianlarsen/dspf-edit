/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.toggles.ts
*/

import * as vscode from "vscode";
import { DEFAULT_GUIDE_COLUMNS } from "./dspf-edit.columns";
import { DDS_LANGUAGES } from "./dspf-edit.settings";

/**
 * Toggles the DDS column guides. They are native `editor.rulers`, scoped to the
 * DDS languages, so no decorations are drawn and other file types are untouched.
 * All DDS languages are written together so they never drift apart.
 */
export async function toggleColumnGuides(): Promise<void> {
  const probe = vscode.workspace.getConfiguration("editor", { languageId: "dds" });
  const inspection = probe.inspect<number[]>("rulers");
  const current = inspection?.globalLanguageValue ?? inspection?.defaultLanguageValue ?? [];
  const next = current.length > 0 ? [] : [...DEFAULT_GUIDE_COLUMNS];

  for (const languageId of DDS_LANGUAGES) {
    const config = vscode.workspace.getConfiguration("editor", { languageId });
    await config.update("rulers", next, vscode.ConfigurationTarget.Global, true);
  }

  vscode.window.setStatusBarMessage(
    next.length > 0 ? "DDS column guides on" : "DDS column guides off",
    2000,
  );
}

/** Toggles the current-section highlight. */
export async function toggleSectionHighlight(): Promise<void> {
  const config = vscode.workspace.getConfiguration("dspf-edit.assist");
  const current = config.get<boolean>("highlight.enabled", true);
  await config.update("highlight.enabled", !current, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(
    !current ? "DDS section highlight on" : "DDS section highlight off",
    2000,
  );
}
