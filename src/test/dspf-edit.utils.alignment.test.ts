import * as assert from 'assert';
import { computeAlignedColumns, computeWindowAlignedPosition } from '../dspf-edit.utils/dspf-edit.alignment';

suite('Preview: align selected elements', () => {
    // Three 4-character constants starting at columns 4, 2 and 3: they cover columns 2 to 7.
    const constants = [{ col: 4, width: 4 }, { col: 2, width: 4 }, { col: 3, width: 4 }];

    test('left puts every start on the leftmost start column', () => {
        assert.deepStrictEqual(computeAlignedColumns(constants, 'left'), [2, 2, 2]);
    });

    test('right puts every end on the rightmost end column', () => {
        assert.deepStrictEqual(computeAlignedColumns(constants, 'right'), [4, 4, 4]);
    });

    test('center centers each element in the span the group covers', () => {
        assert.deepStrictEqual(computeAlignedColumns(constants, 'center'), [3, 3, 3]);
    });

    test('elements of different widths', () => {
        // Covers columns 10 to 29 (20 columns).
        const mixed = [{ col: 10, width: 20 }, { col: 15, width: 6 }, { col: 12, width: 5 }];
        assert.deepStrictEqual(computeAlignedColumns(mixed, 'left'), [10, 10, 10]);
        assert.deepStrictEqual(computeAlignedColumns(mixed, 'right'), [10, 24, 25]);
        // The odd blank left over for the 5-wide one goes to the right: 7 before, 8 after.
        assert.deepStrictEqual(computeAlignedColumns(mixed, 'center'), [10, 17, 17]);
    });
});

suite('Preview: align a window on the screen', () => {
    const screen = { rows: 24, cols: 80 };
    // WINDOW(5 10 8 40): 8 content rows and 40 content columns, so a 10 x 44 frame with its border.
    const frame = { rows: 10, cols: 44 };
    const current = { row: 5, col: 10 };

    test('horizontal alignments keep the row and count the border', () => {
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, frame, current, { axis: 'horizontal', alignment: 'left' }), { row: 5, col: 1 });
        // 36 free columns: 18 on each side.
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, frame, current, { axis: 'horizontal', alignment: 'center' }), { row: 5, col: 19 });
        // The frame's right edge lands on column 80.
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, frame, current, { axis: 'horizontal', alignment: 'right' }), { row: 5, col: 37 });
    });

    test('vertical alignments keep the column and count the border', () => {
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, frame, current, { axis: 'vertical', alignment: 'top' }), { row: 1, col: 10 });
        // 14 free rows: 7 above and 7 below.
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, frame, current, { axis: 'vertical', alignment: 'center' }), { row: 8, col: 10 });
        // The frame's bottom border lands on row 24.
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, frame, current, { axis: 'vertical', alignment: 'bottom' }), { row: 15, col: 10 });
    });

    test('an odd leftover goes after the frame', () => {
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, { rows: 10, cols: 45 }, current, { axis: 'horizontal', alignment: 'center' }), { row: 5, col: 18 });
    });

    test('never lands on row 1 and column 1 at the same time', () => {
        // Aligning left while on row 1 moves one column right instead.
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, frame, { row: 1, col: 10 }, { axis: 'horizontal', alignment: 'left' }), { row: 1, col: 2 });
        // Aligning to the top while on column 1 moves one row down instead.
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, frame, { row: 5, col: 1 }, { axis: 'vertical', alignment: 'top' }), { row: 2, col: 1 });
        // A frame as wide as the screen can't move right, so it moves down.
        assert.deepStrictEqual(computeWindowAlignedPosition(screen, { rows: 10, cols: 80 }, { row: 1, col: 5 }, { axis: 'horizontal', alignment: 'left' }), { row: 2, col: 1 });
    });
});
