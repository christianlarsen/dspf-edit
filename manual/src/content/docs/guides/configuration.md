---
title: Configuration
description: Numeric formatting and preview color settings.
---

## Numeric (decimal) formatting

The decimal point and thousands-separator convention used to preview `EDTCDE()`-edited numeric fields — for example `1,234.56` (US) versus `1.234,56` (European) — is configurable from the **⚙ Configuration** panel in the [Screen Preview](/dspf-edit/guides/screen-preview/).

You can either:

- Pick the convention manually, or
- Fetch it with one click from the connected IBM i's `QDECFMT` system value, via [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi).

This only affects how numeric fields are *rendered in the preview* — it doesn't change the DDS source.

## Preview colors

The colors used to render the green-screen preview itself can be customized:

- **Configure Preview Colors...** opens the color configuration.
- **Reset Preview Colors to Default** restores the built-in defaults.

This is separate from the DDS `DSPATR`/color keywords you apply to fields and constants — see [Colors and Attributes](/dspf-edit/guides/colors-attributes/).

## DDS source editing

The text-editor layer described in [DDS Source Editing](/dspf-edit/guides/dds-source-editing/) has its own settings, under `dspf-edit.assist.*` — open Settings (`Ctrl+,`) and search for "DDS".

| Setting | Default | Description |
|---|---|---|
| `dspf-edit.assist.enabled` | `true` | Master switch. Turn off to keep only the graphical DSPF tooling |
| `dspf-edit.assist.statusBar.enabled` | `true` | Show the status bar column assistant |
| `dspf-edit.assist.statusBar.format` | `DDS \| Col {column} \| {section}` | Status bar text; tokens `{column}`, `{section}`, `{fileType}` |
| `dspf-edit.assist.statusBar.showIcon` | `true` | Icon before the status bar text |
| `dspf-edit.assist.hover.enabled` | `true` | Column and keyword hovers |
| `dspf-edit.assist.diagnostics.enabled` | `true` | DDS validation squiggles |
| `dspf-edit.assist.completion.enabled` | `true` | Keyword completion in columns 45–80 |
| `dspf-edit.assist.highlight.enabled` | `true` | Cursor section highlight |
| `dspf-edit.assist.highlight.color` | *(theme)* | Custom highlight color as hex, e.g. `#61AFEF` |
| `dspf-edit.assist.highlight.opacity` | `0.08` | Highlight opacity, capped at `0.15` |

The column guides are not a setting of their own — they are VS Code's native `editor.rulers`, written per DDS language when you run **Apply Recommended DDS Editor Settings**. You can adjust or remove them like any other setting:

```json
"[dds.dspf]": { "editor.rulers": [6, 44, 80] }
```

The extension never writes to your settings by itself: only that command and the two toggle commands (**Toggle DDS Column Guides**, **Toggle DDS Section Highlight**) do.
