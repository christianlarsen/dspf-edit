---
title: Indicators and Conditions
description: Building AND/OR indicator conditions visually, up to DDS's 9-indicator limit — and simulating them in the preview.
---

Fields, constants, and attributes can be conditioned by response/status indicators, exactly as in native DDS (e.g. `51`, `N61`). DSPF-edit lets you build and read these conditions visually instead of counting indicator columns by hand.

## Adding and changing indicators

Right-click a field, constant, or attribute and choose **Indicators** (or the equivalent **Add / Remove / Change indicators** entry) to add a condition, change an existing one, or remove it.

## Entering indicators

Indicators are entered one at a time, each in its own box: `50`, or `N50` for *not* 50. The `N` can be typed in lowercase (`n50`), and a single digit is read as two (`5` is `05`).

- After each indicator, another box asks for the next one, showing the ones added so far.
- To finish, leave the box empty and press `Enter`, or press `Escape`: the indicators entered are kept.
- `Escape` on the first box cancels, and nothing changes.

## AND conditions

Up to DDS's limit of **9 ANDed indicators** on a single condition is supported. Beyond 3 — the number that fits on one DDS line — the extra indicators spill onto continuation lines automatically; you don't need to manage line-wrapping yourself.

## OR'd conditions

A condition can be made of several OR'd groups, each itself an AND of up to 9 indicators (e.g. `51 AND NOT 61 AND 53  OR  52`). The menu lists every OR'd group with its own change/remove buttons, plus an option to add another OR'd condition.

## Reading conditions in the tree

In the [Schema Tree](/dspf-edit/guides/schema-tree/), an OR'd condition is grouped into its ANDed sub-conditions ("Group 1 (AND)" / "OR" / "Group 2 (AND)" / ...) instead of shown as one flat list. Hovering a conditioned field, constant, or attribute shows the full condition as a tooltip.

## Indicators in the wrong columns

When editing the source by hand, it's easy to type an indicator one column off: `50` in columns 8-9 instead of 9-10 isn't indicator 50, and DDS doesn't allow it. DSPF-edit checks columns 7-16 of every line of an open display file and underlines what doesn't fit, also listed in the **Problems** panel. What CRTDSPF rejects is shown as an error with the compiler's message ID: `CPD7410` for a character other than `N` (or blank) in columns 8, 11 or 14, and `CPD7606` for an indicator that isn't `01`-`99`. The rest are warnings.

- Column 7 must be blank, `A` (AND) or `O` (OR).
- Each indicator takes 3 columns, 8-10, 11-13 and 14-16: `N` (NOT) or blank, then two digits from `01` to `99`. A one-digit indicator, `00`, a letter or an `N` with nothing after it is flagged. So are more than three indicators on one line.
- `O` (OR) can't go on the first line of a condition, with nothing above it to OR with (`CPD7821`; the compiler takes it as blank).
- A display size condition name (`*DS3`, `*DS4` or one of your own) must start in column 9, with `N`, if any, in column 8, can't be joined with `A`/`O`, and must be declared in `DSPSIZ`.

When it's clear what was meant (the indicators are right, only in the wrong columns), the warning says so and offers a **Quick Fix** (`Ctrl+.`/`Cmd+.`, or the light bulb) that moves them to their columns, leaving the rest of the line as it was. The [column ruler](/dspf-edit/guides/column-ruler/) shows the columns while you type.

## Simulating indicators in the preview

The [Screen Preview](/dspf-edit/guides/screen-preview/)'s **Indicators** toggle lets you turn indicators on/off and see which fields, constants, and attributes become visible or hidden — without compiling or connecting to a 5250 session. This setting persists when switching which record is being previewed in the same panel.

The preview's **◌ Hidden** toggle shows the fields and constants hidden by their indicators as dotted outlines, and hovering one shows the condition it needs — see [Showing hidden elements](/dspf-edit/guides/screen-preview/#showing-hidden-elements).
