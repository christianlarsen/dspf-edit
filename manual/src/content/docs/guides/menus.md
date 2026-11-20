---
title: Menus
description: "Design IBM i menus (MNUDDS + MNUCMD) as you design screens: the menu image in the preview, each option's command, and new menus from scratch."
---

Besides display files, DSPF-edit works with **menus**: the ones created with `CRTMNU TYPE(*DSPF)`, which STRSDA designs with its **Design menus** option. You see the menu in the [Screen Preview](/dspf-edit/guides/screen-preview/) as it will look, change its texts and colors, and set the command each option runs, without leaving VS Code.

## What a menu is made of

A menu is two source members, in the same source file (usually `QMNUSRC`):

| Member | Type | What it holds |
| --- | --- | --- |
| `MENU` | `MNUDDS` | The **menu image**: a display file with one record, named like the menu, with the menu's title, its options and their texts. |
| `MENUQQ` | `MNUCMD` | The **menu commands**: the command each option (01 to 99) runs. Always named like the menu plus `QQ`. |

A menu on the system is three objects, all named like the menu: the display file (`*FILE`) made from the menu image, a message file (`*MSGF`) with one message per option's command, and the menu itself (`*MENU`). See [Creating the menu object](#creating-the-menu-object).

As in STRSDA, both members are the same menu: open either one and you're working with the menu.

## Opening a menu

- Open a member of type `MNUDDS` from Code for i (or a local `.mnudds` file) and it opens as a menu: the [Schema Tree](/dspf-edit/guides/schema-tree/) and the preview work as with any display file.
- Open the commands member (`MNUCMD`, `.mnucmd`) and the menu image opens too, in front of it, with its tree and preview. This only happens the first time it's opened: click its tab afterwards to look at its source. Its commands are worked with from the [Menu Commands](#menu-commands) panel.

You can tell you're working with a menu:

- The tree's title says **Menu MENU** next to **Definition**, and its first node is **Menu (MENU.MNUDDS)** instead of **File (...)**.
- The preview's tab is **Preview: MENU (menu)**.

:::note
Code for i opens members with their type as the extension (`.MNUDDS`, `.MNUCMD`), and DSPF-edit recognizes them. Local files need the `.mnudds` and `.mnucmd` extensions.
:::

## What can be changed on a menu

A menu image only takes what STRSDA allows on it: **constants**, with their colors and display attributes. So, on a menu, the tree and the preview only offer what applies:

- **Available**: New Constant, Edit Constant, Copy Constant, Fill Constant, Change Position, Center, Colors, Attributes, Sort Elements, Delete, and the preview.
- **Not offered**: new fields, indicators, command keys, new, copied or renamed records (the record is named like the menu), windows, overlays, display sizes, and the reference file.

In the preview, the **+ Field** button and the **Format** selector aren't shown: a menu always shows at 24 x 80.

### The menu's size

A new menu, as STRSDA creates it, declares two display sizes, `DSPSIZ(24 80 *DS3 27 132 *DS4)`, and its record has `DSPMOD(*DS3)`. That's on purpose: `DSPMOD` shows the record at 24 x 80, and the DDS reference only allows it when both sizes are declared. The menu is always shown at 24 x 80.

## The command line prompt

Every menu has a text above its command line, **Selection or command** in English. STRSDA marks it with a comment right before it, in the language of the system:

```
     A* CMDPROMPT  Do not delete this DDS spec.
     A                                021  2'Selection or command              -
     A                                          '
```

The comment is how the system finds it, so DSPF-edit takes care of it:

- It can't be deleted, from the tree or the preview. Its text can be changed and it can be moved.
- STRSDA writes its line with a leading zero (`021`, `019`). Moving it keeps the zero.
- **Sort Elements** keeps the comment right above it. (Sorting no longer drops comment lines between elements of any display file.)
- The text is up to 38 characters, padded with blanks.

## The preview of a menu

### The command line

Under the prompt, the created menu shows a command line, `===>`, and the preview draws it there. It isn't in the source: it comes from the `CMDLIN` parameter of `CRTMNU`. Choose it in the preview's toolbar, **Command line**:

| Choice | `CMDLIN` | What the menu shows |
| --- | --- | --- |
| **Long** (the default, as in `CRTMNU`) | `*LONG` | A 153-character command line, over two lines. |
| **Short** | `*SHORT` | A 73-character command line, on one line. |
| **None** | `*NONE` | No command line, just a 4-character option line. |

The choice is remembered for each menu. It can't be selected or moved: move the prompt and it follows.

The function keys `CRTMNU` can add at the bottom (`DSPKEY(*YES)`) aren't drawn: their texts depend on the system's language.

### Each option's command

Hover an option number in the preview (`1.`, `10.`, or a constant like `90. Sign off`) to see the command it runs, read from the commands member: `Option 1: CALL PGM(APPLIB/APPPGM01)`. An option shown on the menu without a command says `Option 22: no command`. Edit the commands member and the preview follows at once, even before saving it.

## Menu Commands

The **Menu Commands** panel is where each option's command is set, like STRSDA's **F10=Work with commands**. Open it with the **☰ Commands** button in the preview's toolbar, or by right-clicking the menu's record or the **Menu** node in the tree and choosing **Menu Commands**.

It lists the options that have a command or that the menu shows. Check **Show all options (01-99)** to see every one.

- Type the command in an option's box. It's saved when you leave the box or press `Enter`; `Escape` puts back what it had.
- Leave the box empty to remove the option's command.
- A command starting with `?` is prompted before it runs (`?WRKLNK`).
- Commands are kept as you type them; they aren't changed to upper case.
- A command can be up to 155 characters long.

Next to each option, a warning when something doesn't match:

- **⚠ No command**: the menu shows this option's number, but it has no command.
- **⚠ Not on the menu**: the option has a command, but the menu doesn't show its number.

Each change is written straight into the commands member and saved, touching only that option's lines. **Open the commands member** shows its source.

:::caution
The panel can't be opened while the preview is in **Focus** mode, as with the **⚙ Configuration** panel: opening it beside the preview would take the preview out of Focus mode. Turn Focus off first.
:::

### How the commands member is written

DSPF-edit writes it as STRSDA does, so STRSDA can still open the menu:

```
MENUQQ,1
0001+CALL PGM(APPLIB/APPPGM01) PARM(('S' (*CHAR 1)) (0 (*DEC 3 0)) ('0' (*LGL 1)
))
0002 CALL PGM(APPLIB/APPPGM68)
0024 SIGNOFF
```

- The first line is the member's name and `,1`.
- Then one line per option with a command, in order: the option in 4 digits, a blank, and the command.
- A command longer than 75 characters has a `+` instead of the blank and goes on in the next line, which is glued on exactly where the first one was cut, at column 80.
- Options without a command have no line.

### When the commands member doesn't exist

The first time **Menu Commands** is opened for a menu without its `MENUQQ` member, it offers to create it:

- **On the IBM i**: it asks, and then creates the member in the same source file with `ADDPFM` (type `MNUCMD`), through your Code for i connection. If the system refuses it, its message is shown.
- **A local file**: it asks, and creates `menuqq.mnucmd` next to the menu.

Either way, it starts with its first line, `MENUQQ,1`.

## Creating a new menu

1. Create the menu image member, of type `MNUDDS` (for example, `MENU` in `QMNUSRC`, from Code for i), or a local `menu.mnudds`.
2. Open it. While it's empty, DSPF-edit offers to create the menu, in a message and with the **+** button on **Records** in the tree (also on the right-click menu of **Records** and of the **Menu** node, and as **DSPF Edit: Create Menu** in the command palette).
3. It asks for three texts, with STRSDA's English ones already filled in: the **title** (`MENU Menu`), the **text above the options** (`Select one of the following:`) and the **text above the command line** (`Selection or command`, up to 38 characters).
4. It writes the menu STRSDA creates:
   - The menu's name on row 1, column 2, and the title centered on row 1.
   - The text above the options on row 3, and the options `1.` to `10.` on rows 5 to 14.
   - The command line prompt, with its `A* CMDPROMPT` comment, on row 21.
   - The file and record keywords STRSDA uses on menus: `DSPSIZ`, `CHGINPDFT`, `INDARA`, `PRINT`, `DSPMOD(*DS3)`, `LOCK`, `SLNO(01)`, `CLRL(*ALL)`, `ALWROL`, `CF03`, `HELP`, `HOME` and `HLPRTN`.

The change is left unsaved, like any other edit. Then add each option's text next to its number as constants, and set their commands with **☰ Commands**, which offers to create the commands member.

## Creating the menu object

DSPF-edit doesn't create the menu on the system yet. STRSDA does it when you leave it; without it, `CRTMNU TYPE(*DSPF)` doesn't compile the members: it uses a display file and a message file that must already exist. Once both members are saved, it takes three steps:

1. Create the display file from the menu image:

   ```
   CRTDSPF FILE(MYLIB/MENU) SRCFILE(MYLIB/QMNUSRC) SRCMBR(MENU)
   ```

2. Create the message file, with one message per option holding its command: `USR0001` for option 1, `USR0090` for option 90.

   ```
   CRTMSGF MSGF(MYLIB/MENU)
   ADDMSGD MSGID(USR0001) MSGF(MYLIB/MENU) MSG('CALL PGM(MYLIB/PGM1)')
   ADDMSGD MSGID(USR0090) MSGF(MYLIB/MENU) MSG('SIGNOFF')
   ```

   A quote inside a command is written twice in `MSG`: `MSG('CALL PGM(PGM2) PARM(''S'')')`.

3. Create the menu, with the command line chosen in the preview:

   ```
   CRTMNU MENU(MYLIB/MENU) TYPE(*DSPF) DSPF(MYLIB/MENU) MSGF(MYLIB/MENU) CMDLIN(*LONG)
   ```

Run it with `GO MENU(MYLIB/MENU)`. The message file goes with the menu: copying the menu to another system needs it too.

## Not available yet

- **Menu help** (STRSDA's **Work with menu help**).
- Creating the menu object from DSPF-edit.
- Drawing the function keys of `DSPKEY(*YES)` in the preview.
