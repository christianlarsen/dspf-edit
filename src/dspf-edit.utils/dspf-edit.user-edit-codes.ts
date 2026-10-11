/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.user-edit-codes.ts
*/

import { ExtensionState } from '../dspf-edit.states/state';

/** The user-defined edit codes: EDTCDE(5) through EDTCDE(9), i.e. the QEDIT5-QEDIT9 edit descriptions. */
export const USER_EDIT_CODES = ['5', '6', '7', '8', '9'] as const;

/**
 * One user-defined edit description, as created on the IBM i with CRTEDTD — the parts of it that
 * change what an edited numeric field looks like on screen. `integerMask`/`fractionMask` are null
 * for *NONE (digits shown with no insert characters).
 */
export interface UserEditDescription {
    integerMask: string | null;
    decimalPoint: string;
    fractionMask: string | null;
    currencySymbol: string;
    negativeStatus: string;
    positiveStatus: string;
    leftConstant: string;
    rightConstant: string;
};

/** The edit descriptions known for this IBM i, keyed by edit code ('5'-'9'). */
export type UserEditDescriptions = Partial<Record<string, UserEditDescription>>;

const STORAGE_KEY = 'dspf-edit.userEditCodes';

/**
 * Reads the stored user-defined edit descriptions — in the extension's own global storage, same as
 * the decimal format they're fetched together with (see dspf-edit.decimal-format.ts). Unlike the
 * IBM i edit codes, these have no built-in definition to fall back to: they only exist as objects
 * on a given system, so a code that was never fetched simply isn't here.
 */
export function getUserEditDescriptions(): UserEditDescriptions {
    return ExtensionState.context.globalState.get<UserEditDescriptions>(STORAGE_KEY) ?? {};
};

/** The stored edit description for one user-defined edit code, if it was fetched. */
export function getUserEditDescription(code: string): UserEditDescription | undefined {
    return getUserEditDescriptions()[code];
};

/**
 * Saves the user-defined edit descriptions, replacing whatever was stored.
 * @param descriptions - The edit descriptions, keyed by edit code
 */
export async function setUserEditDescriptions(descriptions: UserEditDescriptions): Promise<void> {
    await ExtensionState.context.globalState.update(STORAGE_KEY, descriptions);
};

/**
 * Forgets every stored user-defined edit description.
 * @returns Whether there was anything stored to forget
 */
export async function resetUserEditDescriptions(): Promise<boolean> {
    if (Object.keys(getUserEditDescriptions()).length === 0) {
        return false;
    };
    await ExtensionState.context.globalState.update(STORAGE_KEY, undefined);
    return true;
};
