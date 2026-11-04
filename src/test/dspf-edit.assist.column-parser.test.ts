/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	test/dspf-edit.assist.column-parser.test.ts
*/

import * as assert from 'assert';
import {
    parseLine,
    parseSource,
    columnInfoAt
} from '../dspf-edit.assist/dspf-edit.column-parser';

// Column ruler for building test lines:
//          1         2         3         4         5
// 123456789012345678901234567890123456789012345678901234567890
const RECORD_LINE = "     A          R CUSREC                    TEXT('Customer')";
const FIELD_LINE = "     A            CUSNO          7Y 0B  5 20TEXT('Customer number')";
const HELP_LINE = '     A          H HLPREC';
const COMMENT_LINE = '     A* This is a comment';

suite('DSPF assist: parseLine', () => {

    test('classifies record format lines', () => {
        const parsed = parseLine(RECORD_LINE, 0);
        assert.strictEqual(parsed.kind, 'record');
        assert.strictEqual(parsed.name, 'CUSREC');
        assert.strictEqual(parsed.nameType, 'R');
    });

    test('classifies field lines and extracts areas', () => {
        const parsed = parseLine(FIELD_LINE, 1);
        assert.strictEqual(parsed.kind, 'field');
        assert.strictEqual(parsed.name, 'CUSNO');
        assert.strictEqual(parsed.length, '7');
        assert.strictEqual(parsed.dataType, 'Y');
        assert.strictEqual(parsed.decimals, '0');
        assert.strictEqual(parsed.usage, 'B');
        assert.strictEqual(parsed.locationLine, '5');
        assert.strictEqual(parsed.locationPosition, '20');
        assert.strictEqual(parsed.keywords, "TEXT('Customer number')");
    });

    test('classifies help specification lines', () => {
        const parsed = parseLine(HELP_LINE, 2);
        assert.strictEqual(parsed.kind, 'help');
        assert.strictEqual(parsed.name, 'HLPREC');
    });

    test('does not treat database name types as their own kind', () => {
        // K, S, O and J belong to physical and logical files. They must fall
        // through to the generic handling so the name-type diagnostic reports
        // them instead of the parser silently accepting them.
        for (const nameType of ['K', 'S', 'O', 'J']) {
            const line = `     A          ${nameType} CUSNO`;
            const parsed = parseLine(line, 0);
            assert.strictEqual(parsed.nameType, nameType);
            assert.strictEqual(parsed.kind, 'field', `${nameType} should not get its own kind`);
        };
    });

    test("classifies comments via '*' in column 7", () => {
        assert.strictEqual(parseLine(COMMENT_LINE, 3).kind, 'comment');
    });

    test('classifies blank lines', () => {
        assert.strictEqual(parseLine('', 4).kind, 'blank');
        assert.strictEqual(parseLine('     ', 5).kind, 'blank');
    });

    test('classifies keyword continuation lines', () => {
        const line = '     A                                      COLOR(BLU)';
        assert.strictEqual(parseLine(line, 6).kind, 'keywordContinuation');
    });

    test('detects overflow past column 80', () => {
        const long = ' '.repeat(79) + 'AB';
        assert.strictEqual(parseLine(long, 7).overflows, true);
        const exact = ' '.repeat(75) + 'TEXTX';
        assert.strictEqual(parseLine(exact, 8).overflows, false);
    });
});

suite('DSPF assist: columnInfoAt (column service)', () => {

    test('maps cursor positions to regions', () => {
        // character is 0-based; column = character + 1
        assert.strictEqual(columnInfoAt(FIELD_LINE, 0, 5).region.id, 'formType');  // col 6
        assert.strictEqual(columnInfoAt(FIELD_LINE, 0, 17).region.id, 'reserved'); // col 18
    });

    test('maps key columns exactly', () => {
        const at = (character: number) => columnInfoAt(FIELD_LINE, 0, character).region.id;
        assert.strictEqual(at(0), 'sequence');          // col 1
        assert.strictEqual(at(16), 'nameType');         // col 17
        assert.strictEqual(at(18), 'name');             // col 19
        assert.strictEqual(at(27), 'name');             // col 28
        assert.strictEqual(at(28), 'reference');        // col 29
        assert.strictEqual(at(33), 'length');           // col 34
        assert.strictEqual(at(34), 'dataType');         // col 35
        assert.strictEqual(at(36), 'decimals');         // col 37
        assert.strictEqual(at(37), 'usage');            // col 38
        assert.strictEqual(at(40), 'locationLine');     // col 41
        assert.strictEqual(at(43), 'locationPosition'); // col 44
        assert.strictEqual(at(44), 'keywords');         // col 45
        assert.strictEqual(at(79), 'keywords');         // col 80
        assert.strictEqual(at(80), 'beyond');           // col 81
    });

    test('returns the raw text of the region', () => {
        const info = columnInfoAt(FIELD_LINE, 0, 20); // inside the name area
        assert.strictEqual(info.text.trim(), 'CUSNO');
    });
});

suite('DSPF assist: parseSource', () => {

    test('parses multiple lines with correct numbering', () => {
        const lines = parseSource([RECORD_LINE, FIELD_LINE, HELP_LINE].join('\n'));
        assert.strictEqual(lines.length, 3);
        assert.strictEqual(lines[0].kind, 'record');
        assert.strictEqual(lines[2].lineNumber, 2);
    });
});
