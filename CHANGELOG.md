# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

- More DDS features and improvements planned.
- Bug fixes and stability enhancements.

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

## [0.1.0] - 2025-08-21
### Added
- Add / Modify / Remove indicators on constants/fields.
- Add / Modify / Remove indicators on constants/fields attributes.

## [0.1.1] - 2025-08-22
### Fixes
- When creating a new window record, it's not positioned in the correct row. It moves up two positions.
- When creating "buttons," in a window, the starting position should be 1. In records, it should be 2. 

## [0.2.0] - 2025-08-23
### Added
- Add constants in relative position to another on screen.

## [0.2.1] - 2025-08-23
### Added
- Fill constants with characters.

## [0.3.0] - 2025-08-24
### Added
- Add fields in relative position to another field/constant on screen.

## [0.3.1] - 2025-08-25
### Fixes
- WDWTITLE command fix.

## [0.3.2] - 2025-08-26
### Fixes
- SFL field column/rows bad configured.

## [0.3.3] - 2025-08-28
### Fixes
- Internal parser bug fixes.

## [0.3.4] - 2025-08-30
### Fixes
- If the field has no attributes, the first attribute is set on the same line in the DDS.
- If the field has no attributes, the first color is set on the same line in the DDS.
- If the field has no attributes, the first editing keyword is set on the same line in the DDS.
- The calculation of the position of the "buttons" in "add-buttons" has been modified.
- The function "isAttributeLine" has been improved.

## [0.4.0] - 2025-08-30
### Added
- Possibility of window resizing.

## [0.4.1] - 2025-08-31
### Fixes
- The WDWTITLE opcode was not split properly if the line exceeded column 80.

## [0.4.2] - 2025-09-02
### Fixes
- Internal changes.

## [0.4.3] - 2025-09-04
### Fixes
- Now only the field length is requested when the type requires it.

## [0.5.0] - 2025-09-06
### Added
- The extension can be launched from a separate icon in the activity bar.
- The extension remembers the last opened DDS display file source and allows you to use other extensions simultaneously (for example, you can use IBM i Renderer without losing the DDS structure on the screen).
### Fixes
- Problems adding a new field.

## [0.5.1] - 2025-09-08
### Fixes
- Field size validation is fixed when editing fields.

## [0.6.0] - 2025-09-08
### Added
- New feature: Sort elements function for sorting constants/fields in a record by row, column or row/column, ascending or descending.
## Fixes
- You can add a new record from the "File" node, or from the "Records" node.

## [0.6.1] - 2025-09-09
## Fixes
- Internal fixes. Refactoring.
- The resizing function was not working correctly.

## [0.6.2] - 2025-09-10
## Fixes
- Fixing resizing again.

### [0.7.0] - 2025-09-14
## Added
- Ability to copy a Field/Constant to a different record or to a different position within the same record.  
  If copying a field, you must provide a new name if one with the same name already exists in the destination record.
## Fixed
- Fixed an issue when sorting items in a record that had hidden fields. These fields now appear first in the sort order.

### [0.7.1] - 2025-09-14
## Refactored
- Internal refactoring and code cleanup.
## Fixed
- Improved subfile record creation.