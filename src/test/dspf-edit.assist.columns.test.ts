/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	test/dspf-edit.assist.columns.test.ts
*/

import * as assert from 'assert';
import {
    REGIONS,
    regionAt,
    regionById,
    DDS_LINE_WIDTH
} from '../dspf-edit.assist/dspf-edit.columns';

suite('DDS assist: column definitions', () => {

    test('covers columns 1 through 80 with no gaps or overlaps', () => {
        let expected = 1;
        for (const region of REGIONS) {
            assert.strictEqual(region.start, expected, `region '${region.id}' should start at ${expected}`);
            assert.ok(region.end >= region.start, `region '${region.id}' ends before it starts`);
            expected = region.end + 1;
        };
        assert.strictEqual(expected - 1, DDS_LINE_WIDTH);
    });

    test('resolves every column to exactly one region', () => {
        for (let col = 1; col <= DDS_LINE_WIDTH; col++) {
            const region = regionAt(col);
            assert.notStrictEqual(region.id, 'beyond', `column ${col} fell outside every region`);
            assert.ok(col >= region.start && col <= region.end);
        };
        assert.strictEqual(regionAt(81).id, 'beyond');
    });

    test('finds regions by id', () => {
        assert.strictEqual(regionById('keywords')?.start, 45);
        assert.strictEqual(regionById('name')?.end, 28);
        assert.strictEqual(regionById('nope'), undefined);
    });
});
