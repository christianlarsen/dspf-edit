---
title: Install
description: How to install DSPF-edit and what it requires.
---

## Requirements

- Visual Studio Code **v1.75** or higher, or **IBM Bob**.
- No connection to an IBM i is required to use DSPF-edit itself — it works directly on your local DDS source. A connection is only needed for the optional [Resolve Referenced Field](/dspf-edit/guides/referenced-fields/) feature, provided by the [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension.

## Install from the Marketplace

1. Open the **Extensions** view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
2. Search for **DSPF-edit**.
3. Click **Install**.

Or install it directly from the [Visual Studio Marketplace listing](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit).

## Optional: Code for i

DSPF-edit works standalone. If you also install [Code for i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) and connect to an IBM i system, DSPF-edit can additionally:

- Resolve the real type, length, and decimals of referenced fields (`R` fields) straight from the system — see [Referenced Fields](/dspf-edit/guides/referenced-fields/).
- Fetch the `QDECFMT` system value to preview `EDTCDE()`-edited numeric fields using your system's decimal convention — see [Configuration](/dspf-edit/guides/configuration/).

## Next step

Continue to the [Quick Start](/dspf-edit/quickstart/) to open your first display file.
