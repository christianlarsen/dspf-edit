import * as assert from 'assert';
import { parseIndicatorInput } from '../dspf-edit.commands/dspf-edit.add-indicators';

suite('Indicator input', () => {
    test('reads an indicator, padded to two digits', () => {
        assert.deepStrictEqual(parseIndicatorInput('50', 1), { position: 1, indicator: '50', isNegated: false, value: '50' });
        assert.deepStrictEqual(parseIndicatorInput('5', 2), { position: 2, indicator: '05', isNegated: false, value: '05' });
        assert.deepStrictEqual(parseIndicatorInput(' N03 ', 3), { position: 3, indicator: 'N03', isNegated: true, value: '03' });
    });

    test('takes a lowercase n as N', () => {
        assert.deepStrictEqual(parseIndicatorInput('n50', 1), { position: 1, indicator: 'N50', isNegated: true, value: '50' });
        assert.deepStrictEqual(parseIndicatorInput('n7', 1), { position: 1, indicator: 'N07', isNegated: true, value: '07' });
    });

    test('rejects what is not an indicator 01-99', () => {
        for (const input of ['', '  ', '0', '00', 'N0', '100', 'X50', 'NN50', '5 0', 'N']) {
            assert.strictEqual(parseIndicatorInput(input, 1), undefined, input);
        };
    });
});
