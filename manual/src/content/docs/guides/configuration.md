---
title: Configuration
description: Numeric formatting and preview color settings.
---

## Numeric (decimal) formatting

The decimal point and thousands-separator convention used to preview `EDTCDE()`-edited numeric fields — for example `1,234.56` (US) versus `1.234,56` (European) — is configurable from the **⚙ Configuration** panel in the [Screen Preview](/guides/screen-preview/).

You can either:

- Pick the convention manually, or
- Fetch it with one click from the connected IBM i's `QDECFMT` system value, via [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi).

This only affects how numeric fields are *rendered in the preview* — it doesn't change the DDS source.

## Preview colors

The colors used to render the green-screen preview itself can be customized:

- **Configure Preview Colors...** opens the color configuration.
- **Reset Preview Colors to Default** restores the built-in defaults.

This is separate from the DDS `DSPATR`/color keywords you apply to fields and constants — see [Colors and Attributes](/guides/colors-attributes/).
