---
title: Windows
description: WINDOW records with real positioning, resizing, titles, and shared windows.
---

`WINDOW` records are fully supported in the [Screen Preview](/dspf-edit/guides/screen-preview/): drawn at their real screen position, resizable and movable with the mouse, and aware of `WDWTITLE`/`WDWBORDER`.

![A WINDOW record in the preview](/dspf-edit/screenshots/captura7.png)

## Resizing and moving

- In the preview, drag a window's border to resize it, or drag its body to move it.
- From the [Schema Tree](/dspf-edit/guides/schema-tree/), right-click the window record and choose **Change Window Size**. This is aware of every display size the file declares (`*DS3`/`*DS4`, ...) and resizes all of them together. See [Multiple Display Sizes](/dspf-edit/guides/display-sizes/). The boxes for the rows and columns start with the window's current ones.
- To move it without changing its size, choose **Change Window Position**, or **Change Position...** in the window's "⋮" menu in the preview. See [Changing the position](#changing-the-position).

## Placed at run time

A window doesn't need a fixed line and position:

- `WINDOW(*DFT rows columns)` lets the system place it relative to the cursor when it's shown, so it doesn't hide the part of the screen being worked on.
- `WINDOW(&LIN &POS rows columns)` takes the line and position from two `P` fields of the record, which the program sets before showing it. They must be signed numeric, up to 3 digits (`3S 0P`). Either of them can also be a number: `WINDOW(&LIN 20 rows columns)` takes only the line from a field, and `WINDOW(5 &POS rows columns)` only the position.

The rows and columns of the window are always numbers: the DDS reference doesn't allow fields for them, since the compiler checks that every field of the record fits in the window.

**New Record** can also create windows without asking for their size and position, at a fixed position or relative to the cursor, to be sized and moved afterwards with the mouse — see [New window records](/dspf-edit/guides/configuration/#new-window-records).

To create one, choose the position in **New Record**: **Relative to the cursor (*DFT)**, or **At the line and/or position in fields (&LIN &POS)**. The second one asks first which ones the program sets:

- **Line and position** (`&LIN &POS`): it asks for the two fields' names (`WDWLIN` and `WDWPOS` by default).
- **Only the line** (`&LIN 20`): it asks for the line's field, and then the position, as a number.
- **Only the position** (`5 &POS`): it asks for the line, as a number, and then the position's field.

The fields are created in the record as `3S 0P`. A number must leave room for the window on the smallest display size the file declares.

To change an existing window, use **Change Window Position** (see below) or **Change Window Size**, whose position lists have the same choices:

- With **At the line and/or position in fields**, a field the record doesn't have yet is created as `3S 0P`. One it has must already be defined that way, or it's refused, saying how it's defined. The fields and numbers the window has now are offered.
- For a window already placed at run time, the list starts with **Keep it where it is**, which only changes its size.
- When the window stops using its line and position fields, it asks whether to delete them, since the program may still use them.

- The preview draws these windows with the border corner on row 2, column 2, as STRSDA does, since their real position is only known when the program runs.
- Resizing such a window in the preview keeps `*DFT` or the fields. Moving or aligning it asks first, because it gives the window a fixed line and position instead; for one placed by fields, it then asks whether to delete them.
- The preview's info bar shows how it's placed (`window 8x30 relative to the cursor (*DFT)`, `window 8x30 at &LIN &POS`) instead of a position.

## Changing the position

**Change Window Position** moves a window without changing its size. Right-click the window record in the tree, or open the window's "⋮" menu in the preview and choose **Change Position...**. The list's title shows where the window is now:

- **CENTERED**: in the middle of the screen.
- **BOTTOM_CENTERED**: centered horizontally, at the bottom.
- **FIXED**: at the line and position you type. A window can't start on line 1 and position 1 at the same time.
- **CURSOR**: relative to the cursor, `WINDOW(*DFT rows columns)`.
- **FIELDS**: at the line and/or position in fields, as described in [Placed at run time](#placed-at-run-time).

It changes every display size the file declares, each checked against its own screen; if the window doesn't fit on one at that position, it says which, and nothing changes. When the window stops using a field for its line or position, it asks whether to delete it. From the preview, it's the same command, so, unlike moving or aligning the window with the mouse, it also changes every display size, not only the one being previewed.

On a record shown in another record's window (`WINDOW(record-name)`), the tree command asks to change the position on that record instead. From the preview, it changes that record's window directly.

## Title

- If the window has a `WDWTITLE`, it's shown in the preview. A window can have one title on the top border and another on the bottom border (`*BOTTOM`), and both are shown. When more than one `WDWTITLE` targets the same border, their parameters are combined, and the first one wins if a parameter is repeated.
- Right-click the record in the tree and choose **Change Window Title**, or click a title directly in the preview. A list shows the window's **Title (top)** and **Footer (bottom)**: select one, or its ✏️ button, to set or change it, and its 🗑️ button to remove it. The list opens again after each change; `Escape` closes it.
- Setting one asks first where its text comes from:
  - **Text**: written in the source, `WDWTITLE((*TEXT 'Customers'))`, at most as long as the window is wide. A single quote can be typed as it is; it's written twice (`''`), as DDS requires.
  - **Field**: a `P` field of the record the program fills, `WDWTITLE((*TEXT &TITULO))`. A field the record doesn't have yet is created as a character `P` field as long as the window is wide (e.g. `30A P`); one it has must already be character with usage `P`, or it's refused.
- Then it asks for the alignment. The title's own color and display attributes (`*COLOR`, `*DSPATR`), if any, are kept.
- When a title stops using a field (removed, or changed to a text or another field), it asks whether to delete the field, since the program may still use it.
- A title taken from a field is only known at run time, so the preview draws a dotted box in the border where it goes, as long as the field (at most the window's width). On a border of characters, the box covers them, as a real title would; on a reverse-image border, it's transparent, so the band of color shows through. Hovering it shows the field and how it's defined (`Title from field &TITULO (20A P)`), and clicking it opens **Change Window Title**.
- When the record declares more than one display size, the command targets the size currently being worked on. When a border has more than one `WDWTITLE`, the command changes the first one in the source, the one whose parameters win.

## Centering and aligning

Hovering a window in the preview reveals a one-click "center horizontally" icon, alongside its "⋮" actions menu — both shown only while hovering.

To place the window anywhere else on the screen, open the "⋮" menu and choose **Align...**. It first asks for the direction, and then where:

- **Horizontally**: **Left**, **Center** or **Right**.
- **Vertically**: **Top**, **Center** or **Bottom**.

The alignment the window already has is marked "current". Only the window's position on that axis changes: its size, and its position on the other axis, stay as they are. As with any other change to the window from the preview, only the display size currently being previewed is affected.

Alignment counts the window's whole frame, not just its content: the border adds 1 row above and below the content, and 2 columns on each side. So **Right** puts the right border on the screen's last column, **Bottom** puts the bottom border on its last row, and **Center** leaves the same space on both sides of the frame (when the space left over is odd, the extra row or column goes after the window). For example, with `WINDOW(5 10 8 40)` on a 24 x 80 screen:

| Alignment | Result |
| --- | --- |
| Left | `WINDOW(5 1 8 40)` |
| Center horizontally | `WINDOW(5 19 8 40)`: 18 columns free on each side |
| Right | `WINDOW(5 37 8 40)` |
| Top | `WINDOW(1 10 8 40)` |
| Center vertically | `WINDOW(8 10 8 40)`: 7 rows free above and below |
| Bottom | `WINDOW(15 10 8 40)` |

A window can't start on row 1 and column 1 at the same time (STRSDA doesn't allow it either). When an alignment would put it there, it's moved one place along the direction you're aligning: **Left** on a window at row 1 starts it at column 2, and **Top** on a window at column 1 starts it at row 2.

## Shared windows

Windows shared via `WINDOW(record-name)` — where one record references another record's window definition instead of declaring its own — are supported and resolved to the real window they point to.

## Error messages on a window

An active `ERRMSG()` on a window shows on the window's own reserved message line (its last content row) when the window doesn't specify `*NOMSGLIN`, matching real DDS behavior — instead of always appearing at the bottom of the physical screen like a non-window record's error message would.

## Windows and subfiles

A subfile control (`SFLCTL`) record commonly shares a window with a separate "commands" record holding its function-key legend. See [Add Commands Record](/dspf-edit/guides/records/#add-commands-record) and [Subfiles](/dspf-edit/guides/subfiles/).
