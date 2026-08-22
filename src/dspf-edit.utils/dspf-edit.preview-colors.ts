/*
    Christian Larsen, 2025
    "RPG structure"
    utils/dspf-edit.preview-colors.ts
*/

import { ExtensionState } from '../dspf-edit.states/state';

/** One of the preview's configurable colors — background, one of the 7 DDS COLOR() codes, or the referenced-field marker. */
export interface PreviewColorSetting {
    /** Storage key, under the `dspf-edit` prefix (e.g. "preview.colorBlue"). */
    key: string;
    /** The DDS COLOR() code this maps to — undefined for background and the referenced-field marker, neither of which is a real DDS color. */
    ddsCode?: string;
    /** Human-readable label for the configuration panel. */
    label: string;
    /** Default hex value, used until the user picks their own in the configuration panel. */
    defaultHex: string;
}

/** The preview's 9 configurable colors, in display order. */
export const PREVIEW_COLOR_SETTINGS: PreviewColorSetting[] = [
    { key: 'preview.background', label: 'Background', defaultHex: '#000000' },
    { key: 'preview.colorBlue', ddsCode: 'BLU', label: 'Blue — COLOR(BLU)', defaultHex: '#6a8ef0' },
    { key: 'preview.colorRed', ddsCode: 'RED', label: 'Red — COLOR(RED)', defaultHex: '#ff4136' },
    { key: 'preview.colorWhite', ddsCode: 'WHT', label: 'White — COLOR(WHT)', defaultHex: '#ffffff' },
    { key: 'preview.colorGreen', ddsCode: 'GRN', label: 'Green — COLOR(GRN)', defaultHex: '#00ff00' },
    { key: 'preview.colorTurquoise', ddsCode: 'TRQ', label: 'Turquoise — COLOR(TRQ)', defaultHex: '#00e5ff' },
    { key: 'preview.colorYellow', ddsCode: 'YLW', label: 'Yellow — COLOR(YLW)', defaultHex: '#ffe600' },
    { key: 'preview.colorPink', ddsCode: 'PNK', label: 'Pink — COLOR(PNK)', defaultHex: '#ff66ff' },
    { key: 'preview.colorReferenced', label: 'Referenced field marker', defaultHex: '#ff8800' }
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const STORAGE_PREFIX = 'dspf-edit.';

/**
 * Reads a preview color, previously saved via `setPreviewColor` — stored in the extension's own
 * global storage (`ExtensionContext.globalState`), not a VS Code setting, so it doesn't show up
 * in the Settings UI; the "⚙ Configuration" panel is the only place to change it. Falls back to
 * `fallback` when unset or not a valid `#rrggbb` hex string — re-validated here since this value
 * gets interpolated as raw text into the preview webview's HTML/JS.
 * @param key - Storage key (e.g. "preview.colorBlue")
 * @param fallback - Hex color to use when unset or invalid
 */
export function readColorSetting(key: string, fallback: string): string {
    const value = ExtensionState.context.globalState.get<string>(STORAGE_PREFIX + key);
    return value && HEX_COLOR_RE.test(value) ? value : fallback;
};

/** Background color of the preview screen — user-configurable, any color. */
export function getBackgroundColor(): string {
    return readColorSetting('preview.background', '#000000');
};

/** Marker color for a referenced field (REFFLD) — not a real DDS color, just an editor cue. */
export function getReferencedFieldColor(): string {
    return readColorSetting('preview.colorReferenced', '#ff8800');
};

/** Maps DDS COLOR() keyword codes to their on-screen color, per the user's configured palette. */
export function getDdsColorMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const setting of PREVIEW_COLOR_SETTINGS) {
        if (setting.ddsCode) {
            map[setting.ddsCode] = readColorSetting(setting.key, setting.defaultHex);
        };
    };
    return map;
};

/**
 * Saves a single preview color, in the extension's own global storage.
 * @param key - Storage key (e.g. "preview.colorBlue")
 * @param value - New hex value (the caller is responsible for validating it)
 */
export async function setPreviewColor(key: string, value: string): Promise<void> {
    await ExtensionState.context.globalState.update(STORAGE_PREFIX + key, value);
};

/**
 * Clears saved preview color(s) — every configured color, or just `onlyKey` — restoring the
 * affected color(s) to their default.
 * @param onlyKey - When given, resets just this one color instead of all of them
 * @returns Whether anything was actually reset (false if already at default)
 */
export async function resetPreviewColors(onlyKey?: string): Promise<boolean> {
    const keys = onlyKey ? [onlyKey] : PREVIEW_COLOR_SETTINGS.map(setting => setting.key);

    let resetAny = false;
    for (const key of keys) {
        if (ExtensionState.context.globalState.get(STORAGE_PREFIX + key) !== undefined) {
            resetAny = true;
            await ExtensionState.context.globalState.update(STORAGE_PREFIX + key, undefined);
        };
    };
    return resetAny;
};
