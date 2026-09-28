---
title: DSPF Source Editing
description: Column awareness, hovers, validation, completion and snippets for writing display file DDS by hand.
---

The [Schema Tree](/dspf-edit/guides/schema-tree/) and [Screen Preview](/dspf-edit/guides/screen-preview/) work on the *structure* of a display file. This layer works on the *text*, for the moments you are typing DDS by hand.

Like the rest of the extension, it applies to `.dspf` sources.

## Where am I? The status bar

Open a display file and look at the bottom right of the window:

```
DSPF | Col 21 | Name
```

Move the cursor along the line and the label follows it, naming the DDS area you are in. It is plain text, so it works regardless of theme or color vision.

**Click it** to open the column reference.

## The column reference

Run **DSPF Edit: Show DSPF Column Reference** from the Command Palette (`Ctrl+Shift+P`), or click the status bar item.

You get a searchable list of every DDS region with its columns and purpose. Picking one **moves the cursor to the first column of that region** on the current line — padding the line with spaces if it is shorter than that column, so you land exactly where you need to type.

Typical use: you are on a new line and need to type a field length. Open the reference, type "len", press Enter, start typing digits.

## The DDS column layout

Every feature here is driven by one internal map of the layout:

| Columns | Region | What goes there |
|---|---|---|
| 1–5 | Sequence Number | Optional; usually blank in stream files |
| 6 | Form Type | Always `A` |
| 7 | Comment / And-Or | `*` = comment line; `A`/`O` chain indicator conditions |
| 8–16 | Conditioning Indicators | Up to three conditions, e.g. `N50` |
| 17 | Name Type | `R` record, `H` help, blank = field |
| 18 | Reserved | Must be blank |
| 19–28 | Name | Record or field name, left-justified, max 10 characters |
| 29 | Reference | `R` = copy the definition from a referenced field |
| 30–34 | Length | Right-justified, digits only |
| 35 | Data Type | `A` alphanumeric, `S` signed numeric, `Y` numeric only, `L` date, `T` time, ... |
| 36–37 | Decimal Positions | Right-justified, numeric fields only |
| 38 | Usage | `B` both, `I` input, `O` output, `H` hidden, `M` message, `P` program-to-system |
| 39–41 | Location: Line | Screen line |
| 42–44 | Location: Position | Screen column |
| 45–80 | Keywords | `TEXT('...')`, `COLOR(BLU)`, `EDTCDE(Z)`, `SFL`, ... |

You never have to memorize it — it is exactly what the status bar, the hovers, the highlight and the guides show you in place.

## Hovers

Two kinds, with no configuration:

- **Column hovers** — hover anywhere on a line to see the region's name, column range, purpose, valid values, examples and IBM notes. Hovering column 35 lists every data type letter and what it means.
- **Keyword hovers** — hover a keyword in the keyword area to see its signature, an explanation and a working example.

## Column guides and section highlight

Thin vertical lines can mark every DDS column boundary. They are VS Code's own `editor.rulers`, scoped to the `dds.dspf` language, so other file types are untouched and there is no rendering cost.

Run **DSPF Edit: Apply Recommended DSPF Editor Settings** once from the Command Palette to switch them on. It writes `editor.rulers` under `[dds.dspf]` only, so no other file type is affected.

This is the one thing you have to ask for — the extension never writes to your settings on its own.

The column region containing the cursor is shaded very subtly regardless — 8% opacity by default, never above 15%, following your theme. Only the region is shaded, never the whole line.

Toggle either one with **DSPF Edit: Toggle DSPF Column Guides** and **DSPF Edit: Toggle DSPF Section Highlight**.

To change where the guides sit, edit the rulers like any other setting:

```json
"[dds.dspf]": { "editor.rulers": [6, 44, 80] }
```

## Validation as you type

Mistakes are flagged in the editor and in the Problems panel (`Ctrl+Shift+M`) before the compiler ever sees them:

| Problem | Severity |
|---|---|
| Text past column 80 | Error |
| Invalid data type in column 35 | Error |
| Length is not numeric | Error |
| Decimal positions exceed the field length | Error |
| Zoned over 63 digits, character over 32766 | Error |
| Decimal positions on a character field | Warning |
| Name too long, invalid characters, or not left-justified | Warning |
| Length not right-justified in column 34 | Warning |
| Length/type specified on a record (`R`) line | Warning |
| Invalid usage or name type letter | Warning |
| Column 6 is not `A` | Warning |

Comment lines (`*` in column 7) are always ignored, and conditioning lines — including AND/OR indicator continuations — are understood and left alone.

Try it: type a `Q` in column 35. A squiggle appears immediately saying *"'Q' is not a valid display file data type."* That is a compile error you just avoided.

### Entries copied from a physical or logical file

Some entries are perfectly valid DDS but belong to database files, so a display file line carrying one is nearly always a copy-paste from a PF or LF rather than a typo. Those get a warning that names the reason instead of a bare error:

| Entry | Message |
|---|---|
| `P`, `B`, `H` in column 35 | Belongs to physical and logical files; a display file uses `S` or `Y` for numeric fields |
| `K`, `S`, `O`, `J` in column 17 | Belongs to physical and logical files; a display file uses `R`, `H` or blank |
| `N` in column 38 | Belongs to logical files |

## Keyword completion

Put the cursor in the keyword area (column 45 or beyond) and press `Ctrl+Space`. You get the 47 display file keywords — `SFL`, `SFLCTL`, `SFLPAG`, `WINDOW`, `DSPATR`, `COLOR`, `ERRMSG`, `EDTCDE`, `CAnn`, `CFnn` and the rest — each with documentation and a fill-in-the-blanks template.

## Snippets

Type a prefix on an empty line and press `Tab`. Every snippet is column-perfect, and each is verified by the test suite against the validation rules above.

| Prefix | Inserts |
|---|---|
| `dspf-record` | Display record with a title constant |
| `dspf-input` / `dspf-output` | Input-capable / output-only display field at line/position |
| `dspf-constant` | Constant text at line/position |
| `dspf-window` | Window record format |
| `dspf-subfile` | Complete subfile + control record pair |
| `dspf-fkey` | Function key definition (`CAnn`) |
| `field-char` / `field-zoned` | Character / zoned numeric field |
| `field-date` / `field-time` / `field-timestamp` | Date / time / timestamp field |
| `dspf-header` | Commented header block |

## Outline and breadcrumbs

Record formats and their fields also appear in the Outline view and the breadcrumb bar above the editor, with fields showing their length and type (`7Y,0`). `Ctrl+Shift+O` gives you quick symbol navigation inside the file.

This is complementary to the [Schema Tree](/dspf-edit/guides/schema-tree/): the tree is the place to *act* on a display file, the Outline is the place to *jump* around its source.

## Turning it off

Everything on this page is optional. `dspf-edit.assist.enabled` turns the whole layer off in one click and leaves the graphical tooling untouched; each feature also has its own switch. See [Configuration](/dspf-edit/guides/configuration/).
