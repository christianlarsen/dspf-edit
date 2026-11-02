---
title: Command Keys
description: Assigning CAxx/CFxx command keys at file or record level.
---

Command keys (`CA01`-`CA24` / `CF01`-`CF24`, i.e. "command attention" and "command function" keys) can be assigned at file level or at record level. A `CF` key sends the changed data to the program; a `CA` key doesn't.

## The Command Keys window

Right-click the **File** node, or a **Record** node, and choose **Command Keys**. The window lists the keys it has, one row each, such as `F5 — CF05 'Refresh'`, with the indicators that make it active and its response indicator.

- Select a row, or click its ✏️ button, to change the key: CA or CF, its response indicator and its text. It stays where it is, with its indicators.
- The indicators button changes its indicators, with the same menu as [Indicators and Conditions](/dspf-edit/guides/indicators/): several indicators per condition, and OR'd conditions.
- The 🗑️ button removes a key; the 🗑️ button in the title bar removes them all.
- **Add command key...** asks which key to add, among those it doesn't have yet, then:
  1. **CA or CF**.
  2. **The response indicator**, set on when the key is pressed. It's the key's own number by default (`05` for F5); leave it blank for none.
  3. **The text**, which documents the response indicator. It's only asked with a response indicator, as DDS requires: `CF05`, `CF05(05)` and `CF05(05 'Refresh')` are valid, but there's no text without an indicator.

  The key is added after the record's (or file's) other keywords, without indicators. To condition it, use its indicators button.

The window opens again after each change; `Escape` closes it.

## Keys that won't compile

CRTDSPF rejects two things that STRSDA doesn't check, so they're usually only found when compiling:

- **The same key as CA in one place and CF in another**, anywhere in the display file: `CA05` in one record and `CF05` in another, or at file level.
- **The same key at both file and record level**, even of the same type: `CA03` at file level and `CA03` in a record. CRTDSPF says *Keyword not allowed at both file and record level*.

So:

- When asking CA or CF, the type the key already has elsewhere in the file comes first. Choosing the other one shows an error saying where the key is, and asks again.
- When adding a key to a record, keys already at file level are marked with where they are, and choosing one shows an error. The same goes, the other way round, when adding at file level a key some record already has.
- A key that already clashes with another place is flagged in the window: `Won't compile:`, followed by where the other one is.

## Seeing key assignments in the preview

The [Screen Preview](/dspf-edit/guides/screen-preview/)'s function-key legend shows every command key available to the record being previewed — file-level and record-level together — switching to solid/inverted styling when the key's indicator condition is currently met.

## Related: buttons

[Add Buttons](/dspf-edit/guides/records/#add-buttons) on a record adds constants showing a key's label (e.g. `F3=Exit`) next to its assignment.
