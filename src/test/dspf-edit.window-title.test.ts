import * as assert from 'assert';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { parseWindowTitleKeyword, buildWindowTitleKeyword, titleFieldProblem } from '../dspf-edit.commands/dspf-edit.window-title';

suite('Window title', () => {
    test('reads a literal title, with a doubled quote', () => {
        assert.deepStrictEqual(parseWindowTitleKeyword("WDWTITLE((*TEXT 'Don''t panic') *CENTER)"), {
            source: { kind: 'text', text: "Don't panic" }, position: 'TOP', align: 'CENTER', colorPart: undefined, dspatrPart: undefined
        });
    });

    test('reads a field title on the bottom border, with color and display attributes', () => {
        assert.deepStrictEqual(parseWindowTitleKeyword('WDWTITLE((*TEXT &ttl2) (*COLOR YLW) (*DSPATR RI) *BOTTOM)'), {
            source: { kind: 'field', name: 'TTL2' }, position: 'BOTTOM', align: undefined, colorPart: '(*COLOR YLW)', dspatrPart: '(*DSPATR RI)'
        });
    });

    test('writes it back, keeping color and display attributes, alignment by default per border', () => {
        assert.strictEqual(buildWindowTitleKeyword({ source: { kind: 'field', name: 'PIE' }, position: 'BOTTOM' }),
            'WDWTITLE((*TEXT &PIE) *LEFT *BOTTOM)');
        assert.strictEqual(buildWindowTitleKeyword({ source: { kind: 'text', text: "Don't" }, position: 'TOP', align: 'RIGHT', colorPart: '(*COLOR RED)' }),
            "WDWTITLE((*TEXT 'Don''t') (*COLOR RED) *RIGHT)");
        const original = 'WDWTITLE((*TEXT &TTL2) (*COLOR YLW) (*DSPATR RI) *CENTER *BOTTOM)';
        assert.strictEqual(buildWindowTitleKeyword({ ...parseWindowTitleKeyword(original), source: { kind: 'text', text: 'Fin' } }),
            "WDWTITLE((*TEXT 'Fin') (*COLOR YLW) (*DSPATR RI) *CENTER *BOTTOM)");
    });

    test('a title field must be character, usage P', () => {
        const fieldOf = (source: string) => {
            parseDocument([
                '     A                                      DSPSIZ(24 80 *DS3)',
                '     A          R WVAR                      WINDOW(*DFT 8 30)',
                source
            ].join('\n'));
            return fieldsPerRecords.find(r => r.record === 'WVAR')!.fields[0];
        };
        assert.strictEqual(titleFieldProblem(fieldOf('     A            TITULO        20A  P')), undefined);
        assert.strictEqual(titleFieldProblem(fieldOf('     A            TITULO        20A  B')), '20A B');
        assert.strictEqual(titleFieldProblem(fieldOf('     A            TITULO         3S 0P')), '3S 0 P');
    });
});
