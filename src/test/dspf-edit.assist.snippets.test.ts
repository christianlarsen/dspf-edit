/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	test/dspf-edit.assist.snippets.test.ts
*/

import * as assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLine } from '../dspf-edit.assist/dspf-edit.column-parser';
import { checkLine } from '../dspf-edit.assist/dspf-edit.rules';

interface Snippet {
    prefix: string;
    body: string[];
}

// Compiled tests run from out/test, so the repository root is two levels up.
const repoRoot = join(__dirname, '..', '..');

const snippets: Record<string, Snippet> = JSON.parse(
    readFileSync(join(repoRoot, 'snippets', 'dds.code-snippets'), 'utf8')
);

/** Renders a snippet line by substituting every placeholder with its default. */
function render(line: string, defaults: Map<string, string>): string {
    // First pass: ${n:default}
    let out = line.replace(/\$\{(\d+):([^}]*)\}/g, (_m, index: string, def: string) => {
        if (!defaults.has(index)) {
            defaults.set(index, def);
        };
        return defaults.get(index) ?? def;
    });
    // Second pass: bare $n mirrors
    out = out.replace(/\$(\d+)/g, (_m, index: string) => defaults.get(index) ?? '');
    return out;
}

suite('DDS assist: snippets', () => {

    test('every snippet renders to valid, column-aligned DDS', () => {
        for (const [name, snippet] of Object.entries(snippets)) {
            const defaults = new Map<string, string>();
            for (const bodyLine of snippet.body) {
                const rendered = render(bodyLine, defaults);
                if (rendered.trim() === '') {
                    continue;
                };

                // Column 6 must be 'A' on every rendered line.
                assert.strictEqual(rendered[5], 'A', `${name}: '${rendered}' column 6`);

                // No line may extend beyond column 80.
                assert.ok(rendered.length <= 80, `${name}: '${rendered}' is wider than 80 columns`);

                // The snippet must not trigger any of our own diagnostics.
                const issues = checkLine(parseLine(rendered, 0));
                assert.deepStrictEqual(
                    issues,
                    [],
                    `${name}: '${rendered}' produced ${issues.map(i => i.code).join(', ')}`
                );
            };
        };
    });

    test('keyword-only lines start their keywords exactly at column 45', () => {
        for (const [name, snippet] of Object.entries(snippets)) {
            const defaults = new Map<string, string>();
            for (const bodyLine of snippet.body) {
                const rendered = render(bodyLine, defaults);
                const parsed = parseLine(rendered, 0);
                if (parsed.kind !== 'keywordContinuation') {
                    continue;
                };
                const keywordArea = rendered.slice(44);
                assert.strictEqual(
                    keywordArea.startsWith(' '),
                    false,
                    `${name}: keywords of '${rendered}' should start at column 45`
                );
                assert.match(
                    rendered.slice(18, 44).trim(),
                    /^[\d ]*$/,
                    `${name}: '${rendered}' pre-keyword area`
                );
            };
        };
    });
});
