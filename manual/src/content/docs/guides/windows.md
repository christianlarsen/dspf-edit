---
title: Windows
description: WINDOW records with real positioning, resizing, titles, and shared windows.
---

`WINDOW` records are fully supported in the [Screen Preview](/guides/screen-preview/): drawn at their real screen position, resizable and movable with the mouse, and aware of `WDWTITLE`/`WDWBORDER`.

![A WINDOW record in the preview](/dspf-edit/screenshots/captura7.png)

## Resizing and moving

- In the preview, drag a window's border to resize it, or drag its body to move it.
- From the [Schema Tree](/guides/schema-tree/), right-click the window record and choose **Change Window Size**. This is aware of every display size the file declares (`*DS3`/`*DS4`, ...) and resizes all of them together. See [Multiple Display Sizes](/guides/display-sizes/).

## Title

- If the window has a `WDWTITLE`, it's shown in the preview.
- Click the title directly in the preview to edit it, or right-click the record in the tree and choose **Change Window Title**. When the record declares more than one display size, the command targets the size currently being worked on.

## Centering

Hovering a window in the preview reveals a one-click "center horizontally" icon, alongside its "⋮" actions menu — both shown only while hovering.

## Shared windows

Windows shared via `WINDOW(record-name)` — where one record references another record's window definition instead of declaring its own — are supported and resolved to the real window they point to.

## Error messages on a window

An active `ERRMSG()` on a window shows on the window's own reserved message line (its last content row) when the window doesn't specify `*NOMSGLIN`, matching real DDS behavior — instead of always appearing at the bottom of the physical screen like a non-window record's error message would.

## Windows and subfiles

A subfile control (`SFLCTL`) record commonly shares a window with a separate "commands" record holding its function-key legend. See [Add Commands Record](/guides/records/#add-commands-record) and [Subfiles](/guides/subfiles/).
