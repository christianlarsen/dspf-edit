---
title: Command Keys
description: Assigning CAxx/CFxx command keys at file or record level.
---

Command keys (`CA01`-`CA24` / `CF01`-`CF24`, i.e. "command attention" and "command function" keys) can be assigned at file level or at record level.

## Assigning a key

Right-click the **File** node, or a **Record** node, and choose **Command Keys** to assign one.

## No CA/CF collisions

A key number already assigned at the *other* level is excluded from the picker — if `F3` is already a `CA` key at file level, it won't be offered as a `CF` key at record level, and vice versa. This makes it impossible to end up with the same key defined as both `CA` and `CF`, which DDS itself allows to be written but which real systems don't treat consistently.

## Seeing key assignments in the preview

The [Screen Preview](/guides/screen-preview/)'s function-key legend shows every command key available to the record being previewed — file-level and record-level together — switching to solid/inverted styling when the key's indicator condition is currently met.

## Related: buttons

[Add Buttons](/guides/records/#add-buttons) on a record adds constants showing a key's label (e.g. `F3=Exit`) next to its assignment.
