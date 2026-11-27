/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.indicator-sets.ts
*/

import * as vscode from 'vscode';
import { ExtensionState } from '../dspf-edit.states/state';
import { getIBMiSystemName } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';

/**
 * Indicator sets: named combinations of the preview's indicators (which are on; the rest are off),
 * saved for each record of each source, so a screen can be looked at the way the program shows it
 * in each case. Nothing is written into the source: they're kept in the extension's own global
 * storage, for this user only.
 *
 * Stored as { [source key]: { [record]: { [set name]: indicators on } } }.
 */

const STORAGE_KEY = 'dspf-edit.indicatorSets';

type StoredIndicatorSets = Record<string, Record<string, Record<string, number[]>>>;

/** One saved set of a record: its name and the indicators it turns on. */
export interface IndicatorSet {
    name: string;
    on: number[];
};

/**
 * The key a source's sets are kept under, which says which source it is wherever it lives:
 * - a local file: its full path;
 * - a member of a source file on the IBM i (`member:/LIB/QDDSSRC/MBR.DSPF`) or a stream file in
 *   its IFS (`streamfile:/home/...`): the system it's on plus its path. Code for i's URIs don't
 *   name the system, so the same member on two systems would be the same source otherwise.
 *   Library, file and member names are case-insensitive on the IBM i, so a member's path is kept
 *   in upper case; IFS paths aren't, so they're kept as they are.
 * Anything else: the URI itself. Query and fragment are left out: they're how a source is opened
 * (e.g. read-only), not which source it is.
 */
export function indicatorSetSourceKey(uri: vscode.Uri): string {
    if (uri.scheme === 'file') {
        return `file:${uri.fsPath}`;
    };
    if (uri.scheme === 'member' || uri.scheme === 'streamfile') {
        const system = (getIBMiSystemName() ?? '?').toUpperCase();
        const path = uri.scheme === 'member' ? uri.path.toUpperCase() : uri.path;
        return `${uri.scheme}://${system}${path}`;
    };
    return uri.with({ query: '', fragment: '' }).toString();
};

function storedSets(): StoredIndicatorSets {
    return ExtensionState.context?.globalState.get<StoredIndicatorSets>(STORAGE_KEY) ?? {};
};

/** The sets saved for a record of a source, sorted by name. */
export function getIndicatorSets(source: vscode.Uri, recordName: string): IndicatorSet[] {
    const sets = storedSets()[indicatorSetSourceKey(source)]?.[recordName.toUpperCase()] ?? {};
    return Object.entries(sets)
        .map(([name, on]) => ({ name, on: [...on] }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Saves (or replaces) a set of a record of a source.
 * @param on - The indicators the set turns on; any other one is off
 */
export async function saveIndicatorSet(source: vscode.Uri, recordName: string, name: string, on: number[]): Promise<void> {
    const all = storedSets();
    const sourceKey = indicatorSetSourceKey(source);
    const record = recordName.toUpperCase();
    const sourceSets = { ...(all[sourceKey] ?? {}) };
    sourceSets[record] = { ...(sourceSets[record] ?? {}), [name]: [...new Set(on)].sort((a, b) => a - b) };
    await ExtensionState.context.globalState.update(STORAGE_KEY, { ...all, [sourceKey]: sourceSets });
};

/** Removes a set of a record of a source (and the record's or source's entry once it has none left). */
export async function deleteIndicatorSet(source: vscode.Uri, recordName: string, name: string): Promise<void> {
    const all = storedSets();
    const sourceKey = indicatorSetSourceKey(source);
    const record = recordName.toUpperCase();
    const recordSets = { ...(all[sourceKey]?.[record] ?? {}) };
    if (!(name in recordSets)) {
        return;
    };
    delete recordSets[name];

    const sourceSets = { ...(all[sourceKey] ?? {}) };
    if (Object.keys(recordSets).length > 0) {
        sourceSets[record] = recordSets;
    } else {
        delete sourceSets[record];
    };

    const updated = { ...all };
    if (Object.keys(sourceSets).length > 0) {
        updated[sourceKey] = sourceSets;
    } else {
        delete updated[sourceKey];
    };
    await ExtensionState.context.globalState.update(STORAGE_KEY, updated);
};
