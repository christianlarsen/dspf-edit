/*
    Christian Larsen, 2026
    "RPG structure"
    dspf-edit.record-preview-panel.ts
*/

import * as vscode from 'vscode';
import { FieldsPerRecord, DdsSize, DdsAttribute, AttributeWithIndicators, DdsIndicator, fieldsPerRecords, records, getDefaultSize, getAvailableDisplayFormats, getSizeForFormat } from '../dspf-edit.model/dspf-edit.model';
import { checkForEditorAndDocument, updateTreeProvider } from '../dspf-edit.utils/dspf-edit.helper';
import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';
import { resolveRecordSizeForFormat } from '../dspf-edit.parser/dspf-edit.parser';
import { editWindowTitleForRecord } from '../dspf-edit.commands/dspf-edit.window-title';
import { getConstantTextFromUser, insertNewConstant } from '../dspf-edit.commands/dspf-edit.edit-constant';
import { addFieldAtPosition } from '../dspf-edit.commands/dspf-edit.edit-field';

/**
 * Item sent to the webview for rendering (a single field or constant on the screen grid).
 */
interface PreviewItem {
    kind: 'field' | 'constant';
    name: string;
    text: string;
    row: number;
    col: number;
    length: number;
    lineIndex: number;
    color: string;
    highIntensity: boolean;
    reverseImage: boolean;
    blink: boolean;
    underline: boolean;
    columnSeparator: boolean;
    nonDisplay: boolean;
    /** Row/col offset that was added to place this item, so a drag-to-move can be converted back to record-local coordinates. */
    rowOffset: number;
    colOffset: number;
    /** True when this item belongs to the record overlaid *behind* a window, not the record being previewed. */
    isBackground: boolean;
    /** False for subfile page-repeat ghosts and background items: only the "real" instance can be clicked/dragged. */
    isInteractive: boolean;
    /** True for input-capable fields (usage I or B), shown underlined instead of boxed. Always false for constants and output-only fields. */
    isInputCapable: boolean;
    /**
     * True when this background item shares the *same* window as the record being previewed
     * (an auto-paired SFL/SFLCTL half, or the window's owner record) rather than belonging to a
     * genuinely different record positioned behind it. The window's own opaque frame is drawn over
     * "behind" background items (they're physically covered by the window), but same-window items
     * must be drawn on top of that frame fill, since they're part of the window's own content.
     */
    sameWindow?: boolean;
};

/** A rectangle in the coordinates of the canvas being drawn (the full display size). */
interface WindowFrame {
    row: number;
    col: number;
    rows: number;
    cols: number;
};

// A WINDOW(row col numRows numCols) keyword gives the *border's* corner and the *content* area's
// size. The content sits inset from the border: 1 row above/below, 1 column to the left, and
// 2 columns to the right (confirmed against a real window: WINDOW(17 25 6 29) borders rows 17-24
// and columns 25-56, with content usable across its full width up to the last column).
const WINDOW_BORDER_TOP = 1;
const WINDOW_BORDER_BOTTOM = 1;
const WINDOW_BORDER_LEFT = 1;
const WINDOW_BORDER_RIGHT = 2;

/** Placeholder character shown across a field's width, keyed by [isNumeric][usage]. */
const FIELD_USAGE_PLACEHOLDER: Record<'alpha' | 'numeric', Record<string, string>> = {
    alpha: { O: 'O', B: 'B', I: 'I' },
    numeric: { O: '6', B: '9', I: '3' }
};

/**
 * Builds the placeholder text shown across a field's width, based on its data type and usage
 * (O=output, B=both, I=input), matching the classic screen-design-aid convention.
 * Falls back to the field name if the usage code isn't one of O/B/I.
 * @param name - Field name (used as a fallback label)
 * @param type - DDS data type code ('A' = alphanumeric; anything else is treated as numeric)
 * @param usage - DDS usage code (O, B, I, H, ...)
 * @param length - Field length, i.e. how many placeholder characters to repeat
 */
function getFieldPlaceholderText(name: string, type: string | undefined, usage: string | undefined, length: number): string {
    const isNumeric = type !== 'A';
    const usageCode = (usage || '').trim().toUpperCase();
    const placeholderChar = FIELD_USAGE_PLACEHOLDER[isNumeric ? 'numeric' : 'alpha'][usageCode];

    if (!placeholderChar) {
        return name;
    };

    return placeholderChar.repeat(Math.max(length, 1));
};

/** Default 5250-style green, used when a field/constant has no COLOR() keyword. */
const DEFAULT_COLOR = '#00ff00';

/** Maps DDS COLOR() keyword codes to their on-screen color. */
const DDS_COLOR_MAP: Record<string, string> = {
    BLU: '#3366ff',
    GRN: '#00ff00',
    WHT: '#ffffff',
    RED: '#ff4136',
    TRQ: '#00e5ff',
    YLW: '#ffe600',
    PNK: '#ff66ff'
};

/**
 * Determines the display color for a field/constant based on its COLOR() DDS keyword, if any.
 * @param attributes - The element's DDS attributes
 * @returns A CSS color string
 */
function getDisplayColor(attributes: AttributeWithIndicators[] | undefined): string {
    const colorAttr = attributes?.find(attr => /^COLOR\([A-Z]{3}\)$/.test(attr.value));
    if (!colorAttr) {
        return DEFAULT_COLOR;
    };

    const code = colorAttr.value.match(/^COLOR\(([A-Z]{3})\)$/)?.[1];
    return (code && DDS_COLOR_MAP[code]) || DEFAULT_COLOR;
};

/**
 * Checks whether a field/constant carries a given DSPATR() keyword (e.g. DSPATR(UL)).
 * @param attributes - The element's DDS attributes
 * @param code - The two-letter DSPATR code to look for (HI, RI, BL, UL, ND, CS)
 */
function hasDisplayAttribute(attributes: AttributeWithIndicators[] | undefined, code: string): boolean {
    return Boolean(attributes?.some(attr => attr.value === `DSPATR(${code})`));
};

/**
 * Groups an attribute's DDS keyword for the "no indicator simulation" fallback: all COLOR() lines
 * are alternatives for the same thing (only one color can apply), while each distinct DSPATR()
 * code is its own independent flag.
 * @param value - The attribute's raw keyword text (e.g. "COLOR(BLU)", "DSPATR(HI)")
 */
function attributeGroupKey(value: string): string {
    const upper = value.toUpperCase();
    return upper.startsWith('COLOR(') ? 'COLOR' : upper;
};

/**
 * Finds the record's WINDOW() keyword, if any. When the record is conditioned by more than one
 * display format (one WINDOW() line per format), picks the one matching activeFormat.
 * @param recordName - Name of the record to inspect
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function findWindowAttribute(recordName: string, activeFormat?: string): { startRow: number; startCol: number; numRows: number; numCols: number; lineIndex: number } | undefined {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    const candidates = record?.attributes?.filter(a => a.value.toUpperCase().startsWith('WINDOW(')) ?? [];
    const attr = pickForActiveFormat(candidates, activeFormat);
    if (!attr) {
        return undefined;
    };

    const match = attr.value.match(/WINDOW\s*\(\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+[^)]*)?\s*\)/i);
    if (!match) {
        return undefined;
    };

    return {
        startRow: parseInt(match[1], 10),
        startCol: parseInt(match[2], 10),
        numRows: parseInt(match[3], 10),
        numCols: parseInt(match[4], 10),
        lineIndex: attr.lineIndex
    };
};

/** A window's title, extracted from its WDWTITLE() keyword. */
interface WindowTitle {
    text: string;
    position: 'TOP' | 'BOTTOM';
    align: 'LEFT' | 'CENTER' | 'RIGHT';
};

/**
 * Finds and parses the record's WDWTITLE() keyword, if any. When the record shares its window
 * with another record (WINDOW(other-record-name), or an SFL/SFLCTL pair where only one side
 * declares the window), the title is commonly only present on that owner record — falls back
 * to it if the record itself has none. When conditioned by more than one display format (one
 * WDWTITLE() per format), picks the one matching activeFormat.
 * Handles the common form WDWTITLE((*TEXT 'title text') [*TOP|*BOTTOM] [*LEFT|*CENTER|*RIGHT]).
 * @param recordName - Name of the record to inspect
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function findWindowTitle(recordName: string, activeFormat?: string): WindowTitle | undefined {
    const ownerName = getEffectiveSize(recordName, activeFormat)?.sharedFromRecord;

    for (const name of ownerName ? [recordName, ownerName] : [recordName]) {
        const rec = fieldsPerRecords.find(r => r.record === name);
        const candidates = rec?.attributes?.filter(a => a.value.toUpperCase().startsWith('WDWTITLE(')) ?? [];
        const attr = pickForActiveFormat(candidates, activeFormat);
        if (!attr) {
            continue;
        };

        const textMatch = attr.value.match(/WDWTITLE\(\(\*\w+\s+'([^']*)'\)/i);
        if (!textMatch) {
            continue;
        };

        const upperValue = attr.value.toUpperCase();

        return {
            text: textMatch[1],
            position: upperValue.includes('*BOTTOM') ? 'BOTTOM' : 'TOP',
            align: upperValue.includes('*RIGHT') ? 'RIGHT' : upperValue.includes('*LEFT') ? 'LEFT' : 'CENTER'
        };
    };

    return undefined;
};

/** Whether a record's attributes include the SFL keyword (i.e. it's a subfile detail record). */
function isSflRecordInfo(recordInfo: FieldsPerRecord): boolean {
    return recordInfo.attributes?.some(attr => attr.value === 'SFL') ?? false;
};

/** Whether a record's attributes include an SFLCTL() keyword (i.e. it's a subfile control record). */
function isSflCtlRecordInfo(recordInfo: FieldsPerRecord): boolean {
    return recordInfo.attributes?.some(attr => attr.value.toUpperCase().startsWith('SFLCTL(')) ?? false;
};

/**
 * Finds the control record for a subfile (SFL) record, i.e. the one carrying SFLCTL(sflRecordName).
 * @param sflRecordName - Name of the subfile (SFL) record
 */
function findSflControlRecord(sflRecordName: string): FieldsPerRecord | undefined {
    return fieldsPerRecords.find(r =>
        r.attributes?.some(attr => {
            const match = attr.value.match(/^SFLCTL\(\s*([A-Za-z0-9@#$]+)\s*\)$/i);
            return Boolean(match && match[1].toUpperCase() === sflRecordName.toUpperCase());
        })
    );
};

/**
 * Finds an SFLCTL record's own SFLPAG() attribute (the candidate matching activeFormat, when
 * conditioned by more than one display format).
 * @param recordInfo - The SFLCTL record
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function findOwnSflPagAttribute(recordInfo: FieldsPerRecord, activeFormat?: string): DdsAttribute | undefined {
    const candidates = recordInfo.attributes?.filter(a => a.value.toUpperCase().startsWith('SFLPAG(')) ?? [];
    return pickForActiveFormat(candidates, activeFormat);
};

/**
 * Finds the SFLPAG (page size, i.e. number of subfile rows shown at once) for a subfile record,
 * by locating its control record (the one with SFLCTL(sflRecordName)) and reading SFLPAG() from it.
 * When conditioned by more than one display format (one SFLPAG() per format), picks the one
 * matching activeFormat.
 * @param sflRecordName - Name of the subfile (SFL) record
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function findSubfilePageSize(sflRecordName: string, activeFormat?: string): number | undefined {
    const controlRecord = findSflControlRecord(sflRecordName);
    if (!controlRecord) {
        return undefined;
    };

    const pagAttr = findOwnSflPagAttribute(controlRecord, activeFormat);
    const match = pagAttr?.value.match(/SFLPAG\(\s*(\d+)\s*\)/i);
    return match ? parseInt(match[1], 10) : undefined;
};

/**
 * Finds the "other half" of a subfile pair: given the SFL detail record, its control record
 * (SFLCTL); given the control record, the SFL detail record it controls. Used to automatically
 * show the header (SFLCTL) alongside the detail rows (SFL), or vice versa, since neither preview
 * is complete on its own.
 * @param recordName - Name of an SFL or SFLCTL record
 */
function findSubfilePairRecordName(recordName: string): string | undefined {
    const record = fieldsPerRecords.find(r => r.record === recordName);
    if (!record) {
        return undefined;
    };

    if (isSflRecordInfo(record)) {
        return findSflControlRecord(recordName)?.record;
    };

    const sflctlAttr = record.attributes?.find(attr => attr.value.toUpperCase().startsWith('SFLCTL('));
    const match = sflctlAttr?.value.match(/^SFLCTL\(\s*([A-Za-z0-9@#$]+)\s*\)$/i);
    return match?.[1];
};

/**
 * Finds the record that actually owns a shared window, i.e. the one named by
 * WINDOW(other-record-name) (or, transitively, the SFL/SFLCTL pair that inherited it). Used to
 * automatically show that owner as background too, since it commonly carries the WDWTITLE and
 * other static text (e.g. function-key footers) that belong to the window as a whole.
 * @param recordName - Name of the record to inspect
 */
function findWindowOwnerRecordName(recordName: string, activeFormat?: string): string | undefined {
    const owner = getEffectiveSize(recordName, activeFormat)?.sharedFromRecord;
    return owner && owner.toUpperCase() !== recordName.toUpperCase() ? owner : undefined;
};

/**
 * Identifies which window a record's own content belongs to, for comparing whether two records
 * share the exact same window (as opposed to one merely being positioned behind the other): the
 * record's own name if it defines a window directly, or the name of the record it borrows one
 * from (WINDOW(other-record-name), or an inherited SFL/SFLCTL pair). Undefined for non-window records.
 * @param recordName - Name of the record to inspect
 */
function windowOwnerOf(recordName: string, activeFormat?: string): string | undefined {
    const size = getEffectiveSize(recordName, activeFormat);
    if (size?.source !== 'window') {
        return undefined;
    };
    return size.sharedFromRecord ?? recordName;
};

/**
 * Resolves a record's effective size: the live, display-format-aware resolution
 * (resolveRecordSizeForFormat) when a display format is actively selected in the preview, else the
 * cached parse-time size — unchanged behavior for files that don't declare multiple DSPSIZ formats.
 * @param recordName - Name of the record to resolve
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function getEffectiveSize(recordName: string, activeFormat?: string): DdsSize | undefined {
    if (activeFormat) {
        return resolveRecordSizeForFormat(recordName, activeFormat);
    };
    return fieldsPerRecords.find(r => r.record === recordName)?.size;
};

/**
 * Filters out attributes/fields/constants conditioned by a display format other than the active
 * one; unconditioned ones (and everything, when no format is active) always pass through.
 * @param items - Items carrying an optional displayFormat condition
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function filterForActiveFormat<T extends { displayFormat?: string }>(items: T[], activeFormat: string | undefined): T[] {
    if (!activeFormat) {
        return items;
    };
    return items.filter(item => !item.displayFormat || item.displayFormat === activeFormat);
};

/**
 * Picks which of several same-keyword candidates applies, when a record/field/constant is
 * conditioned by more than one display format (one line per format, e.g. WDWTITLE or SFLPAG
 * declared once for *DS3 and once for *DS4). Prefers the one matching activeFormat, falling back
 * to an unconditioned one, then to the first candidate — so behavior is unchanged when no format
 * is active.
 * @param candidates - Same-keyword attribute candidates, in source order
 * @param activeFormat - Currently selected display format name (e.g. "*DS3"), or undefined
 */
function pickForActiveFormat<T extends { displayFormat?: string }>(candidates: T[], activeFormat?: string): T | undefined {
    if (candidates.length === 0) {
        return undefined;
    };
    if (!activeFormat) {
        return candidates[0];
    };
    return candidates.find(c => c.displayFormat === activeFormat)
        ?? candidates.find(c => !c.displayFormat)
        ?? candidates[0];
};

/**
 * Read-only visual preview panel for a single DDS record.
 * Shows fields/constants positioned on a monospace grid matching the record's screen size.
 * WINDOW records are drawn at their real screen position, on a canvas sized to the full display,
 * optionally with another record overlaid behind them to see how the window sits on top of it.
 * Refreshes automatically whenever the DDS source is re-parsed.
 */
export class RecordPreviewPanel {

    private static current: RecordPreviewPanel | undefined;

    private readonly panel: vscode.WebviewPanel;
    private recordName: string;
    private treeSubscription: vscode.Disposable | undefined;
    private treeProvider: DdsTreeProvider | undefined;
    private overlayRecordName: string | undefined;
    private indicatorsEnabled = false;
    private activeIndicators: Set<number> = new Set();
    private activeDisplayFormat: string | undefined;
    private lastRecordInfo: FieldsPerRecord | undefined;
    private lastSize: DdsSize | undefined;

    private constructor(recordName: string) {
        this.recordName = recordName;

        this.panel = vscode.window.createWebviewPanel(
            'dspfEditRecordPreview',
            `Preview: ${recordName}`,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true }
        );

        this.panel.webview.html = this.getHtml();

        this.panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message));

        this.panel.onDidDispose(() => {
            this.treeSubscription?.dispose();
            if (RecordPreviewPanel.current === this) {
                RecordPreviewPanel.current = undefined;
            };
        });
    }

    /**
     * Whether a preview panel is currently open (used to decide whether tree selection changes
     * should retarget it to a different record).
     */
    static isOpen(): boolean {
        return RecordPreviewPanel.current !== undefined;
    };

    /**
     * Name of the record currently shown in the open preview panel, if any. Used to tell whether
     * a tree selection needs to retarget the panel or just highlight an item already shown in it.
     */
    static getCurrentRecordName(): string | undefined {
        return RecordPreviewPanel.current?.recordName;
    };

    /**
     * Highlights the given source line in the open preview panel (the persistent selection box
     * shown when clicking a field/constant), without navigating the editor or changing the
     * previewed record. Used to mirror a tree selection into the preview. No-op if no panel is open.
     * @param lineIndex - Zero-based source line index to highlight
     */
    static selectLineIfOpen(lineIndex: number): void {
        RecordPreviewPanel.current?.panel.webview.postMessage({ type: 'selectLine', lineIndex });
    };

    /**
     * Gets the single preview panel, retargeting it to the given record if it already exists,
     * or creates a new one.
     * @param recordName - Name of the record to preview
     * @param treeProvider - The tree provider, used to force a re-parse right after a drag/resize edit
     */
    static getOrCreate(recordName: string, treeProvider: DdsTreeProvider): RecordPreviewPanel {
        const existing = RecordPreviewPanel.current;
        if (existing) {
            existing.recordName = recordName;
            existing.treeProvider = treeProvider;
            existing.overlayRecordName = undefined;
            existing.indicatorsEnabled = false;
            existing.activeIndicators = new Set();
            existing.activeDisplayFormat = undefined;
            existing.panel.title = `Preview: ${recordName}`;
            // Reveal without forcing a column: the user may have moved the panel elsewhere
            // (e.g. to a bottom group), and switching records shouldn't snap it back to "Beside".
            existing.panel.reveal(undefined, true);
            return existing;
        };

        const created = new RecordPreviewPanel(recordName);
        created.treeProvider = treeProvider;
        RecordPreviewPanel.current = created;
        return created;
    };

    /**
     * Registers the listener that keeps this panel in sync with tree refreshes (i.e. re-parses of the DDS source).
     * Only one subscription is kept per panel; callers may call this again safely.
     * @param onRefresh - Callback invoked whenever the tree/model is refreshed
     */
    setRefreshSource(event: vscode.Event<any>, onRefresh: () => void): void {
        this.treeSubscription?.dispose();
        this.treeSubscription = event(onRefresh);
    };

    /**
     * Receives the current record's data and (re-)renders the preview.
     * @param recordInfo - The record's fields/constants, or undefined if the record no longer exists
     * @param size - The record's screen size (rows/cols; window origin when it's a WINDOW record)
     */
    update(recordInfo: FieldsPerRecord | undefined, size: DdsSize | undefined): void {
        this.lastRecordInfo = recordInfo;
        this.lastSize = size;
        this.render();
    };

    /**
     * Resolves the previewed record's current geometry (size, whether it's a window, and the
     * row/col offset that places its record-local coordinates on the screen canvas), honoring the
     * active display format. Shared by `render()` and by anything that needs to convert a screen
     * click back to a record-local position (e.g. placing a new constant).
     */
    private resolveActiveGeometry(): {
        recordInfo: FieldsPerRecord;
        size: DdsSize;
        isWindow: boolean;
        rowOffset: number;
        colOffset: number;
        minDetailRow: number | null;
    } | null {
        const recordInfo = this.lastRecordInfo;
        if (!recordInfo || !this.lastSize) {
            return null;
        };

        // Default to the first declared format so a record's WINDOW()/attributes conditioned per
        // format resolve consistently from the very first render, instead of showing every
        // candidate at once. The selector itself stays locked to it when the file only declares one.
        const availableFormats = getAvailableDisplayFormats();
        if (availableFormats.length > 0 && !this.activeDisplayFormat) {
            this.activeDisplayFormat = availableFormats[0].name;
        };

        // With a format actively selected, re-resolve the record's size live (it may be
        // conditioned differently per format, e.g. a WINDOW() line per format); otherwise use the
        // cached, parse-time size exactly as before.
        const size = this.activeDisplayFormat
            ? resolveRecordSizeForFormat(this.recordName, this.activeDisplayFormat)
            : this.lastSize;

        const isWindow = size.source === 'window';

        // A window is drawn at its real screen position, on a canvas sized to the full display,
        // so its own fields/constants (which are stored record-local) need shifting by its origin.
        // Content starts 1 row/col past the border's own corner (see WINDOW_BORDER_* above).
        const rowOffset = isWindow ? size.originRow : 0;
        const colOffset = isWindow ? size.originCol : 0;

        // A subfile detail (SFL) record's own rows shouldn't be draggable up into the area already
        // occupied by its SFLCTL header's static content (labels, titles...) — that's not a valid
        // screen layout, the repeating detail area has to start below wherever the header ends.
        let minDetailRow: number | null = null;
        if (isSflRecordInfo(recordInfo)) {
            const pairName = findSubfilePairRecordName(this.recordName);
            const headerItems = pairName ? this.buildBackgroundItemsFor(pairName) : undefined;
            if (headerItems && headerItems.length > 0) {
                minDetailRow = Math.max(...headerItems.map(item => item.row)) + 1;
            };
        };

        return { recordInfo, size, isWindow, rowOffset, colOffset, minDetailRow };
    };

    /**
     * Renders the last received record data, honoring the current overlay selection.
     * Split out from `update()` so changing the overlay (a pure view change) can re-render
     * without needing a fresh parse.
     */
    private render(): void {
        const geometry = this.resolveActiveGeometry();
        if (!geometry) {
            this.panel.webview.postMessage({ type: 'notFound' });
            return;
        };
        const { recordInfo, size, isWindow, rowOffset, colOffset, minDetailRow } = geometry;

        const availableFormats = getAvailableDisplayFormats();
        const defaultSize = this.activeDisplayFormat
            ? (getSizeForFormat(this.activeDisplayFormat) ?? getDefaultSize())
            : getDefaultSize();

        const canvasSize = isWindow ? { rows: defaultSize.rows, cols: defaultSize.cols } : { rows: size.rows, cols: size.cols };

        const items = this.buildItems(recordInfo, rowOffset, colOffset, false);
        if (isSflRecordInfo(recordInfo)) {
            items.push(...this.buildSubfileRepeats(items, this.recordName));
        };

        // The overlaid (background) record can be previewed on its own, whether or not it's itself
        // a window, no matter what the record being previewed is. Indicator simulation doesn't
        // apply to it, so its own indicators aren't offered in the toggle list either.
        const backgroundItems: PreviewItem[] = [];
        const shownAsBackground = new Set<string>([this.recordName]);
        const toProcess: string[] = [this.recordName];

        const addBackground = (name: string | undefined): void => {
            if (!name || shownAsBackground.has(name)) {
                return;
            };
            const items = this.buildBackgroundItemsFor(name);
            if (!items) {
                return;
            };
            backgroundItems.push(...items);
            shownAsBackground.add(name);
            toProcess.push(name);
        };

        addBackground(this.overlayRecordName);

        // A subfile's own preview is incomplete without its counterpart: the SFL detail record
        // has no header/titles of its own (those live on the SFLCTL record), and the SFLCTL record
        // has no rows of its own. Likewise, a record whose WINDOW() keyword only names another
        // record (or that inherited its window from an SFL/SFLCTL pair) is missing that owner's
        // own content (e.g. WDWTITLE, footer text). Show whichever of these isn't already visible,
        // automatically, following the chain (e.g. SFL -> its SFLCTL -> that SFLCTL's window owner).
        for (let i = 0; i < toProcess.length; i++) {
            const anchor = toProcess[i];
            addBackground(findSubfilePairRecordName(anchor));
            addBackground(findWindowOwnerRecordName(anchor, this.activeDisplayFormat));
        };

        const availableIndicators = this.collectIndicatorNumbers(recordInfo).sort((a, b) => a - b);

        // The content area (where fields/constants live); its top-left is 1 row/col inside the border.
        const windowFrame: WindowFrame | null = isWindow
            ? { row: size.originRow + WINDOW_BORDER_TOP, col: size.originCol + WINDOW_BORDER_LEFT, rows: size.rows, cols: size.cols }
            : null;

        // The visual border itself: the content area padded out by the border widths.
        const outerFrame: WindowFrame | null = (isWindow && windowFrame)
            ? {
                row: size.originRow,
                col: size.originCol,
                rows: windowFrame.rows + WINDOW_BORDER_TOP + WINDOW_BORDER_BOTTOM,
                cols: windowFrame.cols + WINDOW_BORDER_LEFT + WINDOW_BORDER_RIGHT
            }
            : null;

        // A window can't be resized past the edge of the physical screen it's positioned on
        // (accounting for the border that surrounds the content area on every side).
        const maxSize = isWindow
            ? {
                rows: defaultSize.rows - size.originRow - (WINDOW_BORDER_TOP + WINDOW_BORDER_BOTTOM) + 1,
                cols: defaultSize.cols - size.originCol - (WINDOW_BORDER_LEFT + WINDOW_BORDER_RIGHT) + 1
            }
            : null;

        const availableRecords = records.filter(name => name !== this.recordName);
        const windowTitle = isWindow ? (findWindowTitle(this.recordName, this.activeDisplayFormat) ?? null) : null;
        const errorMessage = this.resolveErrorMessage(recordInfo);
        const sflPagAttr = isSflCtlRecordInfo(recordInfo) ? findOwnSflPagAttribute(recordInfo, this.activeDisplayFormat) : undefined;
        const sflPagMatch = sflPagAttr?.value.match(/SFLPAG\(\s*(\d+)\s*\)/i);
        const sflPag = sflPagMatch ? parseInt(sflPagMatch[1], 10) : null;

        this.panel.webview.postMessage({
            type: 'render',
            recordName: this.recordName,
            size: canvasSize,
            isWindow,
            windowFrame,
            outerFrame,
            windowTitle,
            errorMessage,
            sflPag,
            maxSize,
            availableRecords,
            overlayRecordName: this.overlayRecordName ?? null,
            availableIndicators,
            indicatorsEnabled: this.indicatorsEnabled,
            activeIndicators: [...this.activeIndicators],
            availableFormats,
            activeDisplayFormat: this.activeDisplayFormat ?? null,
            minDetailRow,
            items,
            backgroundItems
        });
    };

    /**
     * Builds background (dimmed, non-interactive) items for an arbitrary record by name: figures
     * out its own offset (in case it's itself a window) and expands subfile page-repeats if it's
     * an SFL record. Used for both the manual overlay and the automatic SFL/SFLCTL pairing.
     * @param recordName - Name of the record to render as background
     */
    private buildBackgroundItemsFor(recordName: string): PreviewItem[] | undefined {
        const record = fieldsPerRecords.find(r => r.record === recordName);
        if (!record) {
            return undefined;
        };

        const size = getEffectiveSize(recordName, this.activeDisplayFormat);
        const isWin = size?.source === 'window';
        const rOffset = isWin && size ? size.originRow : 0;
        const cOffset = isWin && size ? size.originCol : 0;

        const items = this.buildItems(record, rOffset, cOffset, true);
        if (isSflRecordInfo(record)) {
            items.push(...this.buildSubfileRepeats(items, recordName));
        };

        // A same-window item (an auto-paired SFL/SFLCTL half, or the window's owner) is part of
        // the window's own content and must show through its opaque frame, unlike a genuinely
        // different record merely positioned behind the window.
        const foregroundOwner = windowOwnerOf(this.recordName, this.activeDisplayFormat);
        const sameWindow = foregroundOwner !== undefined && windowOwnerOf(recordName, this.activeDisplayFormat) === foregroundOwner;
        for (const item of items) {
            item.sameWindow = sameWindow;
        };

        return items;
    };

    /**
     * Builds the preview items for a record's fields/constants, shifted by the given offset.
     * @param recordInfo - The record's fields/constants
     * @param rowOffset - Added to each field/constant's own row (0 unless this is a window's own content)
     * @param colOffset - Added to each field/constant's own col (0 unless this is a window's own content)
     * @param isBackground - Whether these items belong to the record overlaid behind a window
     */
    private buildItems(recordInfo: FieldsPerRecord, rowOffset: number, colOffset: number, isBackground: boolean): PreviewItem[] {
        const items: PreviewItem[] = [];

        // The parser stores a subfile (SFL) record's field/constant row and column swapped
        // (a leftover of how move-fields/move-constants track "horizontal" movement for SFLs).
        // Undo that swap here to get the real screen row/col for display.
        const isSfl = isSflRecordInfo(recordInfo);

        // Indicator toggling only applies to the record being actively previewed; an overlaid
        // background record always uses the resting state (every indicator OFF), regardless of
        // what's toggled for the foreground record.
        const useLiveIndicators = this.indicatorsEnabled && !isBackground;

        for (const field of recordInfo.fields) {
            if (this.activeDisplayFormat && field.displayFormat && field.displayFormat !== this.activeDisplayFormat) {
                continue;
            };
            if (!this.isItemDisplayed(field.indicators, useLiveIndicators)) {
                continue;
            };

            const trueRow = isSfl ? field.col : field.row;
            const trueCol = isSfl ? field.row : field.col;

            if (trueRow > 0 && trueCol > 0) {
                const activeAttrs = this.getActiveAttributes(field.attributes, useLiveIndicators);
                const usageCode = (field.usage || '').trim().toUpperCase();
                items.push({
                    kind: 'field',
                    name: field.name,
                    text: getFieldPlaceholderText(field.name, field.type, field.usage, field.length),
                    row: trueRow + rowOffset,
                    col: trueCol + colOffset,
                    length: field.length,
                    lineIndex: field.lineIndex,
                    color: getDisplayColor(activeAttrs),
                    highIntensity: hasDisplayAttribute(activeAttrs, 'HI'),
                    reverseImage: hasDisplayAttribute(activeAttrs, 'RI') || this.hasActiveErrorMessage(field.attributes, useLiveIndicators),
                    blink: hasDisplayAttribute(activeAttrs, 'BL'),
                    underline: hasDisplayAttribute(activeAttrs, 'UL'),
                    columnSeparator: hasDisplayAttribute(activeAttrs, 'CS'),
                    nonDisplay: hasDisplayAttribute(activeAttrs, 'ND'),
                    rowOffset,
                    colOffset,
                    isBackground,
                    isInteractive: !isBackground,
                    isInputCapable: usageCode === 'I' || usageCode === 'B'
                });
            };
        };

        for (const constant of recordInfo.constants) {
            if (this.activeDisplayFormat && constant.displayFormat && constant.displayFormat !== this.activeDisplayFormat) {
                continue;
            };
            if (!this.isItemDisplayed(constant.indicators, useLiveIndicators)) {
                continue;
            };

            const trueRow = isSfl ? constant.col : constant.row;
            const trueCol = isSfl ? constant.row : constant.col;

            if (trueRow > 0 && trueCol > 0) {
                const activeAttrs = this.getActiveAttributes(constant.attributes, useLiveIndicators);
                items.push({
                    kind: 'constant',
                    name: constant.name,
                    text: constant.name,
                    row: trueRow + rowOffset,
                    col: trueCol + colOffset,
                    length: constant.length,
                    lineIndex: constant.lineIndex,
                    color: getDisplayColor(activeAttrs),
                    highIntensity: hasDisplayAttribute(activeAttrs, 'HI'),
                    reverseImage: hasDisplayAttribute(activeAttrs, 'RI'),
                    blink: hasDisplayAttribute(activeAttrs, 'BL'),
                    underline: hasDisplayAttribute(activeAttrs, 'UL'),
                    columnSeparator: hasDisplayAttribute(activeAttrs, 'CS'),
                    nonDisplay: hasDisplayAttribute(activeAttrs, 'ND'),
                    rowOffset,
                    colOffset,
                    isBackground,
                    isInteractive: !isBackground,
                    isInputCapable: false
                });
            };
        };

        // Even with indicators resolved (live or resting-state), two genuinely unconditioned
        // items (or ones whose conditions aren't perfectly complementary) could still land on the
        // exact same spot — keep only the first-defined one so they don't render stacked.
        return this.dedupByPosition(items);
    };

    /**
     * Checks whether a field/constant's own line-level indicators (columns 7-15, e.g. "61"/"N61")
     * are satisfied. With live indicators, checks them against the currently toggled-on set
     * (multiple indicators on one line are ANDed together, matching real DDS conditioning).
     * Otherwise, uses the resting state — every indicator assumed OFF — so only unconditioned
     * items and negated ("N") conditions show; this is what makes mutually-exclusive alternates
     * (e.g. one shown on "61", another on "N61") resolve to a single, deterministic one even when
     * they don't happen to share the same screen position. No indicators at all means "always shown".
     * @param indicators - The item's own indicators
     * @param useLiveIndicators - Whether to check against the toggled-on indicator set, or assume all OFF
     */
    private isItemDisplayed(indicators: DdsIndicator[] | undefined, useLiveIndicators: boolean): boolean {
        if (!indicators || indicators.length === 0) {
            return true;
        };
        if (!useLiveIndicators) {
            return indicators.every(ind => !ind.active);
        };
        return indicators.every(ind => this.activeIndicators.has(ind.number) === ind.active);
    };

    /**
     * Filters a field/constant's own COLOR()/DSPATR() attributes the same way visibility is
     * filtered: attributes conditioned on a display format other than the active one are dropped
     * first; then, ones whose own indicators aren't satisfied (checked live or against the resting
     * state — see isItemDisplayed) are dropped too. If more than one candidate for the same
     * keyword still remains (e.g. two unconditioned COLOR() lines), keeps just the first-defined one.
     * @param attributes - The field/constant's own attributes
     * @param useLiveIndicators - Whether to check against the toggled-on indicator set, or assume all OFF
     */
    private getActiveAttributes(attributes: AttributeWithIndicators[], useLiveIndicators: boolean): AttributeWithIndicators[] {
        const forFormat = filterForActiveFormat(attributes, this.activeDisplayFormat);
        const displayed = forFormat.filter(attr => this.isItemDisplayed(attr.indicators, useLiveIndicators));

        const seen = new Set<string>();
        const result: AttributeWithIndicators[] = [];
        for (const attr of displayed) {
            const key = attributeGroupKey(attr.value);
            if (seen.has(key)) {
                continue;
            };
            seen.add(key);
            result.push(attr);
        };
        return result;
    };

    /**
     * Whether a field's own ERRMSG() is currently active (its conditioning indicator satisfied) —
     * the field it's attached to is shown in reverse image while its error is in effect, same as a
     * real 5250 highlights the field an error message refers to.
     */
    private hasActiveErrorMessage(attributes: AttributeWithIndicators[], useLiveIndicators: boolean): boolean {
        const forFormat = filterForActiveFormat(attributes, this.activeDisplayFormat);
        return forFormat.some(attr => /^ERRMSG\(/i.test(attr.value) && this.isItemDisplayed(attr.indicators, useLiveIndicators));
    };

    /**
     * Finds the record's currently-active ERRMSG() message, if any: an ERRMSG keyword (record-level,
     * or on one of the record's own fields/constants) whose own conditioning indicator is satisfied
     * by the indicator simulation — same gating already used for COLOR()/DSPATR() via isItemDisplayed.
     * Shown on the display's message line (the bottom row) like a real 5250 error, in white.
     */
    private resolveErrorMessage(recordInfo: FieldsPerRecord): { text: string } | null {
        const candidates: { value: string; indicators?: DdsIndicator[]; displayFormat?: string }[] = [
            ...(recordInfo.attributes ?? []),
            ...recordInfo.fields.flatMap(field => field.attributes),
            ...recordInfo.constants.flatMap(constant => constant.attributes)
        ];

        const forFormat = filterForActiveFormat(candidates, this.activeDisplayFormat);
        for (const attr of forFormat) {
            if (!this.isItemDisplayed(attr.indicators, this.indicatorsEnabled)) {
                continue;
            };
            const errmsgMatch = attr.value.match(/^ERRMSG\('([^']+)'\s*(\d{2})?\)$/);
            if (errmsgMatch) {
                return { text: errmsgMatch[1] };
            };
        };
        return null;
    };

    /**
     * Keeps only the first (lowest lineIndex) item at each exact (row, col), so alternate
     * constants/fields that occupy the same spot don't render stacked on top of each other.
     */
    private dedupByPosition(items: PreviewItem[]): PreviewItem[] {
        const bestByPosition = new Map<string, PreviewItem>();

        for (const item of items) {
            const key = item.row + ',' + item.col;
            const existing = bestByPosition.get(key);
            if (!existing || item.lineIndex < existing.lineIndex) {
                bestByPosition.set(key, item);
            };
        };

        const kept = new Set(bestByPosition.values());
        return items.filter(item => kept.has(item));
    };

    /**
     * Collects the distinct indicator numbers referenced by a record's own fields/constants, and
     * its own record-level attributes (e.g. a record-level ERRMSG()) — used to populate the
     * indicator toggle list in the toolbar.
     */
    private collectIndicatorNumbers(recordInfo: FieldsPerRecord): number[] {
        const numbers = new Set<number>();
        for (const attr of recordInfo.attributes ?? []) {
            for (const ind of attr.indicators ?? []) {
                numbers.add(ind.number);
            };
        };
        for (const field of recordInfo.fields) {
            for (const ind of field.indicators ?? []) {
                numbers.add(ind.number);
            };
            for (const attr of field.attributes) {
                for (const ind of attr.indicators ?? []) {
                    numbers.add(ind.number);
                };
            };
        };
        for (const constant of recordInfo.constants) {
            for (const ind of constant.indicators ?? []) {
                numbers.add(ind.number);
            };
            for (const attr of constant.attributes) {
                for (const ind of attr.indicators ?? []) {
                    numbers.add(ind.number);
                };
            };
        };
        return [...numbers];
    };

    /**
     * Repeats a subfile's own base items for each additional visible page row (SFLPAG), stacked
     * downward. The repeats are display-only: dragging/clicking always targets the single real
     * source line, so only the first (base) instance stays interactive.
     * @param baseItems - The subfile's own items, as built for its first (real) row
     * @param recordName - Name of the subfile (SFL) record
     */
    private buildSubfileRepeats(baseItems: PreviewItem[], recordName: string): PreviewItem[] {
        const sflPag = findSubfilePageSize(recordName, this.activeDisplayFormat);
        if (!sflPag || sflPag <= 1 || baseItems.length === 0) {
            return [];
        };

        const rows = baseItems.map(item => item.row);
        const rowSpan = Math.max(...rows) - Math.min(...rows) + 1;

        const repeats: PreviewItem[] = [];
        for (let page = 1; page < sflPag; page++) {
            for (const item of baseItems) {
                repeats.push({ ...item, row: item.row + page * rowSpan, isInteractive: false });
            };
        };

        return repeats;
    };

    /**
     * Handles messages posted from the webview: click-to-navigate, drag-to-move, window resize,
     * and overlay selection.
     */
    private async onDidReceiveMessage(message: any): Promise<void> {
        if (message?.type === 'navigate' && typeof message.lineIndex === 'number') {
            await this.navigateToLine(message.lineIndex);
            return;
        };

        if (message?.type === 'move'
            && typeof message.lineIndex === 'number'
            && typeof message.newRow === 'number'
            && typeof message.newCol === 'number') {
            await this.moveElement(
                message.lineIndex,
                message.newRow,
                message.newCol,
                typeof message.rowOffset === 'number' ? message.rowOffset : 0,
                typeof message.colOffset === 'number' ? message.colOffset : 0
            );
            return;
        };

        if (message?.type === 'resize' && typeof message.newRows === 'number' && typeof message.newCols === 'number') {
            await this.resizeWindow(message.newRows, message.newCols);
            return;
        };

        if (message?.type === 'moveWindow' && typeof message.newRow === 'number' && typeof message.newCol === 'number') {
            await this.moveWindowPosition(message.newRow, message.newCol);
            return;
        };

        if (message?.type === 'editWindowTitle') {
            await this.editWindowTitle();
            return;
        };

        if (message?.type === 'windowMenu') {
            await this.showWindowMenu();
            return;
        };

        if (message?.type === 'centerWindowHorizontally') {
            await this.centerWindowHorizontally();
            return;
        };

        if (message?.type === 'addConstantAt' && typeof message.row === 'number' && typeof message.col === 'number') {
            await this.addConstantAt(message.row, message.col);
            return;
        };

        if (message?.type === 'addFieldAt' && typeof message.row === 'number' && typeof message.col === 'number') {
            await this.addFieldAt(message.row, message.col);
            return;
        };

        if (message?.type === 'setOverlay') {
            this.overlayRecordName = message.recordName || undefined;
            this.render();
            return;
        };

        if (message?.type === 'setDisplayFormat' && typeof message.name === 'string') {
            this.activeDisplayFormat = message.name || undefined;
            this.render();
            return;
        };

        if (message?.type === 'setIndicatorsEnabled') {
            this.indicatorsEnabled = Boolean(message.enabled);
            this.render();
            return;
        };

        if (message?.type === 'toggleIndicator' && typeof message.number === 'number') {
            if (this.activeIndicators.has(message.number)) {
                this.activeIndicators.delete(message.number);
            } else {
                this.activeIndicators.add(message.number);
            };
            this.render();
            return;
        };

        if (message?.type === 'sflpagIncrement') {
            await this.adjustSubfilePageSize(1);
            return;
        };

        if (message?.type === 'sflpagDecrement') {
            await this.adjustSubfilePageSize(-1);
        };
    };

    /**
     * Navigates the DDS editor to the given line (used when clicking a field/constant in the preview),
     * and also selects the matching node in the tree view, if one is found.
     * @param lineIndex - Zero-based line index to jump to
     */
    private async navigateToLine(lineIndex: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        await vscode.window.showTextDocument(editor.document, {
            viewColumn: editor.viewColumn,
            preserveFocus: false
        });

        const position = new vscode.Position(lineIndex, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
        await vscode.commands.executeCommand('cursorRight');
        await vscode.commands.executeCommand('cursorLeft');

        const treeView = this.treeProvider?.getTreeView();
        if (this.treeProvider && treeView) {
            const node = await this.treeProvider.findFieldOrConstantNode(lineIndex);
            if (node) {
                try {
                    await treeView.reveal(node, { select: true, focus: false, expand: true });
                } catch {
                    // Ignore reveal errors (e.g. the item is currently filtered out of the tree).
                };
            };
        };
    };

    /**
     * Applies a drag-and-drop move from the preview: writes the new row/column back into the
     * DDS source line, at the same fixed columns used by the move-fields/move-constants commands
     * (raw columns 38-41 for the row/line spec, 41-44 for the column/position spec).
     * The screen position is converted back to record-local coordinates using the offset that was
     * applied when the item was built (non-zero only for a window's own fields/constants).
     * @param lineIndex - Zero-based line index of the field/constant being moved
     * @param newRow - New row, in screen coordinates (as shown in the preview grid)
     * @param newCol - New column, in screen coordinates (as shown in the preview grid)
     * @param rowOffset - Offset to subtract to get back to the record-local row
     * @param colOffset - Offset to subtract to get back to the record-local column
     */
    private async moveElement(lineIndex: number, newRow: number, newCol: number, rowOffset: number, colOffset: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor || lineIndex >= editor.document.lineCount) {
            return;
        };

        const localRow = newRow - rowOffset;
        const localCol = newCol - colOffset;

        // The raw source columns are always "Line spec" (38-41) / "Position spec" (41-44) — i.e.
        // row/col in that fixed order — for every record type. A subfile only swaps which of these
        // ends up labeled model.row/model.col internally (see buildItems' undo); the physical
        // columns themselves never swap, so no subfile-specific handling is needed here.
        const workspaceEdit = new vscode.WorkspaceEdit();
        const uri = editor.document.uri;

        workspaceEdit.replace(uri, new vscode.Range(lineIndex, 38, lineIndex, 41), String(localRow).padStart(3, ' '));
        workspaceEdit.replace(uri, new vscode.Range(lineIndex, 41, lineIndex, 44), String(localCol).padStart(3, ' '));

        await vscode.workspace.applyEdit(workspaceEdit);
        this.forceReparse(editor.document);
    };

    /**
     * Places a brand-new constant at a screen position picked directly in the preview (the
     * "+ Constant" button's placement mode): converts the click back to a record-local row/col,
     * validates it's actually within the previewed record's own area, then reuses the same
     * text-prompt and insertion logic as the tree's "Add constant" command.
     * @param screenRow - Row clicked, in screen/canvas coordinates
     * @param screenCol - Column clicked, in screen/canvas coordinates
     */
    private async addConstantAt(screenRow: number, screenCol: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const position = this.resolveClickPosition(screenRow, screenCol, 'constant');
        if (!position) {
            return;
        };
        const { row, col } = position;

        const text = await getConstantTextFromUser("Enter constant text (without quotes)", "", col);
        if (!text) {
            return;
        };

        await insertNewConstant(editor, { text, row, column: col, recordName: this.recordName });
        this.forceReparse(editor.document);
    };

    /**
     * Places a brand-new field at a screen position picked directly in the preview (the
     * "+ Field" button's placement mode): converts the click back to a record-local row/col,
     * validates it, then reuses the same name/usage/type prompts and insertion logic as the
     * tree's "Add field" command.
     * @param screenRow - Row clicked, in screen/canvas coordinates
     * @param screenCol - Column clicked, in screen/canvas coordinates
     */
    private async addFieldAt(screenRow: number, screenCol: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const position = this.resolveClickPosition(screenRow, screenCol, 'field');
        if (!position) {
            return;
        };

        await addFieldAtPosition(this.recordName, { row: position.row, column: position.col });
        this.forceReparse(editor.document);
    };

    /**
     * Converts a screen click to a record-local row/col for the currently previewed record,
     * validating it falls within the record's own area (its window's content frame, if it's a
     * window; the record's own screen size otherwise) and, for an SFL detail record, below its
     * SFLCTL header's occupied rows. Shows a warning and returns null on an invalid click.
     * @param screenRow - Row clicked, in screen/canvas coordinates
     * @param screenCol - Column clicked, in screen/canvas coordinates
     * @param kind - What's being placed, only used to word the warning message
     */
    private resolveClickPosition(screenRow: number, screenCol: number, kind: 'constant' | 'field'): { row: number; col: number } | null {
        const geometry = this.resolveActiveGeometry();
        if (!geometry) {
            return null;
        };
        const { size, rowOffset, colOffset, minDetailRow } = geometry;

        const row = screenRow - rowOffset;
        const col = screenCol - colOffset;

        if (row < 1 || row > size.rows || col < 1 || col > size.cols) {
            vscode.window.showWarningMessage(
                `Cannot place a ${kind} there — click inside record '${this.recordName}' (rows 1-${size.rows}, columns 1-${size.cols}).`
            );
            return null;
        };
        if (minDetailRow !== null && row < minDetailRow) {
            vscode.window.showWarningMessage(
                `Cannot place a ${kind} on row ${row} — it's occupied by the subfile header (rows below ${minDetailRow} only).`
            );
            return null;
        };

        return { row, col };
    };

    /**
     * Name of the record whose WINDOW() keyword should actually be edited for the current record:
     * itself, unless its window was inherited (WINDOW(other-record-name), or an SFL/SFLCTL pair
     * sharing one side's window) — in which case the real geometry lives on the owner record.
     */
    private resolveWindowRecordName(): string {
        return getEffectiveSize(this.recordName, this.activeDisplayFormat)?.sharedFromRecord ?? this.recordName;
    };

    /**
     * Applies a resize (from dragging the window's corner handle), keeping its screen position unchanged.
     * @param newRows - New window height
     * @param newCols - New window width
     */
    private async resizeWindow(newRows: number, newCols: number): Promise<void> {
        const windowInfo = findWindowAttribute(this.resolveWindowRecordName(), this.activeDisplayFormat);
        if (!windowInfo) {
            return;
        };

        await this.rewriteWindowKeyword(windowInfo.lineIndex, windowInfo.startRow, windowInfo.startCol, newRows, newCols);
    };

    /**
     * Applies a move (from dragging the window's frame), keeping its size unchanged.
     * @param newRow - New window screen row
     * @param newCol - New window screen column
     */
    private async moveWindowPosition(newRow: number, newCol: number): Promise<void> {
        const windowInfo = findWindowAttribute(this.resolveWindowRecordName(), this.activeDisplayFormat);
        if (!windowInfo) {
            return;
        };

        await this.rewriteWindowKeyword(windowInfo.lineIndex, newRow, newCol, windowInfo.numRows, windowInfo.numCols);
    };

    /**
     * Opens the same "Change Window Title" prompt used from the tree's context menu, triggered by
     * clicking the title directly on the preview. Edits the window-owner record when the title
     * belongs to a shared window (WINDOW(other-record-name), or an inherited SFL/SFLCTL pair).
     */
    private async editWindowTitle(): Promise<void> {
        await editWindowTitleForRecord(this.resolveWindowRecordName());

        const { editor } = checkForEditorAndDocument();
        if (editor) {
            this.forceReparse(editor.document);
        };
    };

    /**
     * Shows the window's action menu, opened from the "⋮" button drawn in the frame's corner.
     * Currently just offers "Change Title...", but is meant to grow: additional actions (e.g. a
     * one-click "Center Horizontally") can be appended here, and/or given their own icon on the
     * canvas later, following the same pattern as the title button.
     */
    private async showWindowMenu(): Promise<void> {
        const options: (vscode.QuickPickItem & { action: string })[] = [
            { label: '$(edit) Change Title...', action: 'editTitle' }
        ];

        const selection = await vscode.window.showQuickPick(options, {
            title: `Window '${this.recordName}' — Actions`,
            placeHolder: 'Select an action',
            ignoreFocusOut: true
        });
        if (!selection) {
            return;
        };

        if (selection.action === 'editTitle') {
            await this.editWindowTitle();
        };
    };

    /**
     * Centers the window horizontally on the screen, keeping its row and size unchanged. A
     * one-click action triggered from its own icon, bypassing the actions menu — the same
     * centering math as the "Change Window Size" command's CENTERED option, for consistency.
     */
    private async centerWindowHorizontally(): Promise<void> {
        const windowRecordName = this.resolveWindowRecordName();
        const windowInfo = findWindowAttribute(windowRecordName, this.activeDisplayFormat);
        if (!windowInfo) {
            return;
        };

        const defaultSize = this.activeDisplayFormat
            ? (getSizeForFormat(this.activeDisplayFormat) ?? getDefaultSize())
            : getDefaultSize();

        const newStartCol = Math.max(1, Math.floor((defaultSize.cols - windowInfo.numCols) / 2) + 1);
        if (newStartCol === windowInfo.startCol) {
            return;
        };

        await this.rewriteWindowKeyword(windowInfo.lineIndex, windowInfo.startRow, newStartCol, windowInfo.numRows, windowInfo.numCols);
    };

    /**
     * Rewrites the record's WINDOW(startRow startCol numRows numCols) keyword in place.
     */
    private async rewriteWindowKeyword(lineIndex: number, startRow: number, startCol: number, numRows: number, numCols: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const line = editor.document.lineAt(lineIndex);
        const updatedLine = line.text.replace(
            /WINDOW\s*\(\s*\d+\s+\d+\s+\d+\s+\d+(\s+[^)]*)?\s*\)/i,
            (_match, suffix) => `WINDOW(${startRow} ${startCol} ${numRows} ${numCols}${suffix ?? ''})`
        );

        if (updatedLine === line.text) {
            return;
        };

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(editor.document.uri, line.range, updatedLine);
        await vscode.workspace.applyEdit(workspaceEdit);
        this.forceReparse(editor.document);
    };

    /**
     * Increments or decrements an SFLCTL record's SFLPAG() (number of subfile rows shown at once),
     * always keeping SFLSIZ() one more than SFLPAG — the common convention that gives the subfile
     * one row of headroom past what's visible. Both are 4-digit zero-padded numeric literals.
     */
    private async adjustSubfilePageSize(delta: number): Promise<void> {
        const { editor } = checkForEditorAndDocument();
        if (!editor) {
            return;
        };

        const recordInfo = fieldsPerRecords.find(r => r.record === this.recordName);
        if (!recordInfo || !isSflCtlRecordInfo(recordInfo)) {
            return;
        };

        const pagAttr = findOwnSflPagAttribute(recordInfo, this.activeDisplayFormat);
        const pagMatch = pagAttr?.value.match(/SFLPAG\(\s*(\d+)\s*\)/i);
        if (!pagAttr || !pagMatch) {
            return;
        };

        const currentPag = parseInt(pagMatch[1], 10);
        const newPag = Math.min(Math.max(currentPag + delta, 1), 9998);
        if (newPag === currentPag) {
            return;
        };
        const newSiz = newPag + 1;

        const workspaceEdit = new vscode.WorkspaceEdit();

        const pagLine = editor.document.lineAt(pagAttr.lineIndex);
        workspaceEdit.replace(
            editor.document.uri,
            pagLine.range,
            pagLine.text.replace(/SFLPAG\(\s*\d+\s*\)/i, `SFLPAG(${String(newPag).padStart(4, '0')})`)
        );

        const sizCandidates = recordInfo.attributes?.filter(a => a.value.toUpperCase().startsWith('SFLSIZ(')) ?? [];
        const sizAttr = pickForActiveFormat(sizCandidates, this.activeDisplayFormat);
        if (sizAttr) {
            const sizLine = editor.document.lineAt(sizAttr.lineIndex);
            workspaceEdit.replace(
                editor.document.uri,
                sizLine.range,
                sizLine.text.replace(/SFLSIZ\(\s*\d+\s*\)/i, `SFLSIZ(${String(newSiz).padStart(4, '0')})`)
            );
        };

        await vscode.workspace.applyEdit(workspaceEdit);
        this.forceReparse(editor.document);
    };

    /**
     * The webview holds focus during drag/resize, so the normal onDidChangeTextDocument listener
     * (which only reacts when the edited document is the active text editor) won't fire.
     * Force the re-parse immediately instead of waiting for the user to click back into the source.
     */
    private forceReparse(document: vscode.TextDocument): void {
        if (this.treeProvider) {
            updateTreeProvider(this.treeProvider, document);
        };
    };

    /**
     * Builds the webview HTML: a canvas that draws the field/constant grid and reports clicks,
     * drags, resizes and overlay selection back.
     */
    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
    body {
        margin: 0;
        padding: 8px;
        background: #000000;
        color: #00ff00;
        font-family: var(--vscode-editor-font-family, monospace);
    }
    #toolbarRow {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 16px;
        row-gap: 4px;
        margin-bottom: 6px;
        font-size: 12px;
    }
    #info {
        opacity: 0.7;
    }
    #formatBar, #toolbar {
        display: none;
        align-items: center;
        gap: 4px;
    }
    #formatBar select, #toolbar select {
        background: #000000;
        color: #00ff00;
        border: 1px solid #333333;
        font-family: inherit;
    }
    #formatBar select:disabled {
        color: #666666;
        border-color: #222222;
        cursor: default;
    }
    #actionBar {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    #actionBar button, #sflpagBar button {
        background: #000000;
        color: #00ff00;
        border: 1px solid #333333;
        font-family: inherit;
        font-size: 12px;
        padding: 2px 6px;
        cursor: pointer;
    }
    #actionBar button.active {
        background: #00ff00;
        color: #000000;
        border-color: #00ff00;
    }
    #actionBar button:disabled, #sflpagBar button:disabled {
        color: #666666;
        border-color: #222222;
        cursor: default;
    }
    #indicatorBar {
        display: none;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }
    #sflpagBar {
        display: none;
        align-items: center;
        gap: 4px;
    }
    #sflpagValue {
        min-width: 2ch;
        text-align: center;
    }
    #indicatorList {
        display: none;
        margin-bottom: 6px;
    }
    .indicator-btn {
        display: inline-block;
        min-width: 20px;
        margin: 2px;
        padding: 1px 4px;
        text-align: center;
        border: 1px solid #555555;
        color: #888888;
        background: #000000;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
    }
    .indicator-btn.on {
        color: #000000;
        background: #00ff00;
        border-color: #00ff00;
    }
    canvas {
        background: #000000;
        border: 1px solid #333333;
        cursor: default;
    }
</style>
</head>
<body>
<div id="toolbarRow">
    <span id="info">Loading...</span>
    <span id="formatBar">
        <label for="formatSelect">Format: </label>
        <select id="formatSelect"></select>
    </span>
    <span id="toolbar">
        <label for="overlaySelect">Overlay: </label>
        <select id="overlaySelect"></select>
    </span>
    <label id="indicatorBar"><input type="checkbox" id="indicatorsToggle"> Indicators</label>
    <span id="sflpagBar">
        <label>Page rows: </label>
        <button id="sflpagMinusBtn" title="Decrease SFLPAG (SFLSIZ stays SFLPAG + 1)">-</button>
        <span id="sflpagValue"></span>
        <button id="sflpagPlusBtn" title="Increase SFLPAG (SFLSIZ stays SFLPAG + 1)">+</button>
    </span>
    <span id="actionBar">
        <button id="addFieldBtn" title="Click, then click a point in the screen to place a new field there">+ Field</button>
        <button id="addConstantBtn" title="Click, then click a point in the screen to place a new constant there">+ Constant</button>
        <button id="gridDotsBtn" title="Show a dot in every empty character cell, to see spacing between fields/constants">⋅ Grid</button>
    </span>
</div>
<div id="indicatorList"></div>
<canvas id="screen"></canvas>
<script>
    const vscode = acquireVsCodeApi();
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    const info = document.getElementById('info');
    const formatBar = document.getElementById('formatBar');
    const formatSelect = document.getElementById('formatSelect');
    const toolbar = document.getElementById('toolbar');
    const overlaySelect = document.getElementById('overlaySelect');
    const indicatorBar = document.getElementById('indicatorBar');
    const indicatorsToggle = document.getElementById('indicatorsToggle');
    const indicatorList = document.getElementById('indicatorList');
    const sflpagBar = document.getElementById('sflpagBar');
    const sflpagMinusBtn = document.getElementById('sflpagMinusBtn');
    const sflpagPlusBtn = document.getElementById('sflpagPlusBtn');
    const sflpagValue = document.getElementById('sflpagValue');
    const addConstantBtn = document.getElementById('addConstantBtn');
    const addFieldBtn = document.getElementById('addFieldBtn');
    const gridDotsBtn = document.getElementById('gridDotsBtn');

    const CHAR_W = 9;
    const CHAR_H = 18;
    const BLINK_INTERVAL_MS = 600;
    const HANDLE_SIZE = 8;
    const MENU_ICON_SIZE = 16;
    // Mirrors WINDOW_BORDER_* on the host: content sits 1 row/col inside the border, except on
    // the right, where it's 2 (verified against a real window's on-screen footprint).
    const WINDOW_BORDER_TOP = 1;
    const WINDOW_BORDER_BOTTOM = 1;
    const WINDOW_BORDER_LEFT = 1;
    const WINDOW_BORDER_RIGHT = 2;

    let currentItems = [];
    let currentBackgroundItems = [];
    let currentSize = null;
    let currentWindowFrame = null;
    let currentOuterFrame = null;
    let currentWindowTitle = null;
    let currentErrorMessage = null;
    let currentTitleRect = null;
    let currentMenuIconRect = null;
    let currentCenterIconRect = null;
    let windowHovered = false;
    let maxSize = null;
    let minDetailRow = null;
    let blinkOn = true;
    let dragState = null;
    let resizeState = null;
    let moveWindowState = null;
    let selectedLineIndex = null;
    let currentRecordName = null;
    let placingKind = null; // null | 'constant' | 'field'
    let showGridDots = false;

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function resolveItemRowCol(item, moveDelta) {
        const isDragged = dragState && dragState.item === item;
        let row = isDragged ? dragState.row : item.row;
        let col = isDragged ? dragState.col : item.col;

        // A "sameWindow" background item (the other half of an SFL/SFLCTL pair, sharing this exact
        // window) must move along with the window being dragged, same as the foreground record's
        // own items — only a genuinely different background record (a different window, or none at
        // all) stays put.
        if (moveDelta && (!item.isBackground || item.sameWindow)) {
            row += moveDelta.row;
            col += moveDelta.col;
        }

        return { row, col };
    }

    function drawItem(item, fontFamily, moveDelta) {
        if (item.nonDisplay) {
            return;
        }
        if (item.blink && !blinkOn) {
            return;
        }

        const isSelected = item.lineIndex === selectedLineIndex;
        const { row, col } = resolveItemRowCol(item, moveDelta);
        const isDragged = dragState && dragState.item === item;

        const x = (col - 1) * CHAR_W;
        const y = (row - 1) * CHAR_H;
        const w = Math.max(item.length, item.text.length, 1) * CHAR_W;

        ctx.font = (item.highIntensity ? 'bold ' : '') + (CHAR_H - 4) + 'px ' + fontFamily;

        if (item.reverseImage) {
            ctx.fillStyle = item.color;
            ctx.fillRect(x, y, w, CHAR_H);
            ctx.fillStyle = '#000000';
        } else {
            ctx.fillStyle = item.color;
        }

        // Drawn one character at a time, centered in its own CHAR_W-wide cell — same cx formula
        // grid dots use — rather than a single fillText call left-padded by a flat 2px. Both fixes
        // the drift a whole-string fillText has from the font's own glyph advance width over a
        // long enough string, and keeps each character's visual center aligned with a grid dot's,
        // instead of a fixed left pad making wider glyphs (e.g. bold capitals) look shifted right
        // of where a dot in the same cell sits.
        const text = item.text.length > item.length ? item.text.substring(0, item.length) : item.text;
        ctx.textAlign = 'center';
        for (let i = 0; i < text.length; i++) {
            ctx.fillText(text[i], x + i * CHAR_W + CHAR_W / 2, y + CHAR_H / 2);
        }
        ctx.textAlign = 'start';

        if (item.underline || item.isInputCapable) {
            ctx.strokeStyle = item.reverseImage ? '#000000' : item.color;
            ctx.beginPath();
            ctx.moveTo(x, y + CHAR_H - 2.5);
            ctx.lineTo(x + w, y + CHAR_H - 2.5);
            ctx.stroke();
        }

        if (item.columnSeparator) {
            ctx.strokeStyle = item.color;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, y);
            ctx.lineTo(x + 0.5, y + CHAR_H);
            ctx.moveTo(x + w - 0.5, y);
            ctx.lineTo(x + w - 0.5, y + CHAR_H);
            ctx.stroke();
        }

        if (isSelected) {
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.setLineDash(isDragged ? [3, 2] : []);
            ctx.strokeRect(x - 1.5, y - 1.5, w + 2, CHAR_H + 2);
            ctx.restore();
        }
    }

    function drawGridDots(size, items, backgroundItems, moveDelta, outerFrame, windowFrame) {
        if (!showGridDots) {
            return;
        }

        // A "behind" background item covered by the window's own opaque frame fill (see the
        // fillRect over currentOuterFrame in draw()) is invisible there, so it must not blank out
        // a grid dot in that cell; outside the frame (or for "sameWindow" items, which are drawn
        // after the fill and do show through) it's still visibly occupying its cell.
        const isCoveredByFrame = (row, col) => {
            if (!outerFrame) {
                return false;
            }
            return row >= outerFrame.row && row < outerFrame.row + outerFrame.rows &&
                col >= outerFrame.col && col < outerFrame.col + outerFrame.cols;
        };

        // Cells where a field/constant could never actually go: the border itself (the outer frame
        // minus the content rect it wraps), and — per the same rule already applied when placing
        // buttons (calculateButtonLayout in dspf-edit.add-buttons.ts) — a window's own first and
        // last content column, which DDS reserves and never lets a field/constant use.
        const isUnwritableCell = (row, col) => {
            if (!outerFrame || !isCoveredByFrame(row, col)) {
                return false;
            }
            if (!windowFrame) {
                return true;
            }
            const insideContent = row >= windowFrame.row && row < windowFrame.row + windowFrame.rows &&
                col >= windowFrame.col && col < windowFrame.col + windowFrame.cols;
            if (!insideContent) {
                return true;
            }
            return col === windowFrame.col || col === windowFrame.col + windowFrame.cols - 1;
        };

        const occupied = new Set();
        const markOccupied = (item, respectFrameCover) => {
            if (item.nonDisplay || (item.blink && !blinkOn)) {
                return;
            }
            const { row, col } = resolveItemRowCol(item, moveDelta);
            const w = Math.max(item.length, item.text.length, 1);
            for (let c = 0; c < w; c++) {
                const cellCol = col + c;
                if (respectFrameCover && isCoveredByFrame(row, cellCol)) {
                    continue;
                }
                occupied.add(row + ',' + cellCol);
            }
        };
        items.forEach(item => markOccupied(item, false));
        (backgroundItems || []).forEach(item => markOccupied(item, !item.sameWindow));

        // Drawn as an actual circle rather than the '⋅' glyph: a font's glyph bearing/advance box
        // isn't necessarily centered on the character it draws, which visibly threw the dot off
        // to one side of its cell; an arc is centered on (cx, cy) exactly, by construction.
        const DOT_RADIUS = 1.3;
        ctx.save();
        ctx.fillStyle = '#008800';
        for (let row = 1; row <= size.rows; row++) {
            for (let col = 1; col <= size.cols; col++) {
                if (occupied.has(row + ',' + col) || isUnwritableCell(row, col)) {
                    continue;
                }
                const cx = (col - 1) * CHAR_W + CHAR_W / 2;
                const cy = (row - 1) * CHAR_H + CHAR_H / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, DOT_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    function draw(size, items, backgroundItems, windowFrame, windowTitle, outerFrame) {
        currentItems = items;
        currentBackgroundItems = backgroundItems || [];
        currentSize = size;
        currentWindowFrame = windowFrame || null;
        currentOuterFrame = outerFrame || null;
        currentWindowTitle = windowTitle || null;
        canvas.width = size.cols * CHAR_W;
        canvas.height = size.rows * CHAR_H;

        const fontFamily = getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-family').trim() || 'monospace';

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textBaseline = 'middle';

        // A "behind" background item (a genuinely different record positioned behind the window)
        // is drawn before the window's own opaque frame fill, so the frame physically covers it,
        // just like the real window would. A "same window" item (an auto-paired SFL/SFLCTL half,
        // or the window's owner record) is part of the window's own content and is drawn later,
        // after the frame fill, so it shows through instead of being hidden by it.
        const behindItems = currentBackgroundItems.filter(item => !item.sameWindow);
        const sameWindowItems = currentBackgroundItems.filter(item => item.sameWindow);

        if (behindItems.length) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            for (const item of behindItems) {
                drawItem(item, fontFamily, null);
            }
            ctx.restore();
        }

        // While the window is being dragged, its own fields/constants — and any "sameWindow"
        // background items, the other half of an SFL/SFLCTL pair sharing this exact window — move
        // along with its border. A genuinely different background record's items stay put, since
        // that record (and its own window, if any) isn't being moved.
        const moveDelta = (moveWindowState && currentOuterFrame)
            ? { row: currentOuterFrame.row - moveWindowState.startRow, col: currentOuterFrame.col - moveWindowState.startCol }
            : null;

        if (currentOuterFrame) {
            const fx = (currentOuterFrame.col - 1) * CHAR_W;
            const fy = (currentOuterFrame.row - 1) * CHAR_H;
            const fw = currentOuterFrame.cols * CHAR_W;
            const fh = currentOuterFrame.rows * CHAR_H;

            ctx.fillStyle = '#000000';
            ctx.fillRect(fx, fy, fw, fh);
            ctx.strokeStyle = '#666666';
            ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
        }

        if (sameWindowItems.length) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            for (const item of sameWindowItems) {
                drawItem(item, fontFamily, moveDelta);
            }
            ctx.restore();
        }

        for (const item of items) {
            drawItem(item, fontFamily, moveDelta);
        }

        drawGridDots(size, items, currentBackgroundItems, moveDelta, currentOuterFrame, currentWindowFrame);

        // A currently-active ERRMSG() shows on the display's message line — the physical screen's
        // bottom row, whether or not the record being previewed is itself a window — in white,
        // overwriting whatever would otherwise be there, same as a real 5250 error line.
        if (currentErrorMessage) {
            const rowY = (size.rows - 1) * CHAR_H;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, rowY, canvas.width, CHAR_H);
            ctx.fillStyle = '#ffffff';
            ctx.font = (CHAR_H - 4) + 'px ' + fontFamily;
            ctx.textAlign = 'center';
            const text = currentErrorMessage.text;
            for (let i = 0; i < text.length && i < size.cols; i++) {
                ctx.fillText(text[i], i * CHAR_W + CHAR_W / 2, rowY + CHAR_H / 2);
            }
            ctx.textAlign = 'start';
        }

        if (currentOuterFrame) {
            const hx = (currentOuterFrame.col - 1 + currentOuterFrame.cols) * CHAR_W;
            const hy = (currentOuterFrame.row - 1 + currentOuterFrame.rows) * CHAR_H;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(hx - HANDLE_SIZE, hy - HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE);
        }

        currentTitleRect = null;

        if (currentOuterFrame && currentWindowTitle) {
            const fx = (currentOuterFrame.col - 1) * CHAR_W;
            const fy = (currentOuterFrame.row - 1) * CHAR_H;
            const fw = currentOuterFrame.cols * CHAR_W;
            const fh = currentOuterFrame.rows * CHAR_H;

            const titleY = currentWindowTitle.position === 'BOTTOM' ? fy + fh - CHAR_H : fy;
            const text = ' ' + currentWindowTitle.text + ' ';

            ctx.font = (CHAR_H - 4) + 'px ' + fontFamily;
            const textWidth = Math.min(ctx.measureText(text).width, fw - 4);

            let textX;
            if (currentWindowTitle.align === 'LEFT') {
                textX = fx + 2;
            } else if (currentWindowTitle.align === 'RIGHT') {
                textX = fx + fw - textWidth - 2;
            } else {
                textX = fx + (fw - textWidth) / 2;
            }

            ctx.fillStyle = '#000000';
            ctx.fillRect(textX, titleY, textWidth, CHAR_H);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, textX, titleY + CHAR_H / 2);

            currentTitleRect = { x: textX, y: titleY, width: textWidth, height: CHAR_H };
        }

        currentMenuIconRect = null;
        currentCenterIconRect = null;
        if (currentOuterFrame && windowHovered) {
            const drawIconButton = (x, y, glyph, title) => {
                ctx.fillStyle = '#dddddd';
                ctx.fillRect(x, y, MENU_ICON_SIZE, MENU_ICON_SIZE);
                ctx.strokeStyle = '#666666';
                ctx.strokeRect(x + 0.5, y + 0.5, MENU_ICON_SIZE - 1, MENU_ICON_SIZE - 1);

                ctx.fillStyle = '#000000';
                ctx.font = (MENU_ICON_SIZE - 2) + 'px ' + fontFamily;
                const glyphWidth = ctx.measureText(glyph).width;
                ctx.fillText(glyph, x + (MENU_ICON_SIZE - glyphWidth) / 2, y + MENU_ICON_SIZE / 2);

                return { x, y, width: MENU_ICON_SIZE, height: MENU_ICON_SIZE };
            };

            // "Window actions" button in the frame's top-right corner: always available (even
            // before a title exists), and where future menu-based actions can be added.
            const menuX = (currentOuterFrame.col - 1 + currentOuterFrame.cols) * CHAR_W - MENU_ICON_SIZE - 2;
            const menuY = (currentOuterFrame.row - 1) * CHAR_H + (CHAR_H - MENU_ICON_SIZE) / 2;
            currentMenuIconRect = drawIconButton(menuX, menuY, '⋮', 'Window actions');

            // "Center horizontally" button, a one-click action next to it (no menu needed) — the
            // pattern any future direct-action icon can follow.
            const centerX = menuX - MENU_ICON_SIZE - 2;
            const centerY = menuY;
            currentCenterIconRect = drawIconButton(centerX, centerY, '↔', 'Center horizontally');
        }
    }

    setInterval(() => {
        const anyBlinking = currentItems.some(item => item.blink) || currentBackgroundItems.some(item => item.blink);
        if (!anyBlinking) {
            return;
        }
        blinkOn = !blinkOn;
        draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
    }, BLINK_INTERVAL_MS);

    function cellAt(ev) {
        const rect = canvas.getBoundingClientRect();
        const col = Math.floor((ev.clientX - rect.left) / CHAR_W) + 1;
        const row = Math.floor((ev.clientY - rect.top) / CHAR_H) + 1;
        return { row, col };
    }

    function findItemAt(ev) {
        // Only the real, interactive instance can be clicked/selected/dragged: an overlaid
        // background record is reference-only, and subfile page-repeat ghosts aren't real lines.
        const { row, col } = cellAt(ev);
        return currentItems.find(item =>
            item.isInteractive &&
            row === item.row &&
            col >= item.col &&
            col < item.col + Math.max(item.length, item.text.length, 1)
        );
    }

    function isOverResizeHandle(ev) {
        if (!currentOuterFrame) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const hx = (currentOuterFrame.col - 1 + currentOuterFrame.cols) * CHAR_W;
        const hy = (currentOuterFrame.row - 1 + currentOuterFrame.rows) * CHAR_H;
        return px >= hx - HANDLE_SIZE && px <= hx && py >= hy - HANDLE_SIZE && py <= hy;
    }

    function isOverWindowFrame(ev) {
        if (!currentOuterFrame) {
            return false;
        }
        const { row, col } = cellAt(ev);
        return row >= currentOuterFrame.row && row < currentOuterFrame.row + currentOuterFrame.rows &&
               col >= currentOuterFrame.col && col < currentOuterFrame.col + currentOuterFrame.cols;
    }

    function isOverTitle(ev) {
        if (!currentTitleRect) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        return px >= currentTitleRect.x && px < currentTitleRect.x + currentTitleRect.width &&
               py >= currentTitleRect.y && py < currentTitleRect.y + currentTitleRect.height;
    }

    function isOverMenuIcon(ev) {
        if (!currentMenuIconRect) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        return px >= currentMenuIconRect.x && px < currentMenuIconRect.x + currentMenuIconRect.width &&
               py >= currentMenuIconRect.y && py < currentMenuIconRect.y + currentMenuIconRect.height;
    }

    function isOverCenterIcon(ev) {
        if (!currentCenterIconRect) {
            return false;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        return px >= currentCenterIconRect.x && px < currentCenterIconRect.x + currentCenterIconRect.width &&
               py >= currentCenterIconRect.y && py < currentCenterIconRect.y + currentCenterIconRect.height;
    }

    // Icons only show while the mouse is over the window (frame + content); redraw only happens
    // when this actually flips, so hovering elsewhere doesn't repaint on every mousemove pixel.
    function updateWindowHoverState(ev) {
        const hovering = isOverWindowFrame(ev);
        if (hovering !== windowHovered) {
            windowHovered = hovering;
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    }

    function setPlacingKind(kind) {
        placingKind = kind;
        addConstantBtn.classList.toggle('active', placingKind === 'constant');
        addFieldBtn.classList.toggle('active', placingKind === 'field');
        canvas.style.cursor = placingKind ? 'crosshair' : '';
        canvas.title = placingKind ? ('Click a point in the screen to place the new ' + placingKind) : '';
    }

    addConstantBtn.addEventListener('click', () => {
        setPlacingKind(placingKind === 'constant' ? null : 'constant');
    });

    addFieldBtn.addEventListener('click', () => {
        setPlacingKind(placingKind === 'field' ? null : 'field');
    });

    gridDotsBtn.addEventListener('click', () => {
        showGridDots = !showGridDots;
        gridDotsBtn.classList.toggle('active', showGridDots);
        if (currentSize) {
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    });

    sflpagMinusBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'sflpagDecrement' });
    });

    sflpagPlusBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'sflpagIncrement' });
    });

    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && placingKind) {
            setPlacingKind(null);
        }
    });

    canvas.addEventListener('mousedown', (ev) => {
        if (placingKind) {
            const { row, col } = cellAt(ev);
            vscode.postMessage({ type: placingKind === 'field' ? 'addFieldAt' : 'addConstantAt', row, col });
            setPlacingKind(null);
            return;
        }

        if (isOverResizeHandle(ev)) {
            resizeState = {
                contentRows: currentOuterFrame.rows - WINDOW_BORDER_TOP - WINDOW_BORDER_BOTTOM,
                contentCols: currentOuterFrame.cols - WINDOW_BORDER_LEFT - WINDOW_BORDER_RIGHT
            };
            return;
        }

        if (isOverMenuIcon(ev)) {
            vscode.postMessage({ type: 'windowMenu' });
            return;
        }

        if (isOverCenterIcon(ev)) {
            vscode.postMessage({ type: 'centerWindowHorizontally' });
            return;
        }

        if (isOverTitle(ev)) {
            vscode.postMessage({ type: 'editWindowTitle' });
            return;
        }

        const hit = findItemAt(ev);
        selectedLineIndex = hit ? hit.lineIndex : null;
        draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);

        if (hit) {
            const { row, col } = cellAt(ev);
            dragState = {
                item: hit,
                grabRowOffset: row - hit.row,
                grabColOffset: col - hit.col,
                row: hit.row,
                col: hit.col,
                moved: false
            };
            return;
        }

        // Clicked empty space inside the window's own frame (not on a field/constant): drag the window itself.
        if (isOverWindowFrame(ev)) {
            const { row, col } = cellAt(ev);
            moveWindowState = {
                grabRowOffset: row - currentOuterFrame.row,
                grabColOffset: col - currentOuterFrame.col,
                startRow: currentOuterFrame.row,
                startCol: currentOuterFrame.col,
                moved: false
            };
        }
    });

    document.addEventListener('mouseleave', () => {
        // The mouse left the whole webview, so no more mousemove events will arrive to notice it —
        // hide the icons explicitly instead of leaving them stuck showing.
        if (windowHovered) {
            windowHovered = false;
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    });

    window.addEventListener('mousemove', (ev) => {
        if (placingKind) {
            canvas.style.cursor = 'crosshair';
            return;
        }

        if (resizeState) {
            const { row, col } = cellAt(ev);
            const limitRows = maxSize ? maxSize.rows : currentSize.rows;
            const limitCols = maxSize ? maxSize.cols : currentSize.cols;
            // Content top-left (currentWindowFrame) stays fixed; the corner being dragged maps to
            // content size, not the outer border's own size (see WINDOW_BORDER_* above).
            const newContentRows = clamp(row - currentWindowFrame.row - (WINDOW_BORDER_BOTTOM - 1), 1, limitRows);
            const newContentCols = clamp(col - currentWindowFrame.col - (WINDOW_BORDER_RIGHT - 1), 1, limitCols);

            if (newContentRows !== resizeState.contentRows || newContentCols !== resizeState.contentCols) {
                resizeState.contentRows = newContentRows;
                resizeState.contentCols = newContentCols;
                currentOuterFrame = Object.assign({}, currentOuterFrame, {
                    rows: newContentRows + WINDOW_BORDER_TOP + WINDOW_BORDER_BOTTOM,
                    cols: newContentCols + WINDOW_BORDER_LEFT + WINDOW_BORDER_RIGHT
                });
                draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
            }
            return;
        }

        if (moveWindowState) {
            const { row, col } = cellAt(ev);
            const limitRow = Math.max(currentSize.rows - currentOuterFrame.rows + 1, 1);
            const limitCol = Math.max(currentSize.cols - currentOuterFrame.cols + 1, 1);
            const newRow = clamp(row - moveWindowState.grabRowOffset, 1, limitRow);
            const newCol = clamp(col - moveWindowState.grabColOffset, 1, limitCol);

            if (newRow !== currentOuterFrame.row || newCol !== currentOuterFrame.col) {
                currentOuterFrame = Object.assign({}, currentOuterFrame, { row: newRow, col: newCol });
                moveWindowState.moved = true;
                draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
            }
            return;
        }

        if (!dragState) {
            updateWindowHoverState(ev);

            const overHandle = isOverResizeHandle(ev);
            if (overHandle) {
                canvas.style.cursor = 'nwse-resize';
                canvas.title = '';
                return;
            }
            if (isOverMenuIcon(ev)) {
                canvas.style.cursor = 'pointer';
                canvas.title = 'Window actions';
                return;
            }
            if (isOverCenterIcon(ev)) {
                canvas.style.cursor = 'pointer';
                canvas.title = 'Center horizontally';
                return;
            }
            if (isOverTitle(ev)) {
                canvas.style.cursor = 'pointer';
                canvas.title = 'Click to change the window title';
                return;
            }
            const hit = findItemAt(ev);
            canvas.style.cursor = (!hit && isOverWindowFrame(ev)) ? 'move' : 'default';
            canvas.title = hit ? hit.name : '';
            return;
        }

        const { row, col } = cellAt(ev);
        const width = Math.max(dragState.item.length, dragState.item.text.length, 1);

        // A window's own fields/constants can't be dragged past its frame; background (overlay)
        // items, or items in a plain (non-window) record, are bounded by the whole canvas instead.
        let minRow = 1, maxRow = currentSize.rows, minCol = 1, maxCol = currentSize.cols - width + 1;
        if (currentWindowFrame && !dragState.item.isBackground) {
            minRow = currentWindowFrame.row;
            maxRow = Math.max(currentWindowFrame.row + currentWindowFrame.rows - 1, minRow);
            // The window's own first content column can't be written to; the rest of its width,
            // including the last column, is usable.
            minCol = currentWindowFrame.col + 1;
            maxCol = Math.max(currentWindowFrame.col + currentWindowFrame.cols - width, minCol);
        }

        // A subfile detail record's own rows can't be dragged up into its header's static content.
        if (minDetailRow !== null && !dragState.item.isBackground) {
            minRow = Math.max(minRow, minDetailRow);
        }

        const newRow = clamp(row - dragState.grabRowOffset, minRow, maxRow);
        const newCol = clamp(col - dragState.grabColOffset, minCol, maxCol);

        if (newRow !== dragState.row || newCol !== dragState.col) {
            dragState.row = newRow;
            dragState.col = newCol;
            dragState.moved = true;
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    });

    window.addEventListener('mouseup', () => {
        if (resizeState) {
            const { contentRows, contentCols } = resizeState;
            resizeState = null;
            vscode.postMessage({ type: 'resize', newRows: contentRows, newCols: contentCols });
            return;
        }

        if (moveWindowState) {
            const moved = moveWindowState.moved;
            const finalRow = currentOuterFrame.row;
            const finalCol = currentOuterFrame.col;
            moveWindowState = null;
            if (moved) {
                vscode.postMessage({ type: 'moveWindow', newRow: finalRow, newCol: finalCol });
            }
            return;
        }

        if (!dragState) {
            return;
        }

        if (dragState.moved) {
            vscode.postMessage({
                type: 'move',
                lineIndex: dragState.item.lineIndex,
                newRow: dragState.row,
                newCol: dragState.col,
                rowOffset: dragState.item.rowOffset,
                colOffset: dragState.item.colOffset
            });
        } else {
            vscode.postMessage({ type: 'navigate', lineIndex: dragState.item.lineIndex });
        }

        dragState = null;
        draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
    });

    formatSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'setDisplayFormat', name: formatSelect.value || null });
    });

    function rebuildFormatOptions(availableFormats, selectedValue) {
        formatSelect.innerHTML = '';

        for (const format of availableFormats) {
            const opt = document.createElement('option');
            opt.value = format.name;
            opt.textContent = format.name + ' (' + format.rows + 'x' + format.cols + ')';
            formatSelect.appendChild(opt);
        }

        formatSelect.value = selectedValue;
    }

    overlaySelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'setOverlay', recordName: overlaySelect.value || null });
    });

    function rebuildOverlayOptions(availableRecords, selectedValue) {
        overlaySelect.innerHTML = '';

        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(none)';
        overlaySelect.appendChild(noneOption);

        for (const name of availableRecords) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            overlaySelect.appendChild(opt);
        }

        overlaySelect.value = selectedValue;
    }

    indicatorsToggle.addEventListener('change', () => {
        vscode.postMessage({ type: 'setIndicatorsEnabled', enabled: indicatorsToggle.checked });
    });

    function rebuildIndicatorList(availableIndicators, activeIndicators) {
        indicatorList.innerHTML = '';

        for (const number of availableIndicators) {
            const btn = document.createElement('span');
            btn.className = 'indicator-btn' + (activeIndicators.includes(number) ? ' on' : '');
            btn.textContent = number;
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'toggleIndicator', number });
            });
            indicatorList.appendChild(btn);
        }
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'render') {
            if (message.recordName !== currentRecordName) {
                currentRecordName = message.recordName;
                selectedLineIndex = null;
                dragState = null;
            }

            maxSize = message.maxSize || null;
            minDetailRow = typeof message.minDetailRow === 'number' ? message.minDetailRow : null;
            const availableFormats = message.availableFormats || [];
            formatBar.style.display = availableFormats.length > 0 ? 'inline-flex' : 'none';
            if (availableFormats.length > 0) {
                rebuildFormatOptions(availableFormats, message.activeDisplayFormat || '');
                // Locked (disabled) when the file only declares one display format — nothing to switch to.
                formatSelect.disabled = availableFormats.length <= 1;
            }

            const hasOverlayOptions = message.availableRecords && message.availableRecords.length > 0;
            toolbar.style.display = hasOverlayOptions ? 'inline-flex' : 'none';
            if (hasOverlayOptions) {
                rebuildOverlayOptions(message.availableRecords, message.overlayRecordName || '');
            }

            const hasIndicators = message.availableIndicators && message.availableIndicators.length > 0;
            indicatorBar.style.display = hasIndicators ? 'inline-flex' : 'none';
            if (hasIndicators) {
                indicatorsToggle.checked = Boolean(message.indicatorsEnabled);
                indicatorList.style.display = message.indicatorsEnabled ? 'block' : 'none';
                rebuildIndicatorList(message.availableIndicators, message.activeIndicators || []);
            }

            const hasSflPag = typeof message.sflPag === 'number';
            sflpagBar.style.display = hasSflPag ? 'inline-flex' : 'none';
            if (hasSflPag) {
                sflpagValue.textContent = String(message.sflPag);
                sflpagMinusBtn.disabled = message.sflPag <= 1;
                sflpagPlusBtn.disabled = message.sflPag >= 9998;
            }

            const baseInfo = message.size.rows + ' x ' + message.size.cols;
            info.textContent = message.windowFrame
                ? baseInfo + '  —  window ' + message.windowFrame.rows + 'x' + message.windowFrame.cols +
                  ' at (' + message.windowFrame.row + ',' + message.windowFrame.col + ')'
                : baseInfo;

            currentErrorMessage = message.errorMessage || null;
            draw(message.size, message.items, message.backgroundItems, message.windowFrame, message.windowTitle, message.outerFrame);
        } else if (message.type === 'notFound') {
            info.textContent = 'Record no longer exists.';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else if (message.type === 'selectLine') {
            selectedLineIndex = message.lineIndex;
            draw(currentSize, currentItems, currentBackgroundItems, currentWindowFrame, currentWindowTitle, currentOuterFrame);
        }
    });
</script>
</body>
</html>`;
    };
};
