import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { readFormat, pasteFormat, FormatParts } from '../dspf-edit.commands/dspf-edit.copy-format';

const ALL: FormatParts = { colors: true, attributes: true, elementIndicators: true, editing: false, keepIndicators: true };
const EDITING_ONLY: FormatParts = { colors: false, attributes: false, elementIndicators: false, editing: true, keepIndicators: true };

/** Opens the source in an editor, copies SRC's format and pastes it onto the targets named. */
async function paste(source: string[], targetNames: string[], parts: FormatParts): Promise<string[]> {
    const document = await vscode.workspace.openTextDocument({ content: source.join('\n') });
    const editor = await vscode.window.showTextDocument(document);
    const elements = parseDocument(document.getText()) as any[];
    const named = (name: string) => elements.find(el => (el.kind === 'field' || el.kind === 'constant') && el.name === name);

    await pasteFormat(editor, targetNames.map(named), readFormat(named('SRC'), parts, document.uri.toString()));
    const lines = document.getText().split('\n');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    return lines;
};

suite('Copy Format / Paste Format', () => {
    test('replaces colors and attributes, keeping their indicators, OR conditions included', async () => {
        const lines = await paste([
            '     A          R REC1',
            '     A            SRC           10A  O  5  2',
            '     A  30                                  COLOR(RED)',
            '     A  40',
            '     AON41 42                               DSPATR(UL HI)',
            '     A            TGT           10A  O  6  2COLOR(BLU)',
            '     A                                      DSPATR(RI)',
            '     A            NEXT          10A  O  7  2'
        ], ['TGT'], { ...ALL, elementIndicators: false });

        assert.deepStrictEqual(lines.slice(5), [
            '     A            TGT           10A  O  6  2',
            '     A  30                                  COLOR(RED)',
            '     A  40',
            '     AON41 42                               DSPATR(UL HI)',
            '     A            NEXT          10A  O  7  2'
        ]);
    });

    test('without indicators: one color, attributes merged, element indicators copied', async () => {
        const lines = await paste([
            '     A          R REC1',
            '     A  50        SRC           10A  O  5  2',
            '     A  30                                  COLOR(RED)',
            '     A N30                                  COLOR(WHT)',
            '     A  31                                  DSPATR(HI)',
            '     A                                      DSPATR(UL HI)',
            '     A            TGT           10A  O  6  2',
            '     A            NEXT          10A  O  7  2'
        ], ['TGT'], { ...ALL, keepIndicators: false });

        assert.deepStrictEqual(lines.slice(6), [
            '     A  50        TGT           10A  O  6  2',
            '     A                                      COLOR(RED)',
            '     A                                      DSPATR(HI UL)',
            '     A            NEXT          10A  O  7  2'
        ]);
    });

    test('drops attributes a constant cannot take, and pastes on several targets', async () => {
        const lines = await paste([
            '     A          R REC1',
            '     A            SRC           10A  B  5  2DSPATR(UL PR)',
            "     A                                  6  2'Name'",
            '     A            TGT           10A  B  7  2',
            '     A  60        LAST          10A  O  8  2'
        ], ["'Name'", 'TGT'],{ ...ALL, colors: false, elementIndicators: false });

        assert.deepStrictEqual(lines.slice(2), [
            "     A                                  6  2'Name'",
            '     A                                      DSPATR(UL)',
            '     A            TGT           10A  B  7  2',
            '     A                                      DSPATR(UL PR)',
            '     A  60        LAST          10A  O  8  2'
        ]);
    });

    test('goes in above the indicator lines of the next element', async () => {
        const lines = await paste([
            '     A          R REC1',
            '     A            SRC           10A  O  5  2COLOR(PNK)',
            '     A            TGT           10A  O  6  2',
            '     A  01 02 03',
            '     A  04        NEXT          10A  O  7  2'
        ], ['TGT'], { ...ALL, attributes: false, elementIndicators: false });

        assert.deepStrictEqual(lines.slice(2), [
            '     A            TGT           10A  O  6  2',
            '     A                                      COLOR(PNK)',
            '     A  01 02 03',
            '     A  04        NEXT          10A  O  7  2'
        ]);
    });

    test('number editing goes only on numeric fields it fits, replacing theirs; S becomes Y', async () => {
        const lines = await paste([
            '     A          R REC1',
            '     A            SRC            9Y 2O  5  2EDTCDE(J)',
            '     A            NUM            7Y 0O  6  2',
            "     A                                      EDTWRD('    0 ')",
            '     A            ALPHA         10A  O  7  2',
            '     A            ZONED          5S 0O  8  2',
            '     A            PACKED         5P 0O  8 20',
            '     A            DEFLT          5Y 0B  9  2DFT(0)',
            '     A            LAST           3Y 0O 10  2'
        ], ['NUM', 'ALPHA', 'ZONED', 'PACKED', 'DEFLT'], EDITING_ONLY);

        assert.deepStrictEqual(lines.slice(2), [
            '     A            NUM            7Y 0O  6  2',
            '     A                                      EDTCDE(J)',
            '     A            ALPHA         10A  O  7  2',
            '     A            ZONED          5Y 0O  8  2',
            '     A                                      EDTCDE(J)',
            '     A            PACKED         5P 0O  8 20',
            '     A            DEFLT          5Y 0B  9  2DFT(0)',
            '     A            LAST           3Y 0O 10  2'
        ]);
    });

    test('edit code W/Y and edit word must fit the length; edit mask needs same size and input', async () => {
        const lines = await paste([
            '     A          R REC1',
            "     A            SRC            6Y 0B  5  2EDTWRD('  /  /  ')",
            "     A                                      EDTMSK('  &  &  ')",
            '     A            SAMEB          6Y 0B  6  2',
            '     A            SAMEO          6  0O  7  2',
            '     A            SHORT          5Y 0B  8  2EDTCDE(Y)',
            '     A            LAST           3Y 0O 10  2'
        ], ['SAMEB', 'SAMEO', 'SHORT'], EDITING_ONLY);

        assert.deepStrictEqual(lines.slice(3), [
            '     A            SAMEB          6Y 0B  6  2',
            "     A                                      EDTWRD('  /  /  ')",
            "     A                                      EDTMSK('  &  &  ')",
            '     A            SAMEO          6  0O  7  2',
            "     A                                      EDTWRD('  /  /  ')",
            '     A            SHORT          5Y 0B  8  2EDTCDE(Y)',
            '     A            LAST           3Y 0O 10  2'
        ]);
    });

    test('copying a field with no editing takes the targets\' own away', async () => {
        const lines = await paste([
            '     A          R REC1',
            '     A            SRC            9Y 2O  5  2',
            '     A            NUM            7Y 0O  6  2EDTCDE(J)',
            '     A                                      COLOR(RED)',
            '     A            LAST           3Y 0O 10  2'
        ], ['NUM'], EDITING_ONLY);

        assert.deepStrictEqual(lines.slice(2), [
            '     A            NUM            7Y 0O  6  2',
            '     A                                      COLOR(RED)',
            '     A            LAST           3Y 0O 10  2'
        ]);
    });
});
