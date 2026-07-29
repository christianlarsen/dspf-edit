/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.resolve-referenced-field.ts
*/

import * as vscode from 'vscode';
import { DdsNode, DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { DdsField, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';
import { resolveReferencedField, getPendingReferencedFields } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';

/**
 * Resolves one referenced field, looking up its record's attributes for the REF() fallback.
 * @param documentUri - The DDS document's URI (as a string), used as the cache key
 * @param field - The referenced field to resolve
 * @returns An error message on failure, or undefined on success
 */
async function resolveOneField(documentUri: string, field: DdsField): Promise<string | undefined> {
    const recordAttributes = fieldsPerRecords.find(r => r.record === field.recordname)?.attributes;
    try {
        await resolveReferencedField(documentUri, field, recordAttributes);
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : `Could not resolve field '${field.name}'.`;
    };
};

/**
 * Registers the command that resolves a single referenced field's real type/length/decimals
 * against the connected IBM i (via Code for i), shown as an inline button on referenced-pending
 * fields in the tree.
 * @param context - The VS Code extension context
 * @param treeProvider - The tree provider, refreshed after a successful resolution
 */
export function resolveReferencedFieldCommand(context: vscode.ExtensionContext, treeProvider: DdsTreeProvider): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dspf-edit.resolve-referenced-field', async (node: DdsNode) => {
            await handleResolveReferencedField(node, treeProvider);
        })
    );
};

/**
 * Resolves one referenced field and refreshes the tree. Errors (no connection, file/field not
 * found, ...) are shown to the user rather than thrown further, matching the other tree commands.
 * @param node - The tree node for the referenced field to resolve
 * @param treeProvider - The tree provider, refreshed after a successful resolution
 */
async function handleResolveReferencedField(node: DdsNode, treeProvider: DdsTreeProvider): Promise<void> {
    const element = node.ddsElement;
    if (element.kind !== 'field' || !element.referenced) {
        return;
    };

    const { document } = checkForEditorAndDocument();
    if (!document) {
        return;
    };

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: `Resolving ${element.name}...` },
        async () => {
            const error = await resolveOneField(document.uri.toString(), element);
            treeProvider.refresh();
            if (error) {
                vscode.window.showErrorMessage(error);
            };
        }
    );
};

/**
 * Registers the command that resolves every referenced field still pending in the current
 * document, shown on the "N referenced fields pending" status bar item.
 * @param context - The VS Code extension context
 * @param treeProvider - The tree provider, both read for pending fields and refreshed afterwards
 */
export function resolveAllReferencedFieldsCommand(context: vscode.ExtensionContext, treeProvider: DdsTreeProvider): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dspf-edit.resolve-all-referenced-fields', async () => {
            await handleResolveAllReferencedFields(treeProvider);
        })
    );
};

/**
 * Resolves every pending referenced field in the current document, one at a time, then refreshes
 * the tree once. Reports a summary rather than one message per field.
 * @param treeProvider - The tree provider, both read for pending fields and refreshed afterwards
 */
async function handleResolveAllReferencedFields(treeProvider: DdsTreeProvider): Promise<void> {
    const { document } = checkForEditorAndDocument();
    if (!document) {
        return;
    };

    const documentUri = document.uri.toString();
    const pendingFields = getPendingReferencedFields(documentUri, treeProvider.getElements());
    if (pendingFields.length === 0) {
        vscode.window.showInformationMessage('No pending referenced fields to resolve.');
        return;
    };

    const errors: string[] = [];

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Resolving referenced fields...', cancellable: false },
        async (progress) => {
            for (const field of pendingFields) {
                progress.report({ message: field.name });
                const error = await resolveOneField(documentUri, field);
                if (error) {
                    errors.push(error);
                };
            };
        }
    );

    treeProvider.refresh();

    const resolvedCount = pendingFields.length - errors.length;
    if (errors.length === 0) {
        vscode.window.showInformationMessage(`Resolved ${resolvedCount} referenced field${resolvedCount === 1 ? '' : 's'}.`);
    } else {
        vscode.window.showWarningMessage(`Resolved ${resolvedCount} of ${pendingFields.length} referenced field(s). ${errors.length} failed: ${errors.join(' ')}`);
    };
};
