---
title: Fields
description: Adding, editing, positioning, conditioning, and styling fields.
---

Fields are shown under their record in the [Schema Tree](/dspf-edit/guides/schema-tree/), listing name, length, type, position (row/column), and flags such as *referenced* or *hidden*.

## Add a field

Right-click a record and choose **New Field**, or click **+ Field** in the [Screen Preview](/dspf-edit/guides/screen-preview/) toolbar and click a point on the screen to place it there. Both use the same prompts to collect name, type, length, and position.

## Edit / Rename / Remove

- **Edit Field** — change a field's attributes.
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

## Indicators

**Add / Remove / Change indicators** conditions the field's visibility, following the same AND/OR rules as constants and attributes — see [Indicators and Conditions](/dspf-edit/guides/indicators/).

## Referenced fields

A field referencing another file's field definition (an `R` field with no explicit type/length) shows a *referenced* flag in the tree. See [Referenced Fields](/dspf-edit/guides/referenced-fields/) to resolve its real type, length, and decimals from a connected IBM i.
