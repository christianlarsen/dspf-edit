/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.date-format.ts
*/

import { ExtensionState } from '../dspf-edit.states/state';

/** The date-separator convention the preview renders EDTCDE(W)/EDTCDE(Y)-edited numeric masks with. */
export type DateSeparatorFormat = 'US' | 'European';

/** One selectable date separator, for the configuration panel. */
export interface DateSeparatorOption {
    value: DateSeparatorFormat;
    label: string;
    example: string;
    separator: string;
};

/**
 * The two date-separator conventions the preview supports — matching the two characters the IBM i
 * QDATSEP system value (and the DATSEP job attribute it defaults) can hold: '/' (the system default)
 * and '-' (common in European locales, confirmed against real STRSDA). QDATSEP also allows '.' and
 * ',', but those aren't exposed here since neither has been reported or confirmed in practice.
 */
export const DATE_SEPARATOR_OPTIONS: DateSeparatorOption[] = [
    { value: 'US', label: 'US (QDATSEP /)', example: '12/31/25', separator: '/' },
    { value: 'European', label: 'European (QDATSEP -)', example: '31-12-25', separator: '-' }
];

const STORAGE_KEY = 'dspf-edit.dateSeparatorFormat';

/** The date separator format used until the user picks or fetches their own — matches QDATSEP's own default ('/'). */
export const DEFAULT_DATE_SEPARATOR_FORMAT: DateSeparatorFormat = 'US';

/**
 * Reads the configured date separator format — stored in the extension's own global storage
 * (`ExtensionContext.globalState`), same as the decimal format (see dspf-edit.decimal-format.ts).
 * Falls back to the default when unset or not a recognized value.
 */
export function getDateSeparatorFormat(): DateSeparatorFormat {
    const value = ExtensionState.context.globalState.get<DateSeparatorFormat>(STORAGE_KEY);
    return DATE_SEPARATOR_OPTIONS.some(opt => opt.value === value) ? value! : DEFAULT_DATE_SEPARATOR_FORMAT;
};

/** The separator character for the currently configured date separator format. */
export function getDateSeparator(): string {
    return DATE_SEPARATOR_OPTIONS.find(opt => opt.value === getDateSeparatorFormat())!.separator;
};

/**
 * Saves the date separator format, in the extension's own global storage.
 * @param value - The new date separator format
 */
export async function setDateSeparatorFormat(value: DateSeparatorFormat): Promise<void> {
    await ExtensionState.context.globalState.update(STORAGE_KEY, value);
};

/**
 * Resets the date separator format to its default (US).
 * @returns Whether it actually changed (false if already at default)
 */
export async function resetDateSeparatorFormat(): Promise<boolean> {
    if (getDateSeparatorFormat() === DEFAULT_DATE_SEPARATOR_FORMAT) {
        return false;
    };
    await ExtensionState.context.globalState.update(STORAGE_KEY, undefined);
    return true;
};
