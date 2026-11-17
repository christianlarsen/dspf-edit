import * as assert from 'assert';
import { parseChoiceText, choiceBlankLinesBefore } from '../dspf-edit.utils/dspf-edit.choice-text';

suite('Preview: selection field choices', () => {
    // The DDS reference's own examples for the CHOICE keyword.
    test('> marks the mnemonic and is not shown', () => {
        assert.deepStrictEqual(parseChoiceText('>File'), { text: 'File', mnemonicIndex: 0 });
        assert.deepStrictEqual(parseChoiceText('F>inish'), { text: 'Finish', mnemonicIndex: 1 });
        assert.deepStrictEqual(parseChoiceText('Save >As...'), { text: 'Save As...', mnemonicIndex: 5 });
        assert.deepStrictEqual(parseChoiceText('X >= 1'), { text: 'X = 1', mnemonicIndex: 2 });
    });

    test('>> is a literal >', () => {
        assert.deepStrictEqual(parseChoiceText('X >>= 1'), { text: 'X >= 1', mnemonicIndex: undefined });
        assert.deepStrictEqual(parseChoiceText('X >>>= 1'), { text: 'X >= 1', mnemonicIndex: 3 });
    });

    test('text without > is unchanged', () => {
        assert.deepStrictEqual(parseChoiceText('DEV'), { text: 'DEV', mnemonicIndex: undefined });
    });

    test('a blank line before *SPACEB and non-consecutive numbers', () => {
        assert.deepStrictEqual(choiceBlankLinesBefore([
            { number: 1, spaceBefore: false },
            { number: 2, spaceBefore: false },
            { number: 3, spaceBefore: true },
            { number: 5, spaceBefore: false }
        ]), [0, 0, 1, 1]);
    });
});

import {
    parseChoiceKeyword, formatChoiceKeyword, validateChoiceText, parseSelectionKeyword, formatSelectionKeyword,
    parseChoiceControlKeyword, nextControlFieldName, nextChoiceNumber, choiceListWidth
} from '../dspf-edit.utils/dspf-edit.choice-text';

suite('Selection fields: keywords', () => {
    test('CHOICE is read and written back the same', () => {
        for (const keyword of ["CHOICE(1 'DEV')", "CHOICE(2 '>QA' *SPACEB)", "CHOICE(3 'Don''t')", 'CHOICE(4 &MARKTXT)']) {
            const parsed = parseChoiceKeyword(keyword)!;
            assert.strictEqual(formatChoiceKeyword(parsed), keyword);
        };
        assert.deepStrictEqual(parseChoiceKeyword("CHOICE(3 'Don''t')"), { number: 3, text: "Don't", isFieldReference: false, spaceBefore: false });
        assert.strictEqual(parseChoiceKeyword('CHCCTL(1 &CTL01)'), undefined);
    });

    test('choice text rules', () => {
        assert.strictEqual(validateChoiceText('>DEV', []), undefined);
        assert.strictEqual(validateChoiceText('X >>= 1', []), undefined);
        assert.match(validateChoiceText('>D>EV', [])!, /Only one/);
        assert.match(validateChoiceText('DEV>', [])!, /followed/);
        assert.match(validateChoiceText('> DEV', [])!, /blank/);
        assert.match(validateChoiceText('>dev', ['D'])!, /already uses D/);
        assert.match(validateChoiceText('  ', [])!, /Enter/);
    });

    test('SNGCHCFLD/MLTCHCFLD parameters are kept when rewritten', () => {
        assert.deepStrictEqual(parseSelectionKeyword('SNGCHCFLD'), { multiple: false, options: [], selectionIndicators: true, numCol: undefined, numRow: undefined, gutter: undefined });
        const parsed = parseSelectionKeyword('MLTCHCFLD(*RSTCSR *NOSLTIND (*NUMCOL 3) (*GUTTER 4))')!;
        assert.deepStrictEqual(parsed, { multiple: true, options: ['*RSTCSR'], selectionIndicators: false, numCol: 3, numRow: undefined, gutter: 4 });
        assert.strictEqual(formatSelectionKeyword(parsed), 'MLTCHCFLD(*RSTCSR *NOSLTIND (*NUMCOL 3) (*GUTTER 4))');
        assert.strictEqual(formatSelectionKeyword({ ...parsed, multiple: false, options: [], selectionIndicators: true, numCol: undefined }), 'SNGCHCFLD');
    });

    test('CHCCTL and control field names', () => {
        assert.deepStrictEqual(parseChoiceControlKeyword('CHCCTL(2 &CTL02)'), { number: 2, field: 'CTL02' });
        assert.strictEqual(nextControlFieldName(['CTL01', 'CTL03']), 'CTL02');
        assert.strictEqual(nextChoiceNumber([1, 2, 5]), 6);
        assert.strictEqual(nextChoiceNumber([99]), undefined);
    });

    test('width of the choice list', () => {
        const labels = [{ number: 1, text: 'DEV' }, { number: 2, text: 'QA' }, { number: 3, text: 'UAT' }];
        assert.strictEqual(choiceListWidth(labels, {}), 3 + 6);
        assert.strictEqual(choiceListWidth(labels, { numCol: 3 }), 3 + 3 * 6 + 2 * 3);
    });
});
