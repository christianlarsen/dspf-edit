/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.overlay-settings.ts
*/

import { ExtensionState } from '../dspf-edit.states/state';

const SUBFILE_PAIR_STORAGE_KEY = 'dspf-edit.overlaySubfilePair';
const KEEP_ON_SWITCH_STORAGE_KEY = 'dspf-edit.overlayKeepOnSwitch';

/**
 * Whether the record preview's Overlay list starts with a subfile's other half checked (the SFL
 * detail record when previewing its SFLCTL, and vice versa). On by default, matching how the
 * preview always showed the pair before it could be unchecked. Stored in the extension's own
 * global storage (`ExtensionContext.globalState`), same as the decimal format (see
 * dspf-edit.decimal-format.ts).
 */
export function getOverlaySubfilePair(): boolean {
    return ExtensionState.context.globalState.get<boolean>(SUBFILE_PAIR_STORAGE_KEY) ?? true;
};

/**
 * Saves whether the record preview's Overlay list starts with a subfile's other half checked.
 * @param value - The new setting
 */
export async function setOverlaySubfilePair(value: boolean): Promise<void> {
    await ExtensionState.context.globalState.update(SUBFILE_PAIR_STORAGE_KEY, value);
};

/**
 * Whether the records the user checked in the record preview's Overlay list stay checked when the
 * preview switches to another record of the same DDS file. On by default. When off, each record
 * starts with only what the preview adds on its own (its subfile pair, if that setting is on, and
 * its window owner).
 */
export function getOverlayKeepOnSwitch(): boolean {
    return ExtensionState.context.globalState.get<boolean>(KEEP_ON_SWITCH_STORAGE_KEY) ?? true;
};

/**
 * Saves whether checked overlays stay checked when the preview switches to another record.
 * @param value - The new setting
 */
export async function setOverlayKeepOnSwitch(value: boolean): Promise<void> {
    await ExtensionState.context.globalState.update(KEEP_ON_SWITCH_STORAGE_KEY, value);
};
