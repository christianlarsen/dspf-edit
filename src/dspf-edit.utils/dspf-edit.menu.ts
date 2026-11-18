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
