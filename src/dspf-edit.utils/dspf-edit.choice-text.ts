/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.choice-text.ts
*/

// How a selection field's CHOICE text shows on the display. Pure functions only, so it can be
// unit-tested without the preview panel.

/**
 * A CHOICE text as it shows: `>` marks the next character as the choice's mnemonic and isn't shown;
 * `>>` is a literal `>` (DDS reference, CHOICE keyword: '>File' shows as File with F as mnemonic,
 * 'X >>= 1' as X >= 1). Only the first mnemonic counts, and a `>` with nothing after it is dropped.
 * The mnemonic is only used on a graphical display, where the choices are radio buttons or check
 * boxes; elsewhere the text shows without it.
 * @param raw - The choice text as coded, without its quotes
 * @returns The text to show, and the position of its mnemonic character in it, if any
 */
export function parseChoiceText(raw: string): { text: string; mnemonicIndex?: number } {
    let text = '';
    let mnemonicIndex: number | undefined;
    for (let i = 0; i < raw.length; i++) {
        const char = raw.charAt(i);
        if (char !== '>') {
            text += char;
            continue;
        };
        if (raw.charAt(i + 1) === '>') {
            text += '>';
            i++;
            continue;
        };
        if (mnemonicIndex === undefined && i + 1 < raw.length) {
            mnemonicIndex = text.length;
        };
    };
    return { text, mnemonicIndex };
};

/**
 * Which choices get a blank line before them in a single-column selection field: those coded with
 * *SPACEB, and, per the DDS reference, any whose number doesn't follow the previous one's (that
 * only happens in a single column, never across several).
 * @param choices - The choices in source order: their number and whether they have *SPACEB
 * @returns For each choice, how many blank lines go before it (0 or 1)
 */
export function choiceBlankLinesBefore(choices: { number: number; spaceBefore: boolean }[]): number[] {
    return choices.map((choice, index) => {
        if (index === 0) {
            return 0;
        };
        return choice.spaceBefore || choice.number !== choices[index - 1].number + 1 ? 1 : 0;
    });
};

// READING AND WRITING THE KEYWORDS

/** One CHOICE keyword, as coded. */
export interface ChoiceKeyword {
    number: number;
    /** The text as coded between the quotes (with its `>` marks), single quotes unescaped; or the
     * field name, without the `&`, for a program-to-system field. */
    text: string;
    isFieldReference: boolean;
    spaceBefore: boolean;
};

/**
 * Reads a CHOICE keyword: CHOICE(1 'DEV'), CHOICE(2 '>QA' *SPACEB), CHOICE(3 &FIELD).
 * @returns undefined when it isn't one
 */
export function parseChoiceKeyword(value: string): ChoiceKeyword | undefined {
    const match = value.trim().match(/^CHOICE\(\s*(\d+)\s+(.*)\)\s*;?$/i);
    if (!match) {return undefined;}
    const rest = match[2].trim();
    const quoted = rest.match(/^'((?:[^']|'')*)'(.*)$/);
    if (quoted) {
        return {
            number: parseInt(match[1], 10),
            text: quoted[1].replace(/''/g, "'"),
            isFieldReference: false,
            spaceBefore: /\*SPACEB\b/i.test(quoted[2])
        };
    };
    const field = rest.match(/^&([A-Z0-9@#$_]+)(.*)$/i);
    if (!field) {return undefined;}
    return {
        number: parseInt(match[1], 10),
        text: field[1].toUpperCase(),
        isFieldReference: true,
        spaceBefore: /\*SPACEB\b/i.test(field[2])
    };
};

/** Writes a CHOICE keyword, doubling single quotes in its text: CHOICE(1 'DEV'). */
export function formatChoiceKeyword(choice: ChoiceKeyword): string {
    const text = choice.isFieldReference ? `&${choice.text}` : `'${choice.text.replace(/'/g, "''")}'`;
    return `CHOICE(${choice.number} ${text}${choice.spaceBefore ? ' *SPACEB' : ''})`;
};

/** The mnemonic character of a choice text, upper-cased, if it has one. */
export function choiceMnemonic(text: string): string | undefined {
    const { text: shown, mnemonicIndex } = parseChoiceText(text);
    return mnemonicIndex === undefined ? undefined : shown.charAt(mnemonicIndex).toUpperCase();
};

/**
 * Checks a choice text against the DDS reference's rules for CHOICE: not empty, at most one
 * mnemonic (`>` before a character; `>>` is a literal `>`), the mnemonic not a blank nor `>`, and
 * not the same as another choice's.
 * @param text - The text as typed, with its `>` marks
 * @param otherMnemonics - The other choices' mnemonics, upper-cased
 * @returns A message, or undefined when it's fine
 */
export function validateChoiceText(text: string, otherMnemonics: string[]): string | undefined {
    if (text.trim() === '') {
        return 'Enter the text of the choice.';
    };
    let marks = 0;
    for (let i = 0; i < text.length; i++) {
        if (text.charAt(i) !== '>') {continue;}
        if (text.charAt(i + 1) === '>') {
            i++;
            continue;
        };
        marks++;
        if (i + 1 >= text.length) {
            return 'A > must be followed by the mnemonic character (write >> for a > in the text).';
        };
        if (text.charAt(i + 1) === ' ') {
            return 'The mnemonic (the character after >) can\'t be a blank.';
        };
    };
    if (marks > 1) {
        return 'Only one mnemonic (>) is allowed per choice. Write >> for a > in the text.';
    };
    const mnemonic = choiceMnemonic(text);
    if (mnemonic && otherMnemonics.includes(mnemonic)) {
        return `Another choice already uses ${mnemonic} as its mnemonic.`;
    };
    return undefined;
};

/** The parameters of a SNGCHCFLD/MLTCHCFLD keyword. */
export interface SelectionKeyword {
    multiple: boolean;
    /** The single-word parameters, as coded (*RSTCSR, *AUTOENT...), *SLTIND and *NOSLTIND left out. */
    options: string[];
    /** False with *NOSLTIND. */
    selectionIndicators: boolean;
    numCol?: number;
    numRow?: number;
    gutter?: number;
};

/** Reads SNGCHCFLD, MLTCHCFLD(*NOSLTIND (*NUMCOL 3) (*GUTTER 4))... */
export function parseSelectionKeyword(value: string): SelectionKeyword | undefined {
    const match = value.trim().match(/^(SNGCHCFLD|MLTCHCFLD)(?:\((.*)\))?$/i);
    if (!match) {return undefined;}
    let params = match[2] ?? '';
    const group = (name: string): number | undefined => {
        const found = params.match(new RegExp(`\\(\\s*\\*${name}\\s+(\\d+)\\s*\\)`, 'i'));
        if (!found) {return undefined;}
        params = params.replace(found[0], ' ');
        return parseInt(found[1], 10);
    };
    const numCol = group('NUMCOL');
    const numRow = group('NUMROW');
    const gutter = group('GUTTER');
    const words = params.toUpperCase().split(/\s+/).filter(Boolean);
    return {
        multiple: match[1].toUpperCase() === 'MLTCHCFLD',
        options: words.filter(word => word !== '*SLTIND' && word !== '*NOSLTIND'),
        selectionIndicators: !words.includes('*NOSLTIND'),
        numCol, numRow, gutter
    };
};

/** Writes a SNGCHCFLD/MLTCHCFLD keyword, with no parentheses when it has no parameters. */
export function formatSelectionKeyword(keyword: SelectionKeyword): string {
    const params = [
        ...keyword.options,
        ...(keyword.selectionIndicators ? [] : ['*NOSLTIND']),
        ...(keyword.numCol !== undefined ? [`(*NUMCOL ${keyword.numCol})`] : []),
        ...(keyword.numRow !== undefined ? [`(*NUMROW ${keyword.numRow})`] : []),
        ...((keyword.numCol !== undefined || keyword.numRow !== undefined) && keyword.gutter !== undefined ? [`(*GUTTER ${keyword.gutter})`] : [])
    ];
    const name = keyword.multiple ? 'MLTCHCFLD' : 'SNGCHCFLD';
    return params.length > 0 ? `${name}(${params.join(' ')})` : name;
};

/** Parameters SNGCHCFLD takes that MLTCHCFLD doesn't (DDS reference): auto-select and auto-enter. */
export const SINGLE_CHOICE_ONLY_OPTIONS = ['*NOAUTOSLT', '*AUTOSLT', '*AUTOSLTENH', '*NOAUTOENT', '*AUTOENT', '*AUTOENTNN'];

/** Reads a CHCCTL keyword: CHCCTL(1 &CTL01), possibly with a message after the field. */
export function parseChoiceControlKeyword(value: string): { number: number; field: string } | undefined {
    const match = value.trim().match(/^CHCCTL\(\s*(\d+)\s+&([A-Z0-9@#$_]+)/i);
    return match ? { number: parseInt(match[1], 10), field: match[2].toUpperCase() } : undefined;
};

/**
 * The next free control field name: CTL01, CTL02... skipping the names the record already has.
 * @param takenNames - Field names already in the record, upper-cased
 */
export function nextControlFieldName(takenNames: string[]): string {
    for (let n = 1; n < 1000; n++) {
        const name = `CTL${String(n).padStart(2, '0')}`;
        if (!takenNames.includes(name)) {return name;}
    };
    return 'CTL';
};

/** The next choice number: one more than the highest, or undefined when that would pass 99. */
export function nextChoiceNumber(numbers: number[]): number | undefined {
    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
    return next <= 99 ? next : undefined;
};

/**
 * How many columns, counting from the field's own, the choice list takes as a screen designer shows
 * it (the wider of the two displays): the field's 2 positions, a blank, then each column of
 * "number. text" labels, `gutter` apart.
 * @param labels - The choices' texts as shown, in order, with their numbers
 */
export function choiceListWidth(labels: { number: number; text: string }[], keyword: Pick<SelectionKeyword, 'numCol' | 'numRow' | 'gutter'>): number {
    if (labels.length === 0) {return 2;}
    const widest = Math.max(...labels.map(label => `${label.number}. ${label.text}`.length));
    const columns = keyword.numCol !== undefined
        ? Math.min(keyword.numCol, labels.length)
        : keyword.numRow !== undefined ? Math.ceil(labels.length / keyword.numRow) : 1;
    return 3 + columns * widest + (columns - 1) * (keyword.gutter ?? 3);
};
