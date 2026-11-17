import * as assert from 'assert';
import { layoutSubfileInstances } from '../dspf-edit.utils/dspf-edit.subfile-layout';

suite('Preview: subfile page layout', () => {
    test('without SFLLIN, records stack downward', () => {
        assert.deepStrictEqual(layoutSubfileInstances(3, 2, undefined), [
            { rowOffset: 0, colOffset: 0 },
            { rowOffset: 2, colOffset: 0 },
            { rowOffset: 4, colOffset: 0 }
        ]);
    });

    test('SFLLIN fills each column top to bottom (REC1 REC3 / REC2 REC4)', () => {
        // 10-wide record at columns 2-11, 5 spaces apart, 30-column screen: 2 records per line
        const layout = layoutSubfileInstances(4, 1, { minCol: 2, maxEnd: 11, spacing: 5, maxCol: 30 });
        assert.deepStrictEqual(layout, [
            { rowOffset: 0, colOffset: 0 },
            { rowOffset: 1, colOffset: 0 },
            { rowOffset: 0, colOffset: 15 },
            { rowOffset: 1, colOffset: 15 }
        ]);
    });

    test('SFLPAG is rounded up to fill the last line', () => {
        // 20-wide record, 5 spaces apart, 80 columns: starts at 1, 26, 51 -> 3 per line.
        // SFLPAG(13) -> 5 lines -> 15 records, as in the DDS reference's own example.
        const layout = layoutSubfileInstances(13, 1, { minCol: 1, maxEnd: 20, spacing: 5, maxCol: 80 });
        assert.strictEqual(layout.length, 15);
        assert.deepStrictEqual(layout[5], { rowOffset: 0, colOffset: 25 });
        assert.deepStrictEqual(layout[14], { rowOffset: 4, colOffset: 50 });
    });

    test('a record too wide for a second column stays in one column', () => {
        const layout = layoutSubfileInstances(3, 1, { minCol: 2, maxEnd: 60, spacing: 2, maxCol: 80 });
        assert.deepStrictEqual(layout.map(l => l.colOffset), [0, 0, 0]);
    });
});
