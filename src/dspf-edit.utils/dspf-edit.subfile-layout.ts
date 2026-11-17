/*
    Christian Larsen, 2026
    "RPG structure"
    utils/dspf-edit.subfile-layout.ts
*/

// Layout math for subfile page repeats in the Screen Preview. Pure functions only, so it can be
// unit-tested without the preview panel.

/**
 * Where each subfile record instance goes on a page, as row/column offsets from the first (real)
 * one. A normal subfile stacks its SFLPAG records downward. A horizontal subfile (SFLLIN) fits as
 * many records side by side as the available width allows, then fills them top to bottom, column
 * by column (REC1/REC2 in the first column, REC3/REC4 in the next...). SFLPAG is rounded up to
 * fill its last line, as the DDS reference describes for SFLPAG.
 * @param pageCount - Number of record instances on a page
 * @param rowSpan - Screen rows a single instance takes
 * @param horizontal - For SFLLIN: the record's first/last used column, its spacing and the last usable column
 */
export function layoutSubfileInstances(
    pageCount: number,
    rowSpan: number,
    horizontal?: { minCol: number; maxEnd: number; spacing: number; maxCol: number }
): { rowOffset: number; colOffset: number }[] {
    if (!horizontal) {
        return Array.from({ length: pageCount }, (_, i) => ({ rowOffset: i * rowSpan, colOffset: 0 }));
    };

    const step = (horizontal.maxEnd - horizontal.minCol + 1) + horizontal.spacing;
    const perLine = Math.max(1, 1 + Math.floor((horizontal.maxCol - horizontal.maxEnd) / step));
    const lines = Math.ceil(pageCount / perLine);
    return Array.from({ length: lines * perLine }, (_, i) => ({
        rowOffset: (i % lines) * rowSpan,
        colOffset: Math.floor(i / lines) * step
    }));
};
