---
title: Fields
description: Adding, editing, positioning, conditioning, and styling fields.
---

Fields are shown under their record in the [Schema Tree](/dspf-edit/guides/schema-tree/), listing name, length, type, position (row/column), and flags such as *referenced* or *hidden*.

## Add a field

Right-click a record and choose **New Field**, or click **+ Field** in the [Screen Preview](/dspf-edit/guides/screen-preview/) toolbar and click a point on the screen to place it there. Both use the same prompts to collect name, type, length, and position.

The field kind list offers:

- The common alphanumeric and numeric fields: output, input/output, and input.
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

## Editing keywords

**Add editing keywords** applies DDS edit keywords (e.g. `EDTCDE()`/`EDTWRD()`) that control how the field's value is formatted for display. The [Screen Preview](/dspf-edit/guides/screen-preview/) renders `EDTCDE()`-edited numeric fields using the decimal convention configured in [Configuration](/dspf-edit/guides/configuration/).

## Error messages

**Add error messages** attaches a DDS error-message keyword (e.g. `ERRMSG()`) to the field, shown in the preview per the same message-line rules as window `ERRMSG()` — see [Screen Preview](/dspf-edit/guides/screen-preview/#windows). Unlike validity checks, a field can carry several `ERRMSG()`s at once, each gated by its own indicator — the menu lists them all, letting you change or remove one individually, add another, or clear them all.

The preview also recognizes an existing `ERRMSGID()` on a field the same way it does `ERRMSG()`: while active, the field shows in reverse image, and the message line shows a placeholder naming the message ID and file (its real text lives in an external message file this extension can't read). This menu itself still only creates `ERRMSG()` with inline text.

## Indicators

**Add / Remove / Change indicators** conditions the field's visibility, following the same AND/OR rules as constants and attributes — see [Indicators and Conditions](/dspf-edit/guides/indicators/).

## Referenced fields

A field referencing another field's definition (an `R` field) shows a *referenced* flag in the tree. See [Referenced Fields](/dspf-edit/guides/referenced-fields/) to add one, set the file-level `REF` keyword, and resolve its real type, length, and decimals.
