/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.new-window-settings.ts
*/

import { ExtensionState } from '../dspf-edit.states/state';

const NEW_WINDOW_MODE_STORAGE_KEY = 'dspf-edit.newWindowMode';

/**
 * How New Record creates a window record (or a subfile in a window):
 * - 'ask': asks for its size, position and title, as always
 * - 'fixed': asks nothing about the window, creating it as NEW_WINDOW_DEFAULT_SIZE at row 2, column 2
 * - 'cursor': the same, relative to the cursor, WINDOW(*DFT rows cols)
 * The window is then sized and moved with the mouse in the preview.
 */
export type NewWindowMode = 'ask' | 'fixed' | 'cursor';

/** The size a window is created with when New Record doesn't ask for it. */
export const NEW_WINDOW_DEFAULT_SIZE = { numRows: 10, numCols: 40 };

/** Where a window is created when New Record doesn't ask for it and it's 'fixed'. */
export const NEW_WINDOW_DEFAULT_START = { row: 2, col: 2 };

/** The choices, as the Configuration panel shows them. */
export const NEW_WINDOW_MODE_OPTIONS: { value: NewWindowMode; label: string }[] = [
    { value: 'ask', label: 'Ask for size and position' },
    { value: 'fixed', label: `Create at a fixed position — WINDOW(${NEW_WINDOW_DEFAULT_START.row} ${NEW_WINDOW_DEFAULT_START.col} ${NEW_WINDOW_DEFAULT_SIZE.numRows} ${NEW_WINDOW_DEFAULT_SIZE.numCols})` },
    { value: 'cursor', label: `Create relative to the cursor — WINDOW(*DFT ${NEW_WINDOW_DEFAULT_SIZE.numRows} ${NEW_WINDOW_DEFAULT_SIZE.numCols})` }
];

/**
 * How New Record creates windows. 'ask' by default, as before the setting existed. Stored in the
 * extension's own global storage (`ExtensionContext.globalState`), like the other Configuration
 * panel settings (see dspf-edit.overlay-settings.ts).
 */
export function getNewWindowMode(): NewWindowMode {
    const value = ExtensionState.context.globalState.get<string>(NEW_WINDOW_MODE_STORAGE_KEY);
    return NEW_WINDOW_MODE_OPTIONS.some(option => option.value === value) ? value as NewWindowMode : 'ask';
};

/**
 * Saves how New Record creates windows.
 * @param value - The new setting
 */
export async function setNewWindowMode(value: NewWindowMode): Promise<void> {
    await ExtensionState.context.globalState.update(NEW_WINDOW_MODE_STORAGE_KEY, value);
};
