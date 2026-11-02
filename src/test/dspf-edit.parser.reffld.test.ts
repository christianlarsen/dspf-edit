import * as assert from 'assert';
import { parseDocument, setReferencedLengthResolver } from '../dspf-edit.parser/dspf-edit.parser';
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

suite('Parser: referenced field overrides', () => {
    const src = [
        srcLine({ 17: 'R', 19: 'RECORD' }),
        srcLine({ 19: 'PLUS', 29: 'R', 30: '   +4', 38: 'O', 39: '  2', 42: '  2' }),
        srcLine({ 19: 'MINUS', 29: 'R', 30: '   -2', 36: '+1', 38: 'O', 39: '  3', 42: '  2' }),
        srcLine({ 19: 'ABSOLUTE', 29: 'R', 30: '   12', 35: 'A', 38: 'O', 39: '  4', 42: '  2' }),
        srcLine({ 19: 'PLAIN', 29: 'R', 38: 'O', 39: '  5', 42: '  2' }),
    ].join('\n');
    const elements = parseDocument(src);

    test('+n length is a change, not a length of its own', () => {
        const field = findField(elements, 'PLUS');
        assert.deepStrictEqual(field?.refOverrides, { lengthDelta: 4 });
        assert.strictEqual(field?.length, 0);
    });

    test('-n length and +n decimals', () => {
        const field = findField(elements, 'MINUS');
        assert.deepStrictEqual(field?.refOverrides, { lengthDelta: -2, decimalsDelta: 1 });
        assert.strictEqual(field?.decimals, undefined);
    });

    test('absolute length and data type', () => {
        assert.deepStrictEqual(findField(elements, 'ABSOLUTE')?.refOverrides, { length: 12, type: 'A' });
    });

    test('no overrides', () => {
        assert.strictEqual(findField(elements, 'PLAIN')?.refOverrides, undefined);
    });
});

suite('Parser: relative position after a referenced field', () => {
    // Issue #97: a field/constant positioned "+n" counts from the end of the element before it.
    const src = [
        srcLine({ 45: 'REF(FRF)' }),
        srcLine({ 17: 'R', 19: 'RECORD' }),
        srcLine({ 39: ' 15', 42: '  2', 45: "'Send Product group..'" }),
        srcLine({ 19: 'FMUPGR', 29: 'R', 38: 'B', 42: ' +1', 45: 'REFFLD(DRYE)' }),
        srcLine({ 19: 'FMPGRP', 29: 'R', 38: 'B', 42: ' +1', 45: 'REFFLD(PGRP)' }),
        srcLine({ 19: 'FMNUM', 29: 'R', 30: '    4', 35: 'A', 38: 'B', 42: ' +1', 45: 'REFFLD(NUM)' }),
        srcLine({ 19: 'FMPCA2', 29: 'R', 38: 'B', 42: ' +1', 45: 'REFFLD(PCA2)' }),
    ].join('\n');

    teardown(() => setReferencedLengthResolver(undefined));

    test('unresolved: counts the 1-character marker, or the length coded in the source', () => {
        const elements = parseDocument(src);
        assert.strictEqual(findField(elements, 'FMUPGR')?.column, 23);
        assert.strictEqual(findField(elements, 'FMPGRP')?.column, 25);
        assert.strictEqual(findField(elements, 'FMNUM')?.column, 27);
        assert.strictEqual(findField(elements, 'FMPCA2')?.column, 32);
    });

    test('resolved: counts the referenced field\'s real length', () => {
        const lengths: Record<string, number> = { FMUPGR: 1, FMPGRP: 4, FMNUM: 4 };
        setReferencedLengthResolver((_record, name) => lengths[name]);
        const elements = parseDocument(src);
        assert.strictEqual(findField(elements, 'FMPGRP')?.column, 25);
        assert.strictEqual(findField(elements, 'FMNUM')?.column, 30);
        assert.strictEqual(findField(elements, 'FMPCA2')?.column, 35);
    });
});
