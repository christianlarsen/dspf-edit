# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

- More DDS features and improvements planned.
- Bug fixes and stability enhancements.

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
