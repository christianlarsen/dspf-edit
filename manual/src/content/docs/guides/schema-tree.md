---
title: Schema Tree
description: Navigate a display file's structure and act on it from the right-click menu.
---

The **DSPF STRUCTURE** panel, in the Explorer view, shows a live tree of the display file's structure. It updates automatically as you edit the source, and stays in sync with the [Screen Preview](/dspf-edit/guides/screen-preview/) selection in both directions.

The tree has two levels: **File** and **Records**, with **Constants**, **Fields**, and **Attributes** nested under each record.

## File level

Shows the display file's own attributes — display size, command keys defined at file level, and (if present) more than one `DSPSIZ` format.

Right-click the file node for:

- **Create new records.**
- **Command keys** — lists the file-level keys, to add, change, remove or condition them with indicators. Keys that won't compile are refused or flagged; see [Command Keys](/dspf-edit/guides/command-keys/).
- **Add Display Size** — adds a second standard screen size (`*DS3`/`*DS4`) to a file that currently declares only one. See [Multiple Display Sizes](/dspf-edit/guides/display-sizes/).
- **Reference File** — adds, changes, or removes the file-level `REF` keyword. See [Referenced Fields](/dspf-edit/guides/referenced-fields/#reference-file-ref).

## Records level

Right-click the records list for:

- **Create new records.**

Each record node shows its own record-level attributes, and lists its constants and fields underneath. Right-click a record for:

- **Add constant** / **Add field** / **Remove field**
- **Copy record** / **Delete record**
- **Add buttons** — constants that trigger record commands. See [Records](/dspf-edit/guides/records/#add-buttons).
- **Command keys** — the same window for the record's keys, see [Command Keys](/dspf-edit/guides/command-keys/).
- **Add / Remove / Change indicators** — see [Indicators and Conditions](/dspf-edit/guides/indicators/).
- **Resizing** (window records only) — aware of every declared display size, resizing all of them at once.
- **Change Window Position** (window records only) — moves the window without changing its size: fixed, relative to the cursor (`*DFT`), or at a line and/or position in fields.
- **Change Window Title** (window records only) — targets the size currently being worked on, when the record declares more than one.
- **Sort elements.**
- **Preview Screen Layout** — also available as an inline button on the record. See [Screen Preview](/dspf-edit/guides/screen-preview/).

## Constants

Each constant shows its text, position (row/column), indicators, and attributes. Right-click a constant for:

- **Edit constant.**
- **Copy constant** — to the same record or a different one.
- **Remove constant.**
- **Center constant on screen.**
- **Change position** — absolute, or relative to an existing constant.
- **Apply colors/attributes.**
- **Add / Remove / Change indicators** — including more than 3 ANDed indicators (up to DDS's limit of 9, spilling onto continuation lines automatically) and OR'd conditions. See [Indicators and Conditions](/dspf-edit/guides/indicators/).
- **Fill constant with characters.**

## Fields

Each field shows its name, length, type, position (row/column), and flags such as *referenced* or *hidden*. Indicators and attributes are expandable when present — a field or constant with neither shows as a plain leaf, with no expand arrow. An OR'd condition is grouped into its ANDed sub-conditions (`Group 1 (AND)` / `OR` / `Group 2 (AND)` / ...) instead of a flat list. Hovering a conditioned field, constant, or attribute shows the full condition (e.g. `51 AND NOT 61 AND 53  OR  52`) as a tooltip. Hovering a referenced field shows where its definition comes from (e.g. `UPDUSR in *LIBL/HTPFREF (file-level REF)`).

Right-click a field for:

- **Edit field.**
- **Copy field** — to the same record or a different one.
- **Remove field.**
- **Center field on screen.**
- **Change position** — absolute, or relative to an existing constant/field.
- **Apply colors/attributes.**
- **Add validity checks.**
- **Add editing keywords.**
- **Error messages** — lists the field's messages, own text (`ERRMSG`) or from a message file (`ERRMSGID`); see [Fields](/dspf-edit/guides/fields/#error-messages).
- **Add / Remove / Change indicators** — same AND/OR support as constants. See [Indicators and Conditions](/dspf-edit/guides/indicators/).
- **Resolve Referenced Field** (referenced fields only) — see [Referenced Fields](/dspf-edit/guides/referenced-fields/).

A hidden (`H`), message (`M`), or program-to-system (`P`) field is never displayed, so the options that only apply to a displayed field aren't offered for it: centering, change position, colors/attributes, validity checks, editing keywords, and error messages. Per the DDS reference, message and program-to-system fields only allow the `ALIAS`, `INDTXT`, `OVRDTA` (message only), `REFFLD`, and `TEXT` keywords. A hidden field has no position and is neither an input nor an output field.

## Attributes

Right-click an attribute (a `DSPATR`-style flag on a field or constant) for:

- **Add / Remove / Change indicators** — same AND/OR support as fields and constants.
- **Remove attribute.**

## Filtering the tree

Use **Filter Elements** to narrow the tree to a search term, and **Show All Elements** to clear the filter again.

![Filtering the schema tree](/dspf-edit/screenshots/captura3.png)
