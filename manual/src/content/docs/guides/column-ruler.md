---
title: Column Ruler
description: A ruler above the line being edited that shows which DDS column area each value falls in.
---

DDS is a fixed-column format: a value typed one or two columns off lands in the wrong area, and often still compiles. For example, `COST 7  0` meant as a 7-digit output field puts the `0` in the decimal positions instead of the usage, and the field quietly becomes a numeric field with no usage coded.

The column ruler helps spot this while editing the source by hand. It works like the fixed-format RPG ruler of the [vscode-rpgle](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.vscode-rpgle) extension, and like the format line of SEU and RDi.

## Turning it on

The ruler is off by default. Turn it on or off either way:

- Press `Shift+F4` in a DDS display file source.
- Check **Show a column ruler above the line being edited** in the **Source Editor** section of the **⚙ Configuration** panel. See [Configuration](/dspf-edit/guides/configuration/#source-editor).
- Run **DSPF Edit: Show/Hide Column Ruler** from the Command Palette.

The setting is remembered, and the checkbox in the Configuration panel follows `Shift+F4`.

## What it shows

On the line the cursor is on:

- Above it, the DDS format line, positions 1 to 80:

  ```
  .....AAN01N02N03T.Name++++++RLen++TDpBLinPosFunctions+++++++++++++++++++++++++++
  ```

- On the line itself, each column area is outlined, and the area the cursor is in is highlighted. Hover an area to see its name and positions, e.g. **Decimal positions (36-37)**.

| Positions | Area |
|---|---|
| 7 | Condition And/Or |
| 8-10, 11-13, 14-16 | Indicators 1, 2 and 3 |
| 17 | Name type |
| 19-28 | Name |
| 29 | Reference |
| 30-34 | Length |
| 35 | Data type |
| 36-37 | Decimal positions |
| 38 | Usage |
| 39-41 | Line |
| 42-44 | Position |
| 45-80 | Functions (keywords) |

The ruler covers the line above while the cursor is on a line, and isn't shown on comment lines (`*` in position 7). Areas past the end of a short line aren't outlined, but the format line above still shows where they are.
