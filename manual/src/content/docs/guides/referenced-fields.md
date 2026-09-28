---
title: Referenced Fields
description: Adding referenced fields, the file-level REF keyword, and resolving a referenced field's real type, length, and decimals.
---

A field declared by reference (an `R` in position 29, pulling its definition from another field) shows as *referenced* in the [Schema Tree](/dspf-edit/guides/schema-tree/). DSPF-edit can fetch its real type, length, and decimals, from the connected IBM i or, when it references a field of the same source, straight from the source.

:::note
Resolving a field from a database file requires the [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension, installed and connected to an IBM i. See [Install](/dspf-edit/install/). Fields referencing the same source (`*SRC`) don't need it.
:::

## Reference file (REF)

A file-level `REF` keyword names the database file that referenced fields take their definition from, so each field doesn't need a `REFFLD()` naming it:

```
     A                                      DSPSIZ(24 80 *DS3)
     A                                      REF(*LIBL/HTPFREF)
     A          R RECORD
     A            UPDUSR    R        O 23 43
```

Here `UPDUSR` takes the definition of the `UPDUSR` field in `HTPFREF`.

To add, change, or remove it, right-click the file node in the Schema Tree and choose **Reference File**. It asks for:

1. The library: optional. Leave it empty, or use `*LIBL` or `*CURLIB`.
2. The database file.
3. The record format: optional. It's only needed when more than one record format of the file has a field with that name.

The keyword is written right after `DSPSIZ`, where STRSDA puts it. DDS allows only one `REF`.

Changing or removing it makes the document's referenced fields pending again, so they are resolved against the new file.

## Add a referenced field

Choose **New Field** on a record (or **+ Field** in the [Screen Preview](/dspf-edit/guides/screen-preview/)), enter the field name, and pick one of the **Referenced** entries:

| Entry | Asks for | Writes |
|---|---|---|
| **Referenced from REF file** (only when the file has a `REF`) | The referenced field's name, the new field's own by default | Just the `R` when the names match, otherwise `REFFLD(name)` with no file |
| **Referenced from another file** | Library (optional), file, field, and record format (optional) | `REFFLD(field library/file)` |
| **Referenced from this source** (only when there are fields to pick) | A field of this record or of a record before it, picked from a list | `REFFLD(field *SRC)`, or `REFFLD(record/field *SRC)` for a field in another record |

The usage (output, input, both, ...) is asked last. A `REFFLD()` too long for positions 45–80 continues on a second line.

## Resolve a single field

Right-click a referenced field and choose **Resolve Referenced Field**.

## Resolve every pending field at once

Use **Resolve All Referenced Fields** from the status bar to resolve every pending referenced field in the current document in one go. This is useful right after opening a display file with many `R` fields. Fields are resolved in source order, so a field referencing another referenced field of the same source is resolved after it.

## Where the definition is looked up

Hovering a referenced field in the Schema Tree shows where its definition comes from. It is looked up in this order:

1. The file named in the field's own `REFFLD()`. `REFFLD()` is read wherever it is coded: on the field's own line or on a separate line below it.
2. The file-level `REF`.
3. With neither, or with `*SRC` in `REFFLD()`, a field of the same source, as DDS defines.

Which library is searched for a database file depends on how the file is qualified:

| In the source | Libraries searched |
|---|---|
| `MYLIB/ARTICLES` | Only `MYLIB`. |
| `ARTICLES` or `*LIBL/ARTICLES` | The current library, then the library list, both as set for the active Code for i connection. The first library that has the file is used, the same order as the real `*LIBL`. |
| `*CURLIB/ARTICLES` | Only the connection's current library. |

To change the libraries searched, change the connection's library list or current library in Code for i.

:::note
A record format named in `REF` or `REFFLD()` is kept in the source but not used for the lookup, which searches the file's fields by name. It only matters for a file with more than one record format.
:::

### Fields of the same source (`*SRC`)

As DDS requires, the referenced field must come before the referencing one. With `REFFLD(record/field *SRC)` only that record is searched. Otherwise the field's own record is searched first, then the records before it, and the nearest match is used.

If the referenced field is itself a referenced field, it must be resolved first.

## Overriding the referenced definition

A referenced field can change what it takes from the referenced field by filling in its own columns, as DDS allows:

| Column | Example | Effect |
|---|---|---|
| Length (30–34) | `12` | Replaces the length. |
| | `+4` / `-2` | Increases / decreases it. |
| Data type (35) | `A` | Replaces the type. A character type (`A`, `X`, `M`, `W`) drops the decimal positions. |
| Decimal positions (36–37) | `0` | Replaces them. |
| | `+1` / `-1` | Increases / decreases them. |

```
     A            WSARTDESC R  -10   O  7 15REFFLD(ARTDESC *LIBL/ARTICLES)
```

These are applied on top of the resolved definition, in the Screen Preview and the Schema Tree. Changing them in the source doesn't require resolving the field again.
