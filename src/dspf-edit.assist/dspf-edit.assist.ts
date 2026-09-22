/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.assist.ts
*/

import * as vscode from "vscode";
import { StatusBarManager } from "./dspf-edit.status-bar";
import { DecorationManager } from "./dspf-edit.decorations";
import { DiagnosticManager } from "./dspf-edit.diagnostics";
import { DdsHoverProvider } from "./dspf-edit.hover";
import { DdsCompletionProvider } from "./dspf-edit.completion";
import { DdsDocumentSymbolProvider } from "./dspf-edit.symbols";
import { showColumnReference } from "./dspf-edit.column-reference";
import { toggleColumnGuides, toggleSectionHighlight } from "./dspf-edit.toggles";
import { applyDdsEditorDefaults } from "./dspf-edit.editor-defaults";
import { onSettingsChanged, DDS_LANGUAGES } from "./dspf-edit.settings";

/**
 * Registers the DDS editing-assistance layer: column-aware status bar, column
 * reference, hovers, diagnostics, keyword completion, section highlight and
 * outline symbols.
 *
 * Everything registered here is text-editor assistance driven by the DDS column
 * layout (see dspf-edit.columns.ts). It is deliberately independent of the
 * graphical DSPF tooling: it touches no tree provider, no preview panel and no
 * DSPF parser state, so the two layers cannot interfere with each other.
 *
 * Providers are always registered; the individual features read their settings
 * on every call, so toggling a setting takes effect immediately without a
 * window reload. `dspf-edit.assist.enabled` turns the whole layer off.
 */
export function registerDdsAssist(context: vscode.ExtensionContext): void {
  const statusBar = new StatusBarManager();
  const decorations = new DecorationManager();
  const diagnostics = new DiagnosticManager();

  context.subscriptions.push(
    statusBar,
    decorations,
    diagnostics,

    vscode.languages.registerHoverProvider(DDS_LANGUAGES, new DdsHoverProvider()),
    vscode.languages.registerCompletionItemProvider(DDS_LANGUAGES, new DdsCompletionProvider()),
    vscode.languages.registerDocumentSymbolProvider(
      DDS_LANGUAGES,
      new DdsDocumentSymbolProvider(),
    ),

    vscode.commands.registerCommand("dspf-edit.show-column-reference", showColumnReference),
    vscode.commands.registerCommand("dspf-edit.toggle-column-guides", toggleColumnGuides),
    vscode.commands.registerCommand("dspf-edit.toggle-section-highlight", toggleSectionHighlight),
    vscode.commands.registerCommand("dspf-edit.apply-dds-editor-defaults", applyDdsEditorDefaults),

    onSettingsChanged(() => {
      decorations.refresh();
      diagnostics.refresh();
      statusBar.update(vscode.window.activeTextEditor);
    }),
  );
}
