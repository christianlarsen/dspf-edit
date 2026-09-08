---
title: Colors and Attributes
description: Applying DSPATR-style color and display attributes to fields and constants.
---

Fields and constants can carry display attributes — color and `DSPATR`-style flags such as reverse image, underline, blink, column separators, or non-display — rendered in the [Screen Preview](/dspf-edit/guides/screen-preview/) so you can check the result without compiling.

## Applying colors and attributes

Right-click a field or constant and choose **Colors** or **Attributes** to add one. From the [Screen Preview](/dspf-edit/guides/screen-preview/), the same actions are available from the **⋮ Actions** menu on a selection — including a multi-selection, so you can apply a color or attribute to several elements at once.

## Conditioning an attribute

Each attribute can itself be conditioned by indicators, with the same AND/OR support as fields and constants — see [Indicators and Conditions](/dspf-edit/guides/indicators/). This lets an attribute (e.g. highlighting a field in red) apply only when a given indicator is on.

## Removing an attribute

Right-click the attribute node under a field or constant in the [Schema Tree](/dspf-edit/guides/schema-tree/) and choose **Delete**.

## Preview color scheme

The colors used to render the green-screen preview itself (not the DDS color keywords on your fields) can be adjusted from **Configure Preview Colors...**, and reset back to the defaults with **Reset Preview Colors to Default**. See [Configuration](/dspf-edit/guides/configuration/).
