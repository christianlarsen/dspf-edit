import * as assert from 'assert';
import { parseRefKeyword } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';

suite('REF keyword parsing', () => {
    test('file only', () => {
        assert.deepStrictEqual(parseRefKeyword('REF(FILE1)'), { file: 'FILE1', library: undefined, recordFormat: undefined });
    });

    test('library-qualified file', () => {
        assert.deepStrictEqual(parseRefKeyword('REF(*LIBL/HTPFREF)'), { file: 'HTPFREF', library: '*LIBL', recordFormat: undefined });
    });

    test('library, file and record format', () => {
        assert.deepStrictEqual(parseRefKeyword('REF(LIB/FILE1 RECORD2)'), { file: 'FILE1', library: 'LIB', recordFormat: 'RECORD2' });
    });

    test('file and record format, extra blanks', () => {
        assert.deepStrictEqual(parseRefKeyword('  REF(  FILE1   RECORD2 )'), { file: 'FILE1', library: undefined, recordFormat: 'RECORD2' });
    });

    test('lowercase keyword', () => {
        assert.deepStrictEqual(parseRefKeyword('ref(lib/file1)'), { file: 'file1', library: 'lib', recordFormat: undefined });
    });

    test('not a REF keyword', () => {
        assert.strictEqual(parseRefKeyword('REFFLD(FLD1 FILE1)'), undefined);
        assert.strictEqual(parseRefKeyword('REF()'), undefined);
        assert.strictEqual(parseRefKeyword('REF(A B C)'), undefined);
    });
});
