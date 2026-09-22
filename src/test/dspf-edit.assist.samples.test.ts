/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	test/dspf-edit.assist.samples.test.ts
*/

import * as assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSource } from '../dspf-edit.assist/dspf-edit.column-parser';
import { checkSource } from '../dspf-edit.assist/dspf-edit.rules';

// Compiled tests run from out/test, so the repository root is two levels up. The
// fixtures deliberately live under src/ (committed, and kept out of the published
// .vsix by .vscodeignore) rather than in the gitignored samples/ folder, so a
// fresh clone and CI both have them.
const fixturesDir = join(__dirname, '..', '..', 'src', 'test', 'fixtures');

suite('DDS assist: whole-source fixtures are clean', () => {

    const files = readdirSync(fixturesDir);

    test('there are fixtures to check', () => {
        assert.ok(files.length > 0, `no DDS fixtures found in ${fixturesDir}`);
    });

    for (const file of files) {
        test(`${file} produces no diagnostics`, () => {
            const source = readFileSync(join(fixturesDir, file), 'utf8');
            const issues = checkSource(parseSource(source));
            assert.deepStrictEqual(
                issues,
                [],
                issues.map(i => `line ${i.line + 1}: ${i.code} ${i.message}`).join('\n')
            );
        });
    };
});
