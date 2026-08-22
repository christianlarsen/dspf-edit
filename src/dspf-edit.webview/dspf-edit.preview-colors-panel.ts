/*
    Christian Larsen, 2025
    "RPG structure"
    webview/dspf-edit.preview-colors-panel.ts
*/

import * as vscode from 'vscode';
import { PREVIEW_COLOR_SETTINGS, readColorSetting, resetPreviewColors, setPreviewColor } from '../dspf-edit.utils/dspf-edit.preview-colors';
import { RecordPreviewPanel } from './dspf-edit.record-preview-panel';

/**
 * Small webview panel to pick the record preview's colors visually — a native OS/browser color
 * picker per swatch (`<input type="color">`) instead of typing hex codes by hand. Reads and
 * writes straight to the extension's own stored preview colors (see
 * dspf-edit.utils/dspf-edit.preview-colors.ts), so there's no separate state of its own: closing
 * this panel loses nothing, since every change was already saved the moment it was made — and it
 * pushes each change straight to an open record preview panel, if any.
 */
export class PreviewColorsPanel {

    private static current: PreviewColorsPanel | undefined;

    private readonly panel: vscode.WebviewPanel;

    private constructor() {
        this.panel = vscode.window.createWebviewPanel(
            'dspfEditPreviewColors',
            'Configuration',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
            { enableScripts: true }
        );

        this.panel.webview.html = this.getHtml();
        this.panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message));

        this.panel.onDidDispose(() => {
            if (PreviewColorsPanel.current === this) {
                PreviewColorsPanel.current = undefined;
            };
        });
    }

    /** Opens the panel, or reveals/refreshes it if it's already open. */
    static show(): void {
        if (PreviewColorsPanel.current) {
            PreviewColorsPanel.current.refresh();
            PreviewColorsPanel.current.panel.reveal(vscode.ViewColumn.Beside, false);
            return;
        };
        PreviewColorsPanel.current = new PreviewColorsPanel();
    };

    /** Rebuilds the panel's HTML so its swatches reflect the settings' current effective values. */
    private refresh(): void {
        this.panel.webview.html = this.getHtml();
    };

    private async onDidReceiveMessage(message: any): Promise<void> {
        switch (message?.type) {
            case 'setColor':
                await setPreviewColor(message.key, message.value);
                RecordPreviewPanel.refreshTheme();
                break;
            case 'resetColor':
                await resetPreviewColors(message.key);
                this.refresh();
                RecordPreviewPanel.refreshTheme();
                break;
            case 'resetAll':
                await resetPreviewColors();
                this.refresh();
                RecordPreviewPanel.refreshTheme();
                break;
        };
    };

    private getHtml(): string {
        const rows = PREVIEW_COLOR_SETTINGS.map(setting => {
            const value = readColorSetting(setting.key, setting.defaultHex);
            return `
    <div class="row">
        <span class="label">${setting.label}</span>
        <input type="color" value="${value}" data-key="${setting.key}">
        <span class="hex">${value}</span>
        <button class="reset" data-key="${setting.key}" title="Reset to default">↺</button>
    </div>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    body {
        font-family: var(--vscode-font-family, sans-serif);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 12px 16px;
    }
    h2 {
        font-size: 13px;
        font-weight: 600;
        margin: 0 0 4px 0;
    }
    p.hint {
        font-size: 12px;
        opacity: 0.7;
        margin: 0 0 14px 0;
    }
    .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 0;
    }
    .label {
        flex: 1;
        font-size: 13px;
    }
    input[type="color"] {
        width: 32px;
        height: 22px;
        padding: 0;
        border: 1px solid var(--vscode-input-border, #555555);
        background: none;
        cursor: pointer;
    }
    .hex {
        width: 70px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        opacity: 0.8;
    }
    button.reset {
        background: none;
        border: 1px solid var(--vscode-input-border, #555555);
        color: inherit;
        cursor: pointer;
        border-radius: 3px;
        padding: 2px 6px;
        font-size: 12px;
    }
    button.reset:hover {
        background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2));
    }
    #resetAll {
        margin-top: 16px;
        background: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, inherit);
        border: 1px solid var(--vscode-input-border, #555555);
        border-radius: 3px;
        padding: 4px 10px;
        cursor: pointer;
        font-size: 12px;
    }
    #resetAll:hover {
        background: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.2));
    }
</style>
</head>
<body>
<h2>Preview Colors</h2>
<p class="hint">Changes save immediately and apply to any open preview panel.</p>
${rows}
<button id="resetAll">Reset All to Default</button>
<script>
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('input[type="color"]').forEach(input => {
        // 'input' fires continuously while dragging inside the native picker — cheap enough for
        // the live hex label here, but persisting on every one of those would flood the record
        // preview panel with full-reload refreshes while the user is still choosing. 'change'
        // (fired once, when the picker closes) is when the choice actually gets saved.
        input.addEventListener('input', () => {
            input.nextElementSibling.textContent = input.value;
        });
        input.addEventListener('change', () => {
            vscode.postMessage({ type: 'setColor', key: input.dataset.key, value: input.value });
        });
    });

    document.querySelectorAll('button.reset').forEach(btn => {
        btn.addEventListener('click', () => {
            vscode.postMessage({ type: 'resetColor', key: btn.dataset.key });
        });
    });

    document.getElementById('resetAll').addEventListener('click', () => {
        vscode.postMessage({ type: 'resetAll' });
    });
</script>
</body>
</html>`;
    };
};
