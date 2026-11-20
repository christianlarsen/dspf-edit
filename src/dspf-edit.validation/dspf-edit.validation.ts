/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.validation.ts
*/

import * as vscode from 'vscode';
import { findConditionProblems } from './dspf-edit.condition-columns';
import { findSubfileKeywordProblems, CPF_PAGE_EQUALS_SIZE } from './dspf-edit.subfile-keywords';
import { findMenuPlacementProblems, MENU_PLACEMENT_CODE } from './dspf-edit.menu-placement';
import { getMenuMemberKind } from '../dspf-edit.utils/dspf-edit.menu';
import { getMenuCreateOptions, onDidChangeMenuCreateOptions } from '../dspf-edit.commands/dspf-edit.menu-members';

/**
 * Source checks shown as errors or warnings in the editor and the Problems panel, for things the compiler
 * would reject or read differently than intended. Each open display file is checked when opened
 * and again shortly after each change, whether or not it's the one the tree is showing.
 * For now: the condition area, columns 7-16 (see dspf-edit.condition-columns.ts), with a quick fix
 * that moves the indicators to their columns when it's clear what was meant; and SFLDROP/SFLFOLD
 * when SFLPAG equals SFLSIZ (see dspf-edit.subfile-keywords.ts), with quick fixes that raise SFLSIZ
 * or remove the keyword. On a menu image (MNUDDS), text on the rows the created menu keeps for
 * itself (see dspf-edit.menu-placement.ts).
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
        // A menu's reserved rows depend on the command line and function keys chosen in the preview
        onDidChangeMenuCreateOptions(uri => {
            const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
            if (document) {
                validate(document);
            };
        }),
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
        vscode.languages.registerCodeActionsProvider({ language: DSPF_LANGUAGE_ID }, new SubfileKeywordsFix(), {
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

    const subfileDiagnostics = findSubfileKeywordProblems(lines).map(problem => {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(problem.lineIndex, problem.startCol, problem.lineIndex, problem.endCol),
            problem.message,
            problem.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
        diagnostic.source = DIAGNOSTIC_SOURCE;
        diagnostic.code = problem.code;
        return diagnostic;
    });

    const menuDiagnostics = getMenuMemberKind(document.uri.path) !== 'dds' ? [] :
        findMenuPlacementProblems(lines, getMenuCreateOptions(document.uri)).map(problem => {
            // The row and column, positions 39-44
            const lineLength = lines[problem.lineIndex].length;
            const range = new vscode.Range(problem.lineIndex, Math.min(38, lineLength), problem.lineIndex, Math.min(44, lineLength));
            const diagnostic = new vscode.Diagnostic(range, problem.message, vscode.DiagnosticSeverity.Warning);
            diagnostic.source = DIAGNOSTIC_SOURCE;
            diagnostic.code = MENU_PLACEMENT_CODE;
            return diagnostic;
        });

    return [...subfileDiagnostics, ...menuDiagnostics, ...findConditionProblems(lines).map(problem => {
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
    })];
};

/** Quick fix: rewrites columns 7-16 of the line as suggested, leaving the rest of it untouched. */
class ConditionColumnsFix implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== DIAGNOSTIC_SOURCE || diagnostic.code === CPF_PAGE_EQUALS_SIZE) continue;

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

/**
 * Quick fixes for SFLDROP/SFLFOLD where SFLPAG equals SFLSIZ: make SFLSIZ one more than SFLPAG (the
 * usual choice, and what the preview's SFLPAG buttons keep), or remove the keyword.
 */
class SubfileKeywordsFix implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== DIAGNOSTIC_SOURCE || diagnostic.code !== CPF_PAGE_EQUALS_SIZE) continue;

            const problem = findSubfileKeywordProblems(documentLines(document))
                .find(p => p.lineIndex === diagnostic.range.start.line && p.startCol === diagnostic.range.start.character);
            if (!problem) continue;

            const raise = new vscode.CodeAction('Make SFLSIZ one more than SFLPAG', vscode.CodeActionKind.QuickFix);
            raise.edit = new vscode.WorkspaceEdit();
            for (const edit of problem.sizeFix) {
                raise.edit.replace(document.uri, new vscode.Range(edit.lineIndex, edit.startCol, edit.lineIndex, edit.endCol), edit.newText);
            };
            raise.diagnostics = [diagnostic];
            raise.isPreferred = true;
            actions.push(raise);

            const remove = new vscode.CodeAction(`Remove ${problem.keyword}`, vscode.CodeActionKind.QuickFix);
            remove.edit = new vscode.WorkspaceEdit();
            const { deleteLine, edit } = problem.removeFix;
            remove.edit.delete(document.uri, deleteLine
                ? document.lineAt(edit.lineIndex).rangeIncludingLineBreak
                : new vscode.Range(edit.lineIndex, edit.startCol, edit.lineIndex, edit.endCol));
            remove.diagnostics = [diagnostic];
            actions.push(remove);
        };
        return actions;
    };
};
