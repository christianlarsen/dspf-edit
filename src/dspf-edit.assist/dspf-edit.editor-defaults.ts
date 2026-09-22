/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.editor-defaults.ts
*/

import * as vscode from "vscode";
import { DEFAULT_GUIDE_COLUMNS } from "./dspf-edit.columns";
import { DDS_LANGUAGES } from "./dspf-edit.settings";

/**
 * The editor settings that make fixed-format DDS practical to type:
 * column guides at every DDS boundary, one space per Tab so entries can be
 * placed on an exact column, no indentation guessing, and no word wrap.
 *
 * These are applied as *language-scoped user settings* rather than through
 * `contributes.configurationDefaults`, because VS Code cannot express a
 * language override for a language ID containing a dot: it splits the override
 * key on `.`, so `"[dds.dspf]"` is stored as `["[dds"]["dspf]"]` and the
 * configuration model then throws on the key it cannot find. The throw aborts
 * the whole contribution delta, which also silently prevents this extension's
 * own `configuration` section from registering. Writing the same values through
 * the configuration API works correctly for dotted language IDs, so that is
 * what the "Apply Recommended DDS Editor Settings" command does.
 */
const RECOMMENDED_SETTINGS: ReadonlyArray<readonly [string, unknown]> = [
  ["rulers", [...DEFAULT_GUIDE_COLUMNS]]
];

/** True when every recommended setting is already in effect for every DDS language. */
export function ddsEditorDefaultsApplied(): boolean {
  return DDS_LANGUAGES.every((languageId) => {
    const config = vscode.workspace.getConfiguration("editor", { languageId });
    return RECOMMENDED_SETTINGS.every(([key]) => {
      const inspected = config.inspect(key);
      return (
        inspected?.globalLanguageValue !== undefined ||
        inspected?.workspaceLanguageValue !== undefined
      );
    });
  });
}

/**
 * Writes the recommended editor settings for every DDS language into the user's
 * global settings. Only ever invoked from an explicit command, never silently.
 *
 * Settings already holding the wanted value are skipped, so re-running this is
 * cheap and does not churn settings.json.
 */
export async function applyDdsEditorDefaults(): Promise<void> {
  for (const languageId of DDS_LANGUAGES) {
    const config = vscode.workspace.getConfiguration("editor", { languageId });
    for (const [key, value] of RECOMMENDED_SETTINGS) {
      const existing = config.inspect(key)?.globalLanguageValue;
      if (JSON.stringify(existing) === JSON.stringify(value)) {
        continue;
      }
      await config.update(key, value, vscode.ConfigurationTarget.Global, true);
    }
  }

  // Deliberately not awaited: the command is finished once the settings are
  // written, and it should not stay pending until the user dismisses a toast.
  void vscode.window
    .showInformationMessage(
      "DDS editor settings applied: column guides, one space per Tab, no word wrap. " +
        `Saved per language (${DDS_LANGUAGES.join(", ")}), so no other file type is affected.`,
      "Open Settings",
    )
    .then((choice) => {
      if (choice === "Open Settings") {
        void vscode.commands.executeCommand("workbench.action.openSettingsJson");
      }
    });
}
