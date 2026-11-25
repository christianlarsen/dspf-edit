import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { findUsageIncompatibleKeywords, removeIncompatibleKeywords, applyFieldEdit } from '../dspf-edit.commands/dspf-edit.edit-field';
import { readSubfileMessages } from '../dspf-edit.commands/dspf-edit.add-error-messages';
import { findElementInsertionPoint } from '../dspf-edit.utils/dspf-edit.helper';

const KW = '     A'.padEnd(44, ' ');

function fieldOf(source: string[], name = 'FLD'): any {
    return (parseDocument(source.join('\n')) as any[]).find(el => el.kind === 'field' && el.name === name);
};

suite('Field usage', () => {
    const inputField = [
        '     A          R REC1',
        '     A            FLD            5Y 0B  5  2EDTCDE(Z)',
        KW + 'DSPATR(PR HI)',
        KW + 'VALUES(1 2 3)',
        '     A  50' + ' '.repeat(34) + 'CHECK(ME)',
        KW + 'COLOR(RED)',
        '     A            NEXT          10A  B  6  2'
    ];

    test('becoming output removes input-only keywords and only the input-only DSPATR values', () => {
        const removals = findUsageIncompatibleKeywords(fieldOf(inputField), 'O');
        assert.deepStrictEqual(removals.map(r => [r.attr.value, r.replacement]), [
            ['DSPATR(PR HI)', 'DSPATR(HI)'],
            ['VALUES(1 2 3)', undefined],
            ['CHECK(ME)', undefined]
        ]);
    });

    test('becoming input removes editing keywords', () => {
        const removals = findUsageIncompatibleKeywords(fieldOf(inputField), 'I');
        assert.deepStrictEqual(removals.map(r => r.attr.value), ['EDTCDE(Z)']);
    });

    test('becoming input/output keeps everything', () => {
        assert.strictEqual(findUsageIncompatibleKeywords(fieldOf(inputField), 'B').length, 0);
    });

    test('removing takes conditioned lines with their indicators and keeps the definition line', async () => {
        const document = await vscode.workspace.openTextDocument({ content: inputField.join('\n') });
        const editor = await vscode.window.showTextDocument(document);
        const field = fieldOf(inputField);
        assert.ok(await removeIncompatibleKeywords(editor, field, findUsageIncompatibleKeywords(field, 'O')));
        const lines = document.getText().split('\n').map(l => l.trimEnd());
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        assert.deepStrictEqual(lines, [
            '     A          R REC1',
            '     A            FLD            5Y 0B  5  2EDTCDE(Z)',
            KW + 'DSPATR(HI)',
            KW + 'COLOR(RED)',
            '     A            NEXT          10A  B  6  2'
        ]);
    });
});

suite('Edit Field menu changes', () => {
    async function apply(source: string[], change: (field: any) => any): Promise<string> {
        const document = await vscode.workspace.openTextDocument({ content: source.join('\n') });
        const editor = await vscode.window.showTextDocument(document);
        const field = fieldOf(source);
        const current = { name: field.name, isNumeric: true, size: { length: field.length, decimals: field.decimals }, usage: 'O' };
        assert.ok(await applyFieldEdit(editor, field, change(current)));
        const line = document.lineAt(field.lineIndex).text.trimEnd();
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        return line;
    };
    const source = ['     A          R REC1', '     A            FLD            5  0   5  2', '     A            NEXT          10A  B  6  2'];

    test('changing usage writes position 38 and leaves the rest', async () => {
        assert.strictEqual(await apply(source, c => ({ ...c, usage: 'B' })), '     A            FLD            5  0B  5  2');
    });

    test('changing the size of a numeric field with a blank type updates its decimals', async () => {
        assert.strictEqual(await apply(source, c => ({ ...c, size: { length: 7, decimals: 2 } })), '     A            FLD            7  2   5  2');
    });

    test('renaming changes only the name', async () => {
        assert.strictEqual(await apply(source, c => ({ ...c, name: 'AMOUNT' })), '     A            AMOUNT         5  0   5  2');
    });
});

suite('Subfile messages', () => {
    const source = [
        '     A          R SFL1                      SFL',
        '     A            OPT            1A  B  8  3',
        '     A          R CTL1                      SFLCTL(SFL1)',
        KW + 'SFLSIZ(0010)',
        KW + 'SFLPAG(0009)',
        '     A  40' + ' '.repeat(34) + "SFLMSG('Option not valid' 40)",
        '     A N41 42' + ' '.repeat(31) + "SFLMSG('It''s locked')",
        '     A            TITLE         20A  O  2  2'
    ];

    test('reads SFLMSG on the control record, with condition and response indicator', () => {
        const record = (parseDocument(source.join('\n')) as any[]).find(el => el.kind === 'record' && el.name === 'CTL1');
        assert.deepStrictEqual(readSubfileMessages(record).map(m => [m.text, m.responseIndicator]), [
            ['Option not valid', '40'],
            ["It's locked", undefined]
        ]);
        assert.ok(readSubfileMessages(record)[1].conditionText.length > 0);
    });

    test('new messages go after the record keywords, before its first field', async () => {
        const document = await vscode.workspace.openTextDocument({ content: source.join('\n') });
        const editor = await vscode.window.showTextDocument(document);
        const record = (parseDocument(source.join('\n')) as any[]).find(el => el.kind === 'record' && el.name === 'CTL1');
        const point = findElementInsertionPoint(editor, record);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        assert.strictEqual(point, 7);
    });
});
