/*
    Christian Larsen, 2026
    "RPG structure"
    listeners/dspf-edit.column-ruler.ts
*/

import * as vscode from 'vscode';
import { getColumnRulerEnabled, setColumnRulerEnabled } from '../dspf-edit.utils/dspf-edit.column-ruler-settings';

/**
 * The column ruler: while editing DDS source, shows the classic SEU/RDi format line above the
 * line the cursor is on, and outlines each column area of that line (hover one for its name),
 * so a value typed into the wrong columns — e.g. a usage `O` landing in the decimal positions —
 * stands out (issue #94). Modeled on vscode-rpgle's fixed-format RPG ruler, same Shift+F4 toggle.
 * Off by default; turned on from the "⚙ Configuration" panel or with Shift+F4.
 */

/** The SEU/RDi format line for a DDS A line, positions 1-80. */
const RULER_TEXT = '.....AAN01N02N03T.Name++++++RLen++TDpBLinPosFunctions+++++++++++++++++++++++++++';

/** One column area of a DDS A line (0-based, inclusive). */
interface ColumnArea {
    name: string;
    start: number;
    end: number;
};

const COLUMN_AREAS: ColumnArea[] = [
    { name: 'Condition And/Or (7)', start: 6, end: 6 },
    { name: 'Indicator 1 (8-10)', start: 7, end: 9 },
    { name: 'Indicator 2 (11-13)', start: 10, end: 12 },
    { name: 'Indicator 3 (14-16)', start: 13, end: 15 },
    { name: 'Name type (17)', start: 16, end: 16 },
    { name: 'Name (19-28)', start: 18, end: 27 },
    { name: 'Reference (29)', start: 28, end: 28 },
    { name: 'Length (30-34)', start: 29, end: 33 },
    { name: 'Data type (35)', start: 34, end: 34 },
    { name: 'Decimal positions (36-37)', start: 35, end: 36 },
    { name: 'Usage (38)', start: 37, end: 37 },
    { name: 'Line (39-41)', start: 38, end: 40 },
    { name: 'Position (42-44)', start: 41, end: 43 },
    { name: 'Functions (45-80)', start: 44, end: 79 }
];

const currentArea = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(242, 242, 109, 0.3)',
    border: '1px solid grey'
});

const otherArea = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(242, 242, 109, 0.1)',
    border: '1px solid grey'
});

// VS Code has no API to draw a line of text *between* two source lines, so, like vscode-rpgle,
// the ruler is an `after` decoration on column 0 lifted one line up with CSS smuggled through
// `textDecoration`, over an opaque fill so it hides the line above instead of mixing with it.
const rulerFill = vscode.window.createTextEditorDecorationType({});
const rulerText = vscode.window.createTextEditorDecorationType({});

/**
 * The editor's line height in pixels, worked out the way VS Code does it: `editor.lineHeight` 0
 * means a ratio of the font size (1.5 on macOS, 1.35 elsewhere), a value under 8 is a multiplier
 * of the font size, anything else is already pixels. The ruler has to be lifted by exactly this
 * much: a fixed `1.4em` (what vscode-rpgle uses) is off by a pixel or two with the default
 * settings, enough for the line above to peek out from under it.
 */
function getLineHeightPx(): number {
    const config = vscode.workspace.getConfiguration('editor');
    const fontSize = config.get<number>('fontSize', 12);
    const lineHeight = config.get<number>('lineHeight', 0);
    if (lineHeight <= 0) {
        return Math.round((process.platform === 'darwin' ? 1.5 : 1.35) * fontSize);
    };
    if (lineHeight < 8) {
        return Math.round(lineHeight * fontSize);
    };
    return Math.round(lineHeight);
};

/** CSS smuggled through `textDecoration` to lift a decoration exactly one line up, above the
 * other lines (a high z-index, so the line above never paints over it). */
function liftCss(zIndex: number): string {
    const lineHeight = getLineHeightPx();
    return `none; position: absolute; top: -${lineHeight}px; height: ${lineHeight}px; line-height: ${lineHeight}px; z-index: ${zIndex}; opacity: 1; white-space: pre; display: inline-block; pointer-events: none;`;
};

/** Bumped on every redraw so the ruler's text always differs from the last one — otherwise VS
 * Code can skip re-rendering an unchanged decoration after the editor scrolls. */
let repaintCounter = 0;

function isDdsEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
    return editor?.document.languageId === 'dds.dspf';
};

function clearRuler(editor: vscode.TextEditor): void {
    editor.setDecorations(currentArea, []);
    editor.setDecorations(otherArea, []);
    editor.setDecorations(rulerFill, []);
    editor.setDecorations(rulerText, []);
};

function updateRuler(editor: vscode.TextEditor | undefined): void {
    if (!isDdsEditor(editor)) {
        return;
    };
    if (!getColumnRulerEnabled()) {
        clearRuler(editor);
        return;
    };

    const lineNumber = editor.selection.active.line;
    const cursorCol = editor.selection.active.character;
    const lineText = editor.document.lineAt(lineNumber).text;

    // Only A lines, and not comments (`*` in position 7): nothing to line up there.
    if (lineText.length < 6 || lineText[5].toUpperCase() !== 'A' || lineText[6] === '*') {
        clearRuler(editor);
        return;
    };

    const current: vscode.DecorationOptions[] = [];
    const others: vscode.DecorationOptions[] = [];
    for (const area of COLUMN_AREAS) {
        // Areas past the end of a short line have nothing to outline; the ruler above still shows them.
        if (area.start >= lineText.length) {
            continue;
        };
        const option = {
            range: new vscode.Range(lineNumber, area.start, lineNumber, Math.min(area.end + 1, lineText.length)),
            hoverMessage: area.name
        };
        (cursorCol >= area.start && cursorCol <= area.end ? current : others).push(option);
    };
    editor.setDecorations(currentArea, current);
    editor.setDecorations(otherArea, others);

    const nonce = (repaintCounter++ % 2) === 0 ? '​' : '‌';
    const lineStart = new vscode.Range(lineNumber, 0, lineNumber, 0);
    editor.setDecorations(rulerFill, [{
        range: lineStart,
        renderOptions: {
            before: {
                contentText: ' '.repeat(240) + nonce,
                color: new vscode.ThemeColor('editor.background'),
                backgroundColor: new vscode.ThemeColor('editor.background'),
                textDecoration: liftCss(10)
            }
        }
    }]);
    editor.setDecorations(rulerText, [{
        range: lineStart,
        renderOptions: {
            after: {
                contentText: RULER_TEXT + nonce,
                // Its own look, so it can't be mistaken for a comment line (grey in many themes,
                // the same grey as line numbers): the column areas' yellow tint, and the theme's
                // info color for the text.
                color: new vscode.ThemeColor('editorInfo.foreground'),
                backgroundColor: 'rgba(242, 242, 109, 0.15)',
                textDecoration: liftCss(11)
            }
        }
    }]);
};

/**
 * Redraws (or clears) the ruler in every visible DDS editor — after the setting changes.
 */
export function refreshColumnRuler(): void {
    for (const editor of vscode.window.visibleTextEditors) {
        if (isDdsEditor(editor)) {
            if (getColumnRulerEnabled() && editor === vscode.window.activeTextEditor) {
                updateRuler(editor);
            } else {
                clearRuler(editor);
            };
        };
    };
};

/**
 * Registers the column ruler's listeners and its Shift+F4 toggle command.
 * @param onToggle - Called after the toggle command changes the setting (e.g. to update the Configuration panel)
 */
export function registerColumnRuler(context: vscode.ExtensionContext, onToggle: () => void): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('dspf-edit.toggle-column-ruler', async () => {
            await setColumnRulerEnabled(!getColumnRulerEnabled());
            refreshColumnRuler();
            onToggle();
        }),
        vscode.window.onDidChangeTextEditorSelection(event => updateRuler(event.textEditor)),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            // Leaving an editor for another one: its ruler would otherwise stay behind, stale.
            for (const visible of vscode.window.visibleTextEditors) {
                if (visible !== editor && isDdsEditor(visible)) {
                    clearRuler(visible);
                };
            };
            updateRuler(editor);
        }),
        vscode.window.onDidChangeTextEditorVisibleRanges(event => updateRuler(event.textEditor)),
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === event.document) {
                updateRuler(editor);
            };
        })
    );

    updateRuler(vscode.window.activeTextEditor);
};
