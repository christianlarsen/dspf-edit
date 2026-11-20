/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.utils/dspf-edit.menu.ts
*/

// A menu (CRTMNU TYPE(*DSPF)) is made of two source members in the same source file:
//   - MENU     type MNUDDS: the menu image, a display file with one record named like the menu
//   - MENUQQ   type MNUCMD: the command for each option (01-99)
// SDA treats either member as the same menu, so opening one has to find the other.
// These helpers work on URI paths (posix, as vscode.Uri.path gives them), so they can be tested
// without VS Code; the same rules apply to local files and to Code for IBM i members
// (member:/LIB/QMNUSRC/MENU.MNUDDS).

import * as path from 'path';

export const MENU_DDS_EXTENSION = '.mnudds';
export const MENU_COMMANDS_EXTENSION = '.mnucmd';
const COMMANDS_SUFFIX = 'qq';

export type MenuMemberKind = 'dds' | 'commands';

export interface MenuMemberPair {
    /** The menu name (the MNUDDS member name), as written in the path. */
    menuName: string;
    /** Path of the MNUDDS member (menu image). */
    ddsPath: string;
    /** Path of the MNUCMD member (menu commands): the menu name plus QQ. */
    commandsPath: string;
};

/**
 * Tells whether a path is a menu image (MNUDDS) or menu commands (MNUCMD) member, by its extension.
 * The extension is compared ignoring case: members opened from the IBM i come in upper case.
 */
export function getMenuMemberKind(filePath: string): MenuMemberKind | undefined {
    const extension = path.posix.extname(filePath).toLowerCase();
    if (extension === MENU_DDS_EXTENSION) {return 'dds';}
    if (extension === MENU_COMMANDS_EXTENSION) {return 'commands';}
    return undefined;
};

/**
 * Given either member of a menu, returns the paths of both members.
 * The names are built in the same case as the given path (MENU.MNUDDS <-> MENUQQ.MNUCMD,
 * menu.mnudds <-> menuqq.mnucmd). Returns undefined if the path is not a menu member, or if a
 * commands member does not end in QQ (SDA always names it that way, so there is no menu to pair).
 */
export function getMenuMemberPair(filePath: string): MenuMemberPair | undefined {
    const kind = getMenuMemberKind(filePath);
    if (!kind) {return undefined;}

    const directory = path.posix.dirname(filePath);
    const extension = path.posix.extname(filePath);
    const baseName = path.posix.basename(filePath, extension);
    const upperExtension = extension === extension.toUpperCase();
    const join = (name: string) => path.posix.join(directory, name);

    if (kind === 'dds') {
        const suffix = baseName === baseName.toUpperCase() ? COMMANDS_SUFFIX.toUpperCase() : COMMANDS_SUFFIX;
        const commandsExtension = upperExtension ? MENU_COMMANDS_EXTENSION.toUpperCase() : MENU_COMMANDS_EXTENSION;
        return {
            menuName: baseName,
            ddsPath: filePath,
            commandsPath: join(baseName + suffix + commandsExtension)
        };
    };

    if (baseName.length <= COMMANDS_SUFFIX.length || !baseName.toLowerCase().endsWith(COMMANDS_SUFFIX)) {return undefined;}
    const menuName = baseName.slice(0, -COMMANDS_SUFFIX.length);
    const ddsExtension = upperExtension ? MENU_DDS_EXTENSION.toUpperCase() : MENU_DDS_EXTENSION;
    return {
        menuName,
        ddsPath: join(menuName + ddsExtension),
        commandsPath: filePath
    };
};

// COMMAND LINE PROMPT ("Selection or command")

// SDA marks the constant shown above the menu's command line with a comment right before it:
//     A* CMDPROMPT  Do not delete this DDS spec.
//     A                                021  2'Selection or command              -
// The comment text after CMDPROMPT is translated ("No suprima esta especificación DDS."), so only
// the word is checked. SDA writes that constant's row with a leading zero (019, 021); the source
// keeps both, so they must survive any edit made by the extension.

/** True for an SDA "A* CMDPROMPT ..." comment line. */
export function isCmdPromptComment(lineText: string): boolean {
    return lineText.length > 7 && lineText[6] === '*' && /^\s*CMDPROMPT\b/i.test(lineText.substring(7));
};

/**
 * Line index of the command line prompt constant: the first line after the CMDPROMPT comment that is
 * neither blank nor another comment. Undefined if the source has no CMDPROMPT comment.
 */
export function findCmdPromptConstantLine(lines: readonly string[]): number | undefined {
    const commentLine = lines.findIndex(isCmdPromptComment);
    if (commentLine < 0) {
        return undefined;
    };
    for (let i = commentLine + 1; i < lines.length; i++) {
        const text = lines[i];
        if (text.trim() === '' || text[6] === '*') {
            continue;
        };
        return i;
    };
    return undefined;
};

/**
 * The 3-character row field (positions 39-41) for a new row, written the same way as the current one:
 * zero-padded if it already was (SDA's "021"), blank-padded otherwise (" 21").
 */
export function formatRowField(newRow: number, currentRowField: string): string {
    const zeroPadded = /^0\d\d$/.test(currentRowField);
    return String(newRow).padStart(3, zeroPadded ? '0' : ' ');
};

// MENU COMMANDS (MNUCMD member)

// Layout, as SDA writes it (80-column records):
//     MENUQQ,1                                   <- header: member name and ",1"
//     0001+CALL PGM(APPLIB/APPPGM01) PARM(... (*LGL 1)   <- option (4 digits), ' ' or '+', command
//     ))                                             <- continuation: the whole line, glued on as is
//     0002 CALL PGM(APPLIB/APPPGM68) PARM(' '  'S'  ' ')
// A '+' in column 5 means the command goes on in the next line(s); the text is cut at column 80,
// so the first part is padded back to 80 columns (an editor may have trimmed its trailing blanks).
// A command starting with '?' is prompted (F4) before it runs. Options without a command have no line.

/** Source record length of a menu commands member. */
export const MENU_COMMANDS_RECORD_LENGTH = 80;
const MENU_COMMAND_LINE = /^(\d{4})([ +])(.*)$/;

export interface MenuCommand {
    /** Menu option (1-99). */
    option: number;
    /** The full command, continuation lines joined. */
    command: string;
    /** Zero-based source lines it takes (first and last, both included). */
    firstLine: number;
    lastLine: number;
};

export interface MenuCommands {
    /** The header line ("MENUQQ,1"), if there is one. */
    header?: string;
    commands: MenuCommand[];
};

/** Reads the commands of a menu commands (MNUCMD) member. */
export function parseMenuCommands(lines: readonly string[]): MenuCommands {
    const result: MenuCommands = { commands: [] };
    let current: MenuCommand | undefined;
    let continues = false;

    lines.forEach((rawLine, lineIndex) => {
        const line = rawLine.replace(/\r$/, '');
        const match = MENU_COMMAND_LINE.exec(line);
        if (match) {
            continues = match[2] === '+';
            const text = match[3];
            current = {
                option: parseInt(match[1], 10),
                command: continues ? text.padEnd(MENU_COMMANDS_RECORD_LENGTH - 5, ' ') : text.trimEnd(),
                firstLine: lineIndex,
                lastLine: lineIndex
            };
            result.commands.push(current);
            return;
        };
        if (current && continues) {
            // Continuation line: no option number, glued on exactly where the previous one was cut
            current.command += line.trimEnd();
            current.lastLine = lineIndex;
            continues = false;
            return;
        };
        if (!current && result.header === undefined && line.trim() !== '') {
            result.header = line.trim();
        };
    });

    result.commands.forEach(command => command.command = command.command.trimEnd());
    return result;
};

// WRITING MENU COMMANDS

/** First record: 4-digit option, ' ' or '+', then up to 75 characters of command. */
const FIRST_RECORD_COMMAND_LENGTH = MENU_COMMANDS_RECORD_LENGTH - 5;
/**
 * Longest command written: the first record plus one continuation line, which is the most seen
 * in SDA's members (how SDA would continue a second time isn't known, so it isn't written).
 */
export const MENU_COMMAND_MAX_LENGTH = FIRST_RECORD_COMMAND_LENGTH + MENU_COMMANDS_RECORD_LENGTH;

/** A command as typed (line breaks from a text area become blanks), ready to be written. */
export function normalizeMenuCommand(command: string): string {
    return command.replace(/\s*[\r\n]+\s*/g, ' ').trim();
};

/** Why a command can't be written, or undefined if it can. */
export function menuCommandProblem(command: string): string | undefined {
    const normalized = normalizeMenuCommand(command);
    if (normalized.length > MENU_COMMAND_MAX_LENGTH) {
        return `The command is ${normalized.length} characters long; a menu command can have up to ${MENU_COMMAND_MAX_LENGTH}.`;
    };
    return undefined;
};

/** Source records for one option's command: "0001 CMD", or "0001+" + 75 characters and the rest on the next line. */
export function formatMenuCommandRecords(option: number, command: string): string[] {
    const text = normalizeMenuCommand(command);
    const optionText = String(option).padStart(4, '0');
    if (text.length <= FIRST_RECORD_COMMAND_LENGTH) {
        return [`${optionText} ${text}`];
    };
    return [
        `${optionText}+${text.substring(0, FIRST_RECORD_COMMAND_LENGTH)}`,
        text.substring(FIRST_RECORD_COMMAND_LENGTH)
    ];
};

/** One change to a commands member: replace `deleteCount` lines from `startLine` with `lines`. */
export interface MenuCommandsEdit {
    startLine: number;
    deleteCount: number;
    lines: string[];
};

/**
 * The change that sets (or, with an empty command, removes) one option's command in a commands
 * member, touching only that option's lines: an existing option is replaced where it is, a new one
 * goes before the first higher option (options stay in order), and an empty member gets its
 * header ("MENUQQ,1") first.
 * @param lines - The member's current lines
 * @param memberName - The member's name, for the header of an empty member
 */
export function menuCommandEdit(lines: readonly string[], memberName: string, option: number, command: string): MenuCommandsEdit {
    const parsed = parseMenuCommands(lines);
    const existing = parsed.commands.find(c => c.option === option);
    const records = normalizeMenuCommand(command) === '' ? [] : formatMenuCommandRecords(option, command);

    if (existing) {
        return { startLine: existing.firstLine, deleteCount: existing.lastLine - existing.firstLine + 1, lines: records };
    };
    if (records.length === 0) {
        return { startLine: 0, deleteCount: 0, lines: [] };
    };
    const next = parsed.commands.find(c => c.option > option);
    if (next) {
        return { startLine: next.firstLine, deleteCount: 0, lines: records };
    };
    const last = parsed.commands[parsed.commands.length - 1];
    if (last) {
        return { startLine: last.lastLine + 1, deleteCount: 0, lines: records };
    };
    // No commands yet: after the header, or with a new header if the member is empty
    const headerLine = lines.findIndex(line => line.trim() !== '');
    if (headerLine >= 0) {
        return { startLine: headerLine + 1, deleteCount: 0, lines: records };
    };
    return { startLine: 0, deleteCount: lines.length, lines: [`${memberName.toUpperCase()},1`, ...records] };
};

/**
 * The option number shown by a menu image constant: "1.", "10." or "90. Sign Off" all name an
 * option; anything else is undefined.
 */
export function menuOptionOfConstant(text: string): number | undefined {
    const match = /^\s*(\d{1,2})\.(\s|$)/.exec(text);
    if (!match) {
        return undefined;
    };
    const option = parseInt(match[1], 10);
    return option >= 1 && option <= 99 ? option : undefined;
};

// BOTTOM OF THE MENU (added by CRTMNU, not in the source)

// Under the prompt constant ("Selection or command") the created menu adds a command line, as
// chosen with CRTMNU's CMDLIN parameter, which the source doesn't keep:
//     *LONG (default): 153-byte command line, two lines
//     *SHORT: 73-byte command line, one line
//     *NONE: no command line, just a 4-byte option line
// The "===>" goes right under the prompt, with the entry area 5 columns to its right.
// (DSPKEY(*YES), the function key legend, isn't previewed: its text depends on the system's language.)

export type MenuCommandLine = '*LONG' | '*SHORT' | '*NONE';

export interface MenuCreateOptions {
    /** CRTMNU CMDLIN */
    commandLine: MenuCommandLine;
};

/** CRTMNU's own default: CMDLIN(*LONG). */
export const DEFAULT_MENU_CREATE_OPTIONS: MenuCreateOptions = { commandLine: '*LONG' };

const MENU_SCREEN_ROWS = 24;
const MENU_SCREEN_COLS = 80;
const COMMAND_LINE_LENGTH: Record<MenuCommandLine, number> = { '*LONG': 153, '*SHORT': 73, '*NONE': 4 };

export interface MenuBottomPart {
    /** "===>", or the entry area (drawn underlined). */
    kind: 'arrow' | 'entry';
    row: number;
    col: number;
    length: number;
    text: string;
};

/** What the created menu shows under its prompt constant (at promptRow/promptCol), for the given options. */
export function menuBottomLayout(promptRow: number, promptCol: number, options: MenuCreateOptions): MenuBottomPart[] {
    const parts: MenuBottomPart[] = [];
    const arrowRow = promptRow + 1;
    if (arrowRow <= MENU_SCREEN_ROWS) {
        parts.push({ kind: 'arrow', row: arrowRow, col: promptCol, length: 4, text: '===>' });

        // The entry area starts after "===> " and wraps onto the next line from column 2
        let remaining = COMMAND_LINE_LENGTH[options.commandLine];
        let row = arrowRow;
        let col = promptCol + 5;
        while (remaining > 0 && row <= MENU_SCREEN_ROWS) {
            const length = Math.min(remaining, MENU_SCREEN_COLS - col + 1);
            parts.push({ kind: 'entry', row, col, length, text: '' });
            remaining -= length;
            row++;
            col = 2;
        };
    };

    return parts;
};

// NEW MENU (SDA's default menu image)

export interface NewMenuTexts {
    /** Title, centered on row 1 (SDA's default: "MENU Menu"). */
    title: string;
    /** Line on row 3 (SDA's default: "Select one of the following:"). */
    selectText: string;
    /** The command line prompt, row 21 (SDA's default: "Selection or command"), up to 38 characters. */
    promptText: string;
};

/** Longest command line prompt SDA allows. */
export const MENU_PROMPT_MAX_LENGTH = 38;
const DDS_TEXT_START = 44;          // Zero-based column 45: where a constant's quote goes
const DDS_LAST_COLUMN = 80;

export function defaultNewMenuTexts(menuName: string): NewMenuTexts {
    return {
        title: `${menuName.toUpperCase()} Menu`,
        selectText: 'Select one of the following:',
        promptText: 'Selection or command'
    };
};

/** Column SDA centers a menu title on: floor((78 - length) / 2), as in its own menus. */
export function menuTitleColumn(title: string): number {
    return Math.max(2, Math.floor((78 - title.length) / 2));
};

/**
 * Source lines for a constant at the given position, continued with '-' at column 80 when its
 * quoted text doesn't fit (as SDA writes them). Quotes inside the text are doubled.
 * @param rowField - The 3-character row field as it must be written (e.g. "021" for the prompt)
 */
export function formatMenuConstantLines(rowField: string, column: number, text: string): string[] {
    const quoted = `'${text.replace(/'/g, "''")}'`;
    const prefix = '     A' + ' '.repeat(32) + rowField.padStart(3, ' ') + String(column).padStart(3, ' ');
    const room = DDS_LAST_COLUMN - DDS_TEXT_START - 1;      // Characters before the '-' at column 80
    if (quoted.length <= room + 1) {
        return [prefix + quoted];
    };
    const lines: string[] = [];
    let remaining = quoted;
    let linePrefix = prefix;
    while (remaining.length > room + 1) {
        lines.push(linePrefix + remaining.substring(0, room) + '-');
        remaining = remaining.substring(room);
        linePrefix = '     A' + ' '.repeat(DDS_TEXT_START - 6);
    };
    lines.push(linePrefix + remaining);
    return lines;
};

/**
 * The source of a new menu image, as SDA creates it: menu name and centered title on row 1, the
 * "select" line on row 3, options 1. to 10. on rows 5-14, and the command line prompt (its
 * "A* CMDPROMPT" comment and the constant, padded to 38 characters, on row 021).
 */
export function buildNewMenuSource(menuName: string, texts: NewMenuTexts): string[] {
    const name = menuName.toUpperCase();
    const keyword = (text: string) => '     A' + ' '.repeat(38) + text;
    const lines = [
        `     A* FREE FORM MENU: ${name}`,
        keyword('DSPSIZ(24 80 *DS3                  -'),
        '     A                                             27 132 *DS4)',
        keyword('CHGINPDFT'),
        keyword('INDARA'),
        keyword('PRINT(*LIBL/QSYSPRT)'),
        `     A          R ${name}`,
        keyword('DSPMOD(*DS3)'),
        keyword('LOCK'),
        keyword('SLNO(01)'),
        keyword('CLRL(*ALL)'),
        keyword('ALWROL'),
        keyword('CF03'),
        keyword('HELP'),
        keyword('HOME'),
        keyword('HLPRTN'),
        ...formatMenuConstantLines('1', 2, name),
        keyword('COLOR(BLU)'),
        ...formatMenuConstantLines('1', menuTitleColumn(texts.title), texts.title),
        keyword('DSPATR(HI)'),
        ...formatMenuConstantLines('3', 2, texts.selectText),
        keyword('COLOR(BLU)')
    ];
    for (let option = 1; option <= 10; option++) {
        lines.push(...formatMenuConstantLines(String(option + 4), option < 10 ? 7 : 6, `${option}.`));
    };
    lines.push('     A* CMDPROMPT  Do not delete this DDS spec.');
    lines.push(...formatMenuConstantLines('021', 2, texts.promptText.substring(0, MENU_PROMPT_MAX_LENGTH).padEnd(MENU_PROMPT_MAX_LENGTH, ' ')));
    return lines;
};
