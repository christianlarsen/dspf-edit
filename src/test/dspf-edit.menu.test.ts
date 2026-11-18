import * as assert from 'assert';
import { getMenuMemberKind, getMenuMemberPair, isCmdPromptComment, findCmdPromptConstantLine, formatRowField, parseMenuCommands, menuOptionOfConstant, menuBottomLayout } from '../dspf-edit.utils/dspf-edit.menu';

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

suite('Menu commands member (MNUCMD)', () => {
    const qq = [
        'B_TDA000QQ,1',
        "0001+CALL PGM(BOSTON/BSWTDA01) PARM(('S' (*CHAR 1)) (0 (*DEC 3 0)) ('0' (*LGL 1)",
        '))',
        "0002 CALL PGM(BOSTON/BSWTDA68) PARM(' '  'S'  ' ')",
        '0004 ? WRKLNK',
        '0024 SIGNOFF'
    ];

    test('reads the header and one command per option', () => {
        const parsed = parseMenuCommands(qq);
        assert.strictEqual(parsed.header, 'B_TDA000QQ,1');
        assert.deepStrictEqual(parsed.commands.map(c => c.option), [1, 2, 4, 24]);
        assert.strictEqual(parsed.commands[1].command, "CALL PGM(BOSTON/BSWTDA68) PARM(' '  'S'  ' ')");
        assert.strictEqual(parsed.commands[2].command, '? WRKLNK');
        assert.deepStrictEqual([parsed.commands[3].firstLine, parsed.commands[3].lastLine], [5, 5]);
    });

    test('a + in column 5 glues the next line on, right where the first one was cut', () => {
        const first = parseMenuCommands(qq).commands[0];
        assert.strictEqual(first.command, "CALL PGM(BOSTON/BSWTDA01) PARM(('S' (*CHAR 1)) (0 (*DEC 3 0)) ('0' (*LGL 1)))");
        assert.deepStrictEqual([first.firstLine, first.lastLine], [1, 2]);
    });

    test('a continued line whose trailing blanks were trimmed gets them back', () => {
        const parsed = parseMenuCommands(['M,1', '0001+' + 'X'.repeat(70), 'Y']);
        assert.strictEqual(parsed.commands[0].command, 'X'.repeat(70) + '     Y');
    });

    test('option number constants of the menu image', () => {
        assert.strictEqual(menuOptionOfConstant('1.'), 1);
        assert.strictEqual(menuOptionOfConstant('10.'), 10);
        assert.strictEqual(menuOptionOfConstant('90. Sign Off'), 90);
        assert.strictEqual(menuOptionOfConstant('Mantenimiento de Tiendas'), undefined);
        assert.strictEqual(menuOptionOfConstant('3.5 kg'), undefined);
    });
});

suite('Bottom of the created menu (CRTMNU CMDLIN)', () => {
    const rowsOf = (kind: string, parts: ReturnType<typeof menuBottomLayout>) =>
        parts.filter(p => p.kind === kind).map(p => [p.row, p.col, p.length]);

    test('*LONG: "===>" under the prompt and 153 bytes over two lines', () => {
        const parts = menuBottomLayout(19, 2, { commandLine: '*LONG' });
        assert.deepStrictEqual(rowsOf('arrow', parts), [[20, 2, 4]]);
        assert.deepStrictEqual(rowsOf('entry', parts), [[20, 7, 74], [21, 2, 79]]);
    });

    test('*SHORT: one line of 73 bytes; *NONE: a 4-byte option line', () => {
        assert.deepStrictEqual(rowsOf('entry', menuBottomLayout(19, 2, { commandLine: '*SHORT' })), [[20, 7, 73]]);
        assert.deepStrictEqual(rowsOf('entry', menuBottomLayout(19, 2, { commandLine: '*NONE' })), [[20, 7, 4]]);
    });

    test('the command line never goes past the last row', () => {
        assert.deepStrictEqual(rowsOf('entry', menuBottomLayout(23, 2, { commandLine: '*LONG' })).map(r => r[0]), [24]);
    });
});
