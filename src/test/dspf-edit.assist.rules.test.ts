/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	test/dspf-edit.assist.rules.test.ts
*/

import * as assert from 'assert';
import { parseLine, parseSource } from '../dspf-edit.assist/dspf-edit.column-parser';
import { checkLine, checkSource } from '../dspf-edit.assist/dspf-edit.rules';

/** Builds a DDS line by placing text at exact 1-based columns. */
function ddsLine(parts: Array<[column: number, text: string]>): string {
    let line = '';
    for (const [column, text] of parts) {
        if (line.length < column - 1) {
            line += ' '.repeat(column - 1 - line.length);
        };
        line = line.slice(0, column - 1) + text + line.slice(column - 1 + text.length);
    };
    return line;
}

/** True when the given rule code was reported. */
function hasCode(issues: ReturnType<typeof checkLine>, code: string): boolean {
    return issues.some(i => i.code === code);
}

/** The single issue reported for a line, for assertions on severity/message. */
function onlyIssue(line: string): ReturnType<typeof checkLine>[number] {
    const issues = checkLine(parseLine(line, 0));
    assert.strictEqual(
        issues.length, 1,
        `expected exactly one issue, got: ${issues.map(i => i.code).join(', ')}`
    );
    return issues[0];
}

const A: [number, string] = [6, 'A'];

suite('DSPF assist: checkLine', () => {

    test('accepts a valid field line', () => {
        const line = ddsLine([A, [19, 'CUSNO'], [34, '7'], [35, 'Y'], [37, '0']]);
        assert.deepStrictEqual(checkLine(parseLine(line, 0)), []);
    });

    test('ignores comments and blank lines', () => {
        const comment = '     A* anything at all, even past column 80 ' + 'x'.repeat(60);
        assert.deepStrictEqual(checkLine(parseLine(comment, 0)), []);
        assert.deepStrictEqual(checkLine(parseLine('', 0)), []);
    });

    test('flags text past column 80', () => {
        const line = ddsLine([A, [19, 'FLD'], [34, '5'], [35, 'A'], [81, 'OOPS']]);
        const issues = checkLine(parseLine(line, 0));
        assert.ok(issues.some(i => i.code === 'dds-overflow' && i.severity === 'error'));
    });

    test('flags invalid data types', () => {
        const line = ddsLine([A, [19, 'FLD'], [34, '5'], [35, 'Q']]);
        const issue = onlyIssue(line);
        assert.strictEqual(issue.code, 'dds-data-type');
        assert.strictEqual(issue.severity, 'error');
    });

    test('flags non-numeric length', () => {
        const line = ddsLine([A, [19, 'FLD'], [30, '1X'], [35, 'A']]);
        assert.ok(hasCode(checkLine(parseLine(line, 0)), 'dds-length-digits'));
    });

    test('flags decimals on character fields', () => {
        const line = ddsLine([A, [19, 'FLD'], [33, '10'], [35, 'A'], [37, '2']]);
        assert.ok(hasCode(checkLine(parseLine(line, 0)), 'dds-decimals-type'));
    });

    test('flags decimals greater than length', () => {
        const line = ddsLine([A, [19, 'FLD'], [34, '3'], [35, 'S'], [37, '5']]);
        assert.ok(hasCode(checkLine(parseLine(line, 0)), 'dds-decimals-length'));
    });

    test('flags zoned fields longer than 63 digits', () => {
        const line = ddsLine([A, [19, 'FLD'], [33, '64'], [35, 'S'], [37, '0']]);
        assert.ok(hasCode(checkLine(parseLine(line, 0)), 'dds-numeric-length'));
    });

    test('accepts a full 10-character name but flags invalid characters', () => {
        const ok = ddsLine([A, [19, 'ABCDEFGHIJ'], [33, '10'], [35, 'A']]);
        assert.deepStrictEqual(
            checkLine(parseLine(ok, 0)).filter(i => i.code.startsWith('dds-name')),
            []
        );

        const bad = ddsLine([A, [19, '1BADNAME'], [33, '10'], [35, 'A']]);
        assert.ok(hasCode(checkLine(parseLine(bad, 0)), 'dds-name-chars'));
    });

    test('flags names not left-justified', () => {
        const line = ddsLine([A, [21, 'FLD'], [33, '10'], [35, 'A']]);
        assert.ok(hasCode(checkLine(parseLine(line, 0)), 'dds-name-alignment'));
    });

    test('flags length/type on record lines', () => {
        const line = ddsLine([A, [17, 'R'], [19, 'REC1'], [33, '10']]);
        assert.ok(hasCode(checkLine(parseLine(line, 0)), 'dds-record-data'));
    });

    test('flags invalid usage', () => {
        const line = ddsLine([A, [19, 'FLD'], [33, '10'], [35, 'A'], [38, 'X']]);
        assert.ok(hasCode(checkLine(parseLine(line, 0)), 'dds-usage'));
    });

    test('flags a wrong form type', () => {
        const line = ddsLine([[6, 'B'], [19, 'FLD'], [33, '10'], [35, 'A']]);
        assert.ok(hasCode(checkLine(parseLine(line, 0)), 'dds-form-type'));
    });
});

suite('DSPF assist: database-only entries are warnings, not errors', () => {

    // A line carrying one of these is nearly always copied from a physical or
    // logical file rather than mistyped, so it gets a warning that names the
    // reason instead of a bare "invalid" error.

    test('packed, binary and hexadecimal data types name the reason', () => {
        for (const dataType of ['P', 'B', 'H']) {
            const line = ddsLine([A, [19, 'FLD'], [34, '7'], [35, dataType]]);
            const issue = onlyIssue(line);
            assert.strictEqual(issue.code, 'dds-data-type');
            assert.strictEqual(issue.severity, 'warning', `${dataType} should warn, not error`);
            assert.match(issue.message, /physical and logical files/);
        };
    });

    test('database name types name the reason', () => {
        for (const nameType of ['K', 'S', 'O', 'J']) {
            const line = ddsLine([A, [17, nameType], [19, 'CUSNO']]);
            const issue = onlyIssue(line);
            assert.strictEqual(issue.code, 'dds-name-type');
            assert.strictEqual(issue.severity, 'warning');
            assert.match(issue.message, /physical and logical files/);
        };
    });

    test('usage N names the reason', () => {
        const line = ddsLine([A, [19, 'FLD'], [33, '10'], [35, 'A'], [38, 'N']]);
        const issue = onlyIssue(line);
        assert.strictEqual(issue.code, 'dds-usage');
        assert.strictEqual(issue.severity, 'warning');
        assert.match(issue.message, /logical files/);
    });

    test('every display file data type and usage is accepted', () => {
        for (const dataType of ['A', 'X', 'N', 'S', 'Y', 'D', 'M', 'I', 'W', 'F', 'L', 'T', 'Z', 'G']) {
            const line = ddsLine([A, [19, 'FLD'], [33, '10'], [35, dataType]]);
            assert.deepStrictEqual(
                checkLine(parseLine(line, 0)), [],
                `data type ${dataType} should be accepted`
            );
        };
        for (const usage of ['B', 'I', 'O', 'H', 'M', 'P']) {
            const line = ddsLine([A, [19, 'FLD'], [33, '10'], [35, 'A'], [38, usage]]);
            assert.deepStrictEqual(
                checkLine(parseLine(line, 0)), [],
                `usage ${usage} should be accepted`
            );
        };
    });
});

suite('DSPF assist: checkSource', () => {

    test('reports issues across an entire source', () => {
        const source = [
            '     A          R CUSREC',
            '     A            CUSNO          7Q 0',
        ].join('\n');
        const issues = checkSource(parseSource(source));
        assert.ok(issues.some(i => i.code === 'dds-data-type'));
    });
});

suite('DSPF assist: diagnostics stay quiet on real DSPF conditioning', () => {

    // The graphical side of this extension already round-trips these shapes; the
    // point here is that the DDS rules must not invent problems on them.
    test('indicator conditioning and OR continuation lines produce no issues', () => {
        const source = [
            "     A                                 11 35'Hello world!'",
            '     A  51N61',
            '     AA 53',
            '     AO 52',
            '     AO 81 82                               COLOR(BLU)',
        ].join('\n');
        const issues = checkSource(parseSource(source));
        assert.deepStrictEqual(
            issues,
            [],
            issues.map(i => `line ${i.line + 1}: ${i.code} ${i.message}`).join('\n')
        );
    });

    test('a positioned constant and a window record produce no issues', () => {
        const source = [
            '     A          R WINREC',
            '     A                                      WINDOW(4 10 8 40)',
            "     A                                  1  2'Details'",
            '     A            CUSNO          7Y 0B  3  2',
            '     A            CUSNAME       30A  O   4  2',
        ].join('\n');
        const issues = checkSource(parseSource(source));
        assert.deepStrictEqual(
            issues,
            [],
            issues.map(i => `line ${i.line + 1}: ${i.code} ${i.message}`).join('\n')
        );
    });
});
