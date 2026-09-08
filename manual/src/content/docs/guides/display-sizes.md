---
title: Multiple Display Sizes
description: Working with files that declare more than one DSPSIZ format (e.g. *DS3/*DS4), resolved side by side.
---

A display file's `DSPSIZ` can declare more than one screen format at once (e.g. `*DS3 *DS4`), so the same file adapts to different terminal sizes. DSPF-edit resolves and lets you work with every declared format.

## Adding a second display size

Right-click the **File** node in the [Schema Tree](/dspf-edit/guides/schema-tree/) and choose **Add Display Size**. This adds a second standard screen size to a file that currently declares only one.

## Switching which format is previewed

The [Screen Preview](/dspf-edit/guides/screen-preview/) toolbar has a display-format selector. Window positions/sizes and conditioned elements are resolved specifically for the selected format.

## Editing per-format

When a record declares more than one display size:

- Dragging, resizing, or centering a window in the preview only affects the size currently being previewed.
- Adjusting a subfile's `SFLPAG`/`SFLSIZ` only affects the size currently being previewed.
- **Change Window Title** from the tree targets the size currently being worked on.
- **Change Window Size** resizes every declared display size together, keeping the record consistent across formats.

## What persists across formats

The **Indicators** simulation toggle and the selected display format both persist when switching which *record* is being previewed in the same panel — you don't need to reselect them each time.

## Known limitation

Removing a display size the file already declares isn't supported yet — see the project's [Known Issues / To Do](https://github.com/christianlarsen/dspf-edit#-to-do).
