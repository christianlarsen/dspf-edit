/*
	Christian Larsen, 2025
	"RPG structure"
	dds-aid.model.ts
*/

export type DdsElement =
  | DdsFile
  | DdsRecord
  | DdsField
  | DdsConstant
  | DdsAttribute
  | DdsGroup
  | DdsAttributeGroup
  | DdsIndicatorGroup
  | DdsIndicatorNode;

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

export interface DdsIndicatorNode {
  kind: 'indicatornode',
  indicator : DdsIndicator,
  lineIndex: number, 
  attributes?: DdsAttribute[],
  indicators?: DdsIndicator[]
};

export interface DdsFile {
  kind: 'file';
  lineIndex : number ;
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
  row: number;
  column: number;
  lineIndex: number;
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
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
  attribute : string,
  attributes?: DdsAttribute[];
  indicators?: DdsIndicator[];
};

export interface DdsIndicatorGroup {
  kind: 'indgroup';
  children: DdsIndicator[];
  lineIndex: number;
  attribute: 'Indicators';
  attributes? : DdsAttribute[];
  indicators? : DdsIndicator[];
};

