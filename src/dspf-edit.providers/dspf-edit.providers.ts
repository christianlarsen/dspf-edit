/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.providers.ts
*/

import * as vscode from 'vscode';
import * as path from 'path';
import { DdsElement, DdsGroup } from '../dspf-edit.model/dspf-edit.model';
import { describeDdsField, describeDdsConstant, describeDdsRecord, describeDdsFile, formatDdsIndicators } from '../dspf-edit.utils/dspf-edit.helper';
import { ExtensionState } from '../dspf-edit.states/state';

/**
 * DDS TREE PROVIDER CLASS
 * Provides the TreeDataProvider for DDS elements, supporting filters, visibility toggles,
 * and a status bar item indicating active filters.
 */
export class DdsTreeProvider implements vscode.TreeDataProvider<DdsNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<DdsNode | undefined | void> = new vscode.EventEmitter<DdsNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<DdsNode | undefined | void> = this._onDidChangeTreeData.event;

	private elements: DdsElement[] = [];

	// Visibility filters: which types of elements and which records to show
	private visibilityFilter: Set<'field' | 'constant'> = new Set(['field', 'constant']);
	private recordFilter: Set<string> = new Set();

	// TreeView instance for expand/collapse operations
	private treeView?: vscode.TreeView<DdsNode>;

	// Refresh the tree view
	refresh(): void { this._onDidChangeTreeData.fire(); };

	// Set all DDS elements, initialize record filter if empty
	setElements(elements: DdsElement[]) {
		this.elements = elements;

		if (this.recordFilter.size === 0) {
			this.elements.filter(e => e.kind === 'record').forEach(r => this.recordFilter.add(r.name));
		}
	};

	/**
	 * Set the TreeView instance (call this when creating the TreeView)
	 */
	setTreeView(treeView: vscode.TreeView<DdsNode>) {
		this.treeView = treeView;
	}

	// Status bar item to show active filters
	private statusBarItem: vscode.StatusBarItem | undefined;

	/**
	 * Initializes the StatusBarItem if it hasn't been created yet.
	 */
	private initStatusBar() {
		if (!this.statusBarItem) {
			this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
			this.statusBarItem.show();
		}
	}

	/**
	 * Updates the StatusBarItem to reflect the currently active filters.
	 * If all elements are visible, the status bar is hidden.
	 */
	private updateStatusBar() {
		if (!this.statusBarItem) this.initStatusBar();

		if (!this.statusBarItem) return;

		const allRecords = this.elements.filter(e => e.kind === 'record').map(r => r.name);
		const allTypes: ('field' | 'constant')[] = ['field', 'constant'];

		const recordsFiltered = this.recordFilter.size > 0 && this.recordFilter.size !== allRecords.length;
		const typesFiltered = this.visibilityFilter.size > 0 && this.visibilityFilter.size !== allTypes.length;

		if (!recordsFiltered && !typesFiltered) {
			this.statusBarItem.hide();
			return;
		}

		let statusText = '';
		if (recordsFiltered) statusText += `Records: ${[...this.recordFilter].join(', ')} `;
		if (typesFiltered) statusText += `Types: ${[...this.visibilityFilter].join(', ')}`;

		this.statusBarItem.text = `$(filter) ${statusText}`;
		this.statusBarItem.show();
	}

	/**
	 * Show the QuickPick menu to filter records and element types.
	 * Updates the tree view and status bar after selection.
	 */
	async showFilterMenu() {
		// Initialize status bar if not created yet
		this.initStatusBar();

		// Select which records to show
		const recordItems = this.elements
			.filter(e => e.kind === 'record')
			.map(e => ({ label: `📄 ${e.name}`, name: e.name }));

		const selectedRecords = await vscode.window.showQuickPick(recordItems, {
			canPickMany: true,
			placeHolder: 'Select records to show',
		});

		if (selectedRecords !== undefined) {
			this.recordFilter = new Set(selectedRecords.map(r => r.name));
		}

		// Select which element types to show, default all selected
		const allElementTypes: ('field' | 'constant')[] = ['field', 'constant'];
		const elementItems = allElementTypes.map(type => ({
			label: type === 'field' ? '🔤 Fields' : '💡 Constants',
			type: type,
			picked: this.visibilityFilter.has(type) || this.visibilityFilter.size === 0
		}));

		const selectedElements = await vscode.window.showQuickPick(elementItems, {
			canPickMany: true,
			placeHolder: 'Select element types to show'
		});

		if (selectedElements !== undefined) {
			this.visibilityFilter = new Set(selectedElements.map(e => e.type as 'field' | 'constant'));
			if (this.visibilityFilter.size === 0) {
				// If none selected, restore all types
				this.visibilityFilter = new Set(allElementTypes);
			}
		}

		// Refresh tree and update status bar
		this.refresh();
		this.updateStatusBar();
	};

	/**
	 * Toggle visibility of a specific element type (field or constant)
	 */
	toggleVisibility(kind: 'field' | 'constant') {
		if (this.visibilityFilter.has(kind)) this.visibilityFilter.delete(kind);
		else this.visibilityFilter.add(kind);
		this.refresh();
	};

	/**
	 * Show all records and element types
	 */
	showAll() {
		this.visibilityFilter = new Set(['field', 'constant']);
		this.recordFilter.clear(); // show all records
		this.refresh();
		this.updateStatusBar();
		vscode.window.showInformationMessage('Showing all element types and records');
	};

	/**
	 * Hide all records and element types
	 */
	hideAll() {
		this.visibilityFilter.clear();
		this.recordFilter.clear();
		this.refresh();
		vscode.window.showInformationMessage('All element types and records hidden');
	};

	// Helper methods to check if an element or record is visible
	private isVisibleKind(kind: 'field' | 'constant'): boolean { return this.visibilityFilter.has(kind); }
	private isVisibleRecord(name: string): boolean { return this.recordFilter.size === 0 || this.recordFilter.has(name); }

	// TreeDataProvider required methods
	getTreeItem(element: DdsNode): vscode.TreeItem { return element; }

	/**
	 * Get the parent of a node (required for reveal() to work)
	 */
	getParent(element: DdsNode): vscode.ProviderResult<DdsNode> {
		// If element has no lineIndex or is at root level, it has no parent
		if (element.ddsElement.lineIndex === -1 || element.ddsElement.kind === 'file') {
			return undefined;
		}

		// Handle group nodes
		if (element.ddsElement.kind === 'group') {
			const groupAttr = element.ddsElement.attribute ?? '';
			
			// "Records" group is at root level
			if (groupAttr === '') {
				return undefined;
			}
			
			// Other groups belong to their parent element
			const parentElement = this.elements.find(el => 
				el.lineIndex === element.ddsElement.lineIndex
			);
			
			if (parentElement) {
				return new DdsNode(
					this.getElementLabel(parentElement),
					vscode.TreeItemCollapsibleState.Collapsed,
					parentElement
				);
			}
			return undefined;
		}

		// Handle attributes and indicators - they belong to a group
		if (['attribute', 'constantAttribute', 'fieldAttribute', 'indicatornode'].includes(element.ddsElement.kind)) {
			const parentElement = this.elements.find(el => 
				el.lineIndex === element.ddsElement.lineIndex
			);
			
			if (parentElement) {
				// Return the appropriate group node
				let groupLabel = '';
				let groupAttribute = '';
				
				if (element.ddsElement.kind === 'indicatornode') {
					groupLabel = '📶 Indicators';
					groupAttribute = 'Indicators';
				} else if (element.ddsElement.kind === 'attribute') {
					groupLabel = '⚙️ Attributes';
					groupAttribute = 'Attributes';
				} else if (element.ddsElement.kind === 'constantAttribute') {
					groupLabel = '⚙️ Attributes';
					groupAttribute = 'ConstantAttributes';
				} else if (element.ddsElement.kind === 'fieldAttribute') {
					groupLabel = '⚙️ Attributes';
					groupAttribute = 'FieldAttributes';
				}
				
				const groupNode: DdsGroup = {
					kind: 'group',
					attribute: groupAttribute,
					lineIndex: parentElement.lineIndex,
					children: [],
					attributes: parentElement.attributes ?? [],
					indicators: parentElement.indicators ?? []
				};
				
				return new DdsNode(groupLabel, vscode.TreeItemCollapsibleState.Collapsed, groupNode);
			}
			return undefined;
		}

		// Handle fields and constants - find their parent record
		if (element.ddsElement.kind === 'field' || element.ddsElement.kind === 'constant') {
			const parentRecord = this.elements.find(el => 
				el.kind === 'record' && 
				el.lineIndex < element.ddsElement.lineIndex &&
				(!this.elements.find(nextRec => 
					nextRec.kind === 'record' && 
					nextRec.lineIndex > el.lineIndex && 
					nextRec.lineIndex < element.ddsElement.lineIndex
				))
			);
			
			if (parentRecord) {
				// Fields and constants are inside "Fields and Constants" group
				const fieldsGroup: DdsGroup = {
					kind: 'group',
					attribute: 'FieldsAndConstants',
					lineIndex: parentRecord.lineIndex,
					children: [],
					attributes: [],
					indicators: []
				};
				
				return new DdsNode('🧾 Fields and Constants', vscode.TreeItemCollapsibleState.Collapsed, fieldsGroup);
			}
			return undefined;
		}

		// Handle records - their parent is the "Records" group
		if (element.ddsElement.kind === 'record') {
			const recordsGroup: DdsGroup = {
				kind: 'group',
				attribute: '',
				lineIndex: -1,
				children: this.elements.filter(e => e.kind === 'record'),
				attributes: [],
				indicators: []
			};
			
			return new DdsNode('📂 Records', vscode.TreeItemCollapsibleState.Expanded, recordsGroup);
		}

		return undefined;
	}

	getChildren(element?: DdsNode): Thenable<DdsNode[]> {
		if (!element) return this.getRootChildren(this.elements);

		switch (element.ddsElement.kind) {
			case 'file': return this.getFileChildren(element);
			case 'record': return this.getRecordChildren(element);
			case 'field': return this.getFieldChildren(element);
			case 'constant': return this.getConstantChildren(element);
			case 'group': return this.getGroupChildren(element);
			default: return Promise.resolve([]);
		}
	}

	/**
	 * Root level children: file and records
	 */
	private getRootChildren(elements: DdsElement[]): Thenable<DdsNode[]> {
		const file = elements.find(e => e.kind === 'file');
		const editor = ExtensionState.lastDdsEditor || vscode.window.activeTextEditor;
		const fileName = editor ? path.basename(editor.document.fileName) : 'Unknown';
		const fileNode = file ? new DdsNode(`📂 File (${fileName})`, vscode.TreeItemCollapsibleState.Collapsed, file) : undefined;

		const visibleRecords = elements.filter(e => e.kind === 'record' && this.isVisibleRecord(e.name));

		const recordRoot = new DdsNode(
			`📂 Records`,
			visibleRecords.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
			{ kind: 'group', children: visibleRecords, lineIndex: -1, attribute: '', attributes: [], indicators: [] }
		);

		return Promise.resolve([fileNode, recordRoot].filter(Boolean) as DdsNode[]);
	}

	/**
	 * Return children for a file node (attributes)
	 */
	private getFileChildren(element: DdsNode): Thenable<DdsNode[]> {
		const children: DdsNode[] = [];
		const fileAttributes = element.ddsElement.attributes ?? [];

		const attrGroup: DdsGroup = { kind: 'group', attribute: 'Attributes', lineIndex: element.ddsElement.lineIndex, children: [], attributes: fileAttributes, indicators: [] };
		const hasAttributes = (attrGroup.attributes) ? attrGroup.attributes.length > 0 : false;
		children.push(new DdsNode(`⚙️ Attributes`, hasAttributes ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, attrGroup));

		return Promise.resolve(children);
	}

	/**
	 * Return children for a record node, including fields and constants
	 */
	private getRecordChildren(element: DdsNode): Thenable<DdsNode[]> {
		const children: DdsNode[] = [];

		const recordAttributes = element.ddsElement.attributes ?? [];
		const attrGroup: DdsGroup = { kind: 'group', attribute: 'Attributes', lineIndex: element.ddsElement.lineIndex, children: [], attributes: recordAttributes, indicators: [] };
		const hasAttributes = (attrGroup.attributes) ? attrGroup.attributes.length > 0 : false;
		children.push(new DdsNode(`⚙️ Attributes`, hasAttributes ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, attrGroup));

		const fieldsAndConstants = this.getFieldsAndConstantsForRecord(element.ddsElement.lineIndex)
			.filter(el => this.isVisibleKind(el.kind as 'field' | 'constant'));

		if (fieldsAndConstants.length > 0) {
			children.push(new DdsNode(`🧾 Fields and Constants`, vscode.TreeItemCollapsibleState.Collapsed, { kind: 'group', attribute: 'FieldsAndConstants', children: fieldsAndConstants, lineIndex: element.ddsElement.lineIndex }));
		}

		return Promise.resolve(children);
	}

	/**
	 * Return children for a field node
	 */
	private getFieldChildren(element: DdsNode): Thenable<DdsNode[]> {
		const children: DdsNode[] = [];
		const fieldIndicators = element.ddsElement.indicators ?? [];
		const fieldAttributes = element.ddsElement.attributes ?? [];

		const indiGroup: DdsGroup = { kind: 'group', attribute: 'Indicators', lineIndex: element.ddsElement.lineIndex, children: [], attributes: [], indicators: fieldIndicators };
		const attrGroup: DdsGroup = { kind: 'group', attribute: 'FieldAttributes', lineIndex: element.ddsElement.lineIndex, children: [], attributes: fieldAttributes, indicators: [] };

		const hasIndicators = (indiGroup.indicators) ? indiGroup.indicators.length > 0 : false;
		children.push(new DdsNode(`📶 Indicators`, hasIndicators ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, indiGroup));

		const hasAttributes = (attrGroup.attributes) ? attrGroup.attributes.length > 0 : false;
		children.push(new DdsNode(`⚙️ Attributes`, hasAttributes ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, attrGroup));

		return Promise.resolve(children);
	}

	/**
	 * Return children for a constant node
	 */
	private getConstantChildren(element: DdsNode): Thenable<DdsNode[]> {
		const children: DdsNode[] = [];
		const constantIndicators = element.ddsElement.indicators ?? [];
		const constantAttributes = element.ddsElement.attributes ?? [];

		const indiGroup: DdsGroup = { kind: 'group', attribute: 'Indicators', lineIndex: element.ddsElement.lineIndex, children: [], attributes: [], indicators: constantIndicators };
		const attrGroup: DdsGroup = { kind: 'group', attribute: 'ConstantAttributes', lineIndex: element.ddsElement.lineIndex, children: [], attributes: constantAttributes, indicators: [] };

		const hasIndicators = (indiGroup.indicators) ? indiGroup.indicators.length > 0 : false;
		children.push(new DdsNode(`📶 Indicators`, hasIndicators ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, indiGroup));

		const hasAttributes = (attrGroup.attributes) ? attrGroup.attributes.length > 0 : false;
		children.push(new DdsNode(`⚙️ Attributes`, hasAttributes ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, attrGroup));

		return Promise.resolve(children);
	}

	/**
	 * Return children for a group node
	 */
	private getGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const groupAttr = element.ddsElement.attribute ?? '';
		switch (groupAttr) {
			case 'Attributes': return this.getAttributesGroupChildren(element);
			case 'ConstantAttributes': return this.getConstantAttributesGroupChildren(element);
			case 'FieldAttributes': return this.getFieldAttributesGroupChildren(element);
			case 'Indicators': return this.getIndicatorsGroupChildren(element);
			default: return this.getDefaultGroupChildren(element);
		}
	}

	private getAttributesGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const attrs = group.attributes ?? [];
		return Promise.resolve(attrs.map(attr => new DdsNode(`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `, vscode.TreeItemCollapsibleState.None, { ...attr, kind: 'attribute', lineIndex: attr.lineIndex ?? group.lineIndex })));
	}

	private getConstantAttributesGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const attrs = group.attributes ?? [];
		return Promise.resolve(attrs.map(attr => new DdsNode(`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `, vscode.TreeItemCollapsibleState.None, { ...attr, kind: 'constantAttribute', lineIndex: attr.lineIndex ?? group.lineIndex, lastLineIndex: attr.lastLineIndex ?? group.lineIndex })));
	}

	private getFieldAttributesGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const attrs = group.attributes ?? [];
		return Promise.resolve(attrs.map(attr => new DdsNode(`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `, vscode.TreeItemCollapsibleState.None, { ...attr, kind: 'fieldAttribute', lineIndex: attr.lineIndex ?? group.lineIndex, lastLineIndex: attr.lastLineIndex ?? group.lineIndex })));
	}

	private getIndicatorsGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const indis = group.indicators ?? [];
		return Promise.resolve(indis.map(indi => new DdsNode(`${indi.number.toString().padStart(2, '0')}: ${indi.active ? 'ON' : 'OFF'}`, vscode.TreeItemCollapsibleState.None, { kind: 'indicatornode', indicator: indi, attributes: [], indicators: [], lineIndex: 0 })));
	}

	private getDefaultGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		return Promise.resolve((element.ddsElement.children ?? []).map(rec => new DdsNode(this.getElementLabel(rec), (rec.kind === 'record' || rec.kind === 'field' || rec.kind === 'constant') ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, rec)));
	}

	/**
	 * Get fields and constants belonging to a record
	 */
	private getFieldsAndConstantsForRecord(recordLineIndex: number): DdsElement[] {
		const nextRecord = this.elements.find(el => el.kind === 'record' && el.lineIndex > recordLineIndex);
		const nextRecordLine = nextRecord ? nextRecord.lineIndex : Number.MAX_SAFE_INTEGER;
		return this.elements.filter(el => (el.kind === 'field' || el.kind === 'constant') && el.lineIndex > recordLineIndex && el.lineIndex < nextRecordLine);
	}

	/**
	 * Generate a label for a DDS element with an icon
	 */
	private getElementLabel(element: DdsElement): string {
		switch (element.kind) {
			case 'record': return `📄 ${element.name}`;
			case 'field': return `🔤 ${element.name}`;
			case 'constant': return `💡 ${element.name}`;
			default: return `📦 ${element.kind}`;
		}
	}

	/**
 	 * Expands all nodes in the tree recursively
 	 */
	async expandAll() {
		if (!this.treeView) {
			vscode.window.showWarningMessage('TreeView not available');
			return;
		}
		
		// Get root nodes and expand them recursively
		const rootNodes = await this.getChildren();
		for (const rootNode of rootNodes) {
			await this.expandNodeRecursively(rootNode);
		}
		
		vscode.window.showInformationMessage('Tree expanded');
	}

	/**
	 * Collapses all nodes in the tree
	 */
	async collapseAll() {
		if (!this.treeView) {
			vscode.window.showWarningMessage('TreeView not available');
			return;
		}
		
		// Refresh the tree which will reset expansion state
		this._onDidChangeTreeData.fire(undefined);
		
		vscode.window.showInformationMessage('Tree collapsed');
	}

	/**
	 * Recursively expands a node and all its children
	 */
	private async expandNodeRecursively(node: DdsNode) {
		// Skip nodes that cannot be expanded
		if (node.collapsibleState === vscode.TreeItemCollapsibleState.None) {
			return;
		}

		// Expand current node first
		try {
			await this.treeView?.reveal(node, { 
				select: false, 
				focus: false, 
				expand: true 
			});
		} catch (error) {
			// Silently ignore reveal errors (node might not be visible due to filters)
			return;
		}

		// Get children and expand them recursively
		const children = await this.getChildren(node);
		for (const child of children) {
			await this.expandNodeRecursively(child);
		}
	}
}

/**
 * DDS NODE CLASS
 * Represents each node in the TreeView. Configures label, tooltip, description,
 * context menu value, and navigation command to go to the line in the editor.
 */
export class DdsNode extends vscode.TreeItem {
	constructor(public readonly label: string, public readonly collapsibleState: vscode.TreeItemCollapsibleState, public readonly ddsElement: DdsElement) {
		super(label, collapsibleState);
		this.tooltip = this.getTooltip(ddsElement);
		this.description = this.getDescription(ddsElement);
		this.contextValue = label.includes('📂 Records') ? 'group:records' : ddsElement.kind;

		if (this.shouldHaveNavigationCommand(ddsElement)) {
			this.command = { command: 'ddsEdit.goToLine', title: `Go to ${ddsElement.kind}`, arguments: [ddsElement.lineIndex + 1] };
		}
	}

	private shouldHaveNavigationCommand(ddsElement: DdsElement): boolean {
		return ddsElement.lineIndex !== undefined && ['record', 'field', 'constant', 'attribute', 'constantAttribute', 'fieldAttribute'].includes(ddsElement.kind);
	}

	private getDescription(ddsElement: DdsElement): string {
		switch (ddsElement.kind) {
			case 'file': return describeDdsFile(ddsElement);
			case 'record': return describeDdsRecord(ddsElement);
			case 'field': return describeDdsField(ddsElement);
			case 'constant': return describeDdsConstant(ddsElement);
			case 'attribute': return '';
			case 'constantAttribute':
			case 'fieldAttribute': return formatDdsIndicators(ddsElement.indicators);
			default: return '';
		}
	}

	private getTooltip(ddsElement: DdsElement): string {
		switch (ddsElement.kind) {
			case 'record':
			case 'field':
			case 'constant':
			case 'attribute':
			case 'file': return ddsElement.kind;
			default: return '';
		}
	}
}