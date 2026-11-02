import * as assert from 'assert';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { parseKeyCommand, keyCommandKeyword, readKeyUses } from '../dspf-edit.commands/dspf-edit.add-keys';

suite('Command keys', () => {
    test('reads every form the DDS reference allows', () => {
        assert.deepStrictEqual(parseKeyCommand('CA03'), { type: 'CA', keyNumber: '03', responseIndicator: undefined, text: undefined });
        assert.deepStrictEqual(parseKeyCommand('CA02(92)'), { type: 'CA', keyNumber: '02', responseIndicator: '92', text: undefined });
        assert.deepStrictEqual(parseKeyCommand("CF05(05 'Refresh')"), { type: 'CF', keyNumber: '05', responseIndicator: '05', text: 'Refresh' });
        assert.deepStrictEqual(parseKeyCommand("CF06(06 'Don''t save')"), { type: 'CF', keyNumber: '06', responseIndicator: '06', text: "Don't save" });
        assert.strictEqual(parseKeyCommand('CHANGE(50)'), undefined);
        assert.strictEqual(parseKeyCommand('SFLDROP(CF10)'), undefined);
    });

    test('writes the text only with a response indicator, quotes doubled', () => {
        assert.strictEqual(keyCommandKeyword({ type: 'CA', keyNumber: '03' }), 'CA03');
        assert.strictEqual(keyCommandKeyword({ type: 'CA', keyNumber: '03', text: 'Exit' }), 'CA03');
        assert.strictEqual(keyCommandKeyword({ type: 'CF', keyNumber: '12', responseIndicator: '12' }), 'CF12(12)');
        assert.strictEqual(keyCommandKeyword({ type: 'CF', keyNumber: '06', responseIndicator: '06', text: "Don't save" }), "CF06(06 'Don''t save')");
    });

    test('finds every key in the file, file level and every record, conditioned or not', () => {
        parseDocument([
            '     A                                      DSPSIZ(24 80 *DS3)',
            "     A                                      CA03(03 'Exit')",
            '     A          R LIST',
            "     A  50                                  CF05(05 'Refresh')",
            '     A                                      CA12',
            '     A            FLD           10A  B  5  2',
            '     A          R DETAIL',
            "     A                                      CA05(05 'Back')"
        ].join('\n'));

        assert.deepStrictEqual(readKeyUses().map(use => `${use.type}${use.keyNumber} ${use.where}`), [
            'CA03 file level',
            'CF05 record LIST',
            'CA12 record LIST',
            'CA05 record DETAIL'
        ]);
    });
});
