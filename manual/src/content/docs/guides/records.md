---
title: Records
description: Creating, copying, resizing, and organizing records.
---

Records are the second level of the [Schema Tree](/guides/schema-tree/). Each record node lists its own attributes, plus its constants and fields.

## Create a new record

Right-click the **Records** node, or the **File** node, and choose **New Record**.

## Copy / Delete a record

Right-click a record and choose **Copy Record** or **Delete Record**.

## Add constant / Add field / Remove field

Right-click a record for **Add constant** and **Add field** (see [Constants](/guides/constants/) and [Fields](/guides/fields/)), or **Remove field** to remove an existing one.

## Add buttons

**Add buttons** interactively collects one or more function-key/label pairs (e.g. `F3` / `Exit`) and adds them to the record as constants, formatted the conventional DDS way (e.g. `F3=Exit`) — a quick way to add a function-key legend without typing each constant by hand.

## Add Commands Record

Available on a subfile control (**SFLCTL**) record. Creates a new, empty record right after it, meant to hold the subfile's function-key legend (e.g. "F3=Exit", "F12=Cancel") — conventionally kept on a separate record from the `SFLCTL` itself.

If the `SFLCTL` declares its own `WINDOW(startRow startCol rows cols)` directly, that window (and any `WDWTITLE()`/`WDWBORDER()` that go with it) is moved onto the new record, and the `SFLCTL` is left with a `WINDOW(newRecordName)` reference — the same "commands record owns the shared window, `SFLCTL` borrows it" pattern real-world DDS commonly uses, since the legend text then lives in the same window as the subfile it describes. See [Subfiles](/guides/subfiles/).

After adding the record, use **Add Constant** on it to add the function-key texts.

## Assign command keys

Right-click a record for **Command Keys**. A key number already assigned at the other level (file vs. record) is excluded from the picker, so you can never end up with the same key defined as both `CA` and `CF`. See [Command Keys](/guides/command-keys/).

## Indicators

**Add / Remove / Change indicators** on a record — see [Indicators and Conditions](/guides/indicators/).

## Resizing (window records)

For a `WINDOW` record, **Change Window Size** resizes the window. The command is aware of every display size the file declares (`*DS3`/`*DS4`, ...) and resizes all of them together, keeping the record consistent across formats. You can also resize directly by dragging in the [Screen Preview](/guides/screen-preview/).

## Change Window Title (window records)

**Change Window Title** edits the record's `WDWTITLE`. When the record declares more than one display size, the command targets the size currently being worked on.

## Sort elements

**Sort Elements** reorders a record's constants and fields in the tree/source (e.g. by screen position), to make the DDS source easier to read.

## Preview Screen Layout

Opens the [Screen Preview](/guides/screen-preview/) for this record — also available as an inline button on the record node.
