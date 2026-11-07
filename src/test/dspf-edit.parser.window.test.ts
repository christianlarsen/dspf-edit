import * as assert from 'assert';
import { parseDocument, parseWindowDefinition, rewriteWindowDefinition, windowPositionFieldNames } from '../dspf-edit.parser/dspf-edit.parser';
import { windowPositionFieldProblem, windowPositionFieldLines } from '../dspf-edit.commands/dspf-edit.window-position-fields';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';

suite('Parser: WINDOW placement', () => {
    test('reads a fixed line and position', () => {
        assert.deepStrictEqual(parseWindowDefinition('WINDOW(4 20 9 30 *NORSTCSR)'), {
            placement: 'fixed', positionText: '4 20', startRow: 4, startCol: 20, numRows: 9, numCols: 30, options: ' *NORSTCSR'
        });
    });

    test('reads *DFT: placed relative to the cursor, drawn at row 2 column 2 as STRSDA does', () => {
        assert.deepStrictEqual(parseWindowDefinition('WINDOW(*DFT 9 30 *NOMSGLIN)'), {
            placement: 'cursor', positionText: '*DFT', startRow: 2, startCol: 2, numRows: 9, numCols: 30, options: ' *NOMSGLIN'
        });
        assert.strictEqual(parseWindowDefinition('window( *dft 9 30 )')?.placement, 'cursor');
    });

    test('reads P fields for the line and position, also only one of them', () => {
        assert.deepStrictEqual(parseWindowDefinition('WINDOW(&LIN &POS 9 30)'), {
            placement: 'fields', positionText: '&LIN &POS', startRow: 2, startCol: 2, numRows: 9, numCols: 30, options: ''
        });
        const mixed = parseWindowDefinition('WINDOW(&LIN 20 9 30)');
        assert.strictEqual(mixed?.placement, 'fields');
        assert.deepStrictEqual([mixed?.startRow, mixed?.startCol], [2, 20]);
    });

    test('is not a definition: a reference to another record', () => {
        assert.strictEqual(parseWindowDefinition('WINDOW(WINDOW1)'), undefined);
    });

    test('rewrites the size and keeps a start placed at run time', () => {
        const line = '     A          R WDFT                      WINDOW(*DFT 8 30 *NOMSGLIN)';
        assert.strictEqual(rewriteWindowDefinition(line, { numRows: 10, numCols: 40 }),
            '     A          R WDFT                      WINDOW(*DFT 10 40 *NOMSGLIN)');
        assert.strictEqual(rewriteWindowDefinition('WINDOW(&LIN &POS 8 30)', { numCols: 50 }), 'WINDOW(&LIN &POS 8 50)');
    });

    test('rewrites the start: fixed, or *DFT', () => {
        assert.strictEqual(rewriteWindowDefinition('WINDOW(*DFT 8 30)', { start: { row: 5, col: 10 } }), 'WINDOW(5 10 8 30)');
        assert.strictEqual(rewriteWindowDefinition('WINDOW(5 10 8 30)', { start: 'cursor' }), 'WINDOW(*DFT 8 30)');
        assert.strictEqual(rewriteWindowDefinition('WINDOW(WINDOW1)', { start: 'cursor' }), 'WINDOW(WINDOW1)');
    });

    test('a record with WINDOW(*DFT ...) or WINDOW(&LIN &POS ...) on its R line is a window', () => {
        const records = parseDocument([
            '     A                                      DSPSIZ(24 80 *DS3)',
            '     A          R WDFT                      WINDOW(*DFT 8 30)',
            '     A            D1            10A  B  4  2',
            '     A          R WVAR                      WINDOW(&LIN &POS 8 30)',
            '     A            D2            10A  B  4  2',
            '     A            LIN            3S 0P',
            '     A            POS            3S 0P'
        ].join('\n')).filter((el: any) => el.kind === 'record') as any[];

        for (const record of records) {
            assert.strictEqual(record.size.source, 'window', record.name);
            assert.deepStrictEqual([record.size.originRow, record.size.originCol, record.size.rows, record.size.cols], [2, 2, 8, 30], record.name);
        };
    });

    test('rewrites the start as the P fields holding the line and position', () => {
        assert.strictEqual(rewriteWindowDefinition('WINDOW(5 10 8 30 *NOMSGLIN)', { start: { fields: { row: 'WDWLIN', col: 'WDWPOS' } } }),
            'WINDOW(&WDWLIN &WDWPOS 8 30 *NOMSGLIN)');
    });

    test('names the P fields a window is placed by', () => {
        assert.deepStrictEqual(windowPositionFieldNames(parseWindowDefinition('WINDOW(&LIN &POS 8 30)')!), { row: 'LIN', col: 'POS' });
        assert.deepStrictEqual(windowPositionFieldNames(parseWindowDefinition('WINDOW(&LIN 20 8 30)')!), { row: 'LIN', col: undefined });
        assert.deepStrictEqual(windowPositionFieldNames(parseWindowDefinition('WINDOW(*DFT 8 30)')!), {});
    });
});

suite('Window position fields', () => {
    const fieldOf = (source: string) => {
        parseDocument([
            '     A                                      DSPSIZ(24 80 *DS3)',
            '     A          R WVAR                      WINDOW(&LIN &POS 8 30)',
            source
        ].join('\n'));
        return fieldsPerRecords.find(r => r.record === 'WVAR')!.fields[0];
    };

    test('takes a signed numeric P field of up to 3 digits, as the DDS reference requires', () => {
        assert.strictEqual(windowPositionFieldProblem(fieldOf('     A            LIN            3S 0P')), undefined);
        assert.strictEqual(windowPositionFieldProblem(fieldOf('     A            LIN            2S 0P')), undefined);
    });

    test('refuses any other definition, saying how it is defined', () => {
        assert.strictEqual(windowPositionFieldProblem(fieldOf('     A            LIN            4S 0P')), '4S 0 P');
        assert.strictEqual(windowPositionFieldProblem(fieldOf('     A            LIN            3S 0H')), '3S 0 H');
        assert.strictEqual(windowPositionFieldProblem(fieldOf('     A            LIN            3A  P')), '3A P');
    });

    test('creates them as 3S 0P', () => {
        assert.deepStrictEqual(windowPositionFieldLines({ row: 'WDWLIN', col: 'WDWPOS' }), [
            '     A            WDWLIN         3S 0P',
            '     A            WDWPOS         3S 0P'
        ]);
    });
});
