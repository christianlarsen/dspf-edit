---
title: Configuration
description: Numeric formatting, preview overlay, source editor and preview color settings.
---

## Numeric (decimal) formatting

The decimal point and thousands-separator convention used to preview `EDTCDE()`-edited numeric fields — for example `1,234.56` (US) versus `1.234,56` (European) — is configurable from the **⚙ Configuration** panel in the [Screen Preview](/dspf-edit/guides/screen-preview/).

You can either:

- Pick the convention manually, or
- Fetch it with one click from the connected IBM i's `QDECFMT` system value, via [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi).

This only affects how numeric fields are *rendered in the preview* — it doesn't change the DDS source.

### User-defined edit codes

`EDTCDE(5)` to `EDTCDE(9)` are user-defined edit codes. What they do is not part of DDS: each IBM i holds its own definition of them, in the edit descriptions `QEDIT5` to `QEDIT9`, and an installation can change them. The extension can only know how they look by asking the system.

**Fetch from IBM i** reads them in the same click as `QDECFMT`. The message shown afterwards says which codes were read. From then on, a field using one of them previews as STRSDA shows it, for example `9,999.99CR` for a 6,2 field with the IBM-supplied `EDTCDE(5)`.

- These codes ignore the decimal convention chosen above. Each edit description carries its own decimal point and separators.
- **Reset to Default** forgets the edit descriptions that were read, along with resetting the decimal convention.
- Until they are fetched, or if a code could not be read, a field using it previews with no editing.
- What was read belongs to the system it was read from. After connecting to a different IBM i, fetch again.

## Preview overlay

Two settings in the **Preview Overlay** section of the **⚙ Configuration** panel control the [Overlay](/dspf-edit/guides/screen-preview/#overlay) list of the Screen Preview. Both are on by default, and changes save immediately.

- **Show a subfile's detail and control records together**: while on, previewing a subfile record, or checking one as an overlay, also shows its other half, checked and locked. Turn it off to preview a subfile record on its own, and check its other half yourself when you want it.
- **Keep checked overlays when switching to another record**: while on, the overlays you checked stay checked when you switch to another record of the same file. Turn it off to start each record with only what's added on its own: its subfile pair (if the setting above is on) and the record named in its `WINDOW(record-name)`.

The record named in `WINDOW(record-name)` is always shown, whatever these settings say, since the window is built from it.

## Source editor

The **Source Editor** section of the **⚙ Configuration** panel has one setting, off by default:

- **Show a column ruler above the line being edited**: shows the DDS format line above the line the cursor is on, and outlines each column area of that line. `Shift+F4` in the source turns it on and off too. See [Column Ruler](/dspf-edit/guides/column-ruler/).

## Preview colors

The colors used to render the green-screen preview itself can be customized:

- **Configure Preview Colors...** opens the color configuration.
- **Reset Preview Colors to Default** restores the built-in defaults.

This is separate from the DDS `DSPATR`/color keywords you apply to fields and constants — see [Colors and Attributes](/dspf-edit/guides/colors-attributes/).
