/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.condition-columns.ts
*/

/**
 * Checks the condition area of each source line, columns 7-16, against the layout the DDS
 * reference gives it ("Condition for display files" and "Display size condition names"):
 *   column 7       blank, A (AND, the default) or O (OR) — or * for a comment line
 *   columns 8-10   first option indicator:  8 = N (NOT) or blank, 9-10 = two digits, 01-99
 *   columns 11-13  second indicator, the same way (11 = N or blank)
 *   columns 14-16  third indicator, the same way (14 = N or blank)
 * or, instead of indicators, a display size condition name declared in DSPSIZ (*DS3, *DS4, or a
 * user-defined one) starting in column 9, with N or blank in column 8, and no A/O in column 7.
 * Table 1 of the reference also calls a condition on the primary size (or N with the secondary)
 * an error, but STRSDA itself writes *DS3/*DS4 pairs (SFLSIZ, SFLPAG, WINDOW...) with *DS3 primary,
 * and they compile — so that's not flagged; only a name DSPSIZ doesn't declare is.
 * Anything else is misread: "50" typed one column early (columns 8-9) is not indicator 50.
 * Pure text checks, no vscode dependency, so they can be tested on their own.
 */

export interface ConditionProblem {
    /** Zero-based source line. */
    lineIndex: number;
    /** Zero-based columns the problem covers, end exclusive. */
    startCol: number;
    endCol: number;
    message: string;
    /** Columns 7-16 (10 characters) rewritten the way they were most likely meant, when that's clear. */
    fix?: string;
    /** The CRTDSPF message the compiler gives for it, when confirmed against a real compile. */
    code?: string;
    /** 'error' when CRTDSPF doesn't create the file over it (severity 20 or more). */
    severity: 'error' | 'warning';
};

/** Confirmed against a CRTDSPF listing (V7R5): a character other than N (or blank) in column 8, 11
 * or 14 — "Characters in indicated field not allowed", severity 30. */
const CPD_BAD_CHARACTER = 'CPD7410';
/** Two indicator columns that aren't 01-99 — "Indicator value not 01 - 99", severity 20. */
const CPD_BAD_INDICATOR = 'CPD7606';
/** O in column 7 on the first line of a condition — "Position 7 must be blank on first line of
 * option indicators", severity 10: the compiler takes it as blank and goes on. */
const CPD_OR_ON_FIRST_LINE = 'CPD7821';
const ERROR_CODES = [CPD_BAD_CHARACTER, CPD_BAD_INDICATOR];

/** The display sizes DSPSIZ declares, by condition name, primary first. */
export interface DeclaredSizes {
    names: string[];
};

const SLOT_STARTS = [7, 10, 13]; // zero-based: columns 8, 11, 14
const INDICATOR_LAYOUT = 'each indicator takes 3 columns (8-10, 11-13, 14-16): N or blank, then two digits';

/**
 * The problems in one source's condition areas, at most one per line.
 * @param lines - The source lines
 */
export function findConditionProblems(lines: string[]): ConditionProblem[] {
    const sizes = findDeclaredSizes(lines);
    const problems: ConditionProblem[] = [];
    let previousContinues = false; // the previous line holds only indicators, ANDed/ORed into the next
    lines.forEach((line, lineIndex) => {
        if (line.length < 7 || line.charAt(6) === '*' || line.substring(6).trim() === '') {
            return; // comments and blank lines don't break a condition
        };
        const problem = checkConditionArea(line, lineIndex, sizes)
            ?? (previousContinues ? undefined : checkOrOnFirstLine(line, lineIndex));
        if (problem) problems.push(problem);
        previousContinues = isIndicatorOnlyLine(line);
    });
    return problems;
};

/** A line with indicators in columns 8-16 and nothing from column 17 on: the start (or middle) of a
 * condition that the next line goes on with. */
function isIndicatorOnlyLine(line: string): boolean {
    const padded = line.padEnd(16, ' ');
    return padded.substring(7, 16).trim() !== '' && padded.substring(16).trim() === '';
};

/** O (OR) in column 7 on the first line of a condition, where there's nothing before it to OR with. */
function checkOrOnFirstLine(line: string, lineIndex: number): ConditionProblem | undefined {
    if (line.charAt(6) !== 'O') return undefined;
    return {
        lineIndex, startCol: 6, endCol: 7,
        message: 'O (OR) in column 7 on the first line of a condition: there\'s no condition above to OR it with, so column 7 must be blank. The compiler takes it as blank.',
        fix: ' ' + line.padEnd(16, ' ').substring(7, 16),
        code: CPD_OR_ON_FIRST_LINE,
        severity: 'warning'
    };
};

/**
 * The problem in one line's columns 7-16, if any.
 * @param sizes - The display sizes DSPSIZ declares; the condition name checks against DSPSIZ are
 * skipped when not given
 */
export function checkConditionArea(line: string, lineIndex: number, sizes?: DeclaredSizes): ConditionProblem | undefined {
    // Shorter than 7 columns, a comment, or a blank line (a comment too, per the reference).
    if (line.length < 7 || line.charAt(6) === '*' || line.substring(6).trim() === '') {
        return undefined;
    };

    const padded = line.padEnd(18, ' ');
    const marker = padded.charAt(6);
    const area = padded.substring(7, 16); // columns 8-16
    const spills = area.trim() !== '' && /[0-9]/.test(padded.substring(16, 18)); // a 4th indicator in 17-18
    const fix = spills ? undefined : suggestConditionArea(marker, area);
    const problem = (startCol: number, endCol: number, message: string, code?: string): ConditionProblem =>
        ({ lineIndex, startCol, endCol, message, fix, code, severity: code && ERROR_CODES.includes(code) ? 'error' : 'warning' });

    if (spills) {
        return problem(7, 18, 'The indicators run past column 16: a line takes at most three. Put the rest on the line above, with A or blank in column 7, to AND them.');
    };

    if (marker !== ' ' && marker !== 'A' && marker !== 'O') {
        if (/[N0-9]/.test(marker) && fix) {
            return problem(6, 16, `Column 7 can only be blank, A (AND) or O (OR), not '${marker}': the indicators start too early — ${INDICATOR_LAYOUT}.`);
        };
        return problem(6, 7, `Column 7 can only be blank, A (AND) or O (OR), not '${marker}'.`);
    };

    if (area.trim() === '') {
        return marker === ' '
            ? undefined
            : problem(6, 7, `${marker === 'A' ? 'A (AND)' : 'O (OR)'} in column 7 with no indicators after it in columns 8-16.`);
    };

    // A display size condition name: *DS3, N*DS4, *LARGE...
    const starAt = area.indexOf('*');
    if (starAt >= 0 && area.substring(0, starAt).trim().replace(/^N$/, '') === '') {
        return checkDisplaySizeCondition(marker, area, starAt, sizes, problem);
    };

    const slotProblem = checkIndicatorSlots(area, problem);

    // Indicators that are well formed but not in their columns get one message for the whole area,
    // with the code of the first thing the compiler trips on.
    if (fix) {
        if (/^\d/.test(area)) {
            return problem(7, 16, `Indicator in column 8 — one column too early? Indicators go in columns 9-10; column 8 is only for N (NOT). ${capitalize(INDICATOR_LAYOUT)}.`, CPD_BAD_CHARACTER);
        };
        return problem(7, 16, `The indicators aren't in their columns: ${INDICATOR_LAYOUT}.`, slotProblem?.code);
    };

    return slotProblem;
};

/** The first indicator (columns 8-10, 11-13, 14-16) that isn't N or blank plus 01-99. */
function checkIndicatorSlots(
    area: string,
    problem: (startCol: number, endCol: number, message: string, code?: string) => ConditionProblem
): ConditionProblem | undefined {
    for (const start of SLOT_STARTS) {
        const chunk = area.substring(start - 7, start - 4);
        if (chunk.trim() === '') continue;

        const notCol = start + 1; // one-based column of the N
        const not = chunk.charAt(0);
        const digits = chunk.substring(1);

        if (not !== ' ' && not !== 'N') {
            if (/\d/.test(not)) {
                return problem(start, start + 3, `Indicator in column ${notCol} — one column too early? Indicators go in columns ${notCol + 1}-${notCol + 2}; column ${notCol} is only for N (NOT).`, CPD_BAD_CHARACTER);
            };
            return problem(start, start + 1, `Column ${notCol} can only be blank or N (NOT), not '${not}'.`, CPD_BAD_CHARACTER);
        };
        if (digits.trim() === '') {
            return problem(start, start + 1, `N (NOT) in column ${notCol} with no indicator after it in columns ${notCol + 1}-${notCol + 2}.`, CPD_BAD_INDICATOR);
        };
        if (!/^\d\d$/.test(digits)) {
            if (/^\d ?$|^ \d$/.test(digits)) {
                return problem(start + 1, start + 3, `Indicators are two digits in columns ${notCol + 1}-${notCol + 2}: write ${digits.trim().padStart(2, '0')}, not '${digits}'.`, CPD_BAD_INDICATOR);
            };
            return problem(start + 1, start + 3, `'${digits.trim()}' isn't an option indicator: indicators are two digits, 01 to 99.`, CPD_BAD_INDICATOR);
        };
        if (digits === '00') {
            return problem(start + 1, start + 3, `00 isn't an option indicator: indicators go from 01 to 99.`, CPD_BAD_INDICATOR);
        };
    };

    return undefined;
};

/** Checks a display size condition name (the area holds a '*' at `starAt`, after nothing but an optional N). */
function checkDisplaySizeCondition(
    marker: string,
    area: string,
    starAt: number,
    sizes: DeclaredSizes | undefined,
    problem: (startCol: number, endCol: number, message: string, code?: string) => ConditionProblem
): ConditionProblem | undefined {
    const name = area.substring(starAt).trim();
    const not = area.substring(0, starAt).trim() === 'N';
    const startCol = 7 + starAt;

    if (!/^\*[A-Z0-9@#$_]+$/.test(name)) {
        return problem(startCol, 16, `'${name}' isn't a display size condition name (such as *DS3 or *DS4), and indicators can't go with one.`);
    };
    if (starAt !== 1) {
        const fixed = { ...problem(startCol, startCol + name.length, `A display size condition name such as ${name} must start in column 9 (with N, if any, in column 8).`, CPD_BAD_CHARACTER) };
        if (marker === ' ' && name.length <= 8) {
            fixed.fix = ' ' + ((not ? 'N' : ' ') + name).padEnd(9, ' ');
        };
        return fixed;
    };
    if (marker !== ' ') {
        return problem(6, 7, `A display size condition name such as ${name} can't be joined with A (AND) or O (OR) to other conditions.`);
    };

    if (!sizes || sizes.names.length === 0) {
        return undefined;
    };
    if (!sizes.names.includes(name)) {
        return problem(startCol, startCol + name.length, `${name} isn't a display size declared in DSPSIZ (${sizes.names.join(', ')}).`);
    };
    return undefined;
};

/**
 * Columns 7-16 rewritten the way they were most likely meant, when everything from column 7 to 16
 * reads as up to three well-formed indicators just in the wrong columns — "50" one column early,
 * "N 51" with a space after the N, "N51" starting in column 7... Undefined when it isn't that
 * clear (a stray letter, a one-digit indicator, more than three) or when it's already right.
 */
export function suggestConditionArea(marker: string, area: string): string | undefined {
    if (area.includes('*')) return undefined;

    // An N or a digit in column 7 belongs to the first indicator, typed one column early.
    let source = area;
    let fixedMarker = marker;
    if (/[N0-9]/.test(marker)) {
        source = marker + area;
        fixedMarker = ' ';
    } else if (marker !== ' ' && marker !== 'A' && marker !== 'O') {
        return undefined;
    };

    const raw = source.trim().split(/\s+/).filter(Boolean);
    const tokens: string[] = [];
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === 'N' && i + 1 < raw.length && /^\d\d$/.test(raw[i + 1])) {
            tokens.push(`N${raw[++i]}`);
        } else {
            tokens.push(raw[i]);
        };
    };
    if (tokens.length === 0 || tokens.length > 3) return undefined;
    if (!tokens.every(token => /^N?\d\d$/.test(token) && !token.endsWith('00'))) return undefined;

    const fixed = fixedMarker + tokens.map(token => token.padStart(3, ' ')).join('').padEnd(9, ' ');
    return fixed === marker + area ? undefined : fixed;
};

/**
 * The display size condition names DSPSIZ declares, primary first: DSPSIZ(24 80 *DS3 27 132 *DS4),
 * DSPSIZ(*DS3 *DS4), or sizes without a name (24 80 is *DS3, 27 132 is *DS4). Without DSPSIZ the
 * file has a single *DS3 size. Read from the file-level lines, the ones before the first record.
 */
export function findDeclaredSizes(lines: string[]): DeclaredSizes {
    const fileLevel: string[] = [];
    for (const line of lines) {
        if (line.length > 6 && line.charAt(6) === '*') continue;
        if (line.padEnd(17, ' ').charAt(16) === 'R') break;
        fileLevel.push(line.substring(44).replace(/[+-]\s*$/, ''));
    };

    const match = fileLevel.join(' ').match(/DSPSIZ\(([^)]*)\)/i);
    if (!match) {
        return { names: ['*DS3'] };
    };

    const tokens = match[1].trim().toUpperCase().split(/\s+/);
    const names: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].startsWith('*')) {
            names.push(tokens[i]);
        } else if (/^\d+$/.test(tokens[i]) && /^\d+$/.test(tokens[i + 1] ?? '')) {
            const next = tokens[i + 2];
            if (next?.startsWith('*')) {
                names.push(next);
                i += 2;
            } else {
                const size = `${tokens[i]} ${tokens[i + 1]}`;
                names.push(size === '24 80' ? '*DS3' : size === '27 132' ? '*DS4' : `*${size}`);
                i += 1;
            };
        };
    };
    return { names };
};

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
};
