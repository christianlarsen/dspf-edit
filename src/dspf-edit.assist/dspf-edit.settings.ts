/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.settings.ts
*/

import * as vscode from "vscode";

/** Configuration section holding every DDS-assistance setting. */
const SECTION = "dspf-edit.assist";

/**
 * Every language ID the DDS editing assistance applies to.
 *
 * The graphical DSPF tooling (schema tree, screen preview, element commands) is
 * display-file only and keeps using `dds.dspf` directly. The text-editing
 * assistance in this folder is layout-driven, so it is useful on every DDS
 * source type. `dds` is this extension's own ID for plain `.dds` sources; the
 * `dds.*` IDs are the ones the IBM i ecosystem already uses.
 *
 * This array is the single place to widen or narrow that scope.
 */
export const DDS_LANGUAGES: readonly string[] = [
  "dds",
  "dds.pf",
  "dds.lf",
  "dds.dspf",
  "dds.prtf",
];

/** Typed, centralized access to all DDS-assistance settings. */
export interface DdsAssistSettings {
  /** Master switch. When off, every flag below reads as false. */
  enabled: boolean;
  statusBarEnabled: boolean;
  statusBarFormat: string;
  statusBarShowIcon: boolean;
  hoverEnabled: boolean;
  diagnosticsEnabled: boolean;
  completionEnabled: boolean;
  highlightEnabled: boolean;
  highlightColor: string;
  highlightOpacity: number;
}

export function readSettings(): DdsAssistSettings {
  const config = vscode.workspace.getConfiguration(SECTION);
  // Folding the master switch into every individual flag keeps each consumer
  // free of a second "is the whole layer on?" check.
  const enabled = config.get("enabled", true);
  return {
    enabled,
    statusBarEnabled: enabled && config.get("statusBar.enabled", true),
    statusBarFormat: config.get("statusBar.format", "DDS | Col {column} | {section}"),
    statusBarShowIcon: config.get("statusBar.showIcon", true),
    hoverEnabled: enabled && config.get("hover.enabled", true),
    diagnosticsEnabled: enabled && config.get("diagnostics.enabled", true),
    completionEnabled: enabled && config.get("completion.enabled", true),
    highlightEnabled: enabled && config.get("highlight.enabled", true),
    highlightColor: config.get("highlight.color", ""),
    highlightOpacity: Math.min(0.15, Math.max(0.02, config.get("highlight.opacity", 0.08))),
  };
}

export function onSettingsChanged(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) {
      listener();
    }
  });
}

export function isDdsLanguage(languageId: string): boolean {
  return DDS_LANGUAGES.includes(languageId);
}

export function isDdsDocument(document: vscode.TextDocument): boolean {
  return isDdsLanguage(document.languageId);
}
