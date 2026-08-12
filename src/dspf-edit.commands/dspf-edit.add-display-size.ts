/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.add-display-size.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { getAvailableDisplayFormats } from '../dspf-edit.model/dspf-edit.model';
import {
    checkForEditorAndDocument, applyWorkspaceEdit,
    DisplaySize, STANDARD_DISPLAY_SIZES, collectDspsizConfiguration, updateDspsizLines
} from '../dspf-edit.utils/dspf-edit.helper';

// COMMAND REGISTRATION

/**
 * Registers the "Add Display Size" command for DDS files. Lets the user add a second declared
 * DSPSIZ display size (e.g. *DS4 27x132) to a file that currently declares zero or one. Existing
 * records' size-bearing keywords (WINDOW, SFLPAG, SFLSIZ, ...) are left unconditioned — an
 * unconditioned line already applies to every declared format, including the newly added one — so
 * they keep working unchanged; use the preview to give any of them a size-specific value afterward.
 * @param context - The VS Code extension context
 */
export function addDisplaySize(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-display-size", async (node: DdsNode) => {
            await handleAddDisplaySizeCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the "Add Display Size" command workflow: validates the file isn't already at the
 * supported ceiling of two declared sizes, lets the user pick which standard size to add, and
 * rewrites the file's DSPSIZ specification to declare both.
 * @param node - The DDS node the command was invoked on (must be the file-level node)
 */
async function handleAddDisplaySizeCommand(node: DdsNode): Promise<void> {
    try {
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        if (node.ddsElement.kind !== 'file') {
            vscode.window.showWarningMessage('Display sizes can only be added at file level.');
            return;
        };

        const declaredFormats = getAvailableDisplayFormats();
        if (declaredFormats.length >= STANDARD_DISPLAY_SIZES.length) {
            vscode.window.showInformationMessage(
                `This file already declares ${declaredFormats.length} display size(s) — the supported maximum. Removing a display size isn't supported yet.`
            );
            return;
        };

        const existingSizes: DisplaySize[] = declaredFormats.map(format =>
            STANDARD_DISPLAY_SIZES.find(s => s.name === format.name)
                ?? { rows: format.rows, cols: format.cols, name: format.name, description: format.name }
        );

        const config = await collectDspsizConfiguration(existingSizes);
        if (!config) {
            // User cancelled
            return;
        };

        // "Add" semantics only — keeping every existing size selected is required (removing one is
        // out of scope for now); picking no new size means there's nothing to do.
        const existingNames = new Set(existingSizes.map(s => s.name));
        const droppedExisting = existingSizes.filter(s => !config.sizes.some(picked => picked.name === s.name));
        if (droppedExisting.length > 0) {
            vscode.window.showWarningMessage(
                'Removing an existing display size is not supported yet — keep the existing size(s) selected and add a new one.'
            );
            return;
        };

        const newlyAdded = config.sizes.filter(s => !existingNames.has(s.name));
        if (newlyAdded.length === 0) {
            vscode.window.showInformationMessage('No new display size selected — nothing changed.');
            return;
        };

        if (!(await updateDspsizLines(editor, config.sizes))) {
            return;
        };

        const addedText = newlyAdded.map(s => `${s.rows}x${s.cols} (${s.name})`).join(', ');
        vscode.window.showInformationMessage(
            `Added display size ${addedText}. Existing windows/subfiles now apply to it unchanged — adjust any of them per size from the preview if needed.`
        );

    } catch (error) {
        console.error('Error adding display size:', error);
        vscode.window.showErrorMessage('An error occurred while adding the display size.');
    };
};
