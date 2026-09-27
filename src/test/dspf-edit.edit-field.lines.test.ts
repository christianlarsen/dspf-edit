import * as assert from 'assert';
import { generateQuickFieldLines, generateNewFieldLine } from '../dspf-edit.commands/dspf-edit.edit-field';

const noPosition = { row: 0, column: 0 };

suite('Add Field: generated source lines', () => {
    test('hidden alphanumeric, as STRSDA writes it', () => {
        assert.strictEqual(
            generateQuickFieldLines('WSRECNAM', false, { type: 'H', description: '' }, { length: 10, decimals: 0 }, noPosition),
            '     A            WSRECNAM      10A  H'
        );
    });

    test('hidden numeric, decimals always explicit', () => {
        assert.strictEqual(
            generateQuickFieldLines('NRR', true, { type: 'H', description: '' }, { length: 4, decimals: 0 }, noPosition),
            '     A            NRR            4S 0H'
        );
        assert.strictEqual(
            generateQuickFieldLines('AMOUNT', true, { type: 'H', description: '' }, { length: 9, decimals: 2 }, noPosition),
            '     A            AMOUNT         9S 2H'
        );
    });

    test('output numeric field keeps its position and edit word (blank usage is output)', () => {
        assert.strictEqual(
            generateQuickFieldLines('WSTOTAL', true, { type: 'O', description: '' }, { length: 7, decimals: 2 }, { row: 22, column: 46 }),
            "     A            WSTOTAL        7Y 2  22 46EDTWRD('     .  ')"
        );
    });

    test('message field: character, length only, no position', () => {
        assert.strictEqual(
            generateNewFieldLine({
                name: 'MSGFLD',
                position: noPosition,
                usage: { type: 'M', description: '' },
                isReferenced: false,
                typeConfig: { type: '', size: { length: 78, decimals: 0 } }
            }),
            '     A            MSGFLD        78   M'
        );
    });

    test('hidden date field from More options: no length, type L', () => {
        assert.strictEqual(
            generateNewFieldLine({
                name: 'WSDATE',
                position: noPosition,
                usage: { type: 'H', description: '' },
                isReferenced: false,
                typeConfig: { type: 'L', size: { length: 10, decimals: 0 } }
            }),
            '     A            WSDATE          L  H'
        );
    });
});
