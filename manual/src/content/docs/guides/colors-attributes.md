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

## Copying the format of an element

To give other fields or constants the same look as one you already have, copy its format and paste it, from the **⋮ Actions** menu of the [Screen Preview](/dspf-edit/guides/screen-preview/#multi-select-and-actions):

1. Select the field or constant to copy from and choose **Copy Format...**.
2. Check what to copy. Each row shows what the element has:
   - **Colors**
   - **Display attributes**
   - **Indicators of NAME itself**: the indicators that condition the element.
   - **Number editing (edit code, edit word, edit mask)**: only for fields. Checked only when the field has some.
   - **Keep the indicators of colors and attributes**: uncheck it to paste them without condition.
3. Select one or several elements and choose **Paste Format of NAME**.

What was copied stays available until you copy something else, so you can paste it again later, also in other records or files.

Pasting **replaces** what each element has of every part copied, so it ends up looking like the source. A part the source doesn't have is removed: copying the colors of a field with no colors takes the colors off the elements you paste onto.

### Colors and attributes

With their indicators, colors and attributes keep their whole condition, more than three indicators and OR'd conditions included. Without them, only the first color is pasted, since two colors with no condition would both apply, and the attributes are merged into one `DSPATR()`, each once.

Attributes the element can't take are left out: `MDT`, `OID`, `PR` and `SP` only go on input-capable fields (usage `I`/`B`), and `DSPATR(&field)` only goes on a field whose record has that P field.

### Number editing

Number editing is pasted only where the DDS reference allows it:

- On numeric fields with `Y`, `S` or blank (with decimal positions) in position 35. An `S` field becomes `Y`, as STRSDA does when an edit code is added. A referenced field has to be [resolved](/dspf-edit/guides/referenced-fields/) first.
- Not on fields with `DFT` or `DFTVAL`.
- Edit codes `W` and `Y` only on the field lengths they allow, and an edit word only on fields with as many digits as its digit positions.
- The edit mask only on input-capable fields (`I`/`B`) with the same length and decimals as the field it was copied from, since it has to match the edited field character by character, and not with `CHECK(AB MF RB RZ RLTB)`.

A field that can't take the editing keeps its own. The message shown after pasting says what was left out, and why.

Each element is changed with several edits, so undoing a paste may take more than one `Ctrl`+`Z`.

## Removing an attribute

Right-click the attribute node under a field or constant in the [Schema Tree](/dspf-edit/guides/schema-tree/) and choose **Delete**, or use the 🗑️ button in the **Attributes** window described above.

## Default underline on input-capable fields

Per the DDS reference, every input-capable field (usage `I`/`B`) is underlined by default, regardless of `DSPATR(UL)` — the Screen Preview matches this. A field's own `DSPATR(UL)`, indicator-conditioned or not, always takes priority when present; otherwise, the only way to remove that default is `CHGINPDFT` (with no parameters) at file, record, or field level — see [Change Input Default](/dspf-edit/guides/records/#change-input-default).

## Preview color scheme

The colors used to render the green-screen preview itself (not the DDS color keywords on your fields) can be adjusted from **Configure Preview Colors...**, and reset back to the defaults with **Reset Preview Colors to Default**. See [Configuration](/dspf-edit/guides/configuration/).
