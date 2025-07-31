/*
	Christian Larsen, 2025
	"RPG structure"
	dds-aid.providers.ts
*/

import * as vscode from 'vscode';
import * as path from 'path';
import { DdsElement, DdsGroup } from './dds-aid.model';
import { describeDdsField, describeDdsConstant, describeDdsRecord, describeDdsFile, formatDdsIndicators } from './dds-aid.helper';

export class DdsTreeProvider implements vscode.TreeDataProvider<DdsNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<DdsNode | undefined | void> = new vscode.EventEmitter<DdsNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<DdsNode | undefined | void> = this._onDidChangeTreeData.event;

	private elements: DdsElement[] = [];

	refresh(): void {
		this._onDidChangeTreeData.fire();
	};

	setElements(elements: DdsElement[]) {
		this.elements = elements;
	};

	getTreeItem(element: DdsNode): vscode.TreeItem {
		return element;
	};

	private shouldHaveAttributesGroup(el: DdsElement): boolean {
		return el.kind === 'record' || el.kind === 'field' || el.kind === 'constant';
	};

	getChildren(element?: DdsNode): Thenable<DdsNode[]> {
		const elements = this.elements;

		// Shows "File" and "Records" nodes.
		if (!element) {

			const file = elements.find(e => e.kind === 'file');
			const editor = vscode.window.activeTextEditor;
			const fileName = editor ? path.basename(editor.document.fileName) : 'Unknown';
			let fileNode: DdsNode | undefined;

			if (file) {
				fileNode = new DdsNode(`📂 File (${fileName})`, vscode.TreeItemCollapsibleState.Collapsed, file);
			};

			const recordRoot = new DdsNode(`📂 Records`, vscode.TreeItemCollapsibleState.Expanded, {
				kind: 'group',
				children: elements.filter(e => e.kind === 'record'),
				lineIndex: -1,
				attribute: '',
				attributes: [],
				indicators: []
			});

			return Promise.resolve([fileNode, recordRoot].filter(Boolean) as DdsNode[]);
		};

		// "File"
		if (element.ddsElement.kind === 'file') {
			const children: DdsNode[] = [];

			const fileAttributes = element.ddsElement.attributes ?? [];

			const attrGroup: DdsGroup = {
				kind: 'group',
				attribute: 'Attributes',
				lineIndex: element.ddsElement.lineIndex,
				children: [],
				attributes: fileAttributes,
				indicators: []
			};

			const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0 ? true : false;
			children.push(
				new DdsNode(
					`⚙️ Attributes`,
					hasAttributes ?
						vscode.TreeItemCollapsibleState.Collapsed :
						vscode.TreeItemCollapsibleState.None,
					attrGroup)
			);

			return Promise.resolve(children);
		};

		// "Record"
		if (element.ddsElement.kind === 'record') {
			const children: DdsNode[] = [];

			const recordAttributes = element.ddsElement.attributes ?? [];
			const attrGroup: DdsGroup = {
				kind: 'group',
				attribute: 'Attributes',
				lineIndex: element.ddsElement.lineIndex,
				children: [],
				attributes: recordAttributes,
				indicators: []
			};

			const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0 ? true : false;
			children.push(
				new DdsNode(
					`⚙️ Attributes`,
					hasAttributes ?
						vscode.TreeItemCollapsibleState.Collapsed :
						vscode.TreeItemCollapsibleState.None,
					attrGroup)
			);

			// Record constant&fields group
			const thisRecordLine = element.ddsElement.lineIndex;
			const nextRecord = this.elements.find(
				el => el.kind === 'record' && el.lineIndex > thisRecordLine
			);
			const nextRecordLine = nextRecord ? nextRecord.lineIndex : Number.MAX_SAFE_INTEGER;

			const fieldsAndConstants = this.elements.filter(
				el => (el.kind === 'field' || el.kind === 'constant') &&
					el.lineIndex > thisRecordLine &&
					el.lineIndex < nextRecordLine
			);

			if (fieldsAndConstants.length > 0) {
				children.push(
					new DdsNode(`🧾 Fields and Constants`, vscode.TreeItemCollapsibleState.Collapsed, {
						kind: 'group',
						attribute: 'FieldsAndConstants',
						children: fieldsAndConstants,
						lineIndex: element.ddsElement.lineIndex,
					})
				);
			};

			return Promise.resolve(children);
		};

		// "Field" 
		if (element.ddsElement.kind === 'field') {
			const children: DdsNode[] = [];
			const fieldIndicators = element.ddsElement.indicators ?? [];
			const fieldAttributes = element.ddsElement.attributes ?? [];

			const indiGroup: DdsGroup = {
				kind: 'group',
				attribute: 'Indicators',
				lineIndex: element.ddsElement.lineIndex,
				children: [],
				attributes: [],
				indicators: fieldIndicators
			};
			const attrGroup: DdsGroup = {
				kind: 'group',
				attribute: 'FieldAttributes',
				lineIndex: element.ddsElement.lineIndex,
				children: [],
				attributes: fieldAttributes,
				indicators: []
			};

			const hasIndicators = indiGroup.indicators && indiGroup.indicators.length > 0 ? true : false;
			children.push(
				new DdsNode(
					`📶 Indicators`,
					hasIndicators ?
						vscode.TreeItemCollapsibleState.Collapsed :
						vscode.TreeItemCollapsibleState.None,
					indiGroup)
			);
			const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0 ? true : false;
			children.push(
				new DdsNode(
					`⚙️ Attributes`,
					hasAttributes ?
						vscode.TreeItemCollapsibleState.Collapsed :
						vscode.TreeItemCollapsibleState.None,
					attrGroup)
			);

			return Promise.resolve(children);
		};

		// "Constant"
		if (element.ddsElement.kind === 'constant') {
			const children: DdsNode[] = [];
			const constantIndicators = element.ddsElement.indicators ?? [];
			const constantAttributes = element.ddsElement.attributes ?? [];

			const indiGroup: DdsGroup = {
				kind: 'group',
				attribute: 'Indicators',
				lineIndex: element.ddsElement.lineIndex,
				children: [],
				attributes: [],
				indicators: constantIndicators
			};
			const attrGroup: DdsGroup = {
				kind: 'group',
				attribute: 'ConstantAttributes',
				lineIndex: element.ddsElement.lineIndex,
				children: [],
				attributes: constantAttributes,
				indicators: []
			};

			const hasIndicators = indiGroup.indicators && indiGroup.indicators.length > 0 ? true : false;
			children.push(
				new DdsNode(
					`📶 Indicators`,
					hasIndicators ?
						vscode.TreeItemCollapsibleState.Collapsed :
						vscode.TreeItemCollapsibleState.None,
					indiGroup)
			);
			const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0 ? true : false;
			children.push(
				new DdsNode(
					`⚙️ Attributes`,
					hasAttributes ?
						vscode.TreeItemCollapsibleState.Collapsed :
						vscode.TreeItemCollapsibleState.None,
					attrGroup)
			);

			return Promise.resolve(children);
		};

		// "Group"
		if (element.ddsElement.kind === 'group') {

			const groupAttr = element.ddsElement.attribute;

			// "Attributes" group
			if (groupAttr === 'Attributes') {
				const group = element.ddsElement as DdsGroup;
				const attrs = group.attributes ?? [];

				return Promise.resolve(
					attrs.length === 0 ?
						[] :
						attrs.map(attr =>
							new DdsNode(
								`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `,
								vscode.TreeItemCollapsibleState.None,
								{
									...attr,
									kind: 'attribute',
								}
							)
						)
				);
			} else if (groupAttr === 'ConstantAttributes') {
				const group = element.ddsElement as DdsGroup;
				const attrs = group.attributes ?? [];

				return Promise.resolve(
					attrs.length === 0 ?
						[] :
						attrs.map(attr =>
							new DdsNode(
								`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `,
								vscode.TreeItemCollapsibleState.None,
								{
									...attr,
									kind: 'constantAttribute',
								}
							)
						)
				);
			} else if (groupAttr === 'FieldAttributes') {
				const group = element.ddsElement as DdsGroup;
				const attrs = group.attributes ?? [];

				return Promise.resolve(
					attrs.length === 0 ?
						[] :
						attrs.map(attr =>
							new DdsNode(
								`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `,
								vscode.TreeItemCollapsibleState.None,
								{
									...attr,
									kind: 'fieldAttribute',
								}
							)
						)
				);
				// "Indicators" group
			} else if (groupAttr === 'Indicators') {
				const group = element.ddsElement as DdsGroup;
				const indis = group.indicators ?? [];

				return Promise.resolve(
					indis.length === 0 ?
						[] :
						indis.map(indi =>
							new DdsNode(
								`${indi.number.toString().padStart(2, '0')}: ${indi.active ? 'ON' : 'OFF'}`,
								vscode.TreeItemCollapsibleState.None,
								{
									kind: 'indicatornode',
									indicator: indi,
									attributes: [],
									indicators: [],
									lineIndex: 0
								}
							)
						)
				);
				// "Record/Field/Constant" group		
			} else {
				return Promise.resolve(
					(element.ddsElement.children ?? []).map(rec =>
						new DdsNode(
							rec.kind === 'record' ? `📄 ${rec.name}` :
								rec.kind === 'field' ? `🔤 ${rec.name}` :
									rec.kind === 'constant' ? `💡 ${rec.name}` :
										`📦 ${rec.kind}`,
							this.shouldHaveAttributesGroup(rec) ?
								vscode.TreeItemCollapsibleState.Collapsed :
								vscode.TreeItemCollapsibleState.None,
							rec)
					)
				);
			};
		};

		return Promise.resolve([]);
	};
};

export class DdsNode extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly ddsElement: DdsElement
	) {
		super(label, collapsibleState);

		// Let's show the information on screen
		this.tooltip = this.getTooltip(ddsElement);
		this.description = this.getDescription(ddsElement);
		this.contextValue = ddsElement.kind;
	};

	// Get description of the "node"
	private getDescription(ddsElement: DdsElement): string {
		switch (ddsElement.kind) {
			case 'file':
				return describeDdsFile(ddsElement);
			case 'record':
				return describeDdsRecord(ddsElement);
			case 'field':
				return describeDdsField(ddsElement);
			case 'constant':
				return describeDdsConstant(ddsElement);
			case 'attribute':
				return '';
			case 'constantAttribute':
				return formatDdsIndicators(ddsElement.indicators);
			case 'fieldAttribute':
				return formatDdsIndicators(ddsElement.indicators);
			default:
				return '';
		};
	};

	// Get "toop tip" for the "node"
	private getTooltip(ddsElement: DdsElement): string {
		switch (ddsElement.kind) {
			case 'record':
			case 'field':
			case 'constant':
			case 'attribute':
			case 'file':
				return ddsElement.kind;
			default:
				return '';
		};
	};
};
