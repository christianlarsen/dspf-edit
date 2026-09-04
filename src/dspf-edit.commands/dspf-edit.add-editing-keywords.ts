/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-editing-keywords.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from '../dspf-edit.providers/dspf-edit.providers';
import { fieldsPerRecords } from '../dspf-edit.model/dspf-edit.model';
import { isAttributeLine, findElementInsertionPoint, checkForEditorAndDocument, applyWorkspaceEdit, removeKeywordPatternsFromLines, findKeywordContinuationEndLine } from '../dspf-edit.utils/dspf-edit.helper';
import { getResolvedRef } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';

// INTERFACES AND TYPES

interface EditConfiguration {
    type: 'EDTCDE' | 'EDTWRD' | 'EDTMSK';
    value: string;
    modifier?: string; // For EDTCDE: * for asterisk fill, or currency symbol
};

interface EditCodeOption {
    code: string;
    description: string;
    category: 'Standard' | 'Credit' | 'Minus' | 'Special' | 'User-Defined';
    supportsAsterisk: boolean;
    supportsCurrency: boolean;
};

/** One row of the editing-keywords summary menu — one of the 3 keyword slots for a field. */
interface EditingMenuItem extends vscode.QuickPickItem {
    editType: 'EDTCDE' | 'EDTWRD' | 'EDTMSK';
};

// COMMAND REGISTRATION

/**
 * Registers the edit field command for DDS fields.
 * Allows users to interactively manage field editing (EDTCDE, EDTWRD, EDTMSK).
 * @param context - The VS Code extension context
 */
export function editingKeywords(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.add-editing-keywords", async (node: DdsNode) => {
            await handleEditingKeywordsCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the edit field command for a DDS field: shows a summary menu with all 3 keyword slots
 * (EDTCDE/EDTWRD/EDTMSK) and their current value, letting the user jump straight to setting/
 * changing whichever one they want, or remove one directly via its own trash button — instead of
 * the old "Replace/Remove, then pick a type" two-step flow.
 * @param node - The DDS node containing the field
 */
async function handleEditingKeywordsCommand(node: DdsNode): Promise<void> {
    try {
        // Check for editor and document
        const { editor, document } = checkForEditorAndDocument();
        if (!document || !editor) {
            return;
        };

        // Validate element type - only fields can have editing
        if (node.ddsElement.kind !== 'field') {
            vscode.window.showWarningMessage('Field editing can only be applied to fields.');
            return;
        };

        // Get field information — for a referenced field, its own DDS source leaves type/length/
        // decimals blank (they live in the external database field), so fall back to whatever's
        // already been resolved from IBM i (via "Resolve Referenced Field") when available.
        const fieldInfo = getFieldInfo(node.ddsElement);
        if (!fieldInfo) {
            vscode.window.showErrorMessage('Could not determine field information for editing.');
            return;
        };
        const effectiveFieldInfo = getEffectiveFieldInfo(fieldInfo, node.ddsElement, document.uri.toString());
        const currentEditing = getCurrentEditingForField(node.ddsElement);
        const inputCapable = isInputCapableField(effectiveFieldInfo);

        const choice = await showEditingMenu(buildEditingMenuItems(currentEditing, inputCapable), effectiveFieldInfo.name);
        if (!choice) return;

        if (choice.action === 'remove') {
            await removeOneEditingType(editor, node.ddsElement, choice.editType);
            return;
        };

        let newEdits: EditConfiguration[] | null = null;

        if (choice.editType === 'EDTCDE') {
            // Validate field is numeric for EDTCDE
            if (!isNumericField(effectiveFieldInfo)) {
                vscode.window.showWarningMessage(numericFieldWarning('Edit codes (EDTCDE)', node.ddsElement, effectiveFieldInfo));
                return;
            };
            const editCode = await collectEditCode(effectiveFieldInfo);
            if (editCode) newEdits = [editCode];

        } else if (choice.editType === 'EDTWRD') {
            // Validate field is numeric for EDTWRD
            if (!isNumericField(effectiveFieldInfo)) {
                vscode.window.showWarningMessage(numericFieldWarning('Edit words (EDTWRD)', node.ddsElement, effectiveFieldInfo));
                return;
            };
            const currentEdtwrd = currentEditing.find(edit => edit.type === 'EDTWRD');
            const editWord = await collectEditWord(effectiveFieldInfo, currentEdtwrd);
            if (editWord) newEdits = [editWord];

        } else {
            // EDTMSK protects/masks what the user types, so it's only meaningful on a field the
            // user can actually type into (usage I or B) — an output-only field has nothing to mask
            // (already excluded from the menu, but the command can still be reinvoked directly).
            if (!inputCapable) {
                vscode.window.showWarningMessage(inputCapableFieldWarning(node.ddsElement));
                return;
            };

            const existingBase = currentEditing.find(edit => edit.type === 'EDTCDE' || edit.type === 'EDTWRD');
            let base: EditConfiguration | null = existingBase ?? null;

            if (!base) {
                // EDTMSK requires EDTCDE or EDTWRD to be present
                vscode.window.showInformationMessage('EDTMSK requires EDTCDE or EDTWRD. Choose the base editing first.');

                const baseEditType = await vscode.window.showQuickPick([
                    'EDTCDE - Edit Code',
                    'EDTWRD - Edit Word'
                ], {
                    title: 'EDTMSK requires a base editing keyword. Choose base editing:',
                    placeHolder: 'Select EDTCDE or EDTWRD first'
                });

                if (!baseEditType) return;

                // Validate field is numeric for base editing
                if (!isNumericField(effectiveFieldInfo)) {
                    vscode.window.showWarningMessage(numericFieldWarning('EDTMSK base editing', node.ddsElement, effectiveFieldInfo));
                    return;
                };

                base = baseEditType.startsWith('EDTCDE')
                    ? await collectEditCode(effectiveFieldInfo)
                    : await collectEditWord(effectiveFieldInfo);

                if (!base) return;
            };

            const currentEdtmsk = currentEditing.find(edit => edit.type === 'EDTMSK');
            const editMask = await collectEditMask(base, currentEdtmsk);
            if (editMask) {
                // A base that already existed is left untouched by applyOneEditingKeyword (it
                // only replaces what's actually being changed) — only pass it along when it was
                // just freshly collected here, so it actually gets written.
                newEdits = existingBase ? [editMask] : [base, editMask];
            };
        };

        if (!newEdits) {
            vscode.window.showInformationMessage('No field editing selected.');
            return;
        };

        // Apply the selected editing to the field
        if (!(await applyOneEditingKeyword(editor, node.ddsElement, currentEditing, newEdits))) {
            return;
        };
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        const editingSummary = newEdits.map(formatEditConfig).join(' + ');
        vscode.window.showInformationMessage(
            `Applied field editing ${editingSummary} to ${node.ddsElement.name}.`
        );

    } catch (error) {
        console.error('Error managing field editing:', error);
        vscode.window.showErrorMessage('An error occurred while managing field editing.');
    };
};

// EDITING SUMMARY MENU

/** Formats an editing configuration exactly as it reads in DDS source, e.g. "EDTCDE(Z)" or "EDTWRD('   0.  ')". */
function formatEditConfig(edit: EditConfiguration): string {
    return `${edit.type}(${edit.value}${edit.modifier ? ' ' + edit.modifier : ''})`;
};

const EDIT_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Set/change' };
const REMOVE_BUTTON: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Remove' };

/**
 * Builds the "editing keywords" summary menu's 3 rows (2 for an output-only field, since EDTMSK
 * only ever applies to input-capable ones) — each showing its currently assigned value (formatted
 * exactly as it'd read in the DDS source, e.g. "EDTCDE(Z)") or "(not set)", with an edit button
 * (always) and a trash button (only when something's actually assigned) so both actions are
 * explicit instead of relying on "click the row" meaning "edit".
 * @param currentEditing - The field's current editing configuration(s)
 * @param inputCapable - Whether the field's usage allows EDTMSK
 */
function buildEditingMenuItems(currentEditing: EditConfiguration[], inputCapable: boolean): EditingMenuItem[] {
    const row = (editType: 'EDTCDE' | 'EDTWRD' | 'EDTMSK', label: string): EditingMenuItem => {
        const current = currentEditing.find(edit => edit.type === editType);
        return {
            editType,
            label,
            description: current ? formatEditConfig(current) : '(not set)',
            buttons: current ? [EDIT_BUTTON, REMOVE_BUTTON] : [EDIT_BUTTON]
        };
    };

    const items: EditingMenuItem[] = [
        row('EDTCDE', 'EDTCDE — Edit Code'),
        row('EDTWRD', 'EDTWRD — Edit Word')
    ];
    if (inputCapable) {
        items.push(row('EDTMSK', 'EDTMSK — Edit Mask'));
    };
    return items;
};

/**
 * Shows the editing-keywords summary menu and resolves to what the user did: picked a row (or its
 * edit button) to set/change (`action: 'select'`), or clicked a row's trash button to remove it
 * (`action: 'remove'`) — undefined if dismissed. Needs the raw `createQuickPick` API rather than
 * the simpler `showQuickPick` helper, since only it exposes per-item buttons
 * (`onDidTriggerItemButton`).
 * @param items - The menu's rows, from `buildEditingMenuItems`
 * @param fieldName - The field's name, for the menu's title
 */
function showEditingMenu(items: EditingMenuItem[], fieldName: string): Promise<{ action: 'select' | 'remove'; editType: 'EDTCDE' | 'EDTWRD' | 'EDTMSK' } | undefined> {
    return new Promise(resolve => {
        const quickPick = vscode.window.createQuickPick<EditingMenuItem>();
        quickPick.items = items;
        quickPick.title = `Editing keywords for ${fieldName}`;
        quickPick.placeholder = 'Select a keyword to set/change, or use its buttons';
        quickPick.ignoreFocusOut = true;

        let settled = false;
        const finish = (result: { action: 'select' | 'remove'; editType: 'EDTCDE' | 'EDTWRD' | 'EDTMSK' } | undefined) => {
            if (settled) return;
            settled = true;
            resolve(result);
            quickPick.hide();
        };

        quickPick.onDidTriggerItemButton(event => {
            finish({ action: event.button === REMOVE_BUTTON ? 'remove' : 'select', editType: event.item.editType });
        });
        quickPick.onDidAccept(() => {
            const picked = quickPick.selectedItems[0];
            finish(picked ? { action: 'select', editType: picked.editType } : undefined);
        });
        quickPick.onDidHide(() => {
            finish(undefined);
            quickPick.dispose();
        });

        quickPick.show();
    });
};

// EDITING EXTRACTION FUNCTIONS

/**
 * Extracts current editing configuration from a DDS field.
 * @param element - The DDS field element
 * @returns Array of current editing configurations
 */
function getCurrentEditingForField(element: any): EditConfiguration[] {
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return [];

    const fieldInfo = recordInfo.fields.find(field => field.name === element.name);
    if (!fieldInfo || !fieldInfo.attributes) return [];

    const editing: EditConfiguration[] = [];

    fieldInfo.attributes.forEach(attrObj => {
        const attr = attrObj.value;
        // Check for EDTCDE
        const edtcdeMatch = attr.match(/^EDTCDE\(([^)]+)\)$/);
        if (edtcdeMatch) {
            const params = edtcdeMatch[1].trim().split(/\s+/);
            const code = params[0];
            const modifier = params.length > 1 ? params[1] : undefined;
            editing.push({ type: 'EDTCDE', value: code, modifier });
        };

        // Check for EDTWRD — value keeps its surrounding quotes (matching collectEditWord's own
        // convention below), since createEditingKeywordText interpolates it as-is; without them, a
        // "survivor" reused as-is by applyOneEditingKeyword would get written back unquoted.
        const edtwrdMatch = attr.match(/^EDTWRD\('([^']+)'\)$/);
        if (edtwrdMatch) {
            editing.push({ type: 'EDTWRD', value: `'${edtwrdMatch[1]}'` });
        };

        // Check for EDTMSK — same quoting reasoning as EDTWRD above.
        const edtmskMatch = attr.match(/^EDTMSK\('([^']+)'\)$/);
        if (edtmskMatch) {
            editing.push({ type: 'EDTMSK', value: `'${edtmskMatch[1]}'` });
        };
    });

    return editing;
};

/**
 * Gets field information including type and length.
 * @param element - The DDS field element
 * @returns Field information or null if not found
 */
function getFieldInfo(element: any): any {
    const recordInfo = fieldsPerRecords.find(r => r.record === element.recordname);
    if (!recordInfo) return null;

    return recordInfo.fields.find(field => field.name === element.name);
};

/**
 * For a referenced field, `fieldInfo.type`/`length`/`decimals` are blank — the DDS source doesn't
 * declare them, the external database field does. Once that's been resolved from IBM i (via
 * "Resolve Referenced Field"), use the resolved type/length/decimals instead so EDTCDE/EDTWRD
 * validation reflects the field's real, borrowed type rather than always reading as non-numeric.
 * @param fieldInfo - Field information as parsed from the DDS source
 * @param element - The DDS field element (for its `referenced`/`recordname`/`name`)
 * @param documentUri - The document's URI (as a string), used as the resolved-cache key
 */
function getEffectiveFieldInfo(fieldInfo: any, element: any, documentUri: string): any {
    if (!element.referenced) return fieldInfo;

    const resolved = getResolvedRef(documentUri, element.recordname, element.name);
    if (!resolved) return fieldInfo;

    return { ...fieldInfo, type: resolved.type, length: resolved.length, decimals: resolved.decimals };
};

/**
 * Builds the "not numeric" warning for EDTCDE/EDTWRD/EDTMSK, adding a hint to resolve the field
 * first when it's a referenced field whose real type isn't known yet (rather than implying it's
 * definitely non-numeric, which the source alone can't say).
 * @param keywordLabel - e.g. 'Edit codes (EDTCDE)'
 * @param element - The DDS field element
 * @param effectiveFieldInfo - The field info actually checked (post `getEffectiveFieldInfo`)
 */
function numericFieldWarning(keywordLabel: string, element: any, effectiveFieldInfo: any): string {
    const base = `${keywordLabel} can only be applied to numeric fields (types P, S, B, F, I).`;
    if (element.referenced && !effectiveFieldInfo.type) {
        return `${base} This is a referenced field with an unresolved type — run "Resolve Referenced Field" first to check whether it's numeric.`;
    };
    return base;
};

/**
 * Checks if a field's usage allows user input — EDTMSK only makes sense there, since it protects/
 * formats what the user types; an output-only field has nothing to mask.
 * @param fieldInfo - Field information
 * @returns true if usage is I (input) or B (both)
 */
function isInputCapableField(fieldInfo: any): boolean {
    const usage = (fieldInfo.usage || '').trim().toUpperCase();
    return usage === 'I' || usage === 'B';
};

/**
 * Builds the "not input-capable" warning for EDTMSK.
 * @param element - The DDS field element
 */
function inputCapableFieldWarning(element: any): string {
    return `EDTMSK can only be applied to an input-capable field (usage I or B) — '${element.name}' isn't one.`;
};

/**
 * Checks if a field is numeric and can have edit codes/words.
 * @param fieldInfo - Field information
 * @returns true if field is numeric
 */
function isNumericField(fieldInfo: any): boolean {
    const fieldType = (fieldInfo.type || '').trim();

    // A blank Type column is DDS's own default and is ambiguous on its own: it's alphanumeric
    // only when the decimal-positions column is also blank, but a blank Type with decimal
    // positions given (even 0) is a plain zoned-numeric field — the most common way to define a
    // numeric field in DDS, without ever writing an explicit type letter.
    if (fieldType === '') {
        return fieldInfo.decimals !== undefined;
    };

    // All numeric types that support editing in DDS:
    // P = Packed decimal
    // S = Zoned decimal (signed)
    // B = Binary
    // F = Floating point
    // I = Integer (newer systems)
    // Y = Numeric-only (digits 0-9, no sign)
    // A = Alphanumeric (when used with numeric edit codes, treated as numeric)
    // H = Hexadecimal (binary data, can be numeric in some contexts)
    // L = Date (numeric representation)
    // T = Time (numeric representation)
    // Z = Timestamp (numeric representation)
    
    const numericTypes = [
        'P',  // Packed decimal
        'S',  // Zoned decimal (signed)
        'B',  // Binary
        'F',  // Floating point
        'I',  // Integer
        'Y',  // Numeric-only (digits 0-9, no sign)
        'L',  // Date (can have numeric edit)
        'T',  // Time (can have numeric edit)
        'Z'   // Timestamp (can have numeric edit)
    ];
    
    return numericTypes.includes(fieldType.toUpperCase());
};

/**
 * Alternative version with more detailed type checking
 * @param fieldInfo - Field information including type and other attributes
 * @returns true if field is numeric and supports edit codes/words
 */
function isNumericFieldDetailed(fieldInfo: any): boolean {
    const fieldType = (fieldInfo.type || '').toUpperCase();
    
    // Primary numeric types that always support editing
    const primaryNumericTypes = ['P', 'S', 'B', 'F', 'I', 'Y'];
    
    if (primaryNumericTypes.includes(fieldType)) {
        return true;
    };
    
    // Date/Time types that can have numeric editing
    const dateTimeTypes = ['L', 'T', 'Z'];
    if (dateTimeTypes.includes(fieldType)) {
        return true;
    };
    
    // Special case: Alphanumeric fields (A) can be treated as numeric
    // if they have numeric edit codes or are defined with numeric usage
    if (fieldType === 'A') {
        // Check if field has numeric-related attributes
        const attributes = fieldInfo.attributes || [];
        const hasNumericEdit = attributes.some((attr: string) => 
            /^(EDTCDE|EDTWRD)\s*\(/.test(attr.toUpperCase())
        );
        return hasNumericEdit;
    };
    
    // Hexadecimal fields (H) are typically not editable as numeric,
    // but in some contexts they might be
    if (fieldType === 'H') {
        return false; // Usually false, but can be customized based on needs
    };
    
    return false;
};

// EDIT CODE DEFINITIONS

/**
 * Gets all available edit codes with their descriptions and capabilities.
 * @returns Array of edit code options
 */
function getAvailableEditCodes(): EditCodeOption[] {
    return [
        // Standard codes (1-4)
        { code: '1', description: 'Commas, no sign, zero as .00/0', category: 'Standard', supportsAsterisk: true, supportsCurrency: true },
        { code: '2', description: 'Commas, no sign, zero as blanks', category: 'Standard', supportsAsterisk: true, supportsCurrency: true },
        { code: '3', description: 'No commas, no sign, zero as .00/0', category: 'Standard', supportsAsterisk: true, supportsCurrency: true },
        { code: '4', description: 'No commas, no sign, zero as blanks', category: 'Standard', supportsAsterisk: true, supportsCurrency: true },

        // Credit codes (A-D) - show CR for negative
        { code: 'A', description: 'Commas, CR for negative, zero as .00/0', category: 'Credit', supportsAsterisk: true, supportsCurrency: true },
        { code: 'B', description: 'Commas, CR for negative, zero as blanks', category: 'Credit', supportsAsterisk: true, supportsCurrency: true },
        { code: 'C', description: 'No commas, CR for negative, zero as .00/0', category: 'Credit', supportsAsterisk: true, supportsCurrency: true },
        { code: 'D', description: 'No commas, CR for negative, zero as blanks', category: 'Credit', supportsAsterisk: true, supportsCurrency: true },

        // Minus codes (J-Q) - show - for negative
        { code: 'J', description: 'Commas, minus for negative, zero as .00/0', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'K', description: 'Commas, minus for negative, zero as blanks', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'L', description: 'No commas, minus for negative, zero as .00/0', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'M', description: 'No commas, minus for negative, zero as blanks', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'N', description: 'Commas, leading minus for negative, zero as .00/0', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'O', description: 'Commas, leading minus for negative, zero as blanks', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'P', description: 'No commas, leading minus for negative, zero as .00/0', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },
        { code: 'Q', description: 'No commas, leading minus for negative, zero as blanks', category: 'Minus', supportsAsterisk: true, supportsCurrency: true },

        // Special codes
        { code: 'W', description: 'Date format with slashes, suppresses leftmost zeros', category: 'Special', supportsAsterisk: false, supportsCurrency: false },
        { code: 'Y', description: 'Date format with slashes, different zero suppression', category: 'Special', supportsAsterisk: false, supportsCurrency: false },
        { code: 'Z', description: 'Remove sign, suppress leading zeros', category: 'Special', supportsAsterisk: false, supportsCurrency: false },

        // User-defined codes
        { code: '5', description: 'User-defined edit code QEDIT5', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false },
        { code: '6', description: 'User-defined edit code QEDIT6', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false },
        { code: '7', description: 'User-defined edit code QEDIT7', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false },
        { code: '8', description: 'User-defined edit code QEDIT8', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false },
        { code: '9', description: 'User-defined edit code QEDIT9', category: 'User-Defined', supportsAsterisk: false, supportsCurrency: false }
    ];
};

/**
 * Valid field lengths for EDTCDE(W) and EDTCDE(Y) — unlike the comma/sign codes, these two only
 * work for the specific digit lengths documented in the DDS reference's Table 6/7 footnotes
 * (confirmed against real STRSDA, which rejects any other length). Keep in sync with
 * DATE_EDIT_CODE_DIGIT_GROUPS in dspf-edit.record-preview-panel.ts.
 */
const DATE_EDIT_CODE_VALID_LENGTHS: Record<'W' | 'Y', number[]> = {
    W: [5, 6, 7, 8],
    Y: [3, 4, 5, 6, 7, 8]
};

// USER INTERACTION FUNCTIONS

/**
 * Collects edit code configuration from user — a single flat list (no category grouping/separator
 * rows, which only added scrolling noise) so typing the code letter/number and pressing Enter picks
 * it in one shot, the same speed as typing it directly in STRSDA.
 * @param fieldInfo - Field information
 * @returns Selected edit code configuration
 */
async function collectEditCode(fieldInfo: any): Promise<EditConfiguration | null> {
    const availableEditCodes = getAvailableEditCodes();

    const items = availableEditCodes.map(ec => ({
        label: ec.code,
        description: ec.description,
        code: ec.code
    }));

    const selectedItem = await vscode.window.showQuickPick(items, {
        title: `Select Edit Code for ${fieldInfo.name} (Type: ${fieldInfo.type})`,
        placeHolder: 'Type a code (e.g. J) or pick from the list'
    });

    if (!selectedItem) return null;

    const editCodeOption = availableEditCodes.find(ec => ec.code === selectedItem.code);

    if (!editCodeOption) return null;

    if (editCodeOption.code === 'W' || editCodeOption.code === 'Y') {
        const fieldLength = Number(fieldInfo.length) || 0;
        const validLengths = DATE_EDIT_CODE_VALID_LENGTHS[editCodeOption.code];
        if (!validLengths.includes(fieldLength)) {
            vscode.window.showWarningMessage(
                `EDTCDE(${editCodeOption.code}) is only valid for a field length of ${validLengths.join(', ')} — ${fieldInfo.name} is length ${fieldLength}.`
            );
            return null;
        };
    };

    const editConfig: EditConfiguration = {
        type: 'EDTCDE',
        value: editCodeOption.code
    };

    // Ask for modifiers if supported
    if (editCodeOption.supportsAsterisk || editCodeOption.supportsCurrency) {
        const modifierOptions = ['No modifier'];
        
        if (editCodeOption.supportsAsterisk) {
            modifierOptions.push('* (Asterisk fill)');
        };
        
        if (editCodeOption.supportsCurrency) {
            modifierOptions.push('$ (Floating currency symbol)');
            modifierOptions.push('Other currency symbol...');
        };

        const selectedModifier = await vscode.window.showQuickPick(modifierOptions, {
            title: `Select modifier for EDTCDE(${editCodeOption.code})`,
            placeHolder: 'Choose a modifier (optional)'
        });

        if (selectedModifier && selectedModifier !== 'No modifier') {
            if (selectedModifier === '* (Asterisk fill)') {
                editConfig.modifier = '*';
            } else if (selectedModifier === '$ (Floating currency symbol)') {
                editConfig.modifier = '$';
            } else if (selectedModifier === 'Other currency symbol...') {
                const customSymbol = await vscode.window.showInputBox({
                    title: 'Custom Currency Symbol',
                    prompt: 'Enter the currency symbol (must match QCURSYM system value)',
                    placeHolder: 'e.g., €, £, ¥',
                    validateInput: (value: string) => {
                        if (!value.trim()) return 'Currency symbol is required';
                        if (value.trim().length > 1) return 'Currency symbol should be a single character';
                        return null;
                    }
                });

                if (customSymbol === undefined) return null;
                editConfig.modifier = customSymbol.trim();
            };
        };
    };

    return editConfig;
};

/**
 * Collects edit word configuration from user.
 * @param fieldInfo - Field information
 * @param current - The field's current EDTWRD (already quoted, e.g. "'   0.  '"), if changing one
 * @returns Selected edit word configuration
 */
async function collectEditWord(fieldInfo: any, current?: EditConfiguration): Promise<EditConfiguration | null> {
    const fieldLength = parseInt(fieldInfo.length) || 0;
    // Prefilled with the current word when changing one, or with a blank template already sized to
    // the field's own digit count when starting fresh — already satisfies the "N digit positions"
    // rule below, so the user only has to insert literal characters instead of counting blanks.
    const defaultValue = current ? current.value : `'${' '.repeat(fieldLength)}'`;

    const editWordPattern = await vscode.window.showInputBox({
        title: `Edit Word for ${fieldInfo.name}`,
        prompt: `Enter edit word pattern (Field: ${fieldInfo.length} digits, ${fieldInfo.decimals || 0} decimals)`,
        value: defaultValue,
        valueSelection: [1, 1 + fieldLength],
        placeHolder: `Examples: '   0.  ' (decimal), '   $0.  ' (currency), '( ) -    ' (phone)`,
        validateInput: (value: string) => {
            if (!value.trim()) return 'Edit word pattern is required';
            if (!value.startsWith('\'') || !value.endsWith('\'')) {
                return 'Edit word must be enclosed in single quotes';
            };
            const pattern = value.slice(1, -1);
            if (!pattern) return 'Edit word pattern cannot be empty';
            
            // Basic validation: count blanks and zero-suppression characters
            const digitPositions = (pattern.match(/[ 0]/g) || []).length;
            const fieldLength = parseInt(fieldInfo.length) || 0;
            
            if (digitPositions > 0 && digitPositions !== fieldLength) {
                return `Must have ${fieldLength} digit positions (blanks + zero chars), found ${digitPositions}`;
            };
            
            return null;
        }
    });

    if (editWordPattern === undefined) return null;

    return {
        type: 'EDTWRD',
        value: editWordPattern
    };
};

/**
 * Collects edit mask configuration from user.
 * @param baseEdit - The base editing configuration (EDTCDE or EDTWRD)
 * @param current - The field's current EDTMSK (already quoted), if changing one
 * @returns Selected edit mask configuration
 */
async function collectEditMask(baseEdit: EditConfiguration, current?: EditConfiguration): Promise<EditConfiguration | null> {
    const editMaskPattern = await vscode.window.showInputBox({
        title: `Edit Mask for ${baseEdit.type}(${baseEdit.value})`,
        prompt: `Define protection: & for protected areas, blank for user input areas`,
        value: current?.value,
        placeHolder: `Examples: '& &  & ' (phone), '  &  & ' (date), '&   .  ' (currency)`,
        validateInput: (value: string) => {
            if (!value.trim()) return 'Edit mask pattern is required';
            if (!value.startsWith('\'') || !value.endsWith('\'')) {
                return 'Edit mask must be enclosed in single quotes';
            };
            const pattern = value.slice(1, -1);
            if (!pattern) return 'Edit mask pattern cannot be empty';
            
            // Basic validation: should only contain & and spaces
            if (!/^[& ]*$/.test(pattern)) {
                return 'Edit mask can only contain ampersands (&) and spaces ( )';
            };
            
            return null;
        }
    });

    if (editMaskPattern === undefined) return null;

    return {
        type: 'EDTMSK',
        value: editMaskPattern
    };
};

// DDS MODIFICATION FUNCTIONS

/**
 * Applies one or two freshly-collected editing keywords to the field (EDTCDE or EDTWRD alone;
 * EDTMSK alone if a base already exists; or both together when neither existed yet), replacing
 * whichever existing keyword(s) they're incompatible with — EDTCDE and EDTWRD are mutually
 * exclusive in DDS, so setting one always drops the other, but an existing EDTMSK survives (it
 * doesn't care which of the two is its base) unless it's being explicitly replaced too. Removes
 * everything first, then reapplies survivors + the new edit(s) together — simplest way to reuse the
 * already-working remove/add logic for every combination (field-line vs separate attribute lines,
 * single- vs multi-line EDTWRD...) rather than patching the existing source in place.
 * @param editor - The active text editor
 * @param element - The DDS field to update
 * @param currentEditing - The field's editing configuration before this change
 * @param newEdits - The freshly-collected edit(s) to apply
 */
async function applyOneEditingKeyword(
    editor: vscode.TextEditor,
    element: any,
    currentEditing: EditConfiguration[],
    newEdits: EditConfiguration[]
): Promise<boolean> {
    if (currentEditing.length > 0) {
        if (!(await removeEditingFromField(editor, element))) return false;
    };

    const addingBase = newEdits.some(edit => edit.type === 'EDTCDE' || edit.type === 'EDTWRD');
    const addingMask = newEdits.some(edit => edit.type === 'EDTMSK');
    const toApply = [...newEdits];

    if (addingMask && !addingBase) {
        const survivingBase = currentEditing.find(edit => edit.type === 'EDTCDE' || edit.type === 'EDTWRD');
        if (survivingBase) toApply.unshift(survivingBase);
    };
    if (addingBase && !addingMask) {
        const survivingMask = currentEditing.find(edit => edit.type === 'EDTMSK');
        if (survivingMask) toApply.push(survivingMask);
    };

    return addEditingToField(editor, element, toApply);
};

/**
 * Removes just one editing keyword type from the field (the summary menu's trash-button action) —
 * DDS requires EDTMSK to accompany an EDTCDE/EDTWRD, so removing the *base* takes any mask with it;
 * removing just the mask leaves the base untouched. Same remove-everything-then-reapply-survivors
 * approach as `applyOneEditingKeyword`.
 * @param editor - The active text editor
 * @param element - The DDS field to remove editing from
 * @param editType - Which of EDTCDE/EDTWRD/EDTMSK to remove
 */
async function removeOneEditingType(
    editor: vscode.TextEditor,
    element: any,
    editType: 'EDTCDE' | 'EDTWRD' | 'EDTMSK'
): Promise<void> {
    const currentEditing = getCurrentEditingForField(element);
    const survivors = currentEditing.filter(edit => {
        if (edit.type === editType) return false;
        if ((editType === 'EDTCDE' || editType === 'EDTWRD') && edit.type === 'EDTMSK') return false;
        return true;
    });

    if (!(await removeEditingFromField(editor, element))) return;
    if (survivors.length > 0) {
        await addEditingToField(editor, element, survivors);
    };
};

/**
 * Adds editing configuration to a DDS field.
 * @param editor - The active text editor
 * @param element - The DDS field to add editing to
 * @param editing - Array of editing configurations to add
 */
async function addEditingToField(
    editor: vscode.TextEditor,
    element: any,
    editing: EditConfiguration[]
): Promise<boolean> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    const uri = editor.document.uri;
    const fieldLine = editor.document.lineAt(element.lineIndex);
    const fieldLineText = fieldLine.text;

    // Check if field already has attributes on the field line
    const hasAttributesOnFieldLine = hasExistingAttributes(fieldLineText);
    
    // Check if field has any attribute lines following it
    const hasAttributeLines = hasExistingAttributeLines(editor, element);

    if (!hasAttributesOnFieldLine && !hasAttributeLines) {
        // No existing attributes - add first editing to the field line itself
        await addFirstEditingToFieldLine(editor, element, editing[0], workspaceEdit, uri);
        
        // Add remaining editing keywords as separate lines if any
        if (editing.length > 1) {
            const insertionPoint = findElementInsertionPoint(editor, element);
            if (insertionPoint !== -1) {
                await addAdditionalEditingLines(editing.slice(1), insertionPoint, workspaceEdit, uri, editor);
            };
        };
    } else {
        // Field already has attributes - add all editing as separate lines
        const insertionPoint = findElementInsertionPoint(editor, element);
        if (insertionPoint === -1) {
            throw new Error('Could not find insertion point for field editing');
        };
        // EDTCDE/EDTWRD require numeric-only (Y); upgrade from signed numeric (S) if needed.
        // The field's own line isn't otherwise touched in this branch, so this is a standalone edit.
        if (editing.some(edit => edit.type === 'EDTCDE' || edit.type === 'EDTWRD')) {
            upgradeSignedTypeOnFieldLine(editor.document, workspaceEdit, uri, element);
        };
        await addAdditionalEditingLines(editing, insertionPoint, workspaceEdit, uri, editor);
    };

    return applyWorkspaceEdit(workspaceEdit, 'apply the field editing');
};

/**
 * Checks if a field line already has attributes/keywords.
 * @param fieldLineText - The text of the field line
 * @returns true if field line has attributes
 */
function hasExistingAttributes(fieldLineText: string): boolean {
    // Check if line has content beyond position 44 (where keywords start)
    if (fieldLineText.length <= 44) return false;
    
    // Check for common attribute patterns beyond position 44
    const attributesPart = fieldLineText.substring(44).trim();
    return attributesPart.length > 0 && !attributesPart.startsWith("'");
};

/**
 * Checks if a field has existing attribute lines following it.
 * @param editor - The text editor
 * @param element - The DDS field element
 * @returns true if field has attribute lines
 */
function hasExistingAttributeLines(editor: vscode.TextEditor, element: any): boolean {
    const startLine = element.lineIndex + 1;
    
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;
        
        // Stop at next field or record
        if (!lineText.trim().startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };
        
        // Found at least one attribute line
        return true;
    };
    
    return false;
};

// DDS column 35 (0-indexed 34): data type / keyboard shift.
const FIELD_TYPE_COLUMN = 34;

/**
 * Returns `line` with its type/keyboard-shift column upgraded from signed numeric (S) to
 * numeric-only (Y) when it's currently S, otherwise unchanged. DDS does not allow EDTCDE/EDTWRD
 * on an S field ("You cannot specify S in position 35 if you also specify the EDTCDE or EDTWRD
 * keyword", per the DDS reference) — STRSDA itself makes this same S-to-Y switch automatically
 * the moment you attach an edit code, which is what this mirrors.
 * @param line - The field's DDS source line
 */
function upgradeSignedTypeChar(line: string): string {
    if (line.length <= FIELD_TYPE_COLUMN || line.charAt(FIELD_TYPE_COLUMN).toUpperCase() !== 'S') {
        return line;
    };
    return line.substring(0, FIELD_TYPE_COLUMN) + 'Y' + line.substring(FIELD_TYPE_COLUMN + 1);
};

/**
 * Upgrades the field's own line from signed numeric (S) to numeric-only (Y) in place, for the case
 * where the editing keyword is being written to a separate attribute line rather than appended to
 * the field's own line (so nothing else already touches that line in the same edit).
 * @param document - The active document
 * @param workspaceEdit - The workspace edit to add the change to
 * @param uri - The document URI
 * @param element - The DDS field element
 */
function upgradeSignedTypeOnFieldLine(
    document: vscode.TextDocument,
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri,
    element: any
): void {
    const lineText = document.lineAt(element.lineIndex).text;
    if (lineText.length <= FIELD_TYPE_COLUMN || lineText.charAt(FIELD_TYPE_COLUMN).toUpperCase() !== 'S') {
        return;
    };
    const start = new vscode.Position(element.lineIndex, FIELD_TYPE_COLUMN);
    const end = new vscode.Position(element.lineIndex, FIELD_TYPE_COLUMN + 1);
    workspaceEdit.replace(uri, new vscode.Range(start, end), 'Y');
};

/**
 * Adds the first editing keyword to the field line itself.
 * @param editor - The text editor
 * @param element - The field element
 * @param editing - The editing configuration
 * @param workspaceEdit - The workspace edit
 * @param uri - The document URI
 */
async function addFirstEditingToFieldLine(
    editor: vscode.TextEditor,
    element: any,
    editing: EditConfiguration,
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri
): Promise<void> {
    const fieldLine = editor.document.lineAt(element.lineIndex);
    const fieldLineText = fieldLine.text;

    // Ensure line is at least 44 characters (pad with spaces if needed)
    let updatedLine = fieldLineText;
    while (updatedLine.length < 44) {
        updatedLine += ' ';
    };

    // EDTCDE/EDTWRD require numeric-only (Y); upgrade from signed numeric (S) if needed.
    if (editing.type === 'EDTCDE' || editing.type === 'EDTWRD') {
        updatedLine = upgradeSignedTypeChar(updatedLine);
    };

    // Add the editing keyword
    const editingText = createEditingKeywordText(editing);
    updatedLine += editingText;

    // Replace the entire line
    workspaceEdit.replace(uri, fieldLine.range, updatedLine);
};

/**
 * Adds additional editing keywords as separate attribute lines.
 * @param editing - Array of editing configurations
 * @param insertionPoint - The line index where to insert
 * @param workspaceEdit - The workspace edit
 * @param uri - The document URI
 * @param editor - The text editor
 */
async function addAdditionalEditingLines(
    editing: EditConfiguration[],
    insertionPoint: number,
    workspaceEdit: vscode.WorkspaceEdit,
    uri: vscode.Uri,
    editor: vscode.TextEditor
): Promise<void> {
    let crInserted: boolean = false;
    
    for (let i = 0; i < editing.length; i++) {
        const editingLine = createEditingLine(editing[i]);
        const insertPos = new vscode.Position(insertionPoint, 0);
        
        if (!crInserted && insertPos.line >= editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
            crInserted = true;
        };
        
        workspaceEdit.insert(uri, insertPos, editingLine);
        
        if (i < editing.length - 1 || insertPos.line < editor.document.lineCount) {
            workspaceEdit.insert(uri, insertPos, '\n');
        };
    };
};

/**
 * Creates editing keyword text (without the 'A' prefix and positioning).
 * @param editConfig - The editing configuration
 * @returns Keyword text
 */
function createEditingKeywordText(editConfig: EditConfiguration): string {
    if (editConfig.type === 'EDTCDE') {
        let params = editConfig.value;
        if (editConfig.modifier) {
            params += ' ' + editConfig.modifier;
        };
        return `EDTCDE(${params})`;
    } else if (editConfig.type === 'EDTWRD') {
        return `EDTWRD(${editConfig.value})`;
    } else if (editConfig.type === 'EDTMSK') {
        return `EDTMSK(${editConfig.value})`;
    };
    return '';
};

/**
 * Creates a DDS editing line (complete line with 'A' prefix and positioning).
 * @param editConfig - The editing configuration
 * @returns Formatted DDS line
 */
function createEditingLine(editConfig: EditConfiguration): string {
    let line = '     A'; // Start with 'A' 

    // Pad to position 44 for keywords
    while (line.length < 44) {
        line += ' ';
    };

    // Add the editing keyword and parameters
    line += createEditingKeywordText(editConfig);

    return line;
};

/**
 * Removes existing editing from a DDS field.
 * @param editor - The active text editor
 * @param element - The DDS field to remove editing from
 */
async function removeEditingFromField(editor: vscode.TextEditor, element: any): Promise<boolean> {
    const editingLines = findExistingEditingLines(editor, element);
    if (editingLines.length === 0) return true;

    const document = editor.document;

    // Group lines by type: field line vs standalone editing lines
    const fieldLineIndex = element.lineIndex;
    const standaloneEditingLines = editingLines.filter(lineIndex => lineIndex !== fieldLineIndex);
    const hasFieldLineEditing = editingLines.includes(fieldLineIndex);

    const editingPatterns = [/EDTCDE\([^)]*\)/g, /EDTWRD\([^)]*\)/g, /EDTMSK\([^)]*\)/g];

    // Handle standalone editing lines. DDS allows other keywords to share this same line (e.g.
    // "EDTCDE(3) DSPATR(HI) COLOR(RED)"), and that shared keyword area can itself continue onto
    // further lines via a trailing hyphen — removeKeywordPatternsFromLines strips just the
    // EDTCDE/EDTWRD/EDTMSK text and re-flows whatever remains back onto as few lines as it now fits
    // in. Processed from the last line to the first: each removal can itself delete or merge lines,
    // which would shift the line numbers of everything below it (but never above), so handling later
    // lines first keeps every remaining entry's own line index valid when its turn comes.
    for (const lineIndex of [...standaloneEditingLines].sort((a, b) => b - a)) {
        const endLine = findKeywordContinuationEndLine(document, lineIndex);
        if (!(await removeKeywordPatternsFromLines(editor, lineIndex, endLine, editingPatterns, false))) {
            return false;
        };
    };

    // Handle editing on field line, same reasoning as above (and always last, since it's the
    // topmost line here and unaffected by any of the standalone removals above it).
    if (hasFieldLineEditing) {
        const endLine = findKeywordContinuationEndLine(document, fieldLineIndex);
        if (!(await removeKeywordPatternsFromLines(editor, fieldLineIndex, endLine, editingPatterns, true))) {
            return false;
        };
    };

    await vscode.commands.executeCommand('cursorRight');
    await vscode.commands.executeCommand('cursorLeft');

    vscode.window.showInformationMessage(`Removed field editing from ${element.name}.`);
    return true;
};

// LINE DETECTION FUNCTIONS

/**
 * Finds existing editing lines for a field.
 * @param editor - The active text editor
 * @param element - The DDS field
 * @returns Array of line indices containing editing keywords
 */
function findExistingEditingLines(editor: vscode.TextEditor, element: any): number[] {
    const editingLines: number[] = [];
    const startLine = element.lineIndex;

    // Look for editing lines after the field
    for (let i = startLine; i < editor.document.lineCount; i++) {
        const lineText = editor.document.lineAt(i).text;

        // Special case: first line of a field can have editing
        if (i === element.lineIndex) {
            if (lineText.match(/(EDTCDE|EDTWRD|EDTMSK)\(/)) {
                editingLines.push(i);
            }
            continue;
        };

        if (!lineText.trim().startsWith('A ') || !isAttributeLine(lineText)) {
            break;
        };

        // Check if this is an editing attribute
        if (lineText.match(/(EDTCDE|EDTWRD|EDTMSK)\(/)) {
            editingLines.push(i);
        };
    };

    return editingLines;
};