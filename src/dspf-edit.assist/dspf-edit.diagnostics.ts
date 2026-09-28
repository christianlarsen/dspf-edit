/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.diagnostics.ts
*/

import * as vscode from "vscode";
import { parseSource } from "./dspf-edit.column-parser";
import { checkSource, Issue } from "./dspf-edit.rules";
import { readSettings, isDspfDocument } from "./dspf-edit.settings";

const SEVERITIES: Record<Issue["severity"], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

/**
 * Runs the pure rule engine against DDS documents, debounced on change.
 */
export class DiagnosticManager implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("dspf-edit.dds");
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => this.analyze(doc)),
      vscode.workspace.onDidChangeTextDocument((e) => this.scheduleAnalyze(e.document)),
      vscode.workspace.onDidCloseTextDocument((doc) => this.collection.delete(doc.uri)),
    );
    for (const doc of vscode.workspace.textDocuments) {
      this.analyze(doc);
    }
  }

  /** Re-run everything (settings changed). */
  refresh(): void {
    for (const doc of vscode.workspace.textDocuments) {
      this.analyze(doc);
    }
  }

  private scheduleAnalyze(document: vscode.TextDocument): void {
    if (!isDspfDocument(document)) {
      return;
    }
    const key = document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.analyze(document);
      }, 300),
    );
  }

  private analyze(document: vscode.TextDocument): void {
    if (!isDspfDocument(document)) {
      return;
    }
    if (!readSettings().diagnosticsEnabled) {
      this.collection.delete(document.uri);
      return;
    }

    const issues = checkSource(parseSource(document.getText()));
    const diagnostics = issues.map((issue) => {
      const lineLength = document.lineAt(issue.line).text.length;
      const start = Math.min(issue.startColumn - 1, Math.max(0, lineLength - 1));
      const end = Math.min(issue.endColumn, lineLength);
      const range = new vscode.Range(issue.line, start, issue.line, Math.max(end, start + 1));
      const diagnostic = new vscode.Diagnostic(range, issue.message, SEVERITIES[issue.severity]);
      diagnostic.source = "DSPF-edit";
      diagnostic.code = issue.code;
      return diagnostic;
    });
    this.collection.set(document.uri, diagnostics);
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.collection.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
