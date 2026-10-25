---
title: Colors and Attributes
description: Applying DSPATR-style color and display attributes to fields and constants.
---

Fields and constants can carry display attributes — color and `DSPATR`-style flags such as reverse image, underline, blink, column separators, or non-display — rendered in the [Screen Preview](/dspf-edit/guides/screen-preview/) so you can check the result without compiling.

## Applying colors and attributes

Right-click a field or constant and choose **Colors** or **Attributes**. From the [Screen Preview](/dspf-edit/guides/screen-preview/), the same actions are available from the **⋮ Actions** menu on a selection — including a multi-selection, so you can apply a color or attribute to several elements at once.

## Managing the attributes and colors of an element

For a single field or constant, **Attributes** and **Colors** open one window that lists every attribute or color, each with a checkbox. The ones the element already has are checked, with the indicators that condition them. An element can have several colors, each applying under its own indicators.

- Check the ones to add and uncheck the ones to remove, then press `Enter`. Added ones get no indicators.
- The ✏️ button of a row sets its indicators — see [Conditioning an attribute](#conditioning-an-attribute). On one the element doesn't have yet, it asks for the indicators first and then adds it with them; if you enter none, nothing is added.
- The 🗑️ button of a row removes just that one. If an attribute shares a keyword with others, as `HI` does in `DSPATR(UL HI)`, the others stay.
- The 🗑️ button in the window's title bar removes them all.

The ✏️ and 🗑️ buttons apply their change at once, and the window then opens again, up to date, so you can go on. Checkboxes you changed but didn't apply yet are kept. `Escape` closes the window.

When several elements are selected in the Screen Preview, the window only adds: check the attributes or colors to add to all of them, without indicators.

## Conditioning an attribute

Each attribute can itself be conditioned by indicators, with the same AND/OR support as fields and constants — see [Indicators and Conditions](/dspf-edit/guides/indicators/). This lets an attribute (e.g. highlighting a field in red) apply only when a given indicator is on.

To set or change the condition, open **Attributes** or **Colors** and use the ✏️ button of the row. On one the element already has, it opens the same menu as **Indicators** on a field: up to nine indicators per condition, and up to nine conditions joined with OR.

Indicators condition a whole source line. If the attribute or color shares its line with something else — the field's own line, another keyword, or other attributes in the same `DSPATR()` — it is first moved to a line of its own, keeping the condition it had, so that nothing else changes.

## Removing an attribute

Right-click the attribute node under a field or constant in the [Schema Tree](/dspf-edit/guides/schema-tree/) and choose **Delete**, or use the 🗑️ button in the **Attributes** window described above.

## Default underline on input-capable fields

Per the DDS reference, every input-capable field (usage `I`/`B`) is underlined by default, regardless of `DSPATR(UL)` — the Screen Preview matches this. A field's own `DSPATR(UL)`, indicator-conditioned or not, always takes priority when present; otherwise, the only way to remove that default is `CHGINPDFT` (with no parameters) at file, record, or field level — see [Change Input Default](/dspf-edit/guides/records/#change-input-default).

## Preview color scheme

The colors used to render the green-screen preview itself (not the DDS color keywords on your fields) can be adjusted from **Configure Preview Colors...**, and reset back to the defaults with **Reset Preview Colors to Default**. See [Configuration](/dspf-edit/guides/configuration/).
