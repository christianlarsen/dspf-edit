/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.display-type-settings.ts
*/

import { ExtensionState } from '../dspf-edit.states/state';

const DISPLAY_TYPE_STORAGE_KEY = 'dspf-edit.displayType';

/**
 * The kind of display the preview draws for. The same display file looks different on each, per
 * the DDS reference:
 * - 'graphical': a display attached to a controller that supports an enhanced interface for
 *   nonprogrammable workstations (today's 5250 emulators). Selection fields (SNGCHCFLD/MLTCHCFLD)
 *   show radio buttons or check boxes, without their input field or choice numbers.
 * - 'text': a character-only display, as the screen designer shows it. Selection fields show an
 *   input field and numbered choices ("1. text").
 */
export type DisplayType = 'graphical' | 'text';

/** The choices, as the Configuration panel shows them. */
export const DISPLAY_TYPE_OPTIONS: { value: DisplayType; label: string }[] = [
    { value: 'graphical', label: 'Graphical — radio buttons and check boxes, as most emulators show them' },
    { value: 'text', label: 'Text only — numbered choices with an input field, as the screen designer shows them' }
];

/**
 * The kind of display the preview draws for. 'graphical' by default. Stored in the extension's own
 * global storage (`ExtensionContext.globalState`), like the other Configuration panel settings
 * (see dspf-edit.overlay-settings.ts).
 */
export function getDisplayType(): DisplayType {
    const value = ExtensionState.context.globalState.get<string>(DISPLAY_TYPE_STORAGE_KEY);
    return DISPLAY_TYPE_OPTIONS.some(option => option.value === value) ? value as DisplayType : 'graphical';
};

/**
 * Saves the kind of display the preview draws for.
 * @param value - The new setting
 */
export async function setDisplayType(value: DisplayType): Promise<void> {
    await ExtensionState.context.globalState.update(DISPLAY_TYPE_STORAGE_KEY, value);
};
