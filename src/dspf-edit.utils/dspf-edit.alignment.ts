/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.alignment.ts
*/

// Alignment math for the Screen Preview's "Align..." actions: lining up a multi-selection of
// fields/constants, and placing a window on the screen. Pure functions only — the preview panel
// resolves the positions/sizes it works from and writes the results back to the DDS source.

/** How the preview's "Align" actions line a multi-selection up horizontally. */
export type HorizontalAlignment = 'left' | 'center' | 'right';

/**
 * Computes each element's new start column when a group of fields/constants is aligned
 * horizontally, within the span the group already covers (from its leftmost start column to its
 * rightmost end column): left puts every start on the leftmost start, right puts every end on the
 * rightmost end, and center centers each one in that span (any odd leftover blank goes to the
 * right, the same way "Center" rounds for a single element). Since every new position stays inside
 * that span, nothing can end up outside the screen or window the elements were already in.
 * @param elements - Each element's current start column and displayed width, in screen columns
 * @param alignment - Which edge (or the middle) to line them up on
 * @returns The new start column of each element, in the same order as `elements`
 */
export function computeAlignedColumns(elements: Array<{ col: number; width: number }>, alignment: HorizontalAlignment): number[] {
    const spanStart = Math.min(...elements.map(e => e.col));
    const spanEnd = Math.max(...elements.map(e => e.col + e.width - 1));
    const spanWidth = spanEnd - spanStart + 1;

    return elements.map(e => {
        if (alignment === 'left') {
            return spanStart;
        };
        if (alignment === 'right') {
            return spanEnd - e.width + 1;
        };
        return spanStart + Math.floor((spanWidth - e.width) / 2);
    });
};

/** How a window is lined up vertically on the screen (see `computeWindowAlignedPosition`). */
export type VerticalAlignment = 'top' | 'center' | 'bottom';

/** One of the preview's six window alignments: an axis, and where on it. */
export type WindowAlignment =
    | { axis: 'horizontal'; alignment: HorizontalAlignment }
    | { axis: 'vertical'; alignment: VerticalAlignment };

/** Every window alignment, in the order the preview offers them. */
export const WINDOW_ALIGNMENTS: WindowAlignment[] = [
    { axis: 'horizontal', alignment: 'left' },
    { axis: 'horizontal', alignment: 'center' },
    { axis: 'horizontal', alignment: 'right' },
    { axis: 'vertical', alignment: 'top' },
    { axis: 'vertical', alignment: 'center' },
    { axis: 'vertical', alignment: 'bottom' }
];

/**
 * Computes where a window's border corner (WINDOW()'s start line/position) goes when it's aligned
 * on the screen along one axis, keeping its position on the other axis. Works with the window's
 * whole frame — its content plus the border around it (1 row above and below, 2 columns to the
 * left and right) — so that "right" puts the border's right edge on the screen's last column,
 * "bottom" puts the bottom border on its last row, and "center" leaves the same space on both
 * sides of the frame (any odd leftover goes after it).
 * STRSDA never allows a window at row 1 and column 1 at the same time (same rule the window drag
 * and the "Change Window Size" command follow), so a result landing there is moved one place along
 * the axis being aligned — or along the other one, if the frame doesn't fit that way.
 * @param screen - The screen's rows/columns (the active display format's size)
 * @param frame - The window's whole frame: its content rows/columns plus the border
 * @param current - The window's current border corner
 * @param target - Which axis to align on, and where
 * @returns The new border corner
 */
export function computeWindowAlignedPosition(
    screen: { rows: number; cols: number },
    frame: { rows: number; cols: number },
    current: { row: number; col: number },
    target: WindowAlignment
): { row: number; col: number } {
    const alignedStart = (screenSize: number, frameSize: number, alignment: HorizontalAlignment | VerticalAlignment): number => {
        const free = Math.max(screenSize - frameSize, 0);
        if (alignment === 'left' || alignment === 'top') {
            return 1;
        };
        if (alignment === 'right' || alignment === 'bottom') {
            return free + 1;
        };
        return Math.floor(free / 2) + 1;
    };

    let { row, col } = current;
    if (target.axis === 'horizontal') {
        col = alignedStart(screen.cols, frame.cols, target.alignment);
    } else {
        row = alignedStart(screen.rows, frame.rows, target.alignment);
    };

    if (row === 1 && col === 1) {
        const fitsOneColRight = frame.cols + 1 <= screen.cols;
        const fitsOneRowDown = frame.rows + 1 <= screen.rows;
        if (target.axis === 'horizontal' ? fitsOneColRight || !fitsOneRowDown : !fitsOneRowDown && fitsOneColRight) {
            col = 2;
        } else {
            row = 2;
        };
    };

    return { row, col };
};
