import * as assert from 'assert';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { DdsField, DdsIndicator } from '../dspf-edit.model/dspf-edit.model';

/**
 * Builds a full 80-column DDS source line from a "trimmedLine" (everything after the 5-character
 * sequence number area), placing each field at the same 0-based offsets the parser itself reads —
 * see extractLineComponents in dspf-edit.parser.ts. Keeps these tests readable without having to
 * hand-count columns for every line.
 */
function ddsLine(opts: { marker?: string; ind?: string; name?: string; row?: number | ''; col?: number | ''; keyword?: string }): string {
    const { marker = ' ', ind = '', name = '', row = '', col = '', keyword = '' } = opts;
    const chars = new Array(80).fill(' ');
    chars[0] = 'A';
    chars[1] = marker;
    for (let i = 0; i < ind.length && i < 9; i++) chars[2 + i] = ind[i];
    for (let i = 0; i < name.length && i < 10; i++) chars[13 + i] = name[i];
    if (row !== '') {
        const rowStr = row.toString().padStart(3, ' ');
        for (let i = 0; i < 3; i++) chars[33 + i] = rowStr[i];
    };
    if (col !== '') {
        const colStr = col.toString().padStart(3, ' ');
        for (let i = 0; i < 3; i++) chars[36 + i] = colStr[i];
    };
    for (let i = 0; i < keyword.length && i < 36; i++) chars[39 + i] = keyword[i];
    return '00000' + chars.join('');
}

function indSlot(activeChar: ' ' | 'N', num: number): string {
    return activeChar + num.toString().padStart(2, '0');
}

suite('Parser: indicator AND/OR conditioning', () => {

    test('a plain, non-continued field keeps all its indicators in group 0', () => {
        const src = [
            ddsLine({ marker: ' ', ind: indSlot(' ', 50) + indSlot('N', 51), name: 'FLDC', row: 12, col: 20 }),
        ].join('\n');

        const field = parseDocument(src).find(el => el.kind === 'field') as DdsField;
        assert.ok(field, 'FLDC should be parsed');
        assert.deepStrictEqual(
            field.indicators?.map(i => [i.number, i.active, i.group]),
            [[50, true, 0], [51, false, 0]]
        );
    });

    test('AND-continuation (position 7 blank/A) + a terminal line marked O reproduces the DDS reference example', () => {
        // Mirrors the IBM DDS reference manual's own example (Figure 2): "FLDA is selected if
        // either indicator 01 is off or indicator 02 is on."
        const src = [
            ddsLine({ marker: ' ', ind: indSlot('N', 1) }),
            ddsLine({ marker: 'O', ind: indSlot(' ', 2), name: 'FLDA', row: 10, col: 20, keyword: 'DSPATR(HI)' }),
        ].join('\n');

        const field = parseDocument(src).find(el => el.kind === 'field') as DdsField;
        assert.deepStrictEqual(
            field.indicators?.map(i => [i.number, i.active, i.group]),
            [[1, false, 0], [2, true, 1]]
        );

        const attr = field.attributes?.find(a => a.value === 'DSPATR(HI)');
        assert.deepStrictEqual(
            attr?.indicators?.map(i => [i.number, i.active, i.group]),
            [[1, false, 0], [2, true, 1]]
        );
    });

    test('AND-continuation beyond 3 indicators, then an OR group, conditioning a keyword (not the field itself)', () => {
        const src = [
            ddsLine({ name: 'FLDB', row: 11, col: 20 }),                                    // unconditioned itself
            ddsLine({ marker: ' ', ind: indSlot(' ', 72) + indSlot(' ', 73) }),              // AND group 0: 72,73
            ddsLine({ marker: 'O', ind: indSlot(' ', 60) + indSlot(' ', 61) + indSlot(' ', 62) }), // OR: group 1 starts
            ddsLine({ marker: 'A', ind: indSlot(' ', 63), keyword: 'DSPATR(HI)' }),          // extends group 1, terminal
        ].join('\n');

        const field = parseDocument(src).find(el => el.kind === 'field') as DdsField;
        assert.strictEqual(field.indicators?.length ?? 0, 0, 'FLDB itself is unconditioned');

        const attr = field.attributes?.find(a => a.value === 'DSPATR(HI)');
        assert.deepStrictEqual(
            attr?.indicators?.map(i => [i.number, i.active, i.group]),
            [[72, true, 0], [73, true, 0], [60, true, 1], [61, true, 1], [62, true, 1], [63, true, 1]]
        );
    });

    test('a real-world 3-way OR condition (as coded by a user testing the preview) resolves correctly', () => {
        // "     A                                 11 35'Hello world!'"
        // "     A  51N61"
        // "     AA 53"
        // "     AO 52"
        // "     AO 81 82                               COLOR(BLU)"
        const src = [
            "     A                                 11 35'Hello world!'",
            "     A  51N61",
            "     AA 53",
            "     AO 52",
            "     AO 81 82                               COLOR(BLU)",
        ].join('\n');

        const constant = parseDocument(src).find(el => el.kind === 'constant');
        assert.ok(constant, 'the constant should be parsed');
        const colorAttr = (constant as any).attributes?.find((a: any) => a.value === 'COLOR(BLU)');

        const byGroup = new Map<number, DdsIndicator[]>();
        for (const ind of colorAttr.indicators as DdsIndicator[]) {
            const g = byGroup.get(ind.group ?? 0) ?? [];
            g.push(ind);
            byGroup.set(ind.group ?? 0, g);
        };

        assert.deepStrictEqual([...byGroup.keys()].sort(), [0, 1, 2]);
        assert.deepStrictEqual(byGroup.get(0)!.map(i => [i.number, i.active]), [[51, true], [61, false], [53, true]]);
        assert.deepStrictEqual(byGroup.get(1)!.map(i => [i.number, i.active]), [[52, true]]);
        assert.deepStrictEqual(byGroup.get(2)!.map(i => [i.number, i.active]), [[81, true], [82, true]]);
    });
});
