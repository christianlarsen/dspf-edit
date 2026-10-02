/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.column-ruler-settings.ts
*/

import { ExtensionState } from '../dspf-edit.states/state';

const STORAGE_KEY = 'dspf-edit.columnRuler';

/**
 * Whether the column ruler shows above the line being edited in DDS source (see
 * dspf-edit.listeners/dspf-edit.column-ruler.ts). Off by default. Stored in the extension's own
 * global storage (`ExtensionContext.globalState`), same as the decimal format (see
 * dspf-edit.decimal-format.ts).
 */
export function getColumnRulerEnabled(): boolean {
    return ExtensionState.context.globalState.get<boolean>(STORAGE_KEY) ?? false;
};

/**
 * Saves whether the column ruler shows.
 * @param value - The new setting
 */
export async function setColumnRulerEnabled(value: boolean): Promise<void> {
    await ExtensionState.context.globalState.update(STORAGE_KEY, value);
};
