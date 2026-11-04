/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.settings.ts
*/

import * as vscode from "vscode";

/** Configuration section holding every source-editing setting. */
const SECTION = "dspf-edit.assist";

/**
 * The only language ID this extension handles: display file DDS.
 *
 * It is the same ID the IBM i ecosystem already uses for `.dspf` sources, so
 * declaring it here does not fight with Code for IBM i or IBM i Languages, it
 * just means the extension no longer depends on one of them being installed.
 *
 * This constant is the single place to widen the scope if printer files or
 * physical/logical files are ever brought in.
 */
export const DSPF_LANGUAGE_ID = "dds.dspf";

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
    statusBarFormat: config.get("statusBar.format", "DSPF | Col {column} | {section}"),
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

export function isDspfDocument(document: vscode.TextDocument): boolean {
  return document.languageId === DSPF_LANGUAGE_ID;
}
