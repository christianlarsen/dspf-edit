import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { paginateKeywordText, replaceKeywordTextInLines } from '../dspf-edit.utils/dspf-edit.helper';
import { removeWholeKeyword } from '../dspf-edit.commands/dspf-edit.conditioned-keywords';

const LONG_ERRMSG = "ERRMSG('Customer not found in the customer master file' 50)";
const KEYWORD_LINE = '     A'.padEnd(44, ' ');

/** A long ERRMSG on lines of its own, continued, with its condition on its first line. */
function longErrmsgLines(indicators: string): string[] {
    return paginateKeywordText(LONG_ERRMSG).map((chunk, i) => (i === 0 ? `     A${indicators}`.padEnd(44, ' ') : KEYWORD_LINE) + chunk);
};

/** Opens the source in an editor, runs the edit on field FLD's ERRMSG and returns the lines. */
async function edit(source: string[], run: (editor: vscode.TextEditor, field: any, errmsg: any) => Promise<boolean>): Promise<string[]> {
    const document = await vscode.workspace.openTextDocument({ content: source.join('\n') });
    const editor = await vscode.window.showTextDocument(document);
    const field = (parseDocument(document.getText()) as any[]).find(el => el.kind === 'field' && el.name === 'FLD');
    const errmsg = field.attributes.find((attr: any) => attr.value.startsWith('ERRMSG'));

    assert.ok(await run(editor, field, errmsg));
    const lines = document.getText().split('\n');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    return lines;
};

suite('Error messages', () => {
    test('a long ERRMSG is read whole, across its continuation lines', () => {
        const field = (parseDocument([
            '     A          R REC1',
            '     A            FLD           10A  B  5  2',
            ...longErrmsgLines('  50'),
            '     A            NEXT          10A  B  6  2'
        ].join('\n')) as any[]).find(el => el.kind === 'field' && el.name === 'FLD');

        const errmsg = field.attributes.find((attr: any) => attr.value.startsWith('ERRMSG'));
        assert.strictEqual(errmsg.value, LONG_ERRMSG);
        assert.strictEqual(errmsg.lastLineIndex - errmsg.lineIndex, 1);
    });

    test('removing a continued ERRMSG on lines of its own removes them all, with its OR condition', async () => {
        const lines = await edit([
            '     A          R REC1',
            '     A            FLD           10A  B  5  2',
            '     A                                      DSPATR(HI)',
            '     A  40',
            ...longErrmsgLines(' O50'),
            '     A            NEXT          10A  B  6  2'
        ], (editor, field, errmsg) => removeWholeKeyword(editor, field, {
            keywordText: errmsg.value, lineIndex: errmsg.lineIndex, lastLineIndex: errmsg.lastLineIndex
        }));

        assert.deepStrictEqual(lines, [
            '     A          R REC1',
            '     A            FLD           10A  B  5  2',
            '     A                                      DSPATR(HI)',
            '     A            NEXT          10A  B  6  2'
        ]);
    });

    test('changing a message keeps its indicators on its first line only', async () => {
        const lines = await edit([
            '     A          R REC1',
            '     A            FLD           10A  B  5  2',
            "     A  50                                  ERRMSG('Not found' 50)",
            '     A            NEXT          10A  B  6  2'
        ], (editor, _field, errmsg) => replaceKeywordTextInLines(editor, errmsg.lineIndex, errmsg.lastLineIndex, errmsg.value, LONG_ERRMSG));

        assert.deepStrictEqual(lines, [
            '     A          R REC1',
            '     A            FLD           10A  B  5  2',
            ...longErrmsgLines('  50'),
            '     A            NEXT          10A  B  6  2'
        ]);
    });

    test('rewriting a continued message leaves its continuation line without indicators', async () => {
        const shorter = "ERRMSG('Customer not found in the master file' 50)";
        const lines = await edit([
            '     A          R REC1',
            '     A            FLD           10A  B  5  2',
            ...longErrmsgLines('  50'),
            '     A            NEXT          10A  B  6  2'
        ], (editor, _field, errmsg) => replaceKeywordTextInLines(editor, errmsg.lineIndex, errmsg.lastLineIndex, errmsg.value, shorter));

        assert.deepStrictEqual(lines.slice(2, -1), paginateKeywordText(shorter).map((chunk, i) => (i === 0 ? '     A  50'.padEnd(44, ' ') : KEYWORD_LINE) + chunk));
        assert.strictEqual(lines.length, 5);
    });
});
