---
title: Referenced Fields
description: Resolving a referenced field's real type, length, and decimals from a connected IBM i.
---

A field declared by reference (an `R` field with no explicit type/length, pulling its definition from another file) shows as *referenced* in the [Schema Tree](/dspf-edit/guides/schema-tree/). DSPF-edit can fetch its real type, length, and decimals straight from the system.

:::note
This feature requires the [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension, installed and connected to an IBM i. See [Install](/dspf-edit/install/).
:::

## Resolve a single field

Right-click a referenced field and choose **Resolve Referenced Field**.

## Resolve every pending field at once

Use **Resolve All Referenced Fields** from the status bar to resolve every pending referenced field in the current document in one go — useful right after opening a display file with many `R`-form fields.

## Where the definition is looked up

The file comes from the field's own `REFFLD()`, or from the record- or file-level `REF()` when `REFFLD()` doesn't name one. `REFFLD()` is read wherever it is coded: on the field's own line or on a separate line below it.

Which library is searched depends on how the file is qualified:

| In the source | Libraries searched |
|---|---|
| `MYLIB/ARTICLES` | Only `MYLIB`. |
| `ARTICLES` or `*LIBL/ARTICLES` | The current library, then the library list, both as set for the active Code for i connection. The first library that has the file is used, the same order as the real `*LIBL`. |
| `*CURLIB/ARTICLES` | Only the connection's current library. |

To change the libraries searched, change the connection's library list or current library in Code for i.
