---
title: Subfiles
description: Previewing SFL/SFLCTL records, their paired header/detail record, and adding a commands record.
---

Subfile (`SFL`/`SFLCTL`) records are recognized and rendered specially in the [Screen Preview](/dspf-edit/guides/screen-preview/).

![A subfile preview with header and detail rows](/dspf-edit/screenshots/captura9.png)

## Subfile page rows

The preview shows all `SFLPAG` rows for the subfile, and automatically pairs the subfile detail record with its `SFLCTL` header record so both preview together as they'd actually appear on screen.

## Dragging detail rows

Detail rows can't be dragged up over the header record's own content, keeping the preview physically consistent with how the subfile actually renders.

## Adding a commands record

Right-click a `SFLCTL` record and choose **Add Commands Record** to create a new, empty record right after it for the subfile's function-key legend (e.g. "F3=Exit", "F12=Cancel") — conventionally kept separate from the `SFLCTL` itself.

If the `SFLCTL` declares its own window directly (`WINDOW(startRow startCol rows cols)`), that window — along with its `WDWTITLE()`/`WDWBORDER()` — is moved onto the new record, and the `SFLCTL` is left with a `WINDOW(newRecordName)` reference, since only the record that owns the window actually renders those keywords. See [Add Commands Record](/dspf-edit/guides/records/#add-commands-record) and [Windows](/dspf-edit/guides/windows/#shared-windows).

After the record is created, use **Add Constant** (or **Add Buttons**) on it to add the function-key texts.

## Subfile messages

A `SFLCTL` record's `SFLMSG('text' indicator)` is shown on the preview's message line when its indicator is toggled on in the [Indicators](/dspf-edit/guides/indicators/) simulation, the same way a field or record's `ERRMSG()` is — see [Error messages](/dspf-edit/guides/fields/#error-messages). Per the DDS reference, an active `ERRMSG()` always takes priority over `SFLMSG()`, and `SFLMSG()` only takes effect while `SFLDSP` is itself in effect.

## Multiple display sizes

A subfile's `SFLPAG`/`SFLSIZ` can differ per `DSPSIZ` format. When previewing a file with more than one format, adjusting a subfile's page size only affects the format currently selected in the preview. See [Multiple Display Sizes](/dspf-edit/guides/display-sizes/).
