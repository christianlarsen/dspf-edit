---
title: Records
description: Creating, copying, resizing, and organizing records.
---

Records are the second level of the [Schema Tree](/dspf-edit/guides/schema-tree/). Each record node lists its own attributes, plus its constants and fields.

## Create a new record

Right-click the **Records** node, or the **File** node, and choose **New Record**.

## Copy / Delete a record

Right-click a record and choose **Copy Record** or **Delete Record**.

## Add constant / Add field / Remove field

Right-click a record for **Add constant** and **Add field** (see [Constants](/dspf-edit/guides/constants/) and [Fields](/dspf-edit/guides/fields/)), or **Remove field** to remove an existing one.

## Add buttons

**Add buttons** interactively collects one or more function-key/label pairs (e.g. `F3` / `Exit`) and adds them to the record as constants, formatted the conventional DDS way (e.g. `F3=Exit`) — a quick way to add a function-key legend without typing each constant by hand.

## Add Commands Record

Available on a subfile control (**SFLCTL**) record. Creates a new, empty record right after it, meant to hold the subfile's function-key legend (e.g. "F3=Exit", "F12=Cancel") — conventionally kept on a separate record from the `SFLCTL` itself.

If the `SFLCTL` declares its own `WINDOW(startRow startCol rows cols)` directly, that window (and any `WDWTITLE()`/`WDWBORDER()` that go with it) is moved onto the new record, and the `SFLCTL` is left with a `WINDOW(newRecordName)` reference — the same "commands record owns the shared window, `SFLCTL` borrows it" pattern real-world DDS commonly uses, since the legend text then lives in the same window as the subfile it describes. See [Subfiles](/dspf-edit/guides/subfiles/).

After adding the record, use **Add Constant** on it to add the function-key texts.

## Assign command keys

Right-click a record for **Command Keys**. A key number already assigned at the other level (file vs. record) is excluded from the picker, so you can never end up with the same key defined as both `CA` and `CF`. See [Command Keys](/dspf-edit/guides/command-keys/).

## Indicators

**Add / Remove / Change indicators** on a record — see [Indicators and Conditions](/dspf-edit/guides/indicators/).

## Change Input Default

Right-click the **File** node, or a **Record** node, and choose **Change Input Default** to manage a parameterless `CHGINPDFT` — removes the underline input-capable fields otherwise get by default. Only this parameterless form is supported for now; if the record (or file) already has `CHGINPDFT` with parameters, the command tells you and leaves it alone. Invoked on a record, it also warns when the file already has its own `CHGINPDFT`, since that one already applies to every record (a lower level overrides a higher one, same as real DDS). See [Default underline on input-capable fields](/dspf-edit/guides/colors-attributes/#default-underline-on-input-capable-fields).

## Overlay

Right-click a record and choose **Overlay** to add `OVERLAY`, which shows the record without erasing the screen first: only the records it overlaps are removed. Choose **Add** to have it always, or **Add with indicators...** to condition it, with the same menu as [Indicators](/dspf-edit/guides/indicators/). On a record that already has it, the same command changes its indicators or removes it, also when it's written on the record's own `R` line. If it shares that line, it is first moved to a line of its own, since indicators condition a whole line.

It isn't offered on subfile records (`SFL`).

## Return Cursor Location

Right-click a record and choose **Return Cursor Location** to manage `RTNCSRLOC`, which returns where the cursor is to the program. The keyword has two formats, and a record can have both. The menu lists them, each with what it is set to, a ✏️ button to set or change it and a 🗑️ button to remove it:

- **Record and field the cursor is on**: `RTNCSRLOC([*RECNAME] &record &field [&position])`. The record and field are returned in `10A H` fields, and the optional position within the field in a `4S 0 H` one.
- **Row and column of the cursor**: `RTNCSRLOC(*WINDOW|*MOUSE &row &column [&row2 [&column2]])`, all `3S 0 H`. It first asks for `*WINDOW` or `*MOUSE`, which decide what the optional third and fourth fields return: the position within the active window, or where the cursor was when a two-event mouse definition began.
- **Subfile record the cursor is on**, only on a subfile control record (`SFLCTL`): `SFLCSRRRN(&relative-record)`, which returns the relative record number of the subfile record the cursor is on, in a `5S 0 H` field — 0 when the cursor isn't on an active record of the subfile. See [Subfiles](/dspf-edit/guides/subfiles/).

For each parameter it asks for the name of its hidden field, offering the current one, or a suggested one such as `CSRRCD`. An optional parameter can be left empty, which also leaves out the ones after it. The hidden fields are then kept in step with the keyword:

- A field that doesn't exist yet is created, with the definition the parameter needs, after the hidden fields that follow the record's keywords (or right after the keywords, when there are none), so that they stay together.
- Renaming a parameter renames its field too. With `RTNCSRLOC(&WSNOMREG &WSNOMCAM)`, changing `WSNOMCAM` to `CSRFLD` changes both the keyword and the field's definition line. If a field with the new name already exists, that one is used instead.
- When a field is no longer used by the keyword, it asks whether to delete it, since the program may still use it.

A name used by another parameter of these keywords, or by a field of the record defined differently (for example `5A B` where `10A H` is needed), is rejected. A keyword that doesn't fit in positions 45-80 is continued on the next line. Option indicators aren't valid on `RTNCSRLOC`, so none are asked for.

It isn't offered on subfile records (`SFL`).

## Resizing (window records)

For a `WINDOW` record, **Change Window Size** resizes the window. The command is aware of every display size the file declares (`*DS3`/`*DS4`, ...) and resizes all of them together, keeping the record consistent across formats. You can also resize directly by dragging in the [Screen Preview](/dspf-edit/guides/screen-preview/).

## Change Window Title (window records)

**Change Window Title** edits the record's `WDWTITLE`. When the record declares more than one display size, the command targets the size currently being worked on.

## Sort elements

**Sort Elements** reorders a record's constants and fields in the tree/source (e.g. by screen position), to make the DDS source easier to read.

## Preview Screen Layout

Opens the [Screen Preview](/dspf-edit/guides/screen-preview/) for this record — also available as an inline button on the record node.
