/*
    Christian Larsen, 2025
    "RPG structure"
    webview/dspf-edit.preview-colors-panel.ts
*/

import * as vscode from 'vscode';
import { PREVIEW_COLOR_SETTINGS, readColorSetting, resetPreviewColors, setPreviewColor } from '../dspf-edit.utils/dspf-edit.preview-colors';
import { DECIMAL_FORMAT_OPTIONS, DecimalFormat, getDecimalFormat, resetDecimalFormat, setDecimalFormat } from '../dspf-edit.utils/dspf-edit.decimal-format';
import { DATE_SEPARATOR_OPTIONS, DateSeparatorFormat, getDateSeparatorFormat, resetDateSeparatorFormat, setDateSeparatorFormat } from '../dspf-edit.utils/dspf-edit.date-format';
import { resolveDecimalFormatFromSystem, resolveDateSeparatorFormatFromSystem } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';
import { RecordPreviewPanel } from './dspf-edit.record-preview-panel';

/**
 * The extension's "⚙ Configuration" webview panel. Lets the user pick the record preview's colors
 * visually — a native OS/browser color picker per swatch (`<input type="color">`) instead of
 * typing hex codes by hand — and choose the decimal/thousands-separator convention (US/European)
 * and the date-separator convention (US '/' / European '-') used when previewing EDTCDE()-edited
 * numeric fields, either manually or fetched from the connected IBM i's QDECFMT/QDATSEP system
 * values. Reads and writes straight to the extension's own stored settings (see
 * dspf-edit.utils/dspf-edit.preview-colors.ts, dspf-edit.utils/dspf-edit.decimal-format.ts and
 * dspf-edit.utils/dspf-edit.date-format.ts), so there's no separate state of its own: closing
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

    /**
     * Tells the already-open panel's own script which decimal format radio should be checked.
     * Deliberately not done via `refresh()` (reassigning `webview.html`): VS Code skips the reload
     * when the new html string is byte-identical to what's already loaded — which happens here
     * whenever the resulting format matches whatever was baked into the panel's last real reload
     * (e.g. picking a format by hand, with no intervening reload, then resetting back to the
     * default already shown at panel-open time) — leaving the manually-picked radio visibly
     * checked despite the setting having actually changed underneath it.
     */
    private updateDecimalFormatRadio(): void {
        this.panel.webview.postMessage({ type: 'updateDecimalFormat', value: getDecimalFormat() });
    };

    /** Same as updateDecimalFormatRadio, for the date separator's radios. */
    private updateDateSeparatorRadio(): void {
        this.panel.webview.postMessage({ type: 'updateDateSeparator', value: getDateSeparatorFormat() });
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
            case 'setDecimalFormat':
                await setDecimalFormat(message.value as DecimalFormat);
                RecordPreviewPanel.refreshTheme();
                break;
            case 'resetDecimalFormat': {
                const changed = await resetDecimalFormat();
                this.updateDecimalFormatRadio();
                RecordPreviewPanel.refreshTheme();
                vscode.window.showInformationMessage(
                    changed
                        ? 'DSPF Edit: decimal format reset to default (US).'
                        : 'DSPF Edit: decimal format was already at its default (US).'
                );
                break;
            };
            case 'fetchDecimalFormatFromIBMi':
                try {
                    const format = await resolveDecimalFormatFromSystem();
                    await setDecimalFormat(format);
                    this.updateDecimalFormatRadio();
                    RecordPreviewPanel.refreshTheme();
                    vscode.window.showInformationMessage(`DSPF Edit: decimal format set to '${format}' from the connected IBM i (QDECFMT).`);
                } catch (error) {
                    vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Could not read QDECFMT from the connected IBM i.');
                };
                break;
            case 'setDateSeparator':
                await setDateSeparatorFormat(message.value as DateSeparatorFormat);
                RecordPreviewPanel.refreshTheme();
                break;
            case 'resetDateSeparator': {
                const changed = await resetDateSeparatorFormat();
                this.updateDateSeparatorRadio();
                RecordPreviewPanel.refreshTheme();
                vscode.window.showInformationMessage(
                    changed
                        ? 'DSPF Edit: date separator reset to default (US).'
                        : 'DSPF Edit: date separator was already at its default (US).'
                );
                break;
            };
            case 'fetchDateSeparatorFromIBMi':
                try {
                    const format = await resolveDateSeparatorFormatFromSystem();
                    await setDateSeparatorFormat(format);
                    this.updateDateSeparatorRadio();
                    RecordPreviewPanel.refreshTheme();
                    vscode.window.showInformationMessage(`DSPF Edit: date separator set to '${format}' from the connected IBM i (QDATSEP).`);
                } catch (error) {
                    vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Could not read QDATSEP from the connected IBM i.');
                };
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

        const currentDecimalFormat = getDecimalFormat();
        const decimalFormatRows = DECIMAL_FORMAT_OPTIONS.map(opt => `
    <div class="row">
        <label class="radio-label">
            <input type="radio" name="decimalFormat" value="${opt.value}" ${opt.value === currentDecimalFormat ? 'checked' : ''}>
            ${opt.label} — <span class="hex">${opt.example}</span>
        </label>
    </div>`).join('');

        const currentDateSeparator = getDateSeparatorFormat();
        const dateSeparatorRows = DATE_SEPARATOR_OPTIONS.map(opt => `
    <div class="row">
        <label class="radio-label">
            <input type="radio" name="dateSeparator" value="${opt.value}" ${opt.value === currentDateSeparator ? 'checked' : ''}>
            ${opt.label} — <span class="hex">${opt.example}</span>
        </label>
    </div>`).join('');

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
    .btn-secondary {
        margin-top: 16px;
        background: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, inherit);
        border: 1px solid var(--vscode-input-border, #555555);
        border-radius: 3px;
        padding: 4px 10px;
        cursor: pointer;
        font-size: 12px;
    }
    .btn-secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.2));
    }
    .radio-label {
        flex: 1;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    hr.section {
        border: none;
        border-top: 1px solid var(--vscode-input-border, #555555);
        margin: 20px 0;
    }
</style>
</head>
<body>
<h2>Preview Colors</h2>
<p class="hint">Changes save immediately and apply to any open preview panel.</p>
${rows}
<button id="resetAll" class="btn-secondary">Reset All to Default</button>

<hr class="section">

<h2>Decimal Format</h2>
<p class="hint">Decimal point and thousands separator used when previewing EDTCDE()-edited numeric fields.</p>
${decimalFormatRows}
<div class="row" style="gap: 8px; margin-top: 8px;">
    <button id="fetchDecimalFormat" class="btn-secondary" style="margin-top: 0;">Fetch from IBM i</button>
    <button id="resetDecimalFormat" class="btn-secondary" style="margin-top: 0;">Reset to Default</button>
</div>

<hr class="section">

<h2>Date Separator</h2>
<p class="hint">Separator used when previewing EDTCDE(W)/EDTCDE(Y)-edited numeric fields.</p>
${dateSeparatorRows}
<div class="row" style="gap: 8px; margin-top: 8px;">
    <button id="fetchDateSeparator" class="btn-secondary" style="margin-top: 0;">Fetch from IBM i</button>
    <button id="resetDateSeparator" class="btn-secondary" style="margin-top: 0;">Reset to Default</button>
</div>
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

    document.querySelectorAll('input[name="decimalFormat"]').forEach(input => {
        input.addEventListener('change', () => {
            vscode.postMessage({ type: 'setDecimalFormat', value: input.value });
        });
    });

    document.getElementById('fetchDecimalFormat').addEventListener('click', () => {
        vscode.postMessage({ type: 'fetchDecimalFormatFromIBMi' });
    });

    document.getElementById('resetDecimalFormat').addEventListener('click', () => {
        vscode.postMessage({ type: 'resetDecimalFormat' });
    });

    document.querySelectorAll('input[name="dateSeparator"]').forEach(input => {
        input.addEventListener('change', () => {
            vscode.postMessage({ type: 'setDateSeparator', value: input.value });
        });
    });

    document.getElementById('fetchDateSeparator').addEventListener('click', () => {
        vscode.postMessage({ type: 'fetchDateSeparatorFromIBMi' });
    });

    document.getElementById('resetDateSeparator').addEventListener('click', () => {
        vscode.postMessage({ type: 'resetDateSeparator' });
    });

    // Reset/Fetch don't reload the panel's html (see updateDecimalFormatRadio's comment on the
    // extension side for why) — they instead send this message so the already-live radios get
    // updated directly, without depending on a reload happening at all.
    window.addEventListener('message', event => {
        if (event.data?.type === 'updateDecimalFormat') {
            document.querySelectorAll('input[name="decimalFormat"]').forEach(input => {
                input.checked = input.value === event.data.value;
            });
        };
        if (event.data?.type === 'updateDateSeparator') {
            document.querySelectorAll('input[name="dateSeparator"]').forEach(input => {
                input.checked = input.value === event.data.value;
            });
        };
    });
</script>
</body>
</html>`;
    };
};
