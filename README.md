# DSPF-edit

**DSPF-edit** is a Visual Studio Code extension that helps IBM i developers when creating or modifying DDS source files for **display files**.

The extension provides a **navigable schema view** of the DDS source file that is automatically updated whenever the source changes.

---

## ✨ Features

- **Schema navigation**
  - Two levels are shown: **File** and **Records**.
  - Click on schema elements to jump directly to their location in the source.
  - Right-click for context-aware actions.

- **File level**
  - View display file attributes (e.g., display size, command keys).
  - Right-click options:
    - Create new records.
    - Assign command keys.

- **Records level**
  - Right-click options:
    - Create new records.
  - Each record shows:
    - Record-level attributes.
    - Constants and fields.
  - Right-click options on a record:
    - Add constant.
    - Add field.
    - Copy/Delete record.
    - Add "buttons" (constants for record commands).
    - Assign command keys.
    - Add / Remove / Change indicators.
    - Resizing (if window record).
    - Sort elements.

- **Constants**
  - Show text, position (row/column), indicators, and attributes.
  - Right-click options:
    - Edit constant.
    - Center constant on screen.
    - Change position (absolute position/relative to existing constant).
    - Apply colors/attributes.
    - Add / Remove / Change indicators.
    - Fill constant with characters.

- **Fields**
  - Show name, length, type, position (row/column), and flags (referenced/hidden).
  - Indicators and attributes are expandable.
  - Right-click options:
    - Edit field.
    - Center field on screen.
    - Change position (absolute position/relative to existing constant/field).
    - Apply colors/attributes.
    - Add validity checks.
    - Add editing keywords.
    - Add error messages.
    - Add / Remove / Change indicators.

- **Attributes**
    - Add / Remove / Change indicators.

---

## 🚀 How to Use

1. Open a DDS display file in VS Code.  
2. Go to **explorer view** in VS Code.
2. The **schema view** will appear automatically with the name "DSPF STRUCTURE".  
3. Use **left-click** to navigate, or **right-click** to access contextual options.  

---

## ⚙️ Requirements

- Visual Studio Code **v1.75** or higher.

---

## 🐞 Known Issues

This extension is currently in **preview**.  
Some features may not work as expected. Please leave an issue if something is not working fine!

---

## 📝 To Do

- Bug fixes.  
- Correct handling of display sizes.  
- Many new features to come!  

---

## 📦 Version History
See the full changelog [here](./CHANGELOG.md).

### Latest
**0.6.1** - 2025-09-09
- Fixes: Internal fixes. Refactoring.

---

💬 **Feedback is welcome!** Please leave a comment, open an issue, and enjoy using DSPF-edit.
