/*
  Christian Larsen, 2025
  "RPG structure"
  dspf-edit.model.ts
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

export interface DdsFile {
  kind: 'file';
  lineIndex: number;
  attributes?: DdsAttribute[];
};

export interface DdsRecord {
  kind: 'record';
  name: string;
  lineIndex: number;
  attributes?: DdsAttribute[];
};

export interface DdsField {
  kind: 'field';
  name: string;
  type: string;
  length : number;
  decimals : number;
  usage : string;
  row?: number;
  column?: number;
  hidden?: boolean;
  lineIndex: number;
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
};

export interface DdsFieldAttribute {
  kind: 'fieldAttribute';
  lineIndex: number;
  value: string,
  indicators?: DdsIndicator[];
  attributes?: DdsAttribute[];
};


export interface DdsConstant {
  kind: 'constant';
  name: string;
  row: number;
  column: number;
  lineIndex: number;
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
};

export interface DdsConstantAttribute {
  kind: 'constantAttribute';
  lineIndex: number;
  value: string,
  indicators?: DdsIndicator[];
  attributes?: DdsAttribute[];
};

export interface DdsAttributeGroup {
  kind: 'attributeGroup';
  lineIndex: number;
  attribute: 'Attributes';
  attributes: DdsAttribute[];
};

export interface DdsIndicator {
  active: boolean,
  number: number,
};

export interface DdsIndicators {
  kind: 'indicatornode',
  indicator: DdsIndicator,
  lineIndex: number,
  attributes?: DdsAttribute[],
  indicators?: DdsIndicator[]
};

export interface DdsAttribute {
  kind: 'attribute';
  lineIndex: number;
  value: string,
  indicators?: DdsIndicator[];
  attributes?: DdsAttribute[];
};

export interface DdsGroup {
  kind: 'group';
  children: DdsElement[];
  lineIndex: number;
  attribute: string,
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
};

interface DdsSizeAttributes {
  numDsply : number,
  maxRow1: number,
  maxCol1: number,
  nameDsply1 : string,
  maxRow2: number,
  maxCol2: number
  nameDsply2 : string
};

export let fileSizeAttributes: DdsSizeAttributes = {
  numDsply : 0,
  maxRow1: 0,
  maxCol1: 0,
  nameDsply1 : '',
  maxRow2: 0,
  maxCol2: 0,
  nameDsply2 : ''
};

export interface FieldInfo {
  name: string;
  row: number;
  col: number;
  length: number;
};

export interface ConstantInfo {
  name: string;
  row: number;
  col: number;
  length: number;
};

export interface fieldsPerRecord {
  record: string;
  fields: FieldInfo[];
  constants: ConstantInfo[];
};

export let records : string[] = [];
export let fieldsPerRecords : fieldsPerRecord[] = [];
