# DSPF-edit

**DSPF-edit** is a Visual Studio Code extension that helps IBM i developers when creating or modifying DDS source files for **display files**.

The extension provides a **navigable schema view** of the DDS source file that is automatically updated whenever the source changes.

---

## ✨ Features

- **Schema navigation**
  - Two levels are shown: **File** and **Records**.
  - Click on schema elements to jump directly to their location in the source.
  - Right-click for context-aware actions.

- **File level**
  - View display file attributes (e.g., display size, command keys).
  - Right-click options:
    - Create new records.
    - Assign command keys.

- **Records level**
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
    - Assign command keys.
    - Add / Remove / Change indicators.
    - Resizing (if window record).
    - Change Window Title (if window record).
    - Sort elements.
    - Preview Screen Layout (also available as an inline button on the record).

- **Constants**
  - Show text, position (row/column), indicators, and attributes.
  - Right-click options:
    - Edit constant.
    - Copy constant (to the same or different record).
    - Remove constant.
    - Center constant on screen.
    - Change position (absolute position/relative to existing constant).
    - Apply colors/attributes.
    - Add / Remove / Change indicators.
    - Fill constant with characters.

- **Fields**
  - Show name, length, type, position (row/column), and flags (referenced/hidden).
  - Indicators and attributes are expandable.
  - Right-click options:
    - Edit field.
    - Copy field (to the same or different record).
    - Remove field.
    - Center field on screen.
    - Change position (absolute position/relative to existing constant/field).
    - Apply colors/attributes.
    - Add validity checks.
    - Add editing keywords.
    - Add error messages.
    - Add / Remove / Change indicators.
    - Resolve Referenced Field (for referenced fields only): fetches the real type/length/decimals from the connected IBM i, via the [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension. Also available as "Resolve All Referenced Fields" from the status bar, for every pending referenced field in the document at once.

- **Attributes**
    - Add / Remove / Change indicators.
    - Remove attribute.

- **Screen Preview**
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
  - For files with more than one DSPSIZ format (e.g. *DS3/*DS4), switch which one is previewed — window positions/sizes and conditioned elements are resolved for the selected format.
  - Stays in sync with the schema tree selection in both directions.

---

## 🚀 How to Use

1. Open a DDS display file in VS Code.  
2. Go to **explorer view** in VS Code.
2. The **schema view** will appear automatically with the name "DSPF STRUCTURE".  
3. Use **left-click** to navigate, or **right-click** to access contextual options.  

---

## ⚙️ Requirements

- Visual Studio Code **v1.75** or higher.

---

## 🐞 Known Issues

This extension is currently in **preview**.  
Some features may not work as expected. Please leave an issue if something is not working fine!

- DDS indicator **OR conditioning** is not yet supported: DDS lets you OR several indicator-only continuation lines (marked with `O` in column 7) together, with the actual keyword coded on the last line of the group. Only the indicators on that last line are currently read — the preceding OR'd indicator-only lines are ignored.

---

## 📝 To Do

- Bug fixes.  
- Correct handling of display sizes.  
- Many new features to come!  

---

## 📦 Version History
See the full changelog [here](./CHANGELOG.md).

### Latest
**0.14.0** - 2026-07-30
- Added: "Resolve Referenced Field" action (and "Resolve All Referenced Fields", from a new status bar item) fetches a referenced field's real type/length/decimals from the connected IBM i, via the [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension. Resolved fields show their real type/length in both the tree and the preview.
- Added: Preview support for the `CNTFLD(n)` keyword — a field too long for one line now wraps across multiple rows, `n` characters each, at the same column, matching RDi's preview. Centering such a field now uses its per-line width instead of its full declared length.
- Fixed: Performance: re-parsing a document (e.g. after moving a field in the preview) got dramatically slower as it grew larger, due to two O(n²) hotspots in the parser. Both are now linear.
- Fixed: Performance: checking whether a file is read-only before applying an edit did a live round-trip to the IBM i on every single edit while connected via Code for i. It's now cached per document.
- Fixed: Referenced fields were missing the usual field context menu/inline actions (delete, copy, rename, etc.).
- Fixed: Parser: a field/constant positioned relative (`+n`) right after a bare system keyword (`DATE`, `TIME`, `USER`, `SYSNAME`) landed several columns too far left in the preview, overlapping the keyword's own placeholder.
- Fixed: Preview: dragging a `CNTFLD`-wrapped field failed with a false "document may be read-only" error, since its wrapped lines all share one source line.
- Fixed: Preview: selecting a `CNTFLD`-wrapped field showed "N fields selected" instead of treating it as the single field it is, hiding the "Center"/"Actions" buttons.

---

💬 **Feedback is welcome!** Please leave a comment, open an issue, and enjoy using DSPF-edit.
