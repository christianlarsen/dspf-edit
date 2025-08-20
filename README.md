# DSPF-edit

This is an extension that can help the users while modifying or creating DDS source files for display files on the IBM i.

The extension shows a schema of the DDS source file. This schema is updated every time the source is modified.

Using the mouse left button, you can navigate through the source file.

Using the mouse right button, you can see some interesting options depending on where you are (a constant, a field, a record ...)

## Features

* You can navigate through a DDS source file, using the schema, clicking on the different parts.
- Two levels: "File", and "Records".
- At "File" level, you can see the different attributes of the DDS source file (i.e. display size and command keys).
    Using mouse right button, you can create new records, or assign command keys (at file level).
- At "Records" level, you can see all the records defined in the DDS source file.  
    -> In every record, you can see attributes (at record level), and the different fields and constants in it. 
        Using mouse right button, you can:
            - Add new constant.
            - Add new field.  
            - Copy/Delete a record.
            - Add "buttons" (constants containing the different commands used on that record).
            - Add command keys. 
    -> In every constant, you can see, the text of the constant, and the position on screen (column/row). If you open it, you can see the different indicators used at constant level, and attributes.
        Using mouse right button, you can:
            - Edit constant.
            - Center constant on the screen.
            - Change the position.
            - Apply colors.
            - Apply attributes.
    -> In every field, you can see, the name of the field, the length and type, and the position on screen (column/row). If the field is referenced, then you will see it. Also if it is hidden, you will see it. As in the constants, you can open it, and see the different indicators used at field level, and attributes.
        Using mouse right button, you can:
            - Edit field.
            - Center field on screen.
            - Change the position.
            - Apply colors and attributes.
            - Add validity checks.
            - Add editing keywords.

## How to use

Once a display file is opened, you can see the schema of it, and use all the options said earlier.

## Requirements

The extension requires version 1.75 of VSCode.

## Known Issues

This is a PREVIEW, so there should be some of them... work in progress!!!

## To Do

- (TODO) Bug fixes.
- (TODO) Use of display sizes correctly.
- (TODO) A lot of things ... will be added soon!

### 0.0.1

**Please leave a comment, and Enjoy!**
