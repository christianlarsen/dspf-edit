# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

- More DDS features and improvements planned.
- Bug fixes and stability enhancements.

## [0.17.0] - 2026-08-12
### Added
- Command Keys: adding a CAxx/CFxx now also checks the *other* level (the file, when adding to a record; every record, when adding at file level) and excludes any key number already used there from the picker, regardless of whether the type matches — prevents generating a record whose effective key set defines the same key number as both CA and CF (or twice), which DDS won't compile.
- Preview: a function-key legend now always shows below the toolbar — one green-bordered `Fnn` badge per key actually available to the record being previewed (file-level + record-level CAxx/CFxx, record overriding file per key number, narrowed to the active display format). A key still shows even when its own indicator condition isn't currently met, so you can see at a glance that it's *defined*; it switches to solid (inverted) styling when it's actually active right now — correctly handling more than one indicator-conditioned alternate per key number (AND/OR), and hovering shows its description.
- Preview: an active `ERRMSG()` on a `WINDOW` record now shows on the window's own reserved message line (its last content row) instead of always at the bottom of the physical screen — matching the DDS `WINDOW` keyword's `MSGLIN`/`*NOMSGLIN` parameter (a window reserves its own message line by default; `*NOMSGLIN` is what opts out and sends it to the display's normal message line instead).
- Preview: the "Indicators" toggle and the active display format (e.g. *DS3) now persist across switching which record is previewed in the same panel, instead of resetting back off/default every time.
### Fixed
- Command Keys / Preview: a CAxx/CFxx description longer than 25 characters — legitimately allowed by DDS, spilling onto a continuation line in the source — was silently dropped from both the "current key commands" list and the preview's function-key legend. The reading regex incorrectly reused the 25-character cap that's only meant to apply when this tool itself creates a *new* key command.
- Preview: the display-format dropdown (the *DS3/*DS4 selector) could end up blank instead of showing a real selection — it now keeps the previously-selected format across record switches, but wasn't falling back when that format no longer applied (e.g. after switching to a different file, or a live edit removed a DSPSIZ format from the current one).
- Preview: the panel went blank after being dragged to a different editor group — VS Code was tearing down its live content whenever it became hidden (which moving it briefly does) and nothing re-rendered it on return; the panel now keeps its content alive in the background (`retainContextWhenHidden`).

## [0.16.0] - 2026-08-11
### Added
- Multi-size (DSPSIZ) awareness across creation and editing: when a display file declares more than one screen size (e.g. `DSPSIZ(24 80 *DS3 27 132 *DS4)`), the extension now keeps every declared size correct instead of only ever acting on the first one.
  - New Record / Change Window Size: creating or resizing a WINDOW now generates one `WINDOW()` line per declared size — same rows/columns, position recalculated to fit each screen — instead of a single line silently reused (and often mispositioned) on every size.
  - Change Window Title: edits the title line that actually matches the size being worked on, asking which one when invoked from the tree and the record declares more than one.
  - Preview: dragging/resizing/centering a window, or adjusting a subfile's SFLPAG/SFLSIZ, while a specific size is selected in the preview's format switcher no longer silently changes the other declared size too — the first time a shared, unconditioned line is edited this way, it's split into one explicit line per declared size, and only the one being viewed changes.
  - New "Add Display Size" command (right-click the file in the tree) adds the second standard size (*DS3/*DS4) to a file that currently declares only one, rewriting its DSPSIZ specification in place. Existing windows/subfiles keep applying to the new size unchanged (DDS's own "unconditioned line applies everywhere" rule) until adjusted per size from the preview. Removing a declared size isn't supported yet.
  - Change Position: a field/constant's row/column bounds are now validated against the smallest declared size, not just the first one, so a position stays reachable regardless of which size is active.

## [0.15.0] - 2026-08-11
### Added
- Indicators: full support for DDS's AND/OR conditioning — previously only a single line's worth (up to 3 ANDed) was read or editable, and OR'd conditions were silently ignored.
  - Parser: reads indicator-only continuation lines (position 7 `A`/blank to extend an AND group beyond 3, `O` to start a new OR'd group), up to DDS's own limits (9 ANDed indicators per condition, 9 OR'd conditions).
  - Tree view: an OR'd condition is now shown grouped into its ANDed sub-conditions instead of one flat, misleading list; hovering a conditioned field/constant/attribute shows the full condition as a tooltip (e.g. `51 AND NOT 61 AND 53  OR  52`).
  - Preview: indicator simulation (on/off toggles) now evaluates AND/OR conditions correctly instead of treating every indicator as ANDed together.
  - "Indicators" command: add a 4th+ ANDed indicator (continuation lines are generated/removed automatically), add or remove a whole OR'd condition, or edit indicators within a specific one when there's more than one.

## [0.14.2] - 2026-08-09
### Fixed
- Tree view: a record created in a brand-new DSPF source (one that started out with zero records) didn't show up in the records list until the source was closed and reopened — the per-document record filter seeded itself empty on that first parse and never learned to include anything added afterward.
- Parser/Preview: subfile record formats generated by SDA/RDI often carry the `SFL` keyword on its own line, separate from the record format name line, instead of on the same line. The parser only recognized `SFL` when it was on the record's own line, so those subfiles' fields rendered stacked vertically in the preview instead of side-by-side as subfile columns.

## [0.14.1] - 2026-08-01
### Fixed
- Parser: `REFFLD()`'s field name can be qualified with a record format (`REFFLD(record-format-name/field-name [library-name/]file-name)`), needed to disambiguate a field name that exists in more than one format of the referenced file. This qualification wasn't parsed correctly — the whole "format/field" text was used as the field name, which then never matched an actual database column, breaking resolution against IBM i entirely. Add/Edit Field's "Referenced Field" flow now also has a dedicated (optional) step for the record format, separate from the field name.
- Add Editing Keywords: `EDTCDE`/`EDTWRD`/`EDTMSK` were always rejected as "not a numeric field" on a referenced field, even after its real type had been resolved from IBM i (via "Resolve Referenced Field") — the check only ever looked at the field's own DDS source type, which is blank for a referenced field. It now uses the resolved type/length/decimals when available, and the warning explains when it's the type that's still unresolved rather than the field genuinely being non-numeric.
- Preview: a field with `EDTCDE()` rendered as a plain, unformatted placeholder (e.g. `66666666`) instead of showing the thousands separators/decimal point/sign a real edited numeric field displays — only `EDTWRD` was accounted for. The preview now derives an equivalent mask from the standard DDS edit-code table (1-4, A-D, J-M).
- Parser: fixed incorrect handling of multi-line constants (text continued across several source lines with a `-`) — depending on how the source line was formatted, the continuation could be missed or left embedded in the resulting text instead of being stripped out cleanly.
- Delete Field/Constant: if the following field/constant in the record had its Line/Position coded relative to the deleted one (DDS's relative record format — a blank Line, or a Position written as `+n`), deleting it silently re-anchored that following element to whatever now precedes it, moving it on screen. It's now materialized to an explicit absolute position first, matching what Move Field/Constant already does for an inherited row.
- Preview: deleting the only field/constant in a record that carried any conditioning indicators left the indicator toggle buttons for those indicators showing in the preview's indicator bar, instead of clearing along with it — a stale-refresh bug in the webview's own script, not the parser.
- Preview: adjusted the `COLOR(BLU)` shade to match the IBM i Access Client Solutions (ACS) 5250 terminal more closely.

## [0.14.0] - 2026-07-30
### Added
- New "Resolve Referenced Field" action for referenced fields (`REFFLD`/position-29 `R`, which carry no type/length in the source): a button on the field — and a "Resolve All Referenced Fields" command, also reachable from a new status bar item — queries the connected IBM i, via the [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension, for the referenced database field's real type/length/decimals. Works for both native physical/logical files and SQL-created tables (which can have different long and short column names). Once resolved, the field shows its real type/length in both the tree and the preview (rendered like a normal field, tinted the reference color only when it carries no `COLOR()`/`DSPATR()` of its own). Cached per document until it's closed, or re-resolved on demand from the same button. Requires Code for i to be installed and connected; shows a clear message otherwise.
- A status bar item shows how many referenced fields in the current document are still pending resolution.
- Preview: support for the `CNTFLD(n)` keyword — a field too long to fit on one line now wraps across multiple rows, `n` characters each, all starting at the field's original column, matching how RDi previews it. Centering such a field (`Center`/"↔") now uses its per-line width instead of its full declared length.
### Fixed
- Performance: two O(n²) hotspots in the parser (linking fields/constants to their record, and duplicate-field detection) made re-parsing a document — e.g. after moving a field in the preview — get dramatically slower as it grew larger. Both are now linear.
- Performance: checking whether a file is read-only before applying an edit did a live round-trip to the IBM i on every single edit while connected via Code for i. It's now cached per document.
- Referenced fields were missing the usual field context menu/inline actions (delete, copy, rename, etc.), due to a stricter internal check that didn't account for their new "pending"/"resolved" state.
- Parser: a field/constant positioned relative (`+n`) right after a bare system keyword (`DATE`, `TIME`, `USER`, `SYSNAME`) landed several columns too far left in the preview, overlapping the keyword's own placeholder — the parser was tracking the keyword's raw source-text length instead of its actual on-screen width when resolving the following `+n` position.
- Preview: dragging a `CNTFLD`-wrapped field failed with "the document may be read-only" — its wrapped lines all share one source line, and each was independently written back on drop, producing overlapping edits VS Code rejected outright.
- Preview: selecting a `CNTFLD`-wrapped field showed "N fields selected" (one per wrapped line) instead of being treated as the single field it is, hiding the "↔ Center"/"⋮ Actions" buttons as a result.

## [0.13.6] - 2026-07-29
### Fixed
- Parser: fields and constants positioned using DDS's relative record format (`+n` in the Position field, or a blank Line/Row meaning "same row as the previous field/constant") were misparsed as attributes and silently dropped, instead of being resolved to their actual screen position relative to the preceding field/constant.
- Move Field/Constant Left/Right (tree buttons): when a field/constant's row was inherited via the relative record format above, moving it horizontally updated the column but left the row blank in the source instead of writing it explicitly — unlike dragging in the preview panel, which already materializes both. Moving with the tree buttons now writes the row too.

## [0.13.5] - 2026-07-28
### Added
- Preview: a referenced field (`REFFLD`/position-29 `R`) now renders as a single marker character in a distinct color with a dashed box, instead of a guessed-width placeholder — its real type/length live in the external database field, which dspf-edit has no way to read.
### Fixed
- Add/Edit Field: problems with fields with length of 100 or more.
- Parser: field length was read back from only the last 2 characters of the length column. It has been fixed.
- Add Field: a referenced field (library/file/field) generated an invalid `REFFLD(library/file.field)` specification. Now generates the correct `REFFLD(field [library/]file)` format.
- Add Field: referencing a field required a library name, even though DDS itself makes it optional (falls back to the library list, `*LIBL`, when omitted). The prompt now accepts an empty library.

## [0.13.4] - 2026-07-27
### Fixed
- Parser: DDS comment lines with column 6 left blank (e.g. decorative `***...` banner blocks — the more common comment style, as opposed to `A*...`) were not recognized as comments. Such a line was misparsed as a field, and any file-level keyword coming after it (most notably `DSPSIZ()`) got attached to that phantom field instead of the file, silently falling back to the default screen size (24x80/*DS3) instead of the one actually declared. The same comment-detection fix was applied everywhere else it was used: locating insertion points for key commands, error messages, and file-level attributes.

## [0.13.3] - 2026-07-26
### Added
- Preview: selecting a field or constant now shows a "Selection actions" bar in the toolbar strip (not floating over the canvas, so it never fights the drag gesture or gets cramped by a single-character constant) — a one-click "↔ Center" button and a "⋮ Actions" menu (Add Color..., Add Attribute...), reusing the tree's own commands against the selected element.
- Preview/Center: the DDS system keywords `DATE`, `TIME`, `USER`, and `SYSNAME` now render with their real on-screen appearance (`DD-DD-DD`, `TT:TT:TT`, `UUUUUUUUUU`, `SSSSSSSS`), whether coded as a field's name or bare (unquoted) in a constant's position; "Center" now centers them using that real display width instead of the raw, misleadingly short source length.
- Preview: fields and constants can now be multi-selected (Ctrl/Cmd+click) and dragged together as one group, writing every new position back in a single edit; the selection bar reads "N fields/constants selected", and only offers "↔ Center"/"⋮ Actions" when exactly one item is selected.
- "Add Field" now offers a quick flow — just kind+usage (Alphanumeric/Numeric × Output/Input-Output/Input) and a size — that generates the same field STRSDA itself would (including an automatic `EDTWRD()` for numeric fields with decimals), reusing the same name/position steps as before; the full usage/referenced-field/type flow is still available behind a "More options..." entry for anything else (Hidden/Message usage, a referenced field, or another data type).
### Fixed
- Editing a read-only DDS source (e.g. an IBM i member opened in browse mode, or a read-only file) silently let every edit command (add/rename/move/delete field, constant, attribute, indicator, key command, window resize/title, subfile page size, and more) report success and modify the in-memory buffer, only to fail later with no warning when actually saving. Edits are now checked against the file's read-only status upfront, showing an immediate error instead.
- Preview: an output field with no explicit usage code (DDS's own default when left blank) showed its field name instead of the correct repeated-`O` placeholder text.
- Preview: a Date/Time/Timestamp (`L`/`T`/`Z`) field with no explicit length (DDS determines it automatically for these types) collapsed to a single placeholder character instead of its real fixed width (10/8/26).
- Parser: a bare system keyword (`DATE`, `TIME`, `USER`, `SYSNAME`) coded in a constant's position without quotes had its first and last character corrupted, since quote-stripping was applied unconditionally instead of only to actually-quoted text.
- Parser: two or more constants sharing identical text at different screen positions (e.g. blank/space "pixel" blocks used to build a colored logo out of `DSPATR(RI)` blocks) were silently collapsed down to just the first one found, since duplicates were detected by text alone instead of by source line.
- Preview: `DSPATR(HI)` with no explicit `COLOR()` rendered in the default green instead of white, unlike a real 5250 display.
- Preview: an alphanumeric field with a blank data-type column (DDS's own default — e.g. from the quick "Add Field" flow) showed numeric placeholder digits (6/9/3) instead of the correct usage letter (O/B/I).
- Preview: a numeric field carrying an `EDTWRD()` edit word showed a plain run of digits instead of the mask's actual picture (e.g. `99999999.99` instead of `9999999999`).

## [0.13.2] - 2026-07-25
### Added
- New "Add Commands Record" command (record context menu, shown only on subfile control (SFLCTL) records): creates a record right after the subfile for its function-key legend (e.g. "F3=Exit"). For window subfiles, moves the SFLCTL's own `WINDOW()` (and `WDWTITLE()`/`WDWBORDER()`) onto the new record and leaves a `WINDOW(record)` reference behind, so the legend shares the subfile's window.
- New "Page rows" +/- control in the preview toolbar for SFLCTL records: adjusts `SFLPAG()`, always keeping `SFLSIZ()` one more than `SFLPAG()`.
### Fixed
- An SFL/SFLCTL pair sharing a window (the SFLCTL declaring `WINDOW()` directly) could hide the other half's content behind the window's own opaque background in the preview.
- Dragging a window in the preview left the paired SFL/SFLCTL record's dimmed content static until the mouse was released, instead of moving live with the window.

## [0.13.1] - 2026-07-24
### Added
- New "Grid Dots" toggle in the preview toolbar: marks every empty character cell with a dot, to see spacing between fields/constants (and around a window's border) while designing a screen.
- Indicator simulation now resolves `ERRMSG()`: when its conditioning indicator is on, the message shows on the display's message line (in white), and the field it's attached to is shown in reverse image.
### Fixed
- A `WINDOW()` keyword followed by an optional parameter (e.g. `*NOMSGLIN`, `*RESTORE`, `*PRINT`) was not recognized, so the window wasn't rendered in the preview; moving/resizing a window with such a parameter, or editing its title, no longer strips it.

## [0.13.0] - 2026-07-23
### Added
- New "Preview Screen Layout" option: shows a green-screen-style visual preview of a record on a canvas. Also available as an inline button on record tree items, in addition to the context-menu option.
  - Supports COLOR() and DSPATR() keywords (HI, RI, BL, UL, CS, ND); input-capable fields are shown underlined.
  - Fields/constants can be dragged to reposition them, writing the new position back into the source.
  - "+ Field" / "+ Constant" buttons: click, then click a point on the screen to place a new field/constant there, reusing the same name/type/position prompts as the tree's "Add field"/"Add constant" commands. Validated against the record's own area (a window's content frame, or the SFL detail area below its header).
  - WINDOW records are drawn at their real screen position and can be resized/moved with the mouse; WDWTITLE is shown. Windows shared via WINDOW(record-name) are supported.
  - Clicking a window's title edits it directly; a "⋮" actions menu and a one-click "center horizontally" icon are also available on the window frame — all three only appear while hovering over the window.
  - Subfile (SFL/SFLCTL) records show all SFLPAG rows, and automatically preview their paired header/detail record; the detail rows can't be dragged up over the header's own content.
  - Any other record can be overlaid (dimmed) behind the one being previewed, to see how they compose.
  - Indicator simulation: toggle indicators on/off to preview conditional fields, constants, and attributes.
  - Display format switcher: for DSPF files declaring more than one DSPSIZ format (e.g. *DS3/*DS4), lets you switch between them — window positions/sizes, SFLSIZ/SFLPAG, and conditioned fields/constants/attributes are resolved for whichever format is active. Locked when the file only declares one format.
  - The preview stays in sync with the schema tree selection in both directions.
  - The toolbar (size, display format, overlay, indicators, add buttons) is laid out as a single, compact row.
- New "Change Window Title" command (record context menu) to add, edit, or remove a window's WDWTITLE(), with horizontal alignment (*LEFT/*CENTER/*RIGHT) and vertical position (*TOP/*BOTTOM); also editable directly from the preview.
### Fixed
- Moving a field or constant left/right in a subfile (buttons in the schema view) wrote the new position into the wrong source columns.
- The "Add buttons" command placed buttons in column 1 for window records instead of column 2 (column 1 isn't usable inside a window).
- A line conditioned by a display format name (e.g. "*DS3") instead of indicators was misread as garbage indicator data.
- Without indicator simulation, mutually-exclusive fields/constants/attributes conditioned by complementary indicators (e.g. one on "61", the other on "N61") could show at once instead of resolving to a single, deterministic state.
- Switching between two open DSPF files could leak one file's second DSPSIZ format size into the other's display-format selector.
- The record filter could silently hide a newly-added record with no obvious cause; it's now disabled (with a warning message) whenever a new record appears while the filter is active.
- The record filter could reset unpredictably back to "show all" whenever any record became invalid (e.g. renamed/removed), instead of just pruning the stale entry.
- "Hide all" in the record filter menu didn't actually hide records, only fields/constants.

## [0.12.3] - 2025-11-30
### Fixed
- When creating a new field, the horizontal position was being saved incorrectly in the source.

## [0.12.2] - 2025-11-29
### Fixed
- The movement of fields and constants in subfiles is corrected.
- Changes in record filtering.

## [0.12.1] - 2025-11-29
### Fixed
- The movement of fields and constants in subfiles is corrected.
- Changes in record filtering.

## [0.12.0] - 2025-11-28
### Added
- Now you can move a constant or field, one or five positions to the right or left using a button directly from the schema view.
### Fixed
- Changes to the filter button. It now maintains the filter by file (you can have a different filter applied to another file while they remain open).

## [0.11.0] - 2025-11-15
### Added
- Now you can filter the records you want to work with using the filter button. Also you can select if you want to see the constants or fields, or both.

## [0.10.5] - 2025-11-04
### Fixed
- The parser wasn't reading the first line of the document.

## [0.10.4] - 2025-11-03
### Fixed
- Problems adding new field on column > 80 position.

## [0.10.3] - 2025-10-31
### Fixed
- Problems adding new field on column > 80 position.

## [0.10.2] - 2025-10-30
### Fixed
- Bad DSPSIZ parsing.

## [0.10.1] - 2025-10-03
### Fixed
- Record renaming was not working fine in all cases.

## [0.10.0] - 2025-10-03
### Added
- New rename option for fields and records (button and menu option).

## [0.9.1] - 2025-10-03
### Fixed
- The extension no longer validates whether a constant fits on the screen. Constants that don’t fit can now be viewed by resizing the window.

## [0.9.0] - 2025-09-28
### Added
- Ability to remove a constant or field attribute from the DDS.

## [0.8.0] - 2025-09-21
### Added
- Ability to remove a constant or a field from the DDS.

## [0.7.3] - 2025-09-20
### Fixed
- Corrected navigation when clicking on the attributes.

## [0.7.2] - 2025-09-20
### Fixed
- Issue inserting keyword WSFLRRN in subfile records.
- "Buttons" cannot be inserted in records with SFL keyword.

## [0.7.1] - 2025-09-19
### Refactored
- Internal refactoring and code cleanup.
### Fixed
- 3-digit rows/columns were not being parsed correctly.
### Changed
- Improved subfile record creation (both regular and window subfiles):
  - Every subfile is created with a control record (header), and the subfile record (detail).
  - The control record is created with: SFLSIZ, SFLPAG, OVERLAY, RTNCSRLOC, SFLCSRRRN, SFLDSP, SFLDSPCTL,
    SFLCLR and SFLEND. SFLDSP, SFLDSPCTL, SLFEND with N80 indicator, and SFLCLR with 80 indicator.
    Also some hidden fields are added: NRR, NBR, WSRECNAM, WSFLDNAM, and WSFLRRN.
    (all this will be configurable in future versions).

## [0.7.0] - 2025-09-14
### Added
- Ability to copy a Field/Constant to a different record or to a different position within the same record.  
  If copying a field, you must provide a new name if one with the same name already exists in the destination record.
### Fixed
- Fixed an issue when sorting items in a record that had hidden fields. These fields now appear first in the sort order.

## [0.6.2] - 2025-09-10
### Fixed
- Fixing resizing again.

## [0.6.1] - 2025-09-09
### Fixed
- Internal fixes. Refactoring.
- The resizing function was not working correctly.

## [0.6.0] - 2025-09-08
### Added
- New feature: Sort elements function for sorting constants/fields in a record by row, column or row/column, ascending or descending.
### Fixed
- You can add a new record from the "File" node, or from the "Records" node.

## [0.5.1] - 2025-09-08
### Fixed
- Field size validation is fixed when editing fields.

## [0.5.0] - 2025-09-06
### Added
- The extension can be launched from a separate icon in the activity bar.
- The extension remembers the last opened DDS display file source and allows you to use other extensions simultaneously (for example, you can use IBM i Renderer without losing the DDS structure on the screen).
### Fixed
- Problems adding a new field.

## [0.4.3] - 2025-09-04
### Fixed
- Now only the field length is requested when the type requires it.

## [0.4.2] - 2025-09-02
### Fixed
- Internal changes.

## [0.4.1] - 2025-08-31
### Fixed
- The WDWTITLE opcode was not split properly if the line exceeded column 80.

## [0.4.0] - 2025-08-30
### Added
- Possibility of window resizing.

## [0.3.4] - 2025-08-30
### Fixed
- If the field has no attributes, the first attribute is set on the same line in the DDS.
- If the field has no attributes, the first color is set on the same line in the DDS.
- If the field has no attributes, the first editing keyword is set on the same line in the DDS.
- The calculation of the position of the "buttons" in "add-buttons" has been modified.
- The function "isAttributeLine" has been improved.

## [0.3.3] - 2025-08-28
### Fixed
- Internal parser bug fixes.

## [0.3.2] - 2025-08-26
### Fixed
- SFL field column/rows bad configured.

## [0.3.1] - 2025-08-25
### Fixed
- WDWTITLE command fix.

## [0.3.0] - 2025-08-24
### Added
- Add fields in relative position to another field/constant on screen.

## [0.2.1] - 2025-08-23
### Added
- Fill constants with characters.

## [0.2.0] - 2025-08-23
### Added
- Add constants in relative position to another on screen.

## [0.1.1] - 2025-08-22
### Fixed
- When creating a new window record, it's not positioned in the correct row. It moves up two positions.
- When creating "buttons," in a window, the starting position should be 1. In records, it should be 2. 

## [0.1.0] - 2025-08-21
### Added
- Add / Modify / Remove indicators on constants/fields.
- Add / Modify / Remove indicators on constants/fields attributes.

## [0.0.1] - 2025-08-19
### Added
- Initial release of **DSPF-edit** (Preview).
- Visual schema explorer for DDS display files.
- Navigation between DDS file, records, fields and constants.
- Context menu actions:
  - Create/edit constants and fields.
  - Copy/delete records.
  - Apply colors, attributes, and indicators.
  - Add command keys and validity checks.
  - Add error messages.
- Support for display size and positioning of elements.
