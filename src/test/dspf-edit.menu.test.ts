import * as assert from 'assert';
import { getMenuMemberKind, getMenuMemberPair, isCmdPromptComment, findCmdPromptConstantLine, formatRowField } from '../dspf-edit.utils/dspf-edit.menu';

suite('Menu members (MNUDDS + MNUCMD)', () => {
    test('recognizes both member types, ignoring case', () => {
        assert.strictEqual(getMenuMemberKind('/samples/b_tda000.mnudds'), 'dds');
        assert.strictEqual(getMenuMemberKind('/LIB/QMNUSRC/B_TDA000QQ.MNUCMD'), 'commands');
        assert.strictEqual(getMenuMemberKind('/LIB/QDDSSRC/PANTALLA.DSPF'), undefined);
    });

    test('pairs a local menu image with its commands member, keeping the case', () => {
        assert.deepStrictEqual(getMenuMemberPair('/samples/b_tda000.mnudds'), {
            menuName: 'b_tda000',
            ddsPath: '/samples/b_tda000.mnudds',
            commandsPath: '/samples/b_tda000qq.mnucmd'
        });
    });

    test('pairs an IBM i commands member with its menu image', () => {
        assert.deepStrictEqual(getMenuMemberPair('/BOSTON/QMNUSRC/B_TDA000QQ.MNUCMD'), {
            menuName: 'B_TDA000',
            ddsPath: '/BOSTON/QMNUSRC/B_TDA000.MNUDDS',
            commandsPath: '/BOSTON/QMNUSRC/B_TDA000QQ.MNUCMD'
        });
        assert.strictEqual(getMenuMemberPair('/BOSTON/QMNUSRC/B_TDA000.MNUDDS')?.commandsPath, '/BOSTON/QMNUSRC/B_TDA000QQ.MNUCMD');
    });

    test('a commands member not ending in QQ, or other members, have no pair', () => {
        assert.strictEqual(getMenuMemberPair('/LIB/QMNUSRC/OTRO.MNUCMD'), undefined);
        assert.strictEqual(getMenuMemberPair('/LIB/QMNUSRC/QQ.MNUCMD'), undefined);
        assert.strictEqual(getMenuMemberPair('/LIB/QDDSSRC/PANTALLA.DSPF'), undefined);
    });
});

suite('Menu command line prompt (CMDPROMPT)', () => {
    const source = [
        "     A                                 14  6'10.'",
        '     A* CMDPROMPT  No suprima esta especificación DDS.',
        "     A                                021  2'Selección o mandato               -",
        "     A                                          '",
        "     A                                  1 72' BOSTON '"
    ];

    test('finds the constant after the comment, whatever language the comment is in', () => {
        assert.strictEqual(findCmdPromptConstantLine(source), 2);
        assert.strictEqual(isCmdPromptComment('     A* CMDPROMPT  Diese DDS-Spez. nicht löschen'), true);
        assert.strictEqual(isCmdPromptComment('     A*%%TS  SD  20260925  104603  RNR'), false);
        assert.strictEqual(isCmdPromptComment("     A                                021  2'CMDPROMPT'"), false);
    });

    test('a display file without the comment has no command line prompt', () => {
        assert.strictEqual(findCmdPromptConstantLine([source[0], source[4]]), undefined);
    });

    test('a new row keeps the way the row was written', () => {
        assert.strictEqual(formatRowField(19, '021'), '019');
        assert.strictEqual(formatRowField(5, '021'), '005');
        assert.strictEqual(formatRowField(19, ' 21'), ' 19');
        assert.strictEqual(formatRowField(7, '  1'), '  7');
    });
});
