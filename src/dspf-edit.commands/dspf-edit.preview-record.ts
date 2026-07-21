/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.preview-record.ts
*/

import * as vscode from 'vscode';
import { DdsNode, DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords, getRecordSize, getDefaultSize } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument } from '../dspf-edit.utils/dspf-edit.helper';
import { RecordPreviewPanel } from '../dspf-edit.webview/dspf-edit.record-preview-panel';

/**
 * Registers the "Preview Screen Layout" command for DDS records, and keeps the preview panel
 * (when open) following the tree selection: clicking a different record retargets it, and clicking
 * a field/constant highlights it in the preview (retargeting first if it belongs to another record).
 * @param context - The VS Code extension context
 * @param treeProvider - The tree provider, used to refresh the preview when the DDS source is re-parsed
 */
export function previewRecord(context: vscode.ExtensionContext, treeProvider: DdsTreeProvider): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.preview-record", (node: DdsNode) => {
            handlePreviewRecordCommand(node, treeProvider);
        })
    );

    const treeView = treeProvider.getTreeView();
    if (treeView) {
        context.subscriptions.push(
            treeView.onDidChangeSelection(event => {
                try {
                    if (!RecordPreviewPanel.isOpen()) {
                        return;
                    };

                    const element = event.selection[0]?.ddsElement;
                    if (element?.kind === 'record') {
                        showRecordInPreview(element.name, treeProvider);
                    } else if (element?.kind === 'field' || element?.kind === 'constant') {
                        if (element.recordname !== RecordPreviewPanel.getCurrentRecordName()) {
                            showRecordInPreview(element.recordname, treeProvider);
                        };
                        RecordPreviewPanel.selectLineIfOpen(element.lineIndex);
                    };
                } catch (error) {
                    console.error('Error updating record preview on selection change:', error);
                };
            })
        );
    };
};

/**
 * Handles the preview record command: opens (or reveals) the preview panel for the selected record.
 * @param node - The DDS node containing the record to preview
 * @param treeProvider - The tree provider, whose refresh event drives the panel's updates
 */
function handlePreviewRecordCommand(node: DdsNode, treeProvider: DdsTreeProvider): void {
    try {
        if (!node || !node.ddsElement) {
            vscode.window.showWarningMessage("No record selected to preview.");
            return;
        };

        const element = node.ddsElement;

        if (element.kind !== "record") {
            vscode.window.showWarningMessage("Only records can be previewed.");
            return;
        };

        const { document } = checkForEditorAndDocument();
        if (!document) {
            return;
        };

        showRecordInPreview(element.name, treeProvider);

    } catch (error) {
        console.error('Error previewing record:', error);
        vscode.window.showErrorMessage(`An error occurred while previewing the record: ${error instanceof Error ? error.message : String(error)}`);
    };
};

/**
 * Shows the given record in the (single, shared) preview panel, creating it if needed,
 * and keeps it refreshed on every subsequent tree/model refresh.
 * @param recordName - Name of the record to preview
 * @param treeProvider - The tree provider, whose refresh event drives the panel's updates
 */
function showRecordInPreview(recordName: string, treeProvider: DdsTreeProvider): void {
    const panel = RecordPreviewPanel.getOrCreate(recordName, treeProvider);

    const refresh = () => {
        const recordInfo = fieldsPerRecords.find(r => r.record === recordName);
        const size = getRecordSize(recordName) ?? getDefaultSize();
        panel.update(recordInfo, size);
    };

    panel.setRefreshSource(treeProvider.onDidChangeTreeData, refresh);
    refresh();
};
