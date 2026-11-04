/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.editor-defaults.ts
*/

import * as vscode from "vscode";
import { DEFAULT_GUIDE_COLUMNS } from "./dspf-edit.columns";
import { DSPF_LANGUAGE_ID } from "./dspf-edit.settings";

/**
 * The column guides that make fixed-format DDS practical to read: a guide at
 * every DDS column boundary.
 *
 * These are applied as *language-scoped user settings* rather than through
 * `contributes.configurationDefaults`, because VS Code cannot express a
 * language override for a language ID containing a dot: it splits the override
 * key on `.`, so `"[dds.dspf]"` is stored as `["[dds"]["dspf]"]` and the
 * configuration model then throws on the key it cannot find. The throw aborts
 * the whole contribution delta, which also silently prevents this extension's
 * own `configuration` section from registering. Writing the same values through
 * the configuration API works correctly for dotted language IDs, so that is
 * what the "Apply Recommended DSPF Editor Settings" command does.
 */
const RECOMMENDED_SETTINGS: ReadonlyArray<readonly [string, unknown]> = [
  ["rulers", [...DEFAULT_GUIDE_COLUMNS]],
];

/**
 * Writes the recommended editor settings for the display file language into the
 * user's global settings. Only ever invoked from an explicit command, never
 * silently.
 *
 * Settings already holding the wanted value are skipped, so re-running this is
 * cheap and does not churn settings.json.
 */
export async function applyDspfEditorDefaults(): Promise<void> {
  const config = vscode.workspace.getConfiguration("editor", {
    languageId: DSPF_LANGUAGE_ID,
  });

  for (const [key, value] of RECOMMENDED_SETTINGS) {
    const existing = config.inspect(key)?.globalLanguageValue;
    if (JSON.stringify(existing) === JSON.stringify(value)) {
      continue;
    }
    await config.update(key, value, vscode.ConfigurationTarget.Global, true);
  }

  // Deliberately not awaited: the command is finished once the settings are
  // written, and it should not stay pending until the user dismisses a toast.
  void vscode.window
    .showInformationMessage(
      "DSPF column guides applied. " +
        `Saved under "[${DSPF_LANGUAGE_ID}]", so no other file type is affected.`,
      "Open Settings",
    )
    .then((choice) => {
      if (choice === "Open Settings") {
        void vscode.commands.executeCommand("workbench.action.openSettingsJson");
      }
    });
}
