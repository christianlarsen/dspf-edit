/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.validation.ts
*/

import * as vscode from 'vscode';
import { findConditionProblems } from './dspf-edit.condition-columns';

/**
 * Source checks shown as errors or warnings in the editor and the Problems panel, for things the compiler
 * would reject or read differently than intended. Each open display file is checked when opened
 * and again shortly after each change, whether or not it's the one the tree is showing.
 * For now: the condition area, columns 7-16 (see dspf-edit.condition-columns.ts), with a quick fix
 * that moves the indicators to their columns when it's clear what was meant.
 */

const DSPF_LANGUAGE_ID = 'dds.dspf';
const DIAGNOSTIC_SOURCE = 'DSPF';
const CONDITION_CODE = 'condition-columns';
const DEBOUNCE_MS = 400;

/**
 * Registers the checks: the diagnostic collection, the listeners that keep it up to date, and
 * the quick fix.
 * @param context - The VS Code extension context
 */
export function registerValidation(context: vscode.ExtensionContext): void {
    const collection = vscode.languages.createDiagnosticCollection('dspf-edit');
    const timers = new Map<string, NodeJS.Timeout>();

    const validate = (document: vscode.TextDocument) => {
        if (document.languageId !== DSPF_LANGUAGE_ID) return;
        collection.set(document.uri, buildDiagnostics(document));
    };
    const validateLater = (document: vscode.TextDocument) => {
        const key = document.uri.toString();
        clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => {
            timers.delete(key);
            validate(document);
        }, DEBOUNCE_MS));
    };

    vscode.workspace.textDocuments.forEach(validate);

    context.subscriptions.push(
        collection,
        vscode.workspace.onDidOpenTextDocument(validate),
        vscode.workspace.onDidChangeTextDocument(event => validateLater(event.document)),
        vscode.workspace.onDidCloseTextDocument(document => {
            const key = document.uri.toString();
            clearTimeout(timers.get(key));
            timers.delete(key);
            collection.delete(document.uri);
        }),
        vscode.languages.registerCodeActionsProvider({ language: DSPF_LANGUAGE_ID }, new ConditionColumnsFix(), {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        }),
        { dispose: () => timers.forEach(timer => clearTimeout(timer)) }
    );
};

function documentLines(document: vscode.TextDocument): string[] {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
    };
    return lines;
};

function buildDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
    const lines = documentLines(document);

    return findConditionProblems(lines).map(problem => {
        const lineLength = lines[problem.lineIndex].length;
        const range = new vscode.Range(
            problem.lineIndex, Math.min(problem.startCol, lineLength),
            problem.lineIndex, Math.min(problem.endCol, Math.max(lineLength, problem.startCol))
        );
        const message = problem.fix
            ? `${problem.message} Did you mean '${problem.fix.trimEnd()}' in columns 7-16? (Quick Fix)`
            : problem.message;
        const diagnostic = new vscode.Diagnostic(range, message,
            problem.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
        diagnostic.source = DIAGNOSTIC_SOURCE;
        diagnostic.code = problem.code ?? CONDITION_CODE;
        return diagnostic;
    });
};

/** Quick fix: rewrites columns 7-16 of the line as suggested, leaving the rest of it untouched. */
class ConditionColumnsFix implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== DIAGNOSTIC_SOURCE) continue;

            const lineIndex = diagnostic.range.start.line;
            const line = document.lineAt(lineIndex).text;
            const fix = findConditionProblems(documentLines(document)).find(problem => problem.lineIndex === lineIndex)?.fix;
            if (!fix) continue;

            const padded = line.padEnd(16, ' ');
            const newLine = (padded.substring(0, 6) + fix + padded.substring(16)).trimEnd();
            const action = new vscode.CodeAction(`Fix columns 7-16: '${fix.trimEnd()}'`, vscode.CodeActionKind.QuickFix);
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(document.uri, document.lineAt(lineIndex).range, newLine);
            action.diagnostics = [diagnostic];
            action.isPreferred = true;
            actions.push(action);
        };
        return actions;
    };
};
