import * as assert from 'assert';
import { findSubfileKeywordProblems } from '../dspf-edit.validation/dspf-edit.subfile-keywords';

/** A DDS line: conditions in columns 7-16, name/type up to 44, keywords from 45. */
const line = (condition: string, nameArea: string, keywords: string) =>
    ('     A' + condition.padEnd(10, ' ') + nameArea).padEnd(44, ' ') + keywords;

const subfile = (pag: string, siz: string, extra: string[] = []) => [
    line('', 'R SFL', 'SFL'),
    line('', '  NAME          10A  O  5  2', ''),
    line('', 'R SFLCTL', 'SFLCTL(SFL)'),
    line('', '', pag),
    line('', '', siz),
    line('', '', 'SFLDSP SFLDSPCTL'),
    ...extra
];

suite('Checks: SFLDROP/SFLFOLD with SFLPAG = SFLSIZ', () => {
    test('SFLDROP with SFLPAG = SFLSIZ is an error', () => {
        const lines = subfile('SFLPAG(0010)', 'SFLSIZ(0010)', [line('', '', 'SFLDROP(CF10)')]);
        const problems = findSubfileKeywordProblems(lines);
        assert.strictEqual(problems.length, 1);
        assert.strictEqual(problems[0].lineIndex, 6);
        assert.strictEqual(problems[0].severity, 'error');
        assert.strictEqual(problems[0].code, 'CPF7885');
        assert.deepStrictEqual(problems[0].sizeFix, [{ lineIndex: 4, startCol: 51, endCol: 55, newText: '0011' }]);
        assert.strictEqual(problems[0].removeFix.deleteLine, true);
    });

    test('SFLFOLD on a subfile paged by the system is fine', () => {
        const lines = subfile('SFLPAG(10)', 'SFLSIZ(11)', [line('', '', 'SFLFOLD(CF10)')]);
        assert.deepStrictEqual(findSubfileKeywordProblems(lines), []);
    });

    test('no SFLDROP/SFLFOLD, nothing to report', () => {
        assert.deepStrictEqual(findSubfileKeywordProblems(subfile('SFLPAG(10)', 'SFLSIZ(10)')), []);
    });

    test('sharing a line with another keyword removes only the keyword', () => {
        const lines = subfile('SFLPAG(10)', 'SFLSIZ(10)', [line('', '', 'SFLDROP(CF10) SFLEND')]);
        const [problem] = findSubfileKeywordProblems(lines);
        assert.strictEqual(problem.removeFix.deleteLine, false);
        assert.strictEqual(lines[6].substring(problem.removeFix.edit.startCol, problem.removeFix.edit.endCol), 'SFLDROP(CF10) ');
    });

    test('equal on only one display size is not reported (CRTDSPF compiles it cleanly)', () => {
        const lines = [
            line('', '', 'DSPSIZ(24 80 *DS3 27 132 *DS4)'),
            ...subfile('SFLPAG(0010)', 'SFLSIZ(0011)', [
                line('  *DS4', '', 'SFLPAG(0010)'),
                line('  *DS4', '', 'SFLSIZ(0010)'),
                line('', '', 'SFLDROP(CF10)')
            ])
        ];
        assert.deepStrictEqual(findSubfileKeywordProblems(lines), []);
    });

    test('equal on every display size is an error, fixing each size', () => {
        const lines = [
            line('', '', 'DSPSIZ(24 80 *DS3 27 132 *DS4)'),
            ...subfile('SFLPAG(0010)', 'SFLSIZ(0010)', [
                line('  *DS4', '', 'SFLPAG(0012)'),
                line('  *DS4', '', 'SFLSIZ(0012)'),
                line('', '', 'SFLDROP(CF10)')
            ])
        ];
        const [problem] = findSubfileKeywordProblems(lines);
        assert.strictEqual(problem.severity, 'error');
        assert.deepStrictEqual(problem.sizeFix.map(f => f.newText), ['0011', '0013']);
    });

    test('a keyword on another record is not mixed in', () => {
        const lines = [
            ...subfile('SFLPAG(10)', 'SFLSIZ(11)', [line('', '', 'SFLDROP(CF10)')]),
            line('', 'R OTHER', ''),
            line('', '', 'SFLPAG(5)'),
            line('', '', 'SFLSIZ(5)')
        ];
        assert.deepStrictEqual(findSubfileKeywordProblems(lines), []);
    });
});
