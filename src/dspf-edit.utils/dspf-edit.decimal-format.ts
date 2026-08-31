/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.decimal-format.ts
*/

import { ExtensionState } from '../dspf-edit.states/state';

/** The decimal/thousands-separator convention the preview renders EDTCDE()-edited numeric masks with. */
export type DecimalFormat = 'US' | 'European';

/** Separator characters for a decimal format, as used when building an EDTCDE mask. */
export interface DecimalFormatSeparators {
    thousands: string;
    decimal: string;
};

/** One selectable decimal format, for the configuration panel. */
export interface DecimalFormatOption {
    value: DecimalFormat;
    label: string;
    example: string;
    separators: DecimalFormatSeparators;
};

/**
 * The two decimal formats the preview supports — matching the two distinct character conventions
 * the IBM i QDECFMT system value can produce (see resolveDecimalFormatFromSystem in
 * dspf-edit.ibmi-integration.ts): '0' (US) and '1'/'J' (European). QDECFMT '1' and 'J' use the same
 * decimal-point/thousands-separator characters — per the DDS reference's own Table 6, footnote 1,
 * 'J' only differs from '1' in its zero-suppression style for a zero-balance value (kept as a
 * literal '0' instead of blanked out), which this placeholder-based preview doesn't simulate since
 * there's no real value being formatted — so both map to 'European' here.
 */
export const DECIMAL_FORMAT_OPTIONS: DecimalFormatOption[] = [
    { value: 'US', label: 'US (QDECFMT 0)', example: '1,000.00', separators: { thousands: ',', decimal: '.' } },
    { value: 'European', label: 'European (QDECFMT 1 or J)', example: '1.000,00', separators: { thousands: '.', decimal: ',' } }
];

const STORAGE_KEY = 'dspf-edit.decimalFormat';

/** The decimal format used until the user picks or fetches their own — matches QDECFMT's own default ('0'). */
export const DEFAULT_DECIMAL_FORMAT: DecimalFormat = 'US';

/**
 * Reads the configured decimal format — stored in the extension's own global storage
 * (`ExtensionContext.globalState`), not a VS Code setting, same as the preview colors (see
 * dspf-edit.preview-colors.ts). Falls back to the default when unset or not a recognized value.
 */
export function getDecimalFormat(): DecimalFormat {
    const value = ExtensionState.context.globalState.get<DecimalFormat>(STORAGE_KEY);
    return DECIMAL_FORMAT_OPTIONS.some(opt => opt.value === value) ? value! : DEFAULT_DECIMAL_FORMAT;
};

/** The thousands/decimal separator characters for the currently configured decimal format. */
export function getDecimalSeparators(): DecimalFormatSeparators {
    return DECIMAL_FORMAT_OPTIONS.find(opt => opt.value === getDecimalFormat())!.separators;
};

/**
 * Saves the decimal format, in the extension's own global storage.
 * @param value - The new decimal format
 */
export async function setDecimalFormat(value: DecimalFormat): Promise<void> {
    await ExtensionState.context.globalState.update(STORAGE_KEY, value);
};

/**
 * Resets the decimal format to its default (US).
 * @returns Whether it actually changed (false if already at default)
 */
export async function resetDecimalFormat(): Promise<boolean> {
    if (getDecimalFormat() === DEFAULT_DECIMAL_FORMAT) {
        return false;
    };
    await ExtensionState.context.globalState.update(STORAGE_KEY, undefined);
    return true;
};
