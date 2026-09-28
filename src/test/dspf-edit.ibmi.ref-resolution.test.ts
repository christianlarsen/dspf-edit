import * as assert from 'assert';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { DdsElement, DdsField } from '../dspf-edit.model/dspf-edit.model';
import { applyRefOverrides, resolveReferencedField, getResolvedRef, clearResolvedRef } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';

function srcLine(parts: Record<number, string>): string {
    const chars = new Array(80).fill(' ');
    chars[5] = 'A';
    for (const [position, text] of Object.entries(parts)) {
        for (let i = 0; i < text.length; i++) chars[Number(position) - 1 + i] = text[i];
    };
    return chars.join('').trimEnd();
}

function findField(elements: DdsElement[], name: string): DdsField {
    for (const element of elements) {
        if (element.kind === 'field' && element.name === name) return element;
        const nested = element.children ? findField(element.children, name) : undefined;
        if (nested) return nested;
    };
    return undefined as unknown as DdsField;
}

suite('Referenced field overrides', () => {
    const base = { type: 'S', length: 7, decimals: 2 };

    test('none keeps the referenced definition', () => {
        assert.deepStrictEqual(applyRefOverrides(base, undefined), base);
    });

    test('+n/-n change length and decimals', () => {
        assert.deepStrictEqual(applyRefOverrides(base, { lengthDelta: 4, decimalsDelta: -1 }), { type: 'S', length: 11, decimals: 1 });
    });

    test('new values replace length and decimals', () => {
        assert.deepStrictEqual(applyRefOverrides(base, { length: 5, decimals: 0 }), { type: 'S', length: 5, decimals: 0 });
    });

    test('a character data type drops the decimal positions', () => {
        assert.deepStrictEqual(applyRefOverrides(base, { type: 'A' }), { type: 'A', length: 7, decimals: 0 });
    });

    test('a numeric data type keeps the decimal positions', () => {
        assert.deepStrictEqual(applyRefOverrides(base, { type: 'Y' }), { type: 'Y', length: 7, decimals: 2 });
    });
});

suite('Referenced fields in the same source (*SRC)', () => {
    const uri = 'test://src-resolution';
    const src = [
        srcLine({ 17: 'R', 19: 'FMAT1' }),
        srcLine({ 19: 'ITEM', 30: '    5', 38: 'O', 39: '  3', 42: '  2' }),
        srcLine({ 19: 'PRICE', 30: '    9', 35: 'Y', 36: ' 2', 38: 'O', 39: '  4', 42: '  2' }),
        srcLine({ 19: 'ITEM1', 29: 'R', 38: 'O', 39: '  5', 42: '  2', 45: 'REFFLD(ITEM)' }),
        srcLine({ 19: 'ITEM6', 29: 'R', 30: '   +3', 38: 'O', 39: '  6', 42: '  2', 45: 'REFFLD(ITEM *SRC)' }),
        srcLine({ 19: 'PRICE2', 29: 'R', 38: 'O', 39: '  7', 42: '  2', 45: 'REFFLD(FMAT1/PRICE *SRC)' }),
        srcLine({ 19: 'CHAIN', 29: 'R', 38: 'O', 39: '  8', 42: '  2', 45: 'REFFLD(ITEM6)' }),
        srcLine({ 19: 'LATER', 29: 'R', 38: 'O', 39: '  9', 42: '  2', 45: 'REFFLD(NEXT)' }),
        srcLine({ 19: 'NEXT', 30: '    3', 38: 'O', 39: ' 10', 42: '  2' }),
    ].join('\n');
    // parseDocument fills the global model the resolver reads, so parse per suite, right before its tests.
    let elements: DdsElement[] = [];
    suiteSetup(() => {
        elements = parseDocument(src);
        clearResolvedRef(uri);
    });

    const resolve = (name: string) => {
        const field = findField(elements, name);
        return resolveReferencedField(uri, field)
            .then(() => getResolvedRef(uri, field.recordname, field.name, field.refOverrides));
    };

    test('REFFLD with no file and no REF looks in this source', async () => {
        assert.deepStrictEqual(await resolve('ITEM1'), { type: 'A', length: 5, decimals: 0 });
    });

    test('REFFLD(... *SRC) with its own +n length change', async () => {
        assert.deepStrictEqual(await resolve('ITEM6'), { type: 'A', length: 8, decimals: 0 });
    });

    test('record-format-qualified *SRC reference to a numeric field', async () => {
        assert.deepStrictEqual(await resolve('PRICE2'), { type: 'Y', length: 9, decimals: 2 });
    });

    test('a reference to a resolved referenced field takes its effective definition', async () => {
        assert.deepStrictEqual(await resolve('CHAIN'), { type: 'A', length: 8, decimals: 0 });
    });

    test('the referenced field must precede the referencing one', async () => {
        await assert.rejects(resolve('LATER'), /not found before it/);
    });
});

suite('REF is a file-level keyword only', () => {
    const uri = 'test://record-level-ref';
    const src = [
        srcLine({ 17: 'R', 19: 'RECB' }),
        srcLine({ 45: 'REF(OTHERFILE)' }),
        srcLine({ 19: 'ITEM', 30: '    6', 38: 'O', 39: '  3', 42: '  2' }),
        srcLine({ 19: 'ITEM1', 29: 'R', 38: 'O', 39: '  4', 42: '  2', 45: 'REFFLD(ITEM)' }),
    ].join('\n');
    // parseDocument fills the global model the resolver reads, so parse per suite, right before its tests.
    let elements: DdsElement[] = [];
    suiteSetup(() => {
        elements = parseDocument(src);
        clearResolvedRef(uri);
    });

    test('a REF coded at record level is ignored: with no file-level REF, the field is looked up in this source', async () => {
        const field = findField(elements, 'ITEM1');
        await resolveReferencedField(uri, field);
        assert.deepStrictEqual(getResolvedRef(uri, field.recordname, field.name), { type: 'A', length: 6, decimals: 0 });
    });
});
