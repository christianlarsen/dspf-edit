import * as assert from 'assert';
import { parseDocument } from '../dspf-edit.parser/dspf-edit.parser';
import { getMenuMemberKind, getMenuMemberPair, isCmdPromptComment, findCmdPromptConstantLine, formatRowField, parseMenuCommands, menuOptionOfConstant, menuBottomLayout, formatMenuCommandRecords, menuCommandEdit, menuCommandProblem, normalizeMenuCommand, buildNewMenuSource, formatMenuConstantLines, menuTitleColumn, menuLastTextRow, menuLastPromptRow, menuPlacementProblem, defaultNewMenuTexts, menuImageControlRecord, buildMenuCompileCommands, menuCommandsTooLong } from '../dspf-edit.utils/dspf-edit.menu';
import { findMenuPlacementProblems } from '../dspf-edit.validation/dspf-edit.menu-placement';

suite('Menu members (MNUDDS + MNUCMD)', () => {
    test('recognizes both member types, ignoring case', () => {
        assert.strictEqual(getMenuMemberKind('/samples/menu.mnudds'), 'dds');
        assert.strictEqual(getMenuMemberKind('/LIB/QMNUSRC/MENUQQ.MNUCMD'), 'commands');
        assert.strictEqual(getMenuMemberKind('/LIB/QDDSSRC/PANTALLA.DSPF'), undefined);
    });

    test('pairs a local menu image with its commands member, keeping the case', () => {
        assert.deepStrictEqual(getMenuMemberPair('/samples/menu.mnudds'), {
            menuName: 'menu',
            ddsPath: '/samples/menu.mnudds',
            commandsPath: '/samples/menuqq.mnucmd'
        });
    });

    test('pairs an IBM i commands member with its menu image', () => {
        assert.deepStrictEqual(getMenuMemberPair('/MYLIB/QMNUSRC/MENUQQ.MNUCMD'), {
            menuName: 'MENU',
            ddsPath: '/MYLIB/QMNUSRC/MENU.MNUDDS',
            commandsPath: '/MYLIB/QMNUSRC/MENUQQ.MNUCMD'
        });
        assert.strictEqual(getMenuMemberPair('/MYLIB/QMNUSRC/MENU.MNUDDS')?.commandsPath, '/MYLIB/QMNUSRC/MENUQQ.MNUCMD');
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
        "     A                                  1 72' TEST '"
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
        'MENUQQ,1',
        "0001+CALL PGM(APPLIB/APPPGM01) PARM(('S' (*CHAR 1)) (0 (*DEC 3 0)) ('0' (*LGL 1)",
        '))',
        "0002 CALL PGM(APPLIB/APPPGM68) PARM(' '  'S'  ' ')",
        '0004 ? WRKLNK',
        '0024 SIGNOFF'
    ];

    test('reads the header and one command per option', () => {
        const parsed = parseMenuCommands(qq);
        assert.strictEqual(parsed.header, 'MENUQQ,1');
        assert.deepStrictEqual(parsed.commands.map(c => c.option), [1, 2, 4, 24]);
        assert.strictEqual(parsed.commands[1].command, "CALL PGM(APPLIB/APPPGM68) PARM(' '  'S'  ' ')");
        assert.strictEqual(parsed.commands[2].command, '? WRKLNK');
        assert.deepStrictEqual([parsed.commands[3].firstLine, parsed.commands[3].lastLine], [5, 5]);
    });

    test('a + in column 5 glues the next line on, right where the first one was cut', () => {
        const first = parseMenuCommands(qq).commands[0];
        assert.strictEqual(first.command, "CALL PGM(APPLIB/APPPGM01) PARM(('S' (*CHAR 1)) (0 (*DEC 3 0)) ('0' (*LGL 1)))");
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
        assert.strictEqual(menuOptionOfConstant('Mantenimiento de clientes'), undefined);
        assert.strictEqual(menuOptionOfConstant('3.5 kg'), undefined);
    });
});

suite('Bottom of the created menu (CRTMNU CMDLIN and DSPKEY)', () => {
    const rowsOf = (kind: string, parts: ReturnType<typeof menuBottomLayout>) =>
        parts.filter(p => p.kind === kind).map(p => [p.row, p.col, p.length]);

    test('*LONG: "===>" on row 22 (20 with keys), 153 bytes: columns 7-80 and 1-79', () => {
        const parts = menuBottomLayout({ commandLine: '*LONG' });
        assert.deepStrictEqual(rowsOf('arrow', parts), [[22, 2, 4]]);
        assert.deepStrictEqual(rowsOf('entry', parts), [[22, 7, 74], [23, 1, 79]]);
        const withKeys = menuBottomLayout({ commandLine: '*LONG', functionKeys: true });
        assert.deepStrictEqual(rowsOf('arrow', withKeys), [[20, 2, 4]]);
        assert.deepStrictEqual(rowsOf('entry', withKeys).map(r => r[0]), [20, 21]);
    });

    test('*SHORT: "===>" on row 23 (21 with keys), 73 bytes from column 7', () => {
        assert.deepStrictEqual(rowsOf('entry', menuBottomLayout({ commandLine: '*SHORT' })), [[23, 7, 73]]);
        assert.deepStrictEqual(rowsOf('arrow', menuBottomLayout({ commandLine: '*SHORT', functionKeys: true })), [[21, 2, 4]]);
    });

    test('*NONE: no "===>", a 4-byte option field on row 22 (20 with keys)', () => {
        const parts = menuBottomLayout({ commandLine: '*NONE' });
        assert.deepStrictEqual(rowsOf('arrow', parts), []);
        assert.deepStrictEqual(rowsOf('entry', parts), [[22, 7, 4]]);
        assert.deepStrictEqual(rowsOf('entry', menuBottomLayout({ commandLine: '*NONE', functionKeys: true })), [[20, 7, 4]]);
    });

    test('the function keys go on rows 22-23, without F4 and F9 when there is no command line', () => {
        const keys = (commandLine: '*LONG' | '*NONE') => menuBottomLayout({ commandLine, functionKeys: true })
            .filter(p => p.kind === 'keys').map(p => [p.row, p.text]);
        assert.deepStrictEqual(keys('*LONG'), [
            [22, 'F3=Exit   F4=Prompt   F9=Retrieve   F12=Cancel'],
            [23, 'F13=Information Assistant  F16=System main menu']
        ]);
        assert.deepStrictEqual(keys('*NONE')[0], [22, 'F3=Exit   F12=Cancel']);
    });
});

suite('Where a menu\'s text can go', () => {
    const longNoKeys = { commandLine: '*LONG' as const };
    const longKeys = { commandLine: '*LONG' as const, functionKeys: true };

    test('text goes on rows 1-20, or 1-19 when the command line goes up to row 20', () => {
        assert.strictEqual(menuLastTextRow(longNoKeys), 20);
        assert.strictEqual(menuLastTextRow(longKeys), 19);
        assert.strictEqual(menuLastTextRow({ commandLine: '*SHORT', functionKeys: true }), 20);
        assert.strictEqual(menuLastTextRow({ commandLine: '*NONE', functionKeys: true }), 19);
        assert.strictEqual(menuPlacementProblem(20, 2, false, longNoKeys), undefined);
        assert.match(menuPlacementProblem(21, 2, false, longNoKeys) ?? '', /rows 1-20/);
        assert.match(menuPlacementProblem(20, 2, false, longKeys) ?? '', /rows 1-19/);
    });

    test('the prompt goes up to row 21, above the command line', () => {
        assert.strictEqual(menuPlacementProblem(21, 2, true, longNoKeys), undefined);
        assert.match(menuPlacementProblem(22, 2, true, longNoKeys) ?? '', /rows 1-21/);
        assert.match(menuPlacementProblem(21, 2, true, longKeys) ?? '', /rows 1-19, above the command line and the function keys/);
        assert.strictEqual(menuLastPromptRow({ commandLine: '*SHORT', functionKeys: true }), 20);
    });

    test('row 1, column 1 is reserved', () => {
        assert.match(menuPlacementProblem(1, 1, false, longNoKeys) ?? '', /reserved/);
        assert.strictEqual(menuPlacementProblem(1, 2, false, longNoKeys), undefined);
    });
});

suite('Writing menu commands (MNUCMD)', () => {
    const qq = [
        'MENUQQ,1',
        "0001+CALL PGM(APPLIB/APPPGM01) PARM(('S' (*CHAR 1)) (0 (*DEC 3 0)) ('0' (*LGL 1)",
        '))',
        '0004 CALL PGM(APPLIB/APPPGM25)',
        '0024 SIGNOFF'
    ];
    const apply = (lines: readonly string[], edit: ReturnType<typeof menuCommandEdit>) => {
        const result = [...lines];
        result.splice(edit.startLine, edit.deleteCount, ...edit.lines);
        return result;
    };

    test('a long command is cut at column 80 and goes on in the next line, as SDA writes it', () => {
        const command = "CALL PGM(APPLIB/APPPGM01) PARM(('S' (*CHAR 1)) (0 (*DEC 3 0)) ('0' (*LGL 1)))";
        assert.deepStrictEqual(formatMenuCommandRecords(1, command), [qq[1], '))']);
        assert.deepStrictEqual(formatMenuCommandRecords(90, 'SIGNOFF'), ['0090 SIGNOFF']);
        assert.deepStrictEqual(parseMenuCommands(['M,1', ...formatMenuCommandRecords(1, command)]).commands[0].command, command);
    });

    test('changing an option replaces only its lines, continuation included', () => {
        assert.deepStrictEqual(apply(qq, menuCommandEdit(qq, 'MENUQQ', 1, 'DSPLIBL')),
            ['MENUQQ,1', '0001 DSPLIBL', '0004 CALL PGM(APPLIB/APPPGM25)', '0024 SIGNOFF']);
    });

    test('a new option goes in order, and an empty command removes the option', () => {
        assert.deepStrictEqual(apply(qq, menuCommandEdit(qq, 'MENUQQ', 5, 'WRKSPLF')).slice(3),
            ['0004 CALL PGM(APPLIB/APPPGM25)', '0005 WRKSPLF', '0024 SIGNOFF']);
        assert.deepStrictEqual(apply(qq, menuCommandEdit(qq, 'MENUQQ', 90, 'SIGNOFF')).slice(-1), ['0090 SIGNOFF']);
        assert.deepStrictEqual(apply(qq, menuCommandEdit(qq, 'MENUQQ', 4, '  ')),
            [qq[0], qq[1], qq[2], '0024 SIGNOFF']);
    });

    test('an empty member gets its header first', () => {
        assert.deepStrictEqual(apply([''], menuCommandEdit([''], 'nuevoqq', 1, '?WRKLNK')), ['NUEVOQQ,1', '0001 ?WRKLNK']);
        assert.deepStrictEqual(apply(['NUEVOQQ,1'], menuCommandEdit(['NUEVOQQ,1'], 'NUEVOQQ', 3, 'GO MAIN')), ['NUEVOQQ,1', '0003 GO MAIN']);
    });

    test('commands longer than one continuation line are refused', () => {
        assert.strictEqual(menuCommandProblem('X'.repeat(155)), undefined);
        assert.match(menuCommandProblem('X'.repeat(156)) ?? '', /up to 155/);
        assert.strictEqual(normalizeMenuCommand(' CALL PGM(A)\n   PARM(1) '), 'CALL PGM(A) PARM(1)');
    });
});

suite('Menu image control record (SDA3630)', () => {
    test('the first line is written exactly as SDA expects it, case included', () => {
        assert.strictEqual(menuImageControlRecord('test1'), '     A* Free Form Menu: TEST1');
        assert.strictEqual(buildNewMenuSource('test1', defaultNewMenuTexts('test1'))[0], '     A* Free Form Menu: TEST1');
    });
});

suite('New menu (SDA default menu image)', () => {
    const texts = { title: 'MENU Menu', selectText: 'Select one of the following:', promptText: 'Selección o mandato' };
    const source = buildNewMenuSource('menu', texts);

    test('the prompt is written as SDA writes it: 38 characters, cut at column 80, row 021', () => {
        const start = source.findIndex(isCmdPromptComment);
        assert.deepStrictEqual(source.slice(start + 1), [
            "     A                                021  2'Selección o mandato               -",
            "     A                                          '"
        ]);
    });

    test('the title is centered as SDA does, and options 1. to 10. go on rows 5-14', () => {
        assert.ok(source.includes("     A                                  1 34'MENU Menu'"));
        assert.strictEqual(menuTitleColumn('PRTCTL MENU'), 33);
        assert.ok(source.includes("     A                                  5  7'1.'"));
        assert.ok(source.includes("     A                                 14  6'10.'"));
    });

    test('the parser reads it as a menu with its record, prompt and option numbers', () => {
        const elements = parseDocument(source.join('\n'));
        assert.deepStrictEqual(elements.filter(e => e.kind === 'record').map(e => (e as { name: string }).name), ['MENU']);
        const promptLine = findCmdPromptConstantLine(source);
        const prompt = elements.find(e => e.kind === 'constant' && e.lineIndex === promptLine) as { row: number; column: number } | undefined;
        assert.deepStrictEqual([prompt?.row, prompt?.column], [21, 2]);
        const options = elements
            .filter(e => e.kind === 'constant')
            .map(e => menuOptionOfConstant(String((e as { name: string }).name).replace(/^'|'$/g, '')))
            .filter(o => o !== undefined);
        assert.deepStrictEqual(options, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test('long texts go on with "-" at column 80, quotes doubled', () => {
        const lines = formatMenuConstantLines('3', 2, "Seleccione una de las siguientes opciones");
        assert.deepStrictEqual(lines, [
            "     A                                  3  2'Seleccione una de las siguientes o-",
            "     A                                      pciones'"
        ]);
        assert.deepStrictEqual(formatMenuConstantLines('1', 2, "Menu d'Alex"), ["     A                                  1  2'Menu d''Alex'"]);
    });
});

suite('Menu text on reserved rows (source check)', () => {
    const source = buildNewMenuSource('menu', defaultNewMenuTexts('menu'));

    test('a new menu has nothing out of place, whatever the options', () => {
        assert.deepStrictEqual(findMenuPlacementProblems(source, { commandLine: '*LONG' }), []);
    });

    test('text on row 22, or the prompt below the command line, is reported', () => {
        const withText = [...source, "     A                                 22  2'Debajo'"];
        assert.deepStrictEqual(findMenuPlacementProblems(withText, { commandLine: '*LONG' }).map(p => p.lineIndex), [withText.length - 1]);
        const promptLine = findCmdPromptConstantLine(source) ?? -1;
        assert.deepStrictEqual(findMenuPlacementProblems(source, { commandLine: '*LONG', functionKeys: true }).map(p => p.lineIndex), [promptLine]);
    });
});

suite('Compiling a menu (CRTDSPF, message file, CRTMNU)', () => {
    const source = {
        sourceLibrary: 'mylib', sourceFile: 'qmnusrc', menuName: 'test2', library: 'objlib',
        commands: [{ option: 1, command: 'WRKACTJOB' }, { option: 90, command: "CALL PGM(APPLIB/PGM2) PARM('S')" }],
        options: { commandLine: '*SHORT' as const, functionKeys: true }
    };

    test('builds each step, a message per option with its quotes doubled', () => {
        const commands = buildMenuCompileCommands(source);
        assert.strictEqual(commands.crtdspf, 'CRTDSPF FILE(OBJLIB/TEST2) SRCFILE(MYLIB/QMNUSRC) SRCMBR(TEST2)');
        assert.strictEqual(commands.crtmsgf, 'CRTMSGF MSGF(OBJLIB/TEST2)');
        assert.deepStrictEqual(commands.addmsgd.map(a => a.command), [
            "ADDMSGD MSGID(USR0001) MSGF(OBJLIB/TEST2) MSG('WRKACTJOB')",
            "ADDMSGD MSGID(USR0090) MSGF(OBJLIB/TEST2) MSG('CALL PGM(APPLIB/PGM2) PARM(''S'')')"
        ]);
        assert.strictEqual(commands.crtmnu, 'CRTMNU MENU(OBJLIB/TEST2) TYPE(*DSPF) DSPF(OBJLIB/TEST2) MSGF(OBJLIB/TEST2) CMDLIN(*SHORT) DSPKEY(*YES)');
    });

    test('commands longer than a message can hold are found', () => {
        assert.deepStrictEqual(menuCommandsTooLong([{ option: 1, command: 'X'.repeat(132) }, { option: 2, command: 'X'.repeat(133) }]), [2]);
    });
});
