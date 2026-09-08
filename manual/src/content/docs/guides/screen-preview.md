---
title: Screen Preview
description: A green-screen-style, drag-and-drop preview that stays in sync with the source and the schema tree — see your screen before you compile.
---

The Screen Preview is a visual, green-screen-style rendering of a record's fields and constants — colors, `DSPATR` attributes, and placeholders for output/input/both fields — built to match how the field would actually appear under **STRSDA**.

Open it from the schema tree: right-click a record and choose **Preview Screen Layout**, or use the inline preview button next to the record.

![Screen Preview panel with a populated record](/dspf-edit/screenshots/captura4.png)

## Toolbar

A single, compact toolbar sits above the preview with:

- Display size / display format selector (see [Multiple Display Sizes](/dspf-edit/guides/display-sizes/)).
- Overlay selector.
- Indicators toggle (see [Simulating indicators](#simulating-indicators)).
- "+ Field" / "+ Constant" add buttons.

![Screen Preview toolbar](/dspf-edit/screenshots/captura5.png)

## Repositioning by drag

Drag any field or constant directly on the preview to reposition it. The change is written back to the DDS source immediately.

## Adding elements from the preview

Click **+ Field** or **+ Constant**, then click a point on the screen to place the new element there — using the same prompts as the tree's **Add field** / **Add constant** commands (see [Fields](/dspf-edit/guides/fields/) and [Constants](/dspf-edit/guides/constants/)).

## Multi-select and actions

Select a field or constant — or several, with `Ctrl`/`Cmd`+click — to get a **⋮ Actions** menu:

- **Add color/attribute**, **Copy**, or **Delete** — applied to every selected element at once when multiple are selected.
- A **single** selected field or constant additionally gets **Rename.../Edit Text...**, **Indicators...**, and (for fields) **Validity Checks...**, **Editing Keywords...**, and **Error Messages...** — the same commands available from the tree's context menu, so most of what you'd do from the tree is also reachable straight from the preview.

![Multi-select actions menu in the preview](/dspf-edit/screenshots/captura6.png)

## Simulating indicators

Toggle **Indicators** in the toolbar to simulate indicators on/off and preview conditional fields, constants, and attributes without compiling or connecting to a 5250 session. See [Indicators and Conditions](/dspf-edit/guides/indicators/) for how conditions are built.

The Indicators toggle, and the selected display format, persist when you switch which record is being previewed in the same panel.

![Simulating indicators in the preview](/dspf-edit/screenshots/captura7.png)

## Overlay

Overlay any other record (dimmed) behind the one being previewed, to see how the two compose — useful for checking a detail record against its header, or a window against the record behind it.

![Overlaying a record behind the preview](/dspf-edit/screenshots/captura8.png)

## Windows

`WINDOW` records are drawn at their real screen position and can be resized/moved directly with the mouse. The window's `WDWTITLE`, if present, is shown. Windows shared via `WINDOW(record-name)` are supported.

- Click a window's title to edit it.
- Hovering a window reveals its "⋮" actions menu and a one-click "center horizontally" icon.

An active `ERRMSG()` on a window shows on the window's own reserved message line (its last content row) when the window doesn't specify `*NOMSGLIN` — matching real DDS behavior — instead of always appearing at the bottom of the physical screen.

See [Windows](/dspf-edit/guides/windows/) for the full reference.

## Subfiles

`SFL`/`SFLCTL` records show every `SFLPAG` row, and automatically preview their paired header/detail record. Detail rows can't be dragged up over the header's own content. See [Subfiles](/dspf-edit/guides/subfiles/).

## Field wrapping (`CNTFLD`)

A field coded with `CNTFLD(n)` wraps across multiple lines in the preview, `n` characters each, all starting at its original column — matching how RDi previews it.

## Function-key legend

A function-key legend (`F3`, `F12`, ...) shows every command key available to the record being previewed — both file-level and record-level `CAxx`/`CFxx` keys. A key still shows even when its indicator condition isn't currently met, so you can see it's defined; it switches to solid/inverted styling when it's actually active under the current simulated indicators.

## Multiple display sizes

For files with more than one `DSPSIZ` format (e.g. `*DS3`/`*DS4`), switch which one is being previewed from the toolbar. Window positions/sizes and conditioned elements are resolved for the selected format, and dragging/resizing/centering a window, or adjusting a subfile's `SFLPAG`/`SFLSIZ`, only affects the size currently being previewed. See [Multiple Display Sizes](/dspf-edit/guides/display-sizes/).

## Numeric formatting

The decimal point and thousands-separator convention used to preview `EDTCDE()`-edited numeric fields — US or European — is configurable from the **⚙ Configuration** panel, either picked manually or fetched with one click from the connected IBM i's `QDECFMT` system value. See [Configuration](/dspf-edit/guides/configuration/).

## Focus mode

**Focus** maximizes the preview so it fills the editing area, hiding the DDS source editor beside it. **Show code** brings the source editor back.

## Staying in sync

The preview stays in sync with the schema tree selection in both directions: selecting an element in the tree highlights it in the preview, and vice versa.
