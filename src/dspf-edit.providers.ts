/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.providers.ts
*/

import * as vscode from 'vscode';
import * as path from 'path';
import { DdsElement, DdsGroup } from './dspf-edit.model';
import { describeDdsField, describeDdsConstant, describeDdsRecord, describeDdsFile, formatDdsIndicators } from './dspf-edit.helper';
import { lastDdsEditor } from './extension';

// DDS TREE PROVIDER CLASS

/**
 * Tree data provider for displaying DDS file structure in VS Code's tree view.
 * Provides hierarchical view of files, records, fields, constants, and their attributes.
 */
export class DdsTreeProvider implements vscode.TreeDataProvider<DdsNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<DdsNode | undefined | void> = new vscode.EventEmitter<DdsNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<DdsNode | undefined | void> = this._onDidChangeTreeData.event;

	private elements: DdsElement[] = [];

	/**
	 * Refreshes the tree view by firing the change event.
	 */
	refresh(): void {
		this._onDidChangeTreeData.fire();
	};

	/**
	 * Sets the DDS elements to be displayed in the tree.
	 * @param elements - Array of DDS elements to display
	 */
	setElements(elements: DdsElement[]) {
		this.elements = elements;
	};

	/**
	 * Returns the tree item representation of the given element.
	 * @param element - The DDS node to get tree item for
	 * @returns The corresponding VS Code tree item
	 */
	getTreeItem(element: DdsNode): vscode.TreeItem {
		return element;
	};

	/**
	 * Determines if an element should have an attributes group as a child.
	 * @param el - The DDS element to check
	 * @returns True if the element should have attributes group
	 */
	private shouldHaveAttributesGroup(el: DdsElement): boolean {
		return el.kind === 'record' || el.kind === 'field' || el.kind === 'constant';
	};

	/**
	 * Gets the children of a tree node. This is the main method that builds the tree structure.
	 * @param element - The parent node (undefined for root level)
	 * @returns Promise resolving to array of child nodes
	 */
	getChildren(element?: DdsNode): Thenable<DdsNode[]> {
		const elements = this.elements;

		// Root level - shows "File" and "Records" nodes
		if (!element) {
			return this.getRootChildren(elements);
		};

		// Handle different types of elements
		switch (element.ddsElement.kind) {
			case 'file':
				return this.getFileChildren(element);
			case 'record':
				return this.getRecordChildren(element);
			case 'field':
				return this.getFieldChildren(element);
			case 'constant':
				return this.getConstantChildren(element);
			case 'group':
				return this.getGroupChildren(element);
			default:
				return Promise.resolve([]);
		};
	};

	// CHILDREN PROVIDER METHODS

	/**
	 * Gets the root level children (File and Records nodes).
	 * @param elements - All DDS elements
	 * @returns Promise resolving to root level nodes
	 */
	private getRootChildren(elements: DdsElement[]): Thenable<DdsNode[]> {
		const file = elements.find(e => e.kind === 'file');
		const editor = lastDdsEditor || vscode.window.activeTextEditor;
		const fileName = editor ? path.basename(editor.document.fileName) : 'Unknown';
		let fileNode: DdsNode | undefined;

		if (file) {
			fileNode = new DdsNode(`📂 File (${fileName})`, vscode.TreeItemCollapsibleState.Collapsed, file);
		}

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

	/**
	 * Gets children for a file node (typically attributes).
	 * @param element - The file node
	 * @returns Promise resolving to file's child nodes
	 */
	private getFileChildren(element: DdsNode): Thenable<DdsNode[]> {
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

		const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0;
		children.push(
			new DdsNode(
				`⚙️ Attributes`,
				hasAttributes
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None,
				attrGroup
			)
		);

		return Promise.resolve(children);
	};

	/**
	 * Gets children for a record node (attributes and fields/constants).
	 * @param element - The record node
	 * @returns Promise resolving to record's child nodes
	 */
	private getRecordChildren(element: DdsNode): Thenable<DdsNode[]> {
		const children: DdsNode[] = [];

		// Add attributes group
		const recordAttributes = element.ddsElement.attributes ?? [];
		const attrGroup: DdsGroup = {
			kind: 'group',
			attribute: 'Attributes',
			lineIndex: element.ddsElement.lineIndex,
			children: [],
			attributes: recordAttributes,
			indicators: []
		};

		const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0;
		children.push(
			new DdsNode(
				`⚙️ Attributes`,
				hasAttributes
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None,
				attrGroup
			)
		);

		// Add fields and constants group
		const fieldsAndConstants = this.getFieldsAndConstantsForRecord(element.ddsElement.lineIndex);
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

	/**
	 * Gets children for a field node (indicators and attributes).
	 * @param element - The field node
	 * @returns Promise resolving to field's child nodes
	 */
	private getFieldChildren(element: DdsNode): Thenable<DdsNode[]> {
		const children: DdsNode[] = [];
		const fieldIndicators = element.ddsElement.indicators ?? [];
		const fieldAttributes = element.ddsElement.attributes ?? [];

		// Add indicators group
		const indiGroup: DdsGroup = {
			kind: 'group',
			attribute: 'Indicators',
			lineIndex: element.ddsElement.lineIndex,
			children: [],
			attributes: [],
			indicators: fieldIndicators
		};

		// Add attributes group
		const attrGroup: DdsGroup = {
			kind: 'group',
			attribute: 'FieldAttributes',
			lineIndex: element.ddsElement.lineIndex,
			children: [],
			attributes: fieldAttributes,
			indicators: []
		};

		const hasIndicators = indiGroup.indicators && indiGroup.indicators.length > 0;
		children.push(
			new DdsNode(
				`📶 Indicators`,
				hasIndicators
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None,
				indiGroup
			)
		);

		const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0;
		children.push(
			new DdsNode(
				`⚙️ Attributes`,
				hasAttributes
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None,
				attrGroup
			)
		);

		return Promise.resolve(children);
	};

	/**
	 * Gets children for a constant node (indicators and attributes).
	 * @param element - The constant node
	 * @returns Promise resolving to constant's child nodes
	 */
	private getConstantChildren(element: DdsNode): Thenable<DdsNode[]> {
		const children: DdsNode[] = [];
		const constantIndicators = element.ddsElement.indicators ?? [];
		const constantAttributes = element.ddsElement.attributes ?? [];

		// Add indicators group
		const indiGroup: DdsGroup = {
			kind: 'group',
			attribute: 'Indicators',
			lineIndex: element.ddsElement.lineIndex,
			children: [],
			attributes: [],
			indicators: constantIndicators
		};

		// Add attributes group
		const attrGroup: DdsGroup = {
			kind: 'group',
			attribute: 'ConstantAttributes',
			lineIndex: element.ddsElement.lineIndex,
			children: [],
			attributes: constantAttributes,
			indicators: []
		};

		const hasIndicators = indiGroup.indicators && indiGroup.indicators.length > 0;
		children.push(
			new DdsNode(
				`📶 Indicators`,
				hasIndicators
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None,
				indiGroup
			)
		);

		const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0;
		children.push(
			new DdsNode(
				`⚙️ Attributes`,
				hasAttributes
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.None,
				attrGroup
			)
		);

		return Promise.resolve(children);
	};

	/**
	 * Gets children for a group node (attributes, indicators, or nested elements).
	 * @param element - The group node
	 * @returns Promise resolving to group's child nodes
	 */
	private getGroupChildren(element: DdsNode): Thenable<DdsNode[]> {

		const groupAttr = element.ddsElement.attribute ?? '';

		switch (groupAttr) {
			case 'Attributes':
				return this.getAttributesGroupChildren(element);
			case 'ConstantAttributes':
				return this.getConstantAttributesGroupChildren(element);
			case 'FieldAttributes':
				return this.getFieldAttributesGroupChildren(element);
			case 'Indicators':
				return this.getIndicatorsGroupChildren(element);
			default:
				return this.getDefaultGroupChildren(element);
		}
	};

	// GROUP CHILDREN HELPER METHODS

	/**
	 * Gets children for an attributes group.
	 * @param element - The attributes group node
	 * @returns Promise resolving to attribute nodes
	 */
	private getAttributesGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const attrs = group.attributes ?? [];

		return Promise.resolve(
			attrs.length === 0
				? []
				: attrs.map(attr =>
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
	};

	/**
	 * Gets children for a constant attributes group.
	 * @param element - The constant attributes group node
	 * @returns Promise resolving to constant attribute nodes
	 */
	private getConstantAttributesGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const attrs = group.attributes ?? [];

		return Promise.resolve(
			attrs.length === 0
				? []
				: attrs.map(attr =>
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
	};

	/**
	 * Gets children for a field attributes group.
	 * @param element - The field attributes group node
	 * @returns Promise resolving to field attribute nodes
	 */
	private getFieldAttributesGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const attrs = group.attributes ?? [];

		return Promise.resolve(
			attrs.length === 0
				? []
				: attrs.map(attr =>
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
	};

	/**
	 * Gets children for an indicators group.
	 * @param element - The indicators group node
	 * @returns Promise resolving to indicator nodes
	 */
	private getIndicatorsGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const indis = group.indicators ?? [];

		return Promise.resolve(
			indis.length === 0
				? []
				: indis.map(indi =>
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
	};

	/**
	 * Gets children for a default group (records, fields, constants).
	 * @param element - The default group node
	 * @returns Promise resolving to child element nodes
	 */
	private getDefaultGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		return Promise.resolve(
			(element.ddsElement.children ?? []).map(rec =>
				new DdsNode(
					this.getElementLabel(rec),
					this.shouldHaveAttributesGroup(rec)
						? vscode.TreeItemCollapsibleState.Collapsed
						: vscode.TreeItemCollapsibleState.None,
					rec
				)
			)
		);
	};

	// UTILITY METHODS

	/**
	 * Gets fields and constants that belong to a specific record.
	 * @param recordLineIndex - The line index of the record
	 * @returns Array of fields and constants belonging to the record
	 */
	private getFieldsAndConstantsForRecord(recordLineIndex: number): DdsElement[] {
		const nextRecord = this.elements.find(
			el => el.kind === 'record' && el.lineIndex > recordLineIndex
		);
		const nextRecordLine = nextRecord ? nextRecord.lineIndex : Number.MAX_SAFE_INTEGER;

		return this.elements.filter(
			el => (el.kind === 'field' || el.kind === 'constant') &&
				el.lineIndex > recordLineIndex &&
				el.lineIndex < nextRecordLine
		);
	};

	/**
	 * Gets the appropriate label for a DDS element based on its kind.
	 * @param element - The DDS element
	 * @returns The formatted label string
	 */
	private getElementLabel(element: DdsElement): string {
		switch (element.kind) {
			case 'record':
				return `📄 ${element.name}`;
			case 'field':
				return `🔤 ${element.name}`;
			case 'constant':
				return `💡 ${element.name}`;
			default:
				return `📦 ${element.kind}`;
		};
	};
};

// DDS NODE CLASS

/**
 * Represents a node in the DDS tree view.
 * Extends VS Code's TreeItem to provide custom functionality for DDS elements.
 */
export class DdsNode extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly ddsElement: DdsElement
	) {
		super(label, collapsibleState);

		// Configure node properties
		this.tooltip = this.getTooltip(ddsElement);
		this.description = this.getDescription(ddsElement);
		
		if (label === '📂 Records') {
			this.contextValue = 'group:records' 
		} else {
			this.contextValue = ddsElement.kind;
		};

		// Add navigation command if applicable
		if (this.shouldHaveNavigationCommand(ddsElement)) {
			this.command = {
				command: 'ddsEdit.goToLine',
				title: `Go to ${ddsElement.kind}`,
				arguments: [ddsElement.lineIndex + 1]
			};
		}
	}

	/**
	 * Determines if the element should have a navigation command (go to line).
	 * @param ddsElement - The DDS element to check
	 * @returns True if the element should be navigable
	 */
	private shouldHaveNavigationCommand(ddsElement: DdsElement): boolean {
		return (
			ddsElement.lineIndex !== undefined &&
			(ddsElement.kind === 'record' ||
				ddsElement.kind === 'field' ||
				ddsElement.kind === 'constant')
		);
	};

	/**
	 * Gets the description text for the tree node based on element type.
	 * @param ddsElement - The DDS element
	 * @returns The description string to display
	 */
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

	/**
	 * Gets the tooltip text for the tree node.
	 * @param ddsElement - The DDS element
	 * @returns The tooltip string to display on hover
	 */
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
