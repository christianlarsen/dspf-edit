/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.menu-placement.ts
*/

import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { findCmdPromptConstantLine, menuPlacementProblem, MenuCreateOptions } from '../dspf-edit.utils/dspf-edit.menu';

/**
 * Checks where the text of a menu image (MNUDDS) is: on the rows the created menu keeps for itself
 * (its command line, function keys and messages, as the CRTMNU options chosen in the preview say)
 * it would be covered, so text doesn't go there (see menuPlacementProblem).
 * Pure text checks, no vscode dependency, so they can be tested on their own.
 */

export const MENU_PLACEMENT_CODE = 'menu-placement';

export interface MenuPlacementProblem {
    /** Zero-based source line of the field or constant. */
    lineIndex: number;
    message: string;
};

/** The fields and constants of a menu image that are where a menu's text can't go. */
export function findMenuPlacementProblems(lines: readonly string[], options: MenuCreateOptions): MenuPlacementProblem[] {
    const promptLine = findCmdPromptConstantLine(lines);
    const problems: MenuPlacementProblem[] = [];
    for (const element of parseDocument(lines.join('\n'))) {
        if (element.kind !== 'constant' && element.kind !== 'field') {
            continue;
        };
        const { row, column, lineIndex } = element as { row?: number; column?: number; lineIndex: number };
        if (!row || !column) {
            continue;
        };
        const message = menuPlacementProblem(row, column, lineIndex === promptLine, options);
        if (message) {
            problems.push({ lineIndex, message });
        };
    };
    return problems;
};
