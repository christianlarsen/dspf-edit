/*
    Christian Larsen, 2025
    "RPG structure"
    dds-aid.providers.ts
*/

import * as vscode from 'vscode';
import * as path from 'path';
import { DdsElement } from './dds-aid.model';
import { describeDdsField, describeDdsConstant, describeDdsRecord, describeDdsFile, getAllDdsElements } from './dds-aid.helper';

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

	getChildren(element?: DdsNode): Thenable<DdsNode[]> {
		const elements = this.elements;

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
				attribute : '',
				attributes : [],
				indicators : []
			});

			return Promise.resolve([fileNode, recordRoot].filter(Boolean) as DdsNode[]);
		};
/*
		// "File"
		if (element.ddsElement.kind === 'file') {
			const attrs = element.ddsElement.attributes ?? [];
			
			return Promise.resolve(
				attrs.map(attr =>
					new DdsNode(`⚙️ ${attr.value}`, vscode.TreeItemCollapsibleState.None, {
						kind: 'attribute',
						lineIndex: attr.lineIndex,
						value: attr.value,
						indicators: [],
						attributes: [],
					})
				)
			);
		};
*/
		// "File"
		if (element.ddsElement.kind === 'file') {
			const children: DdsNode[] = [];
			const attrGroup = this.elements.find(
	  			el => el.kind === 'group' && el.attribute === 'Attributes'
			);
  
			if (attrGroup) {
	  			children.push(
					new DdsNode(`⚙️ Attributes`, vscode.TreeItemCollapsibleState.Collapsed, attrGroup)
	  			);
			};
  
			return Promise.resolve(children);
  		};

		// "Group"
		if (element.ddsElement.kind === 'group') {
			return Promise.resolve(
				(element.ddsElement.children ?? []).map(rec =>
					new DdsNode(
						rec.kind === 'record' ? `📄 ${rec.name}` :
						rec.kind === 'field' ? `🔤 ${rec.name}` :
						rec.kind === 'constant' ? `💡 ${rec.name}` :
						`📦 ${rec.kind}`,
						(rec.attributes?.length && rec.attributes.length > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
						rec
					  )
				)
			);
		};

		// "Record"
		if (element.ddsElement.kind === 'record') {
			const recordLine = element.ddsElement.lineIndex;
			const children = elements.filter(e =>
				(e.kind === 'field' || e.kind === 'constant') &&
				e.lineIndex > recordLine &&
				!elements.some(parent => parent.kind === 'record' && parent.lineIndex > recordLine && parent.lineIndex < e.lineIndex)
			);

			return Promise.resolve(
				children.map(child => {
					
					let label = '';

					if (child.kind === 'field') {
						label = `🔤 ${child.name}`;
					} else if (child.kind === 'constant') {
						label = `💡 ${child.name}`;
					};

					return new DdsNode(
						label,
						(child.attributes?.length && child.attributes.length > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
						child
					  );				  
				})
			);
		};

		// "Field" or "Constant"
		// ????? I have to add here :
		// ????? -> Indicators
		// ????? -> If field, type+size
		// ????? -> Attributes
		if (element.ddsElement.kind === 'field' || element.ddsElement.kind === 'constant') {
			const attrs = element.ddsElement.attributes ?? [];
			return Promise.resolve(
				attrs.map(attr =>
					new DdsNode(`⚙️ ${attr.value}`, vscode.TreeItemCollapsibleState.None, {
						kind: 'attribute',
						lineIndex: attr.lineIndex,
						value: attr.value,
						indicators : [],
						attributes: []
					})
				)
			);
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
			default:
				return '';
		};
	};

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
