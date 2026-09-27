/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.ibmi-integration.ts
*/

import * as vscode from 'vscode';
import { DdsAttribute, DdsElement, DdsField, attributesFileLevel } from '../dspf-edit.model/dspf-edit.model';
import { DecimalFormat } from '../dspf-edit.utils/dspf-edit.decimal-format';
import { DateSeparatorFormat } from '../dspf-edit.utils/dspf-edit.date-format';

/**
 * Isolated from the rest of the extension on purpose: this is the only file that knows about the
 * Code for i extension's API, which its own docs say may change between releases.
 *
 * Deliberately NOT typed against `@halcyontech/vscode-ibmi-types`: importing its `IBMi`/`CodeForIBMi`
 * types pulls in transitive type dependencies (`@ibm/mapepire-js`, `node-ssh`, `ssh2`) that aren't
 * installed and aren't declared by that package either, which breaks `tsc` for anything that just
 * wants types. Instead, a minimal structural interface covers only what's actually called here.
 */

const CODE_FOR_IBMI_EXTENSION_ID = 'halcyontechltd.code-for-ibmi';

/** The slice of Code for i's `IBMi` connection this module actually calls. */
interface MinimalIBMiConnection {
    runSQL(statements: string | string[], options?: { bindings?: (string | number | null)[] }): Promise<Record<string, string | number | null>[]>;
    /** The connection's own settings — only its library list is read here. */
    getConfig?(): { currentLibrary?: string; libraryList?: string[] } | undefined;
};

/** The slice of Code for i's exported API this module actually calls. */
interface MinimalCodeForIBMi {
    instance: {
        getConnection(): MinimalIBMiConnection | undefined;
    };
};

/** A referenced field's real type/length/decimals, as resolved from the IBM i database. */
export interface ResolvedRefInfo {
    type: string;
    length: number;
    decimals: number;
};

/**
 * Gets the active IBM i connection from the Code for i extension, if installed and connected.
 * Returns undefined rather than throwing: callers decide how to surface "no connection" to the user.
 */
export function getIBMiConnection(): MinimalIBMiConnection | undefined {
    const codeForIBMi = vscode.extensions.getExtension<MinimalCodeForIBMi>(CODE_FOR_IBMI_EXTENSION_ID);
    return codeForIBMi?.exports?.instance?.getConnection();
};

/** The file (and optional library and record format) named by a REF() keyword. */
export interface RefKeywordTarget {
    file: string;
    library?: string;
    recordFormat?: string;
};

/**
 * Parses a REF() keyword's value, per the DDS reference: REF([library-name/]database-file-name
 * [record-format-name]). The record format is optional and only says which of the file's formats
 * to take field definitions from.
 * @param value - The keyword as coded, e.g. "REF(*LIBL/HTPFREF)" or "REF(LIB/FILE1 RECORD2)"
 */
export function parseRefKeyword(value: string): RefKeywordTarget | undefined {
    const match = value.trim().match(/^REF\(\s*(\S+?)(?:\s+(\S+?))?\s*\)$/i);
    if (!match) {
        return undefined;
    };

    const [, qualifiedFile, recordFormat] = match;
    const [library, file] = qualifiedFile.includes('/') ? qualifiedFile.split('/') : [undefined, qualifiedFile];
    return { file, library, recordFormat };
};

/**
 * Extracts the file (and optional library) named by a REF() keyword — used as a fallback when a
 * referenced field's own REFFLD() doesn't name a file (or there's no REFFLD at all), so the file
 * comes from the record- or file-level REF() instead.
 * @param attributes - The record's or file's own DDS attributes
 */
function findRefKeyword(attributes: DdsAttribute[] | undefined): RefKeywordTarget | undefined {
    const attr = attributes?.find(a => a.value.trim().toUpperCase().startsWith('REF('));
    return attr ? parseRefKeyword(attr.value) : undefined;
};

/**
 * The libraries to look for a referenced file in, in search order, for the library it was qualified
 * with in REFFLD()/REF():
 * - A real library name: just that one.
 * - None, or *LIBL (the same thing — DDS reference, REF keyword): the current library, then the
 *   user portion of the library list, both as configured for the active Code for i connection —
 *   the same order they take in the job's real *LIBL. The system portion (QSYS, QSYS2, ...) isn't
 *   included, since it doesn't hold application files.
 * - *CURLIB: just the connection's current library.
 * An empty result means no library could be determined (e.g. an empty library list), and the
 * caller searches every library instead.
 * @param connection - The active Code for i connection
 * @param library - The library qualifier as coded in the source, if any
 */
function resolveSearchLibraries(connection: MinimalIBMiConnection, library: string | undefined): string[] {
    const qualifier = library?.trim().toUpperCase();
    if (qualifier && !qualifier.startsWith('*')) {
        return [qualifier];
    };

    const config = connection.getConfig?.();
    // Code for i uses *CRTDFT (or an empty value) for "no current library".
    const isRealLibrary = (name: string | undefined): name is string => Boolean(name) && !name!.startsWith('*');
    const currentLibrary = config?.currentLibrary?.trim().toUpperCase();
    const current = isRealLibrary(currentLibrary) ? [currentLibrary] : [];

    if (qualifier === '*CURLIB') {
        return current;
    };

    const userLibraries = (config?.libraryList ?? []).map(name => name.trim().toUpperCase()).filter(isRealLibrary);
    return [...new Set([...current, ...userLibraries])];
};

/**
 * Best-effort mapping from a QSYS2.SYSCOLUMNS DATA_TYPE to a DDS single-letter field type. Covers
 * the common DDS-creatable types; refine against real IBM i data as edge cases turn up.
 */
const SQL_TYPE_TO_DDS: Record<string, string> = {
    CHARACTER: 'A',
    CHAR: 'A',
    VARCHAR: 'A',
    GRAPHIC: 'A',
    VARGRAPHIC: 'A',
    DECIMAL: 'P',
    NUMERIC: 'P',
    ZONED: 'S',
    BINARY: 'B',
    VARBINARY: 'B',
    SMALLINT: 'B',
    INTEGER: 'B',
    BIGINT: 'B',
    FLOAT: 'F',
    REAL: 'F',
    DOUBLE: 'F',
    DATE: 'L',
    TIME: 'T',
    TIMESTAMP: 'Z'
};

/**
 * Maps a QSYS2.SYSCOLUMNS row to the DDS type/length/decimals convention used elsewhere in the
 * model (e.g. `DdsField.type`/`length`/`decimals`).
 * @param dataType - QSYS2.SYSCOLUMNS.DATA_TYPE
 * @param length - QSYS2.SYSCOLUMNS.LENGTH
 * @param scale - QSYS2.SYSCOLUMNS.NUMERIC_SCALE
 */
function mapSqlTypeToDds(dataType: string, length: number, scale: number): ResolvedRefInfo {
    const type = SQL_TYPE_TO_DDS[dataType.toUpperCase()] ?? 'A';
    return { type, length, decimals: scale || 0 };
};

/** Per-document cache of resolved referenced fields: uri -> "record.field" -> resolved info. */
const resolvedRefCache: Map<string, Map<string, ResolvedRefInfo>> = new Map();

/** Builds the cache key for a field within a document. */
function fieldCacheKey(recordName: string, fieldName: string): string {
    return `${recordName}.${fieldName}`;
};

/** Gets a previously-resolved referenced field's info, if any, for the given document. */
export function getResolvedRef(documentUri: string, recordName: string, fieldName: string): ResolvedRefInfo | undefined {
    return resolvedRefCache.get(documentUri)?.get(fieldCacheKey(recordName, fieldName));
};

function setResolvedRef(documentUri: string, recordName: string, fieldName: string, info: ResolvedRefInfo): void {
    if (!resolvedRefCache.has(documentUri)) {
        resolvedRefCache.set(documentUri, new Map());
    };
    resolvedRefCache.get(documentUri)!.set(fieldCacheKey(recordName, fieldName), info);
};

/** Clears every resolved referenced field cached for a document (e.g. when it's closed). */
export function clearResolvedRef(documentUri: string): void {
    resolvedRefCache.delete(documentUri);
};

/** Recursively collects every referenced field in a parsed DDS element tree. */
function collectReferencedFields(elements: DdsElement[]): DdsField[] {
    const fields: DdsField[] = [];
    for (const element of elements) {
        if (element.kind === 'field' && element.referenced) {
            fields.push(element);
        };
        if (element.children) {
            fields.push(...collectReferencedFields(element.children));
        };
    };
    return fields;
};

/** Every referenced field in the document that hasn't been resolved yet. */
export function getPendingReferencedFields(documentUri: string, elements: DdsElement[]): DdsField[] {
    return collectReferencedFields(elements).filter(field => !getResolvedRef(documentUri, field.recordname, field.name));
};

/**
 * Resolves a referenced field's real type/length/decimals against the connected IBM i, caching
 * the result for the document. Throws a descriptive error (no connection, no file could be
 * determined, field not found) rather than returning a sentinel — callers show it to the user.
 * @param documentUri - The DDS document's URI (as a string), used as the cache key
 * @param field - The referenced field to resolve
 * @param recordAttributes - The field's own record's attributes, for a record-level REF() fallback
 */
export async function resolveReferencedField(documentUri: string, field: DdsField, recordAttributes: DdsAttribute[] | undefined): Promise<ResolvedRefInfo> {
    const connection = getIBMiConnection();
    if (!connection) {
        throw new Error('No active IBM i connection. Connect via the Code for i extension first.');
    };

    const target = field.refTarget ?? { fieldName: field.name };
    const fileRef = target.file
        ? { file: target.file, library: target.library }
        : findRefKeyword(recordAttributes) ?? findRefKeyword(attributesFileLevel);

    if (!fileRef?.file) {
        throw new Error(`Could not determine the referenced database file for field '${field.name}' (no file named in REFFLD() and no REF() keyword found).`);
    };

    // REFFLD()/REF() names are always DDS-style short "system" names (max 10 chars) — for a native
    // physical/logical file these match the SQL long name, but for an SQL-created table they can
    // differ (e.g. long name CUSTOMER_MASTER, system name CUSTMAST). Filtering on QSYS2.SYSCOLUMNS'
    // own SYSTEM_* columns instead of its long-name ones handles both.
    const searchLibraries = resolveSearchLibraries(connection, fileRef.library);

    const bindings: string[] = [fileRef.file.toUpperCase(), target.fieldName.toUpperCase()];
    let sql = `SELECT SYSTEM_TABLE_SCHEMA, DATA_TYPE, LENGTH, NUMERIC_SCALE FROM QSYS2.SYSCOLUMNS WHERE SYSTEM_TABLE_NAME = ? AND SYSTEM_COLUMN_NAME = ?`;
    if (searchLibraries.length > 0) {
        sql += ` AND SYSTEM_TABLE_SCHEMA IN (${searchLibraries.map(() => '?').join(', ')})`;
        bindings.push(...searchLibraries);
    };

    // The file may exist in more than one of the libraries searched — like the library list itself,
    // the first library (in search order) that has it wins.
    const rows = await connection.runSQL(sql, { bindings });
    const libraryOrder = (row: Record<string, string | number | null>) =>
        searchLibraries.indexOf(String(row.SYSTEM_TABLE_SCHEMA ?? '').trim().toUpperCase());
    const row = [...rows].sort((a, b) => libraryOrder(a) - libraryOrder(b))[0];
    if (!row) {
        const where = searchLibraries.length === 1 ? `${searchLibraries[0]}/${fileRef.file}`
            : searchLibraries.length > 1 ? `${fileRef.file} (library list: ${searchLibraries.join(', ')})`
            : fileRef.file;
        throw new Error(`Field '${target.fieldName}' not found in ${where}.`);
    };

    const resolved = mapSqlTypeToDds(String(row.DATA_TYPE), Number(row.LENGTH), Number(row.NUMERIC_SCALE ?? 0));
    setResolvedRef(documentUri, field.recordname, field.name, resolved);
    return resolved;
};

/**
 * Maps the IBM i QDECFMT system value's raw character to the extension's DecimalFormat: '0' (the
 * default) uses a period decimal point and comma thousands separator; '1' and 'J' both use a comma
 * decimal point and period thousands separator — per the DDS reference's own Table 6 (footnote 1),
 * 'J' only differs from '1' in its zero-suppression style for a zero-balance value, which this
 * placeholder-based preview doesn't simulate, so both map to 'European' here.
 */
const QDECFMT_TO_DECIMAL_FORMAT: Record<string, DecimalFormat> = {
    '0': 'US',
    '1': 'European',
    J: 'European'
};

/**
 * Reads the connected IBM i's QDECFMT system value and maps it to the extension's decimal format.
 * Throws (no connection, unrecognized value) rather than returning a sentinel — callers show it to
 * the user.
 */
export async function resolveDecimalFormatFromSystem(): Promise<DecimalFormat> {
    const connection = getIBMiConnection();
    if (!connection) {
        throw new Error('No active IBM i connection. Connect via the Code for i extension first.');
    };

    const rows = await connection.runSQL(
        `SELECT CURRENT_CHARACTER_VALUE FROM QSYS2.SYSTEM_VALUE_INFO WHERE SYSTEM_VALUE_NAME = 'QDECFMT'`
    );
    const raw = String(rows[0]?.CURRENT_CHARACTER_VALUE ?? '').trim().toUpperCase();
    const mapped = QDECFMT_TO_DECIMAL_FORMAT[raw];
    if (!mapped) {
        throw new Error(`Unrecognized QDECFMT value '${raw}' on the connected IBM i.`);
    };
    return mapped;
};

/**
 * Maps the IBM i QDATSEP system value's raw character to the extension's DateSeparatorFormat: '/'
 * (the default) and '-' (common in European locales, confirmed against real STRSDA). QDATSEP also
 * allows '.' and ',', which aren't mapped since neither format is exposed in the configuration panel.
 */
const QDATSEP_TO_DATE_SEPARATOR_FORMAT: Record<string, DateSeparatorFormat> = {
    '/': 'US',
    '-': 'European'
};

/**
 * Reads the connected IBM i's QDATSEP system value and maps it to the extension's date separator
 * format. Throws (no connection, unrecognized value) rather than returning a sentinel — callers show
 * it to the user.
 */
export async function resolveDateSeparatorFormatFromSystem(): Promise<DateSeparatorFormat> {
    const connection = getIBMiConnection();
    if (!connection) {
        throw new Error('No active IBM i connection. Connect via the Code for i extension first.');
    };

    const rows = await connection.runSQL(
        `SELECT CURRENT_CHARACTER_VALUE FROM QSYS2.SYSTEM_VALUE_INFO WHERE SYSTEM_VALUE_NAME = 'QDATSEP'`
    );
    const raw = String(rows[0]?.CURRENT_CHARACTER_VALUE ?? '').trim();
    const mapped = QDATSEP_TO_DATE_SEPARATOR_FORMAT[raw];
    if (!mapped) {
        throw new Error(`Unrecognized QDATSEP value '${raw}' on the connected IBM i.`);
    };
    return mapped;
};
