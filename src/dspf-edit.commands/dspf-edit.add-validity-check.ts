/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-validity-check.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { findElementInsertionPoint, checkForEditorAndDocument, applyWorkspaceEdit, removeKeywordTextFromLines } from '../dspf-edit.utils/dspf-edit.helper';

// INTERFACES AND TYPES

interface ValidityCheck {
    type: 'RANGE' | 'COMP' | 'VALUES';
    parameters: string[];
    /** The keyword's own text exactly as parsed (e.g. "VALUES(1 2 3)") and its line range — only
     * set for an existing check read off the field, used to locate/remove it precisely without
     * disturbing sibling keywords. */
    raw?: string;
    lineIndex?: number;
    lastLineIndex?: number;
};

interface CompParameters {
    operator: 'EQ' | 'NE' | 'LT' | 'NL' | 'GT' | 'NG' | 'LE' | 'GE';
    value: string;
};

/** One row of the validity-check summary menu — one of the 3 mutually exclusive check types. */
interface ValidityCheckMenuItem extends vscode.QuickPickItem {
    checkType: 'RANGE' | 'COMP' | 'VALUES';
};

// COMMAND REGISTRATION

/**
 * Registers the add validity check command for DDS fields.
 * Allows users to interactively manage the validity check for fields.
 * @param context - The VS Code extension context
 */
export function addValidityCheck(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-validity-check", async (node: DdsNode) => {
            await handleAddValidityCheckCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the add validity check command for a DDS field. RANGE, COMP and VALUES are mutually
 * exclusive in DDS — the manual is explicit that COMP allows "only one COMP keyword for a field",
 * and lists COMP/RANGE/VALUES as unable to coexist with each other or with a CHECK(VN/VNE/...)
 * keyword — so a field has at most one validity check at a time, never several to manage as a list.
 * Shows a 3-row summary menu (RANGE/COMP/VALUES) with whichever one is currently set, letting the
 * user jump straight to setting/changing it or removing it directly via its own trash button;
 * setting a different type than the one currently in effect replaces it, the same way EDTCDE and
 * EDTWRD replace each other in the editing-keywords command.
 * @param node - The DDS node containing the field
 */
async function handleAddValidityCheckCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type - only fields can have validity checks
        if (node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Validity checks can only be added to fields.');
            return;
        };

        // Only "input" and "input/output" fields cam have validity checks
        if (node.ddsElement.type === 'O') {
            vscode.window.showWarningMessage('Validity checks cannot be added to output fields.');
            return;
        };

        // Get field information to determine valid options
        const fieldInfo = getFieldInfo(node.ddsElement);
        if (!fieldInfo) {
            vscode.window.showErrorMessage('Could not determine field type for validity checks.');
            return;
        };

        // A field can have at most one of RANGE/COMP/VALUES — if the source somehow has more than
        // one (invalid DDS), only the first one found is treated as "current".
        const current = getCurrentValidityCheckForField(node.ddsElement);

        let checkType: ValidityCheck['type'];

        if (current) {
            const choice = await showValidityCheckMenu(buildValidityCheckMenuItems(current), node.ddsElement.name);
            if (!choice) return;

            if (choice.action === 'remove') {
                await removeOneValidityCheck(editor, node.ddsElement, current);
                return;
            };
            checkType = choice.checkType;
        } else {
            const selectedType = await vscode.window.showQuickPick(
                ['RANGE - Validation range', 'COMP - Value comparison', 'VALUES - Valid values list'],
                {
                    title: `Add Validity Check for ${node.ddsElement.name}`,
                    placeHolder: 'Select validity check type'
                }
            );
            if (!selectedType) return;
            checkType = selectedType.split(' - ')[0] as ValidityCheck['type'];
        };

        // Collect the check's parameters, prefilled with the current value when the user picked
        // the same type that's already set (i.e. they're changing it, not switching types).
        const newCheck = await collectOneValidityCheck(checkType, fieldInfo, current?.type === checkType ? current : undefined);
        if (!newCheck) return;

        // Replace whatever check currently exists (of any of the 3 types) with the new one.
        if (current) {
            if (!(await removeOneValidityCheck(editor, node.ddsElement, current, true))) return;
        };
        if (!(await addValidityCheckToField(editor, node.ddsElement, newCheck))) return;
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        vscode.window.showInformationMessage(
            `Set validity check ${formatValidityCheck(newCheck)} on ${node.ddsElement.name}.`
        );

    } catch (error) {
        console.error('Error managing validity checks:', error);
        vscode.window.showErrorMessage('An error occurred while managing validity checks.');
    };
};

// VALIDITY CHECK EXTRACTION FUNCTIONS

/**
 * Extracts the field's current validity check, if any — RANGE, COMP and VALUES are mutually
 * exclusive in DDS, so at most one of them is ever in effect.
 * @param element - The DDS field element
 * @returns The current validity check, or undefined if none is set
 */
function getCurrentValidityCheckForField(element: any): ValidityCheck | undefined {
    // Find the field in the fieldsPerRecords data
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return undefined;

    const fieldInfo = recordInfo.fields.find(field => field.name === element.name);
    if (!fieldInfo || !fieldInfo.attributes) return undefined;

    for (const attrObj of fieldInfo.attributes) {
        const attr = attrObj.value;
        const match = attr.match(/^(RANGE|COMP|VALUES)\(([^)]+)\)$/);
        if (!match) continue;

        return {
            type: match[1] as ValidityCheck['type'],
            parameters: match[2].split(' ').filter(p => p.trim()),
            raw: attr,
            lineIndex: attrObj.lineIndex,
            lastLineIndex: attrObj.lastLineIndex
        };
    };

    return undefined;
};

// VALIDITY CHECK SUMMARY MENU

/** Formats a validity check exactly as it reads in DDS source, e.g. "VALUES(0 1 2)". */
function formatValidityCheck(vc: ValidityCheck): string {
    return `${vc.type}(${vc.parameters.join(' ')})`;
};

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Set/change' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Builds the validity-check summary menu's 3 rows (RANGE/COMP/VALUES), each showing its currently
 * assigned value (formatted exactly as it'd read in the DDS source, e.g. "VALUES(0 1 2)") or
 * "(not set)" for the other two — mirroring the editing-keywords command's summary menu for another
 * mutually exclusive keyword group (EDTCDE/EDTWRD).
 * @param current - The field's current validity check
 */
function buildValidityCheckMenuItems(current: ValidityCheck): ValidityCheckMenuItem[] {
    const row = (type: ValidityCheck['type'], label: string): ValidityCheckMenuItem => {
        const isCurrent = current.type === type;
        return {
            checkType: type,
            label,
            description: isCurrent ? formatValidityCheck(current) : '(not set)',
            buttons: isCurrent ? [EDIT_BUTTON, REMOVE_BUTTON] : [EDIT_BUTTON]
        };
    };

    return [
        row('RANGE', 'RANGE — Validation range'),
        row('COMP', 'COMP — Value comparison'),
        row('VALUES', 'VALUES — Valid values list')
    ];
};

/**
 * Shows the validity-check summary menu and resolves to what the user did: picked a row (or its
 * edit button) to set/change it (`action: 'select'`), or clicked the current row's trash button to
 * remove it (`action: 'remove'`) — undefined if dismissed. Needs the raw `createQuickPick` API
 * rather than the simpler `showQuickPick` helper, since only it exposes per-item buttons
 * (`onDidTriggerItemButton`).
 * @param items - The menu's rows, from `buildValidityCheckMenuItems`
 * @param fieldName - The field's name, for the menu's title
 */
function showValidityCheckMenu(
    items: ValidityCheckMenuItem[],
    fieldName: string
): Promise<{ action: 'select' | 'remove'; checkType: ValidityCheck['type'] } | undefined> {
    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<ValidityCheckMenuItem>();
        quickPick.items = items;
        quickPick.title = `Validity check for ${fieldName}`;
        quickPick.placeholder = 'RANGE, COMP and VALUES are mutually exclusive — setting one replaces any other';
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: { action: 'select' | 'remove'; checkType: ValidityCheck['type'] } | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'select', checkType: event.item.checkType });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            finish(picked ? { action: 'select', checkType: picked.checkType } : undefined);
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

/**
 * Removes the field's current validity check (the summary menu's trash-button action, or the first
 * step of changing it), using the same precise keyword-text removal as single-attribute deletion —
 * only this check's own text is stripped from its line(s), leaving sibling keywords untouched.
 * @param editor - The active text editor
 * @param element - The DDS field the check belongs to
 * @param check - The existing check to remove (must carry `raw`/`lineIndex`/`lastLineIndex`)
 * @param silent - Suppresses the cursor nudge + confirmation message (used when immediately
 * re-adding a replacement as part of "change")
 */
async function removeOneValidityCheck(
    editor: vscode.TextEditor,
    element: any,
    check: ValidityCheck,
    silent: boolean = false
): Promise<boolean> {
    if (check.raw === undefined || check.lineIndex === undefined || check.lastLineIndex === undefined) {
        return false;
    };

    const preserveFirstLine = check.lineIndex === element.lineIndex;
    if (!(await removeKeywordTextFromLines(editor, check.lineIndex, check.lastLineIndex, check.raw, preserveFirstLine))) {
        return false;
    };

    if (!silent) {
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');
        vscode.window.showInformationMessage(`Removed validity check ${formatValidityCheck(check)} from ${element.name}.`);
    };
    return true;
};

/**
 * Collects a single validity check of a given type, prefilled with its current value when changing
 * an existing one of the same type.
 * @param type - Which validity check type to collect
 * @param fieldInfo - Field information to determine valid options
 * @param current - The check's current value, when changing an existing one of this same type
 */
async function collectOneValidityCheck(type: ValidityCheck['type'], fieldInfo: any, current?: ValidityCheck): Promise<ValidityCheck | null> {
    if (type === 'RANGE') return collectRangeParameters(fieldInfo, current);
    if (type === 'COMP') return collectCompParameters(fieldInfo, current);
    return collectValuesParameters(fieldInfo, current);
};

/**
 * Gets field information including type and length for validity checks.
 * @param element - The DDS field element
 * @returns Field information or null if not found
 */
function getFieldInfo(element: any): any {
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return null;

    return recordInfo.fields.find(field => field.name === element.name);
};

// USER INTERACTION FUNCTIONS

/**
 * Collects RANGE parameters from user.
 * @param fieldInfo - Field information
 * @param current - The check's current from/to values, when changing an existing RANGE
 * @returns RANGE validity check or null if cancelled
 */
async function collectRangeParameters(fieldInfo: any, current?: ValidityCheck): Promise<ValidityCheck | null> {
    const fieldType = fieldInfo.type || 'A';
    const isNumeric = ['P', 'S', 'B', 'F', 'I'].includes(fieldType);

    const fromValue = await vscode.window.showInputBox({
        title: 'RANGE - From Value',
        prompt: `Enter the starting value for the range (Field type: ${fieldType})`,
        value: current?.parameters[0],
        placeHolder: isNumeric ? 'e.g., 0, -100' : 'e.g., A, AA',
        validateInput: (value: string) => {
            if (!value.trim()) return 'From value is required';
            return null;
        }
    });

    if (fromValue === undefined) return null;

    const toValue = await vscode.window.showInputBox({
        title: 'RANGE - To Value',
        prompt: `Enter the ending value for the range (Field type: ${fieldType})`,
        value: current?.parameters[1],
        placeHolder: isNumeric ? 'e.g., 1000, 999' : 'e.g., Z, ZZ',
        validateInput: (value: string) => {
            if (!value.trim()) return 'To value is required';
            return null;
        }
    });

    if (toValue === undefined) return null;

    return {
        type: 'RANGE',
        parameters: [fromValue.trim(), toValue.trim()]
    };
};

/**
 * Collects COMP parameters from user.
 * @param fieldInfo - Field information
 * @param current - The check's current operator/value, when changing an existing COMP
 * @returns COMP validity check or null if cancelled
 */
async function collectCompParameters(fieldInfo: any, current?: ValidityCheck): Promise<ValidityCheck | null> {
    const operators = [
        'EQ - Equal to',
        'NE - Not equal to',
        'LT - Less than',
        'NL - Not less than',
        'GT - Greater than',
        'NG - Not greater than',
        'LE - Less than or equal',
        'GE - Greater than or equal'
    ];

    const selectedOperator = await vscode.window.showQuickPick(
        operators,
        {
            title: current ? `COMP - Select Operator (current: ${current.parameters[0]})` : 'COMP - Select Operator',
            placeHolder: 'Choose comparison operator'
        }
    );

    if (!selectedOperator) return null;

    const operator = selectedOperator.split(' - ')[0] as CompParameters['operator'];

    const value = await vscode.window.showInputBox({
        title: `COMP - Comparison Value (${operator})`,
        prompt: `Enter the value to compare against (Field type: ${fieldInfo.type || 'A'})`,
        value: current?.parameters[1],
        placeHolder: 'e.g., 0, 100, A',
        validateInput: (value: string) => {
            if (!value.trim()) return 'Comparison value is required';
            return null;
        }
    });

    if (value === undefined) return null;

    return {
        type: 'COMP',
        parameters: [operator, value.trim()]
    };
};

/**
 * Whether a field is numeric for VALUES-entry validation purposes, per the same DDS Type/decimal-
 * positions default rule used elsewhere in the extension (see isNumericFieldType in
 * dspf-edit.record-preview-panel.ts): 'A' is always character, anything else non-blank is always
 * numeric, and a blank Type is character only when decimal positions are also blank.
 * @param fieldInfo - Field information
 */
function isNumericFieldForValues(fieldInfo: any): boolean {
    const trimmedType = (fieldInfo.type || '').trim().toUpperCase();
    return trimmedType !== '' ? trimmedType !== 'A' : fieldInfo.decimals !== undefined;
};

/**
 * Splits a VALUES input string into its individual value tokens, treating a single-quoted run as
 * one token even if it contains embedded spaces (e.g. `'AB CD'`) — a naive split on whitespace
 * would otherwise tear a multi-word character literal in two.
 * @param raw - The raw text typed into the VALUES input box
 */
function tokenizeValuesInput(raw: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < raw.length) {
        while (i < raw.length && /\s/.test(raw[i])) i++;
        if (i >= raw.length) break;

        if (raw[i] === "'") {
            const end = raw.indexOf("'", i + 1);
            if (end === -1) {
                tokens.push(raw.slice(i)); // Unterminated quote — kept as-is, validateValueToken rejects it.
                break;
            };
            tokens.push(raw.slice(i, end + 1));
            i = end + 1;
        } else {
            const start = i;
            while (i < raw.length && !/\s/.test(raw[i])) i++;
            tokens.push(raw.slice(start, i));
        };
    };
    return tokens;
};

/**
 * Validates one VALUES() entry against the field it belongs to, per the DDS reference: "A value can
 * be a numeric or a character value, corresponding in length to the field that is to be tested. A
 * character value must be enclosed in single quotation marks. A numeric value is restricted to the
 * digits 0 through 9 and can be preceded by a minus sign." Since a field's data type is fixed, every
 * entry must match it the same way — there's no such thing as a mixed character/numeric list, so
 * e.g. `VALUES('A' 'B' 55)` on a 1-character field is invalid DDS on two counts: 55 isn't quoted,
 * and even quoted ('55') it would be 2 characters against a 1-character field.
 * @param token - One value token, exactly as typed (including surrounding quotes, if any)
 * @param isNumeric - Whether the field is numeric (see isNumericFieldForValues)
 * @param length - The field's length, in characters/digits
 */
function validateValueToken(token: string, isNumeric: boolean, length: number): string | null {
    const isQuoted = token.length >= 2 && token.startsWith("'") && token.endsWith("'");

    if (isNumeric) {
        if (isQuoted) return `${token} is quoted, but this is a numeric field — VALUES entries must not be quoted.`;
        if (!/^-?\d+(\.\d+)?$/.test(token)) return `'${token}' isn't a valid numeric value.`;
        return null;
    };

    if (!isQuoted) return `${token} must be enclosed in single quotes ('${token}') — this is a character field.`;
    const content = token.slice(1, -1);
    if (content.length > length) return `${token} is longer than the field (${length} character${length === 1 ? '' : 's'}).`;
    return null;
};

/**
 * Collects VALUES parameters from user, validating each one against the field's type and length so
 * the result is always valid DDS — a character field rejects an unquoted or over-length entry, and
 * a numeric field rejects a quoted one, instead of silently writing an invalid VALUES() to the
 * source (e.g. mixing 'A' 'B' with a bare 55 on a 1-character field).
 * @param fieldInfo - Field information
 * @param current - The check's current values list, when changing an existing VALUES
 * @returns VALUES validity check or null if cancelled
 */
async function collectValuesParameters(fieldInfo: any, current?: ValidityCheck): Promise<ValidityCheck | null> {
    if ((fieldInfo.type || '').trim().toUpperCase() === 'F') {
        vscode.window.showWarningMessage('VALUES cannot be specified on a floating-point field.');
        return null;
    };

    const isNumeric = isNumericFieldForValues(fieldInfo);
    const length = fieldInfo.length ?? 0;

    const values = await vscode.window.showInputBox({
        title: 'VALUES - Valid Values List',
        prompt: `Enter valid values separated by spaces (Field type: ${isNumeric ? 'numeric' : 'character'}, length ${length})`,
        value: current?.parameters.join(' '),
        placeHolder: isNumeric ? 'e.g., 0 1 2 -5' : "e.g., 'A' 'B' 'C'",
        validateInput: (value: string) => {
            if (!value.trim()) return 'At least one valid value is required';
            const tokens = tokenizeValuesInput(value);
            if (tokens.length === 0) return 'At least one valid value is required';
            for (const token of tokens) {
                const error = validateValueToken(token, isNumeric, length);
                if (error) return error;
            };
            return null;
        }
    });

    if (values === undefined) return null;

    return {
        type: 'VALUES',
        parameters: tokenizeValuesInput(values)
    };
};

// DDS MODIFICATION FUNCTIONS

/**
 * Adds a validity check to a DDS field by inserting a validity check line after the field.
 * @param editor - The active text editor
 * @param element - The DDS field to add the validity check to
 * @param validityCheck - The validity check to add
 */
async function addValidityCheckToField(
    editor: vscode.TextEditor,
    element: any,
    validityCheck: ValidityCheck
): Promise<boolean> {
    const insertionPoint = findElementInsertionPoint(editor, element);
    if (insertionPoint === -1) {
        throw new Error('Could not find insertion point for the validity check');
    };

    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;

    const validityCheckLine = createValidityCheckLine(validityCheck);
    const insertPos = new vscode.Position(insertionPoint, 0);
    if (insertPos.line >= editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPos, '\n');
    };
    workspaceEdit.insert(uri, insertPos, validityCheckLine);
    if (insertPos.line < editor.document.lineCount) {
        workspaceEdit.insert(uri, insertPos, '\n');
    };

    return applyWorkspaceEdit(workspaceEdit, 'add the validity check');
};

/**
 * Creates a DDS validity check line.
 * @param validityCheck - The validity check
 * @returns Formatted DDS line in correct positions
 */
function createValidityCheckLine(validityCheck: ValidityCheck): string {
    let line = '     A '; // Start with 'A' and spaces up to position 7

    while (line.length < 44) {
        line += ' ';
    };

    // Add the validity check keyword and parameters
    line += `${validityCheck.type}(${validityCheck.parameters.join(' ')})`;

    return line;
};
