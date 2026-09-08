---
title: Indicators and Conditions
description: Building AND/OR indicator conditions visually, up to DDS's 9-indicator limit — and simulating them in the preview.
---

Fields, constants, and attributes can be conditioned by response/status indicators, exactly as in native DDS (e.g. `51`, `N61`). DSPF-edit lets you build and read these conditions visually instead of counting indicator columns by hand.

## Adding and changing indicators

Right-click a field, constant, or attribute and choose **Indicators** (or the equivalent **Add / Remove / Change indicators** entry) to add a condition, change an existing one, or remove it.

## AND conditions

Up to DDS's limit of **9 ANDed indicators** on a single condition is supported. Beyond 3 — the number that fits on one DDS line — the extra indicators spill onto continuation lines automatically; you don't need to manage line-wrapping yourself.

## OR'd conditions

A condition can be made of several OR'd groups, each itself an AND of up to 9 indicators (e.g. `51 AND NOT 61 AND 53  OR  52`). You can add or remove a whole OR'd group, or edit the indicators within a single group, from the same dialog.

## Reading conditions in the tree

In the [Schema Tree](/dspf-edit/guides/schema-tree/), an OR'd condition is grouped into its ANDed sub-conditions ("Group 1 (AND)" / "OR" / "Group 2 (AND)" / ...) instead of shown as one flat list. Hovering a conditioned field, constant, or attribute shows the full condition as a tooltip.

## Simulating indicators in the preview

The [Screen Preview](/dspf-edit/guides/screen-preview/)'s **Indicators** toggle lets you turn indicators on/off and see which fields, constants, and attributes become visible or hidden — without compiling or connecting to a 5250 session. This setting persists when switching which record is being previewed in the same panel.
