---
title: Fields
description: Adding, editing, positioning, conditioning, and styling fields.
---

Fields are shown under their record in the [Schema Tree](/dspf-edit/guides/schema-tree/), listing name, length, type, position (row/column), and flags such as *referenced* or *hidden*.

## Add a field

Right-click a record and choose **New Field**, or click **+ Field** in the [Screen Preview](/dspf-edit/guides/screen-preview/) toolbar and click a point on the screen to place it there. Both use the same prompts to collect name, type, length, and position.

The field kind list offers:

- The common alphanumeric and numeric fields: output, input/output, and input.
- **Selection** fields: **Single choice — radio buttons** and **Multiple choice — check boxes**. See [Selection fields](#selection-fields).
- **Hidden** alphanumeric and numeric fields. They are never displayed, so no position is asked. They are written the way STRSDA writes them, e.g. `10A  H` or `4S 0H`.
- A **Referenced** section, for a field taking its definition from another one. See [Add a referenced field](/dspf-edit/guides/referenced-fields/#add-a-referenced-field).
- **More options...**, for any usage and data type. That includes message (`M`) and program-to-system (`P`) fields, and hidden date, time, or timestamp fields. Only the data types DDS allows for the usage are offered:
  - A message field is always character, so only its length is asked. It isn't offered in a subfile record.
  - A program-to-system field can't be a date, time, or timestamp.

A numeric field can have up to 63 digits.

## Edit / Rename / Remove

- **Edit Field** — change a field's name, size, and kind (alphanumeric ↔ numeric). Switching kind writes the type column the same way the quick **New Field** flow does, and — if the switch would leave keywords that no longer apply (`EDTCDE`/`EDTWRD`/`EDTMSK` need a numeric field; `CHECK(LC)`/`LOWER` need a character one) — asks to confirm removing them first, listing exactly what will go.
- **Rename** — change a field's name, updating references to it.
- **Remove field** — delete it from the record.
- **Copy Field** — duplicate it, to the same record or a different one.

## Position

- **Change Position** — move it to an absolute row/column, or position it relative to an existing field or constant.
- **Center** — center it horizontally on the screen.
- You can also drag a field directly in the [Screen Preview](/dspf-edit/guides/screen-preview/).

## Colors and attributes

**Colors** and **Attributes** apply `DSPATR`-style color/attribute keywords to the field. See [Colors and Attributes](/dspf-edit/guides/colors-attributes/).

## Validity checks

**Add validity checks** applies DDS field-validation keywords (range/comparison/value checks) to the field. `RANGE`, `COMP`, and `VALUES` are mutually exclusive in DDS — a field can only have one of the three at a time — so the menu shows all three slots and whichever one is currently set; picking a different one automatically replaces it.

`VALUES` entries are validated against the field as you type them: a character field requires each value in single quotes (e.g. `'A' 'B'`) and rejects one longer than the field itself, while a numeric field requires plain, unquoted numbers — matching the DDS rule that every entry in the list must match the field's own type, never a mix of both. `VALUES` also isn't offered on a floating-point field, which DDS doesn't allow it on at all.

## Keying options

**Keying Options** (on input-capable fields, usage `I` or `B`) opens a window with the keyboard-control codes of the `CHECK` keyword, each with a checkbox, checked when the field has it:

| Code | Meaning |
|------|---------|
| `ME` | Mandatory entry: at least one character must be typed. |
| `ER` | Automatic record advance: typing the last position sends the record, as if Enter were pressed. |
| `MF` | Mandatory fill: if the field is changed, every position must be filled. |
| `FE` | Field exit key required: the user must press Field Exit (or Field+/Field-) to leave the field. |
| `RB` | Right adjust, blank fill. |
| `RZ` | Right adjust, zero fill. |

Check the ones the field should have and press `Enter`: each new one is written on a line of its own, `CHECK(ME)` then `CHECK(FE)`, as STRSDA does; the unchecked ones are removed. Only `ME` and `ER` can be conditioned by indicators, as the DDS reference says, so only their rows have a ✏️ to set indicators. Other `CHECK` codes the field may have (`AB`, `LC`, `VN`, `M10`...) are left as they are, even when they share the same `CHECK()`.

Combinations DDS doesn't allow are refused before anything is written: `RB` with `RZ`, `MF` with `RB` or `RZ`, and `MF`, `RB` or `RZ` on a field with `WRDWRAP` or split into lines (`CNTFLD`).

## Split into lines

**Split Into Lines** (on input-capable character fields) turns a long field into a box of several lines, with `CNTFLD(width)`: the field is shown `width` columns at a time, each line below the previous one, starting at the same column. A 90-character field with `CNTFLD(30)` is a box of 3 lines of 30 columns.

It asks for the columns per line, which must be less than the field's length and fit to the right of the field and, with the lines it takes, above the bottom of the display or window. If other fields or constants would end up inside the box, it lists them and asks before going ahead. On a field already split, it offers to change the width or to put it back on one line.

As the DDS reference requires, it isn't offered for numeric fields, output-only fields or fields in a subfile, nor on a field with `AUTO(RAB/RAZ)`, `CHECK(AB MF RB RZ RLTB)`, `CHOICE`, `DSPATR(OID/SP)` or `EDTMSK`. **Edit field** offers to remove `CNTFLD` when the field becomes numeric.

## Selection fields

A selection field lets the user pick one choice (`SNGCHCFLD`) or several (`MLTCHCFLD`) from a list. The screen designer doesn't edit them, so they're usually written by hand:

```
     A            WSENTORNO      2Y 0B  4 37SNGCHCFLD
     A                                      CHOICE(1 'DEV')
     A                                      CHOICE(2 'QA')
     A                                      CHOICE(3 'UAT')
```

On a graphical display, as most emulators show a screen, the choices are radio buttons (single choice) or check boxes (multiple choice). On a text-only display, as the screen designer shows them, there's an input field and the choices are numbered. The preview draws either one; see [Display type](/dspf-edit/guides/configuration/#display-type).

### Creating one

**Add Field** (from the tree, or **+ Field** in the preview) has a **Selection** section in its kind list: **Single choice — radio buttons** and **Multiple choice — check boxes**. After the name, it asks for the choices one after another; leave one empty to finish. Cancelling after some asks whether to create the field with those. The field is written as `2Y 0B`, as the DDS reference requires, with `SNGCHCFLD` or `MLTCHCFLD` on its line and one `CHOICE` per line.

A multiple-choice field also needs a `CHCCTL` per choice: the program reads its `1Y 0 H` field to know whether the choice was selected. Each `CHOICE` gets its `CHCCTL(n &CTL01)` right after it, and the fields `CTL01`, `CTL02`... are created with the record's other hidden fields, skipping names the record already has.

### Changing the choices

Right-click a selection field and choose **Choices**, or pick **Choices...** in the preview's **Actions** menu. It lists the field's choices, with what each one has: its mnemonic, a blank line before it, its indicators, and for a multiple-choice field its control field. Each row has buttons to:

- ✏️ **Change the text** (selecting the row does it too).
- **Blank line before it**, on or off (`*SPACEB`). A choice whose number doesn't follow the previous one also gets one, in a single column.
- **Indicators**, with the same menu as [Indicators](/dspf-edit/guides/indicators/).
- **Control field** (multiple choice): rename it, or create it when the choice has none.
- 🗑️ **Remove** it. A field keeps at least one choice. A control field left unused can then be deleted; it asks first.

Below the list:

- **Add choice**: the next number, after the last choice (before any other keyword of the field, such as `ERRMSG`). In a multiple-choice field it gets its `CHCCTL` and control field.
- **Layout**: one column, several per row (`*NUMCOL`, filled row by row) or several per column (`*NUMROW`, filled column by column), and the spaces between columns (`*GUTTER`, at least 2; 3 when not coded).
- **Type**: single choice ↔ multiple choice. Going multiple, each choice gets its `CHCCTL` and control field, and the parameters only single choice takes (`*AUTOSLT`, `*AUTOENT`...) are removed. Going single, the `CHCCTL`s are removed, and their fields can be deleted.
- **Radio buttons** / **Check boxes**: shown, or not (`*NOSLTIND`).

The window comes back after each change, until you close it.

While typing a choice's text, it checks the DDS reference's rules: put `>` before a letter to make it the mnemonic (`>Development`), and `>>` for a `>` in the text; only one mnemonic per choice, not a blank, and not the same as another choice's. Choice numbers go up to 99, and the choices must fit on the display or window, laid out as the screen designer shows them.

## Editing keywords

**Add editing keywords** applies DDS edit keywords (e.g. `EDTCDE()`/`EDTWRD()`) that control how the field's value is formatted for display. The [Screen Preview](/dspf-edit/guides/screen-preview/) renders `EDTCDE()`-edited numeric fields using the decimal convention configured in [Configuration](/dspf-edit/guides/configuration/). The user-defined edit codes (`5` to `9`) are previewed once fetched from the IBM i, from that same section.

To give other numeric fields the same editing, use **Copy Format...** and **Paste Format** in the Screen Preview — see [Copying the format of an element](/dspf-edit/guides/colors-attributes/#copying-the-format-of-an-element).

## Error messages

**Error Messages** (on input-capable fields, usage `I` or `B`) opens a window listing the field's error messages: its own text (`ERRMSG`) or one from a message file (`ERRMSGID`). Unlike validity checks, a field can have several at once; their indicators choose which one shows. Each row shows the message, the indicators that show it and its response indicator.

- Select a row, or click its ✏️ button, to change the message. It stays where it is, with its indicators.
- The indicators button changes its indicators, with the same menu as [Indicators and Conditions](/dspf-edit/guides/indicators/): several indicators per condition, and OR'd conditions.
- The 🗑️ button removes a message, with its indicator lines; the 🗑️ button in the title bar removes them all.
- **Add error message...** asks for the text and the response indicator. **Add error message from a message file...** asks for the message ID (e.g. `USR0001`), the message file (`MYMSGF` or `MYLIB/MYMSGF`), the response indicator and the field the message data comes from. Then both ask for the indicators that show the message; it isn't added without them, since it would show on every output of the record.

The response indicator is optional; DDS turns it off once the message is shown, so it's usually the same indicator that shows the message. A single quote in the text is written twice (`''`), as DDS requires. A long message is continued on the next lines.

The window opens again after each change; `Escape` closes it.

In the preview, while a message is active, the field shows in reverse image and the message line shows its text — see [Screen Preview](/dspf-edit/guides/screen-preview/#windows). For `ERRMSGID`, it shows a placeholder naming the message ID and file, since its real text lives in the message file.

## Indicators

**Add / Remove / Change indicators** conditions the field's visibility, following the same AND/OR rules as constants and attributes — see [Indicators and Conditions](/dspf-edit/guides/indicators/).

## Referenced fields

A field referencing another field's definition (an `R` field) shows a *referenced* flag in the tree. See [Referenced Fields](/dspf-edit/guides/referenced-fields/) to add one, set the file-level `REF` keyword, and resolve its real type, length, and decimals.
