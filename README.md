# DSPF-edit

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version/ChristianLarsen.dspf-edit.svg)](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit)
[![Installs](https://vsmarketplacebadges.dev/installs/ChristianLarsen.dspf-edit.svg)](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit)
[![Rating](https://vsmarketplacebadges.dev/rating-star/ChristianLarsen.dspf-edit.svg)](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit&ssr=false#review-details)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Manual](https://img.shields.io/badge/manual-read%20it-blue)](https://christianlarsen.github.io/dspf-edit/)

**DSPF-edit** turns DDS display-file editing into a visual, live experience right inside VS Code — see the screen you're building as you build it, instead of guessing until you compile.

> 📖 **[Read the full manual →](https://christianlarsen.github.io/dspf-edit/)** — step-by-step guides for every feature, from your first field to windows, subfiles, and indicator conditions.

![DSPF-edit demo](assets/demo.gif)

---

## Why DSPF-edit?

| | SEU / STRSDA (5250) | RDi | DSPF-edit |
|---|:---:|:---:|:---:|
| Live visual preview while you edit | ❌ | ⚠️ separate tool/step | ✅ inline, drag to reposition |
| Auto-updating structure/schema view | ❌ | ✅ | ✅ |
| Runs inside VS Code | ❌ | ❌ (Eclipse) | ✅ |
| Simulate indicators/colors without compiling | ❌ | ❌ | ✅ |
| Multiple `DSPSIZ` formats (`*DS3`/`*DS4`) resolved side by side | ❌ | ⚠️ manual | ✅ |
| AND/OR indicator conditions (up to DDS's 9-indicator limit) built visually | ❌ | ⚠️ manual | ✅ |
| Column awareness while typing raw DDS (hovers, validation, snippets) | ⚠️ format line only | ✅ | ✅ |

DSPF-edit doesn't replace your compiler — it closes the gap between writing DDS and seeing the screen it produces, matching real **STRSDA** behavior field by field, so what you preview is what you get.

---

## ✨ Features

### 🖥️ Screen Preview — see it before you compile
  - Visual, green-screen-style preview of a record's fields and constants (colors, DSPATR attributes, and placeholders for output/input/both fields).
  - A field coded with `CNTFLD(n)` wraps across multiple lines in the preview, `n` characters each, all starting at its original column — matching how RDi previews it.
  - A single, compact toolbar (size, display format, overlay, indicators, add buttons) sits above the preview.
  - Drag fields/constants to reposition them directly on the preview.
  - "+ Field" / "+ Constant" buttons: click, then click a point on the screen to place a new field/constant there, using the same prompts as the tree's "Add field"/"Add constant" commands.
  - WINDOW records are drawn at their real screen position and can be resized/moved with the mouse; shows WDWTITLE if present. Supports windows shared via WINDOW(record-name).
  - Click a window's title to edit it, or use its "⋮" actions menu / one-click "center horizontally" icon — all shown only while hovering over the window.
  - Subfile (SFL/SFLCTL) records show all SFLPAG rows, and automatically preview their paired header/detail record; detail rows can't be dragged up over the header's own content.
  - Overlay any other record (dimmed) behind the one being previewed, to see how they compose.
  - Simulate indicators on/off to preview conditional fields, constants, and attributes.
  - A function-key legend (`F3`, `F12`, ...) shows every command key available to the record being previewed (file-level + record-level CAxx/CFxx); a key still shows even when its indicator condition isn't currently met (so you can see it's defined), switching to solid/inverted styling when it's actually active.
  - An active `ERRMSG()` on a window shows on the window's own reserved message line (its last content row) when the window doesn't specify `*NOMSGLIN`, matching real DDS behavior, instead of always at the bottom of the physical screen.
  - A subfile's `SFLMSG()` also shows on the message line when its indicator is active and `SFLDSP` is in effect, the same way `ERRMSG()` does (which still takes priority over it, matching the DDS reference).
  - For files with more than one DSPSIZ format (e.g. *DS3/*DS4), switch which one is previewed — window positions/sizes and conditioned elements are resolved for the selected format. Dragging/resizing/centering a window, or adjusting a subfile's SFLPAG/SFLSIZ, only affects the size currently being previewed.
  - The "Indicators" toggle and the selected display format persist when switching which record is previewed in the same panel.
  - Stays in sync with the schema tree selection in both directions.
  - "Focus" maximizes the preview so it fills the editing area, hiding the DDS source editor beside it; "Show code" brings the source back.
  - Select a field or constant (or several, with Ctrl/Cmd+click) to get a "⋮ Actions" menu: add color/attribute, copy, or delete — applied to every selected element at once for a multi-selection. A single selected field or constant also gets Rename.../Edit Text..., Indicators..., and — for fields — Validity Checks..., Editing Keywords..., and Error Messages..., the same commands the tree's context menu offers, so most of what you'd do from the tree is also reachable straight from the preview.
  - Press `Delete`/`Backspace` with one or more fields/constants selected to delete them directly — same confirmation as the "⋮ Actions" menu's Delete.
  - Double-click a dimmed background record (an SFL/SFLCTL auto-paired header/detail, the manual overlay, or a shared window's owner) to switch the preview to it, the same as picking it in the tree.
  - Right-click a field or constant to open the "⋮ Actions" menu directly, instead of the browser's native Cut/Copy/Paste menu — selecting it first if it wasn't already selected.
  - The decimal point and thousands-separator convention used to preview `EDTCDE()`-edited numeric fields — US or European — is configurable from the "⚙ Configuration" panel, either picked manually or fetched with one click from the connected IBM i's `QDECFMT` system value.

### 🧭 Schema navigation
  - Two levels are shown: **File** and **Records**.
  - Click on schema elements to jump directly to their location in the source.
  - Right-click for context-aware actions.

### File level
  - View display file attributes (e.g., display size, command keys).
  - Right-click options:
    - Create new records.
    - Assign command keys — a key number already used at the other level (file vs. record) is excluded, so you can't end up with the same key defined as both CA and CF.
    - Add Display Size: adds a second standard screen size (*DS3/*DS4) to a file that currently declares only one.
    - Change Input Default: manages a parameterless `CHGINPDFT` — removes the automatic underline input-capable fields otherwise get by default.

### Records level
  - Right-click options:
    - Create new records.
  - Each record shows:
    - Record-level attributes.
    - Constants and fields.
  - Right-click options on a record:
    - Add constant.
    - Add field.
    - Remove field.
    - Copy/Delete record.
    - Add "buttons" (constants for record commands).
    - Assign command keys — a key number already used at the other level (file vs. record) is excluded, so you can't end up with the same key defined as both CA and CF.
    - Add / Remove / Change indicators.
    - Change Input Default: manages a parameterless `CHGINPDFT` for this record — removes the automatic underline input-capable fields otherwise get by default. Warns if the file already has one at file level.
    - Resizing (if window record) — aware of every declared display size, resizing all of them at once.
    - Change Window Title (if window record) — targets the size being worked on when the record declares more than one.
    - Sort elements.
    - Preview Screen Layout (also available as an inline button on the record).

### Constants
  - Show text, position (row/column), indicators, and attributes.
  - Right-click options:
    - Edit constant.
    - Copy constant (to the same or different record).
    - Remove constant.
    - Center constant on screen.
    - Change position (absolute position/relative to existing constant).
    - Apply colors/attributes.
    - Add / Remove / Change indicators, including more than 3 ANDed indicators (up to DDS's limit of 9, spilling onto continuation lines automatically) and OR'd conditions (add/remove whole OR'd groups, or edit indicators within one).
    - Fill constant with characters.

### Fields
  - Show name, length, type, position (row/column), and flags (referenced/hidden).
  - Indicators and attributes are expandable; an OR'd condition is grouped into its ANDed sub-conditions ("Group 1 (AND)" / "OR" / "Group 2 (AND)" / ...) instead of one flat list. Hovering a conditioned field/constant/attribute shows the full condition (e.g. `51 AND NOT 61 AND 53  OR  52`) as a tooltip.
  - Right-click options:
    - Edit field — name, size, and kind (alphanumeric ↔ numeric); switching kind offers to remove any keyword that no longer applies (e.g. `EDTCDE`/`EDTWRD` when going alphanumeric).
    - Copy field (to the same or different record).
    - Remove field.
    - Center field on screen.
    - Change position (absolute position/relative to existing constant/field).
    - Apply colors/attributes.
    - Add validity checks.
    - Add editing keywords.
    - Add error messages.
    - Add / Remove / Change indicators, including more than 3 ANDed indicators (up to DDS's limit of 9, spilling onto continuation lines automatically) and OR'd conditions (add/remove whole OR'd groups, or edit indicators within one).
    - Resolve Referenced Field (for referenced fields only): fetches the real type/length/decimals from the connected IBM i, via the [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension. Also available as "Resolve All Referenced Fields" from the status bar, for every pending referenced field in the document at once.

### Attributes
  - Add / Remove / Change indicators, with the same AND/OR support as fields and constants.
  - Remove attribute.

### ✍️ DSPF source editing — stop counting columns

The visual tooling above works on the *structure* of a display file. This layer works on the *text*, for the moments you are typing DDS by hand. Like the rest of the extension, it applies to `.dspf` sources only.

  - **Status bar column assistant** — always shows where the cursor is: `DSPF | Col 27 | Name`. Purely textual, so it works for colorblind users too. Click it to open the column reference.
  - **Column reference** — a searchable list of every DDS region with its columns and purpose. Picking one **moves the cursor to that column** on the current line, padding the line with spaces if it is too short.
  - **Hover documentation** — hover any column to see the region's name, column range, purpose, valid values, examples and IBM notes. Hover a keyword in the keyword area (`TEXT`, `SFLCTL`, `WINDOW`, `DSPATR`, `EDTCDE`, `REFFLD`, `CAnn`, ...) to see its signature, an explanation and a working example.
  - **Column guides** — thin vertical lines at every DDS boundary (after columns 5, 6, 16, 18, 28, 29, 34, 35, 37, 38, 41, 44 and 80), using VS Code's native editor rulers scoped to the display file language, so other file types are untouched and there is no rendering cost. Run **DSPF Edit: Apply Recommended DSPF Editor Settings** once to switch them on. Nothing is written to your settings unless you run that command.
  - **Section highlight** — the column region containing the cursor is shaded very subtly (8% opacity by default, never above 15%), following your theme. Only the region, never the whole line.
  - **Diagnostics** — the classic DDS mistakes are flagged as you type, before the compiler sees them: text past column 80, invalid data type / usage / name-type letters, non-numeric or misaligned length, decimal positions exceeding the length or set on a character field, zoned fields over 63 digits, character fields over 32766, names too long or not left-justified, length or type on an `R` line, and column 6 not being `A`. Entries that are valid DDS but belong to physical and logical files (`P`, `B`, `H` data types, `K`/`S`/`O`/`J` name types, usage `N`) are reported as warnings that name the reason, since such a line is usually copied from a database file rather than mistyped. Comment lines are always ignored.
  - **Keyword completion** — 47 display file keywords in the keyword area (column 45 onward): `SFL`, `SFLCTL`, `WINDOW`, `DSPATR`, `COLOR`, `ERRMSG`, `CAnn`... Each completion carries documentation and inserts a fill-in-the-blanks template.
  - **Snippets** — column-perfect templates: `dspf-record`, `dspf-subfile`, `dspf-window`, `dspf-input`, `dspf-output`, `dspf-constant`, `dspf-fkey`, `field-char`, `field-zoned`, `field-date`, `field-time`, `field-timestamp`, `dspf-header`. Every one is verified by the test suite against the diagnostics above.
  - **Outline and breadcrumbs** — record formats and their fields appear in the Outline view and the breadcrumb bar, with fields showing their length/type (`7Y,0`). `Ctrl+Shift+O` jumps between them.

Every part of this layer can be turned off individually, or all at once — see [Settings](#%EF%B8%8F-settings).

---

## 🚀 How to Use

1. Open a DDS display file in VS Code.  
2. Go to **explorer view** in VS Code.
3. The **schema view** will appear automatically with the name "DSPF STRUCTURE".  
4. Use **left-click** to navigate, or **right-click** to access contextual options.  

See the **[full manual](https://christianlarsen.github.io/dspf-edit/)** for a guided walkthrough and the complete feature reference.

---

## 📄 File types

`.dspf` files are recognized automatically (case-insensitive) and mapped to the `dds.dspf` language.

That is the same language ID the IBM i ecosystem already uses, so extensions such as [IBM i Languages](https://marketplace.visualstudio.com/items?itemName=barrettotte.ibmi-languages) and display-file renderers recognize the very same files and keep working side by side. Declaring it here simply means DSPF-edit no longer needs one of them to be installed first.

If your sources use different names — members downloaded as `.MBR`, or files with no extension — map them in your settings:

```json
"files.associations": {
  "*.MBR": "dds.dspf",
  "CUSTDSP*": "dds.dspf"
}
```

You can also click the language indicator in the status bar (bottom right) and pick **DDS Display File** for the current file.

---

## 🎛️ Commands

Open the Command Palette (`Ctrl+Shift+P`) and type "DSPF":

| Command | What it does |
|---|---|
| **DSPF Edit: Apply Recommended DSPF Editor Settings** | One-time setup: switches on the column guides, scoped to `.dspf` only |
| **DSPF Edit: Show DSPF Column Reference** | Searchable column cheat sheet; jumps the cursor to the chosen region |
| **DSPF Edit: Toggle DSPF Column Guides** | Show/hide the vertical column rulers |
| **DSPF Edit: Toggle DSPF Section Highlight** | Enable/disable the cursor section highlight |
| **DSPF Edit: Configure Preview Colors...** | Customize the Screen Preview colors |
| **DSPF Edit: Reset Preview Colors to Default** | Restore the built-in preview colors |

Everything else is reached by right-clicking in the **DSPF Structure** tree or directly in the Screen Preview.

---

## ⚙️ Settings

Open Settings (`Ctrl+,`) and search for "DSPF":

| Setting | Default | Description |
|---|---|---|
| `dspf-edit.assist.enabled` | `true` | Master switch for the source-editing layer. Turn off to keep only the graphical tooling |
| `dspf-edit.assist.statusBar.enabled` | `true` | Show the status bar column assistant |
| `dspf-edit.assist.statusBar.format` | `DSPF \| Col {column} \| {section}` | Status bar text; tokens `{column}`, `{section}` |
| `dspf-edit.assist.statusBar.showIcon` | `true` | Icon before the status bar text |
| `dspf-edit.assist.hover.enabled` | `true` | Column and keyword hovers |
| `dspf-edit.assist.diagnostics.enabled` | `true` | Validation squiggles |
| `dspf-edit.assist.completion.enabled` | `true` | Keyword completion in columns 45–80 |
| `dspf-edit.assist.highlight.enabled` | `true` | Cursor section highlight |
| `dspf-edit.assist.highlight.color` | *(theme)* | Custom highlight color as hex, e.g. `#61AFEF` |
| `dspf-edit.assist.highlight.opacity` | `0.08` | Highlight opacity, capped at `0.15` |

The column guides are not a setting of their own — they are VS Code's native `editor.rulers`, written under `[dds.dspf]` by **Apply Recommended DSPF Editor Settings**. Adjust or remove them like any other setting:

```json
"[dds.dspf]": { "editor.rulers": [6, 44, 80] }
```

This extension never writes to your settings on its own; only that command and the two toggle commands do.

---

## ⚙️ Requirements

- Visual Studio Code **v1.75** or higher.
- Nothing else. The `dds.dspf` language is registered by this extension, so `.dspf` files are recognized on a clean install — and if you already use IBM i Languages or Code for IBM i, they stay fully compatible.

---

## 🐞 Known Issues

No known blocking issues right now. Please [open an issue](https://github.com/christianlarsen/dspf-edit/issues) if something isn't working as expected!

---

## 📝 To Do

- Bug fixes.  
- Support removing a declared display size.  
- Many new features to come!  

---

## 📦 Version History
See the full changelog [here](./CHANGELOG.md).

### Latest
**1.8.2** - 2026-09-26
- Fixed: resolving referenced fields — `REFFLD()` is now found when coded on its own line below the field, not only on the field's definition line ([#90](https://github.com/christianlarsen/dspf-edit/issues/90)).
- Fixed: resolving referenced fields — with no library (or `*LIBL`/`*CURLIB`), the file is now looked up in the Code for i connection's current library and library list, in order, instead of in any library on the system.
- Fixed: keywords continued onto the next line with `+` (not just `-`) are now joined correctly, so e.g. a wrapped `WDWBORDER()` shows properly in the Screen Preview.
- Fixed: Screen Preview and Add Attribute — `DSPATR()` with several attributes (e.g. `DSPATR(UL HI)`) is now recognized.
- Fixed: Add Buttons, Center and Change Window Title use the display size selected in the Screen Preview instead of asking for it.
- Fixed: Screen Preview — a window with a top and a bottom `WDWTITLE` (e.g. `*BOTTOM *RIGHT`) now shows both titles, not just the first one.

---

## ⭐ Enjoying DSPF-edit?

If it's saving you trips to SEU or STRSDA, please consider [leaving a rating on the Marketplace](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit&ssr=false#review-details) — it takes 10 seconds and is the single biggest thing that helps other IBM i developers find it.

💬 **Feedback is welcome!** Please leave a comment, [open an issue](https://github.com/christianlarsen/dspf-edit/issues), and enjoy using DSPF-edit.
