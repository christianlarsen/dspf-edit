---
title: Referenced Fields
description: Resolving a referenced field's real type, length, and decimals from a connected IBM i.
---

A field declared by reference (an `R` field with no explicit type/length, pulling its definition from another file) shows as *referenced* in the [Schema Tree](/guides/schema-tree/). DSPF-edit can fetch its real type, length, and decimals straight from the system.

:::note
This feature requires the [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension, installed and connected to an IBM i. See [Install](/install/).
:::

## Resolve a single field

Right-click a referenced field and choose **Resolve Referenced Field**.

## Resolve every pending field at once

Use **Resolve All Referenced Fields** from the status bar to resolve every pending referenced field in the current document in one go — useful right after opening a display file with many `R`-form fields.
