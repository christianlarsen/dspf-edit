/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.ibmi-integration.ts
*/

import * as vscode from 'vscode';
import { DdsAttribute, DdsElement, DdsField, RefOverrides, attributesFileLevel, fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
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
 * comes from the file-level REF() instead. REF() is a file-level keyword only, per the DDS reference.
 * @param attributes - The file's own DDS attributes
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

/** Data types (position 35) that make a field character: decimal positions aren't copied then. */
const CHARACTER_TYPES = new Set(['A', 'X', 'M', 'W']);

/**
 * Applies a referenced field's own overrides to the referenced field's definition, per the DDS
 * reference: a new length/decimals value replaces it, +n/-n changes it, a data type in position 35
 * replaces it — and overriding it to a character type drops the decimal positions.
 * @param base - The referenced field's definition, as resolved
 * @param overrides - The referencing field's overrides, if any
 */
export function applyRefOverrides(base: ResolvedRefInfo, overrides: RefOverrides | undefined): ResolvedRefInfo {
    if (!overrides) {
        return base;
    };

    const type = overrides.type ?? base.type;
    const length = overrides.length ?? base.length + (overrides.lengthDelta ?? 0);
    const decimals = overrides.decimals
        ?? (overrides.decimalsDelta !== undefined ? base.decimals + overrides.decimalsDelta
            : overrides.type && CHARACTER_TYPES.has(overrides.type.toUpperCase()) ? 0 : base.decimals);
    return { type, length, decimals };
};

/**
 * Gets a previously-resolved referenced field's info, if any, for the given document — with the
 * field's own overrides applied when given. The cache holds the referenced field's definition as
 * resolved, so editing an override in the source never needs resolving again.
 * @param overrides - The referencing field's overrides (length/decimals/type), if any
 */
export function getResolvedRef(documentUri: string, recordName: string, fieldName: string, overrides?: RefOverrides): ResolvedRefInfo | undefined {
    const base = resolvedRefCache.get(documentUri)?.get(fieldCacheKey(recordName, fieldName));
    return base ? applyRefOverrides(base, overrides) : undefined;
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
 */
export async function resolveReferencedField(documentUri: string, field: DdsField): Promise<ResolvedRefInfo> {
    const target = field.refTarget ?? { fieldName: field.name };
    const fileRef = target.file
        ? { file: target.file, library: target.library }
        : findRefKeyword(attributesFileLevel);

    // REFFLD(field *SRC) — or no file in REFFLD() and no REF() either, where *SRC is DDS's own
    // default — references a field earlier in this same source: no IBM i connection needed.
    if (!fileRef || fileRef.file.toUpperCase() === '*SRC') {
        const resolved = resolveFromSource(documentUri, field, target.fieldName, target.recordFormat);
        setResolvedRef(documentUri, field.recordname, field.name, resolved);
        return resolved;
    };

    const connection = getIBMiConnection();
    if (!connection) {
        throw new Error('No active IBM i connection. Connect via the Code for i extension first.');
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
 * Resolves a referenced field against a field defined earlier in the same DDS source (*SRC), per
 * the DDS reference: the referenced field must precede the referencing one. Looks in the given
 * record format when REFFLD() names one; otherwise in the field's own record first, then in the
 * records before it — the nearest preceding definition wins.
 * @param documentUri - The DDS document's URI (as a string), for a referenced field's own resolution
 * @param field - The referencing field
 * @param fieldName - The referenced field's name
 * @param recordFormat - The record format REFFLD() qualified the name with, if any
 */
function resolveFromSource(documentUri: string, field: DdsField, fieldName: string, recordFormat: string | undefined): ResolvedRefInfo {
    const name = fieldName.toUpperCase();
    const candidates = fieldsPerRecords
        .filter(record => recordFormat ? record.record.toUpperCase() === recordFormat.toUpperCase() : true)
        .flatMap(record => record.fields
            .filter(f => f.name.toUpperCase() === name && f.lineIndex < field.lineIndex)
            .map(f => ({ record: record.record, info: f })))
        .sort((a, b) => {
            const sameRecord = Number(b.record === field.recordname) - Number(a.record === field.recordname);
            return sameRecord !== 0 ? sameRecord : b.info.lineIndex - a.info.lineIndex;
        });

    const source = candidates[0];
    if (!source) {
        const where = recordFormat ? `record ${recordFormat}` : 'this source';
        throw new Error(`Field '${fieldName}' referenced by '${field.name}' not found before it in ${where} (no file in REFFLD() and no REF() keyword, so it's looked up in this same source).`);
    };

    if (source.info.referenced) {
        // Itself a referenced field: its own definition is whatever it was resolved to.
        const resolved = getResolvedRef(documentUri, source.record, source.info.name, source.info.refOverrides);
        if (!resolved) {
            throw new Error(`Field '${fieldName}' referenced by '${field.name}' is itself a referenced field not resolved yet. Resolve it first.`);
        };
        return resolved;
    };

    // A blank data type is zoned decimal when decimal positions are given, character otherwise.
    const ownType = (source.info.type ?? '').trim();
    const type = ownType || (source.info.decimals !== undefined ? 'S' : 'A');
    return { type, length: source.info.length, decimals: source.info.decimals ?? 0 };
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
