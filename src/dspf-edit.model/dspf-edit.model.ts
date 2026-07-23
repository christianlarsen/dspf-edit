/*
  Christian Larsen, 2025
  "RPG structure"
  dspf-edit.model.ts
*/

/**
 * Represents any possible DDS element type.
 */
export type DdsElement =
  | DdsFile
  | DdsRecord
  | DdsAttribute
  | DdsField
  | DdsFieldAttribute
  | DdsConstant
  | DdsConstantAttribute
  | DdsGroup
  | DdsIndicators;

/**
 * Represents a general DDS attribute.
 */
export interface DdsAttribute {
  kind: 'attribute';
  lineIndex: number;
  lastLineIndex?: number;
  value: string;
  attribute?: string;
  indicators?: DdsIndicator[];
  attributes?: DdsAttribute[];
  children?: DdsElement[];
  /** Set when this line is conditioned by a display format name (e.g. "*DS3") instead of/besides indicators. */
  displayFormat?: string;
};

/**
 * Represents an indicator (e.g., *IN01).
 */
export interface DdsIndicator {
  active: boolean;
  number: number;
};

/**
 * Represents a size definition for a DDS display or window.
 */
export interface DdsSize {
  rows: number;
  cols: number;
  name?: string;
  source: 'default' | 'window';
  originRow : number;
  originCol : number;
  /**
   * Set when this size was inherited rather than defined locally: either because the record's own
   * WINDOW() keyword names another record (WINDOW(other-record)) instead of giving row/col/rows/cols
   * directly, or because it's an SFL/SFLCTL record that borrows its pair's window. Names the record
   * that actually owns/defines the window (e.g. its WDWTITLE), so previews can show that owner too.
   */
  sharedFromRecord?: string;
};

// ELEMENT-SPECIFIC INTERFACES

/** DDS File element */
export interface DdsFile {
  kind: 'file';
  lineIndex: number;
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
  attribute?: string;
  children?: DdsElement[];
};

/** DDS Record element */
export interface DdsRecord {
  kind: 'record';
  name: string;
  lineIndex: number;
  endIndex?: number;
  attribute?: string;
  children?: DdsElement[];
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
  size?: DdsSize;
};

/** DDS Field element */
export interface DdsField {
  kind: 'field';
  name: string;
  type?: string;
  length?: number;
  decimals?: number;
  usage: string;
  row?: number;
  column?: number;
  hidden?: boolean;
  referenced?: boolean;
  lineIndex: number;
  recordname: string;
  attribute?: string;
  children?: DdsElement[];
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
  /** Set when this field's line is conditioned by a display format name (e.g. "*DS3"). */
  displayFormat?: string;
};

/** Field attribute (e.g., EDTCDE, DSPATR) */
export interface DdsFieldAttribute {
  kind: 'fieldAttribute';
  lineIndex: number;
  lastLineIndex: number;
  value: string;
  attribute?: string;
  indicators?: DdsIndicator[];
  attributes?: DdsAttribute[];
  children?: DdsElement[];
};

/** DDS Constant element */
export interface DdsConstant {
  kind: 'constant';
  name: string;
  row: number;
  column: number;
  lineIndex: number;
  recordname: string;
  attribute?: string;
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
  children?: DdsElement[];
  /** Set when this constant's line is conditioned by a display format name (e.g. "*DS3"). */
  displayFormat?: string;
};

/** Constant attribute (similar to field attributes but for constants) */
export interface DdsConstantAttribute {
  kind: 'constantAttribute';
  lineIndex: number;
  lastLineIndex: number;
  value: string;
  attribute?: string;
  indicators?: DdsIndicator[];
  attributes?: DdsAttribute[];
  children?: DdsElement[];
};

/** Attribute group (e.g., "Attributes" node in a tree) */
export interface DdsAttributeGroup {
  kind: 'attributeGroup';
  lineIndex: number;
  attribute: 'Attributes';
  attributes: DdsAttribute[];
};

/** Indicators container */
export interface DdsIndicators {
  kind: 'indicatornode';
  indicator: DdsIndicator;
  lineIndex: number;
  attribute?: string;
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
  children?: DdsElement[];
};

/** DDS Group element (can contain multiple child elements) */
export interface DdsGroup {
  kind: 'group';
  children: DdsElement[];
  lineIndex: number;
  attribute: string;
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
};

// SIZE-RELATED INTERNAL STRUCTURES

/**
 * Raw size attributes extracted from DDS source.
 */
interface DdsSizeAttributes {
  numDsply: number;
  maxRow1: number;
  maxCol1: number;
  nameDsply1: string;
  maxRow2: number;
  maxCol2: number;
  nameDsply2: string;
};

/** Global storage for file size attributes */
export let fileSizeAttributes: DdsSizeAttributes = {
  numDsply: 0,
  maxRow1: 0,
  maxCol1: 0,
  nameDsply1: '',
  maxRow2: 0,
  maxCol2: 0,
  nameDsply2: ''
};

// FIELD & CONSTANT INFO STRUCTURES

/** Simplified field info (used for reporting/grouping) */
export interface FieldInfo {
  name: string;
  type?: string;
  usage?: string;
  row: number;
  col: number;
  length: number;
  attributes: AttributeWithIndicators[];
  indicators?: DdsIndicator[];
  lineIndex: number;
  lastLineIndex: number;
  /** Set when this field's line is conditioned by a display format name (e.g. "*DS3"). */
  displayFormat?: string;
};

/** Simplified constant info */
export interface ConstantInfo {
  name: string;
  type?: string;
  row: number;
  col: number;
  length: number;
  attributes: AttributeWithIndicators[];
  indicators?: DdsIndicator[];
  lineIndex: number;
  lastLineIndex: number;
  /** Set when this constant's line is conditioned by a display format name (e.g. "*DS3"). */
  displayFormat?: string;
};

/*** Attribute with indicadors info */
export interface AttributeWithIndicators {
  value: string;
  indicators?: DdsIndicator[];
  lineIndex: number;
  lastLineIndex: number;
  /** Set when this attribute's line is conditioned by a display format name (e.g. "*DS3"). */
  displayFormat?: string;
};

/** Record container for fields & constants */
export interface FieldsPerRecord {
  record: string;
  attributes?: DdsAttribute[];
  fields: FieldInfo[];
  constants: ConstantInfo[];
  size?: DdsSize;
  startIndex: number;
  endIndex: number;
};

// GLOBAL DATA ARRAYS

export let records: string[] = [];
export let fieldsPerRecords: FieldsPerRecord[] = [];
export let attributesFileLevel: DdsAttribute[] = []; 

// UTILITY FUNCTIONS

/**
 * Get the default display size from the global file size attributes.
 */
export function getDefaultSize(): DdsSize {
  return {
    rows: fileSizeAttributes.maxRow1,
    cols: fileSizeAttributes.maxCol1,
    name: fileSizeAttributes.nameDsply1,
    source: 'default',
    originCol : 1,
    originRow : 1
  };
};

/**
 * Get the size information for a specific record by name.
 * @param recordName - Name of the record to find.
 */
export function getRecordSize(recordName: string): DdsSize | undefined {
  const recordEntry = fieldsPerRecords.find(r => r.record === recordName);
  return recordEntry?.size;
};

/**
 * Get all records that have size information.
 */
export function getAllRecordSizes(): Array<{ record: string; size: DdsSize }> {
  return fieldsPerRecords
    .filter(r => r.size)
    .map(r => ({ record: r.record, size: r.size! }));
};

/**
 * Lists the display formats declared in DSPSIZ (e.g. *DS3/*DS4), if the file declares more than
 * one. Used to offer a format switcher in the preview; empty when the file has a single size.
 */
export function getAvailableDisplayFormats(): Array<{ name: string; rows: number; cols: number }> {
  const formats: Array<{ name: string; rows: number; cols: number }> = [];

  if (fileSizeAttributes.nameDsply1) {
    formats.push({ name: fileSizeAttributes.nameDsply1, rows: fileSizeAttributes.maxRow1, cols: fileSizeAttributes.maxCol1 });
  };
  if (fileSizeAttributes.nameDsply2) {
    formats.push({ name: fileSizeAttributes.nameDsply2, rows: fileSizeAttributes.maxRow2, cols: fileSizeAttributes.maxCol2 });
  };

  return formats;
};

/**
 * Gets the default (non-window) screen size for a specific named display format (e.g. "*DS3"),
 * as declared in DSPSIZ. Undefined if the name doesn't match either declared format.
 * @param formatName - The display format name to look up
 */
export function getSizeForFormat(formatName: string): DdsSize | undefined {
  const format = getAvailableDisplayFormats().find(f => f.name === formatName);
  if (!format) {
    return undefined;
  };

  return {
    rows: format.rows,
    cols: format.cols,
    name: format.name,
    source: 'default',
    originCol: 1,
    originRow: 1
  };
};

