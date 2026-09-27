import * as assert from 'assert';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { DdsElement, DdsField } from '../dspf-edit.model/dspf-edit.model';

/**
 * Builds an 80-column DDS source line from 1-based source positions, as the DDS reference numbers
 * them: e.g. { 17: 'R', 19: 'RECORD' } puts the record type in position 17 and the name at 19.
 */
function srcLine(parts: Record<number, string>): string {
    const chars = new Array(80).fill(' ');
    chars[5] = 'A';
    for (const [position, text] of Object.entries(parts)) {
        for (let i = 0; i < text.length; i++) chars[Number(position) - 1 + i] = text[i];
    };
    return chars.join('').trimEnd();
}

function findField(elements: DdsElement[], name: string): DdsField | undefined {
    for (const element of elements) {
        if (element.kind === 'field' && element.name === name) return element;
        const nested = element.children ? findField(element.children, name) : undefined;
        if (nested) return nested;
    };
    return undefined;
}

suite('Parser: referenced field targets', () => {
    const src = [
        srcLine({ 45: 'REF(TEST)' }),
        srcLine({ 17: 'R', 19: 'RECORD' }),
        srcLine({ 19: 'UPDUSR', 29: 'R', 38: 'O', 39: ' 23', 42: ' 43' }),
        srcLine({ 19: 'USRX', 29: 'R', 38: 'O', 39: ' 22', 42: ' 43', 45: 'REFFLD(UPDUSR)' }),
        srcLine({ 19: 'LONGFLD', 29: 'R', 38: 'O', 39: ' 21', 42: ' 43', 45: 'REFFLD(RECFORMAT1/FIELDNAME1 -' }),
        srcLine({ 45: 'LIBRARY001/FILENAME01)' }),
    ].join('\n');
    const elements = parseDocument(src);

    test('bare R field references its own name, file from REF', () => {
        assert.deepStrictEqual(findField(elements, 'UPDUSR')?.refTarget, { fieldName: 'UPDUSR' });
    });

    test('REFFLD with no file references another name, file from REF', () => {
        assert.deepStrictEqual(findField(elements, 'USRX')?.refTarget, { fieldName: 'UPDUSR', recordFormat: undefined });
    });

    test('fully qualified REFFLD continued on the next line', () => {
        assert.deepStrictEqual(findField(elements, 'LONGFLD')?.refTarget, {
            fieldName: 'FIELDNAME1', file: 'FILENAME01', library: 'LIBRARY001', recordFormat: 'RECFORMAT1'
        });
    });
});
