---
title: Configuration
description: Numeric formatting, preview overlay and preview color settings.
---

## Numeric (decimal) formatting

The decimal point and thousands-separator convention used to preview `EDTCDE()`-edited numeric fields — for example `1,234.56` (US) versus `1.234,56` (European) — is configurable from the **⚙ Configuration** panel in the [Screen Preview](/dspf-edit/guides/screen-preview/).

You can either:

- Pick the convention manually, or
- Fetch it with one click from the connected IBM i's `QDECFMT` system value, via [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi).

This only affects how numeric fields are *rendered in the preview* — it doesn't change the DDS source.

## Preview overlay

Two settings in the **Preview Overlay** section of the **⚙ Configuration** panel control the [Overlay](/dspf-edit/guides/screen-preview/#overlay) list of the Screen Preview. Both are on by default, and changes save immediately.

- **Show a subfile's detail and control records together**: while on, previewing a subfile record, or checking one as an overlay, also shows its other half, checked and locked. Turn it off to preview a subfile record on its own, and check its other half yourself when you want it.
- **Keep checked overlays when switching to another record**: while on, the overlays you checked stay checked when you switch to another record of the same file. Turn it off to start each record with only what's added on its own: its subfile pair (if the setting above is on) and the record named in its `WINDOW(record-name)`.

The record named in `WINDOW(record-name)` is always shown, whatever these settings say, since the window is built from it.

## Preview colors

The colors used to render the green-screen preview itself can be customized:

- **Configure Preview Colors...** opens the color configuration.
- **Reset Preview Colors to Default** restores the built-in defaults.

This is separate from the DDS `DSPATR`/color keywords you apply to fields and constants — see [Colors and Attributes](/dspf-edit/guides/colors-attributes/).
