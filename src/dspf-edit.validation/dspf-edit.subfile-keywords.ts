/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.subfile-keywords.ts
*/

import { findDeclaredSizes } from './dspf-edit.condition-columns';

/**
 * Checks the keywords of each subfile control record against each other.
 * For now: SFLDROP and SFLFOLD when SFLPAG equals SFLSIZ. The system doesn't page such a subfile
 * itself, so there's nothing to truncate or fold. The DDS reference says both are ignored then
 * (SFLFOLD with a severity 20 error), and CRTDSPF rejects SFLDROP with CPF7885 ("keyword not
 * allowed when SFLPAG equals SFLSIZ"). With several display sizes (DSPSIZ), each size is checked
 * with its own SFLPAG/SFLSIZ, and it's only reported when they're equal on every size the keyword
 * applies to: equal on only some compiles cleanly, without even a warning (confirmed with CRTDSPF,
 * *DS3 10/11 and *DS4 10/10) — the keyword is just ignored on those sizes.
 * Pure text checks, no vscode dependency, so they can be tested on their own.
 */

export const CPF_PAGE_EQUALS_SIZE = 'CPF7885';

/** A text replacement on one source line (zero-based columns, end exclusive). */
export interface LineEdit {
    lineIndex: number;
    startCol: number;
    endCol: number;
    newText: string;
};

export interface SubfileKeywordProblem {
    /** Zero-based source line of the SFLDROP/SFLFOLD keyword. */
    lineIndex: number;
    /** Zero-based columns of the keyword, end exclusive. */
    startCol: number;
    endCol: number;
    keyword: 'SFLDROP' | 'SFLFOLD';
    message: string;
    code: string;
    severity: 'error' | 'warning';
    /** Raises SFLSIZ to SFLPAG + 1 on every display size where they're equal. */
    sizeFix: LineEdit[];
    /** Removes the keyword: its whole line when nothing else is coded on it. */
    removeFix: { deleteLine: boolean; edit: LineEdit };
};

/** One numeric keyword (SFLPAG, SFLSIZ) found on a record. */
interface NumericKeyword {
    value: number;
    displayFormat?: string;
    lineIndex: number;
    /** Columns of the number itself. */
    startCol: number;
    endCol: number;
    digits: number;
};

interface ToggleKeyword {
    keyword: 'SFLDROP' | 'SFLFOLD';
    displayFormat?: string;
    lineIndex: number;
    startCol: number;
    endCol: number;
};

interface RecordKeywords {
    pag: NumericKeyword[];
    siz: NumericKeyword[];
    toggles: ToggleKeyword[];
};

const KEYWORD_COLUMN = 44; // zero-based: keywords start in column 45

/**
 * The SFLDROP/SFLFOLD keywords coded where SFLPAG equals SFLSIZ.
 * @param lines - The source lines
 */
export function findSubfileKeywordProblems(lines: string[]): SubfileKeywordProblem[] {
    const sizes = findDeclaredSizes(lines).names;
    const problems: SubfileKeywordProblem[] = [];

    for (const record of collectRecords(lines)) {
        for (const toggle of record.toggles) {
            const applies = toggle.displayFormat ? [toggle.displayFormat] : sizes;
            const equalOn = applies
                .map(size => ({ size, pag: pickForSize(record.pag, size), siz: pickForSize(record.siz, size) }))
                .filter(({ pag, siz }) => pag && siz && pag.value === siz.value);
            if (equalOn.length === 0 || equalOn.length < applies.length) continue;

            const values = [...new Set(equalOn.map(e => e.pag!.value))].join(', ');
            const message = `${toggle.keyword} isn't allowed when SFLPAG equals SFLSIZ (${values}): the subfile isn't paged by the system, so there's nothing to ${toggle.keyword === 'SFLDROP' ? 'truncate' : 'fold'}. Make SFLSIZ bigger than SFLPAG, or remove ${toggle.keyword}.`;

            const seen = new Set<NumericKeyword>();
            const sizeFix: LineEdit[] = [];
            for (const { pag, siz } of equalOn) {
                if (seen.has(siz!)) continue;
                seen.add(siz!);
                sizeFix.push({
                    lineIndex: siz!.lineIndex, startCol: siz!.startCol, endCol: siz!.endCol,
                    newText: String(pag!.value + 1).padStart(siz!.digits, '0')
                });
            };

            problems.push({
                lineIndex: toggle.lineIndex, startCol: toggle.startCol, endCol: toggle.endCol,
                keyword: toggle.keyword,
                message,
                code: CPF_PAGE_EQUALS_SIZE,
                severity: 'error',
                sizeFix,
                removeFix: buildRemoveFix(lines[toggle.lineIndex], toggle)
            });
        };
    };

    return problems;
};

/** The keywords of each record that has any of interest, read from columns 45 on. */
function collectRecords(lines: string[]): RecordKeywords[] {
    const records: RecordKeywords[] = [];
    let current: RecordKeywords | undefined;

    lines.forEach((line, lineIndex) => {
        if (line.length > 6 && line.charAt(6) === '*') return;
        const padded = line.padEnd(KEYWORD_COLUMN, ' ');
        if (padded.charAt(16) === 'R') {
            current = { pag: [], siz: [], toggles: [] };
            records.push(current);
        };
        if (!current || line.length <= KEYWORD_COLUMN) return;

        const displayFormat = padded.substring(7, 16).trim().match(/^(\*[A-Z0-9@#$_]+)$/i)?.[1].toUpperCase();
        const keywords = line.substring(KEYWORD_COLUMN);

        for (const match of keywords.matchAll(/\b(SFLPAG|SFLSIZ)\(\s*(\d+)\s*\)/gi)) {
            const numberAt = KEYWORD_COLUMN + match.index! + match[0].indexOf(match[2]);
            const entry: NumericKeyword = {
                value: parseInt(match[2], 10), displayFormat, lineIndex,
                startCol: numberAt, endCol: numberAt + match[2].length, digits: match[2].length
            };
            (match[1].toUpperCase() === 'SFLPAG' ? current.pag : current.siz).push(entry);
        };
        for (const match of keywords.matchAll(/\b(SFLDROP|SFLFOLD)\([^)]*\)/gi)) {
            current.toggles.push({
                keyword: match[1].toUpperCase() as 'SFLDROP' | 'SFLFOLD',
                displayFormat, lineIndex,
                startCol: KEYWORD_COLUMN + match.index!,
                endCol: KEYWORD_COLUMN + match.index! + match[0].length
            });
        };
    });

    return records.filter(record => record.toggles.length > 0);
};

/** The keyword that applies on a display size: the one for that size, else an unconditioned one. */
function pickForSize(candidates: NumericKeyword[], size: string): NumericKeyword | undefined {
    return candidates.find(c => c.displayFormat === size) ?? candidates.find(c => !c.displayFormat);
};

/**
 * Removing the keyword: the whole line when it's the only thing coded on it (its indicators go with
 * it), otherwise just the keyword and the blanks after it.
 */
function buildRemoveFix(line: string, toggle: ToggleKeyword): { deleteLine: boolean; edit: LineEdit } {
    const isRecordLine = line.padEnd(17, ' ').charAt(16) === 'R';
    const alone = !isRecordLine && line.substring(KEYWORD_COLUMN).trim() === line.substring(toggle.startCol, toggle.endCol);
    if (alone) {
        return { deleteLine: true, edit: { lineIndex: toggle.lineIndex, startCol: 0, endCol: line.length, newText: '' } };
    };
    let endCol = toggle.endCol;
    while (line.charAt(endCol) === ' ') endCol++;
    return { deleteLine: false, edit: { lineIndex: toggle.lineIndex, startCol: toggle.startCol, endCol, newText: '' } };
};
