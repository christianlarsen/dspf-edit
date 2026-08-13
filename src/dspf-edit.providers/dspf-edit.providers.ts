/*
	Christian Larsen, 2025
	"RPG structure"
	dspf-edit.providers.ts
*/

import * as vscode from 'vscode';
import * as path from 'path';
import { DdsElement, DdsGroup, DdsIndicator, groupIndicatorsByCondition } from '../dspf-edit.model/dspf-edit.model';
import { describeDdsField, describeDdsConstant, describeDdsRecord, describeDdsFile, formatDdsIndicators, formatIndicatorCondition } from '../dspf-edit.utils/dspf-edit.helper';
import { ExtensionState } from '../dspf-edit.states/state';
import { getResolvedRef, getPendingReferencedFields } from '../dspf-edit.ibmi/dspf-edit.ibmi-integration';
import { moveRecordInSource } from '../dspf-edit.commands/dspf-edit.move-record';

/**
 * Estructura para guardar los filtros de un documento específico
 */
interface DocumentFilter {
	visibilityFilter: Set<'field' | 'constant'>;
	recordFilter: Set<string>;
	/** Whether recordFilter has been seeded for this document yet. Needed to tell an intentional
	 * "hide all" (empty recordFilter) apart from a brand-new document that just hasn't been
	 * initialized yet — both look like an empty set otherwise. */
	initialized: boolean;
	/** Every record name seen as of the last setElements() call, filtered or not — used to detect
	 * newly-added records (as opposed to ones that were already there but filtered out). */
	knownRecords: Set<string>;
}

/**
 * DDS TREE PROVIDER CLASS
 * Provides the TreeDataProvider for DDS elements, supporting filters per document,
 * visibility toggles, and a status bar item indicating active filters.
 */
export class DdsTreeProvider implements vscode.TreeDataProvider<DdsNode>, vscode.TreeDragAndDropController<DdsNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<DdsNode | undefined | void> = new vscode.EventEmitter<DdsNode | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<DdsNode | undefined | void> = this._onDidChangeTreeData.event;

	private elements: DdsElement[] = [];

	// Mapa de filtros por documento (URI del documento como clave)
	private documentFilters: Map<string, DocumentFilter> = new Map();

	// Filtro por defecto para nuevos documentos
	private defaultFilter: DocumentFilter = {
		visibilityFilter: new Set(['field', 'constant']),
		recordFilter: new Set(),
		initialized: false,
		knownRecords: new Set()
	};

	// TreeView instance for expand/collapse operations
	private treeView?: vscode.TreeView<DdsNode>;

	// Status bar item to show active filters
	private statusBarItem: vscode.StatusBarItem | undefined;

	// Status bar item showing how many referenced fields are still pending resolution
	private pendingRefStatusBarItem: vscode.StatusBarItem | undefined;

	// Refresh the tree view
	refresh(): void {
		this._onDidChangeTreeData.fire();
		this.updatePendingRefStatusBar();
	}

	/**
	 * Gets the currently loaded DDS elements (the parsed tree for the active document).
	 */
	getElements(): DdsElement[] {
		return this.elements;
	}

	// Set all DDS elements, initialize record filter if empty for current document
	setElements(elements: DdsElement[]) {
		this.elements = elements;

		const filter = this.getCurrentFilter();
		const recordNames = this.elements.filter(e => e.kind === 'record').map(r => r.name);
		const currentRecordNames = new Set(recordNames);

		if (!filter.initialized) {
			// Brand-new document: seed the filter with every record, so nothing is hidden by
			// default. Only happens once — an explicit "Hide all" afterwards must stick.
			filter.recordFilter = new Set(recordNames);
			filter.initialized = true;
		} else {
			const newRecords = recordNames.filter(name => !filter.knownRecords.has(name));
			// "Partially" filtered = some records are actively hidden (not none, not all) — a
			// brand-new record would silently vanish into that hidden set with no obvious cause.
			const wasPartiallyFiltered = filter.recordFilter.size > 0 && filter.recordFilter.size < filter.knownRecords.size;

			if (newRecords.length > 0 && wasPartiallyFiltered) {
				// Rather than leave the new record(s) invisible for no apparent reason, disable
				// the record filter entirely (show everything) and let the user know why.
				filter.recordFilter = new Set(recordNames);

				const docName = ExtensionState.lastDdsDocument ? path.basename(ExtensionState.lastDdsDocument.uri.fsPath) : 'this document';
				vscode.window.showWarningMessage(
					`New record${newRecords.length > 1 ? 's' : ''} (${newRecords.join(', ')}) detected in ${docName} — record filter disabled so it's visible.`
				);
			} else {
				// Prune record names that no longer exist (renamed/removed). Any new record is
				// silently included too, unless the filter was intentionally emptied ("Hide all"),
				// which stays that way.
				const pruned = new Set([...filter.recordFilter].filter(name => currentRecordNames.has(name)));
				// recordFilter is empty in two different cases that look identical otherwise: the
				// user explicitly hid every record (must stick), or no record existed yet to filter
				// in the first place (a brand-new DSPF) — knownRecords being empty means the latter,
				// so a record appearing for the first time must always become visible.
				if (filter.recordFilter.size > 0 || filter.knownRecords.size === 0) {
					for (const name of newRecords) {
						pruned.add(name);
					};
				};
				filter.recordFilter = pruned;
			};
		};

		filter.knownRecords = currentRecordNames;
		this.setCurrentFilter(filter);

		// Actualizar el status bar después de establecer los elementos
		// con un pequeño delay para evitar parpadeos
		// (el status bar de campos referenciados pendientes no lo necesita: ya se actualiza en
		// refresh(), que todo llamador de setElements() invoca justo a continuación)
		setTimeout(() => this.updateStatusBar(), 50);
	}

	/**
	 * Set the TreeView instance (call this when creating the TreeView)
	 */
	setTreeView(treeView: vscode.TreeView<DdsNode>) {
		this.treeView = treeView;
	}

	/**
	 * Gets the TreeView instance, e.g. to listen for selection changes.
	 */
	getTreeView(): vscode.TreeView<DdsNode> | undefined {
		return this.treeView;
	}

	/**
	 * Finds the tree node for the field or constant at the given source line, by traversing the
	 * tree via getChildren (mirroring how expandNodeRecursively walks it) so the returned node is
	 * one TreeView.reveal() can actually locate. Used to sync the tree selection with a click in
	 * the record preview. Returns undefined if the item is filtered out or no longer exists.
	 * @param lineIndex - Zero-based source line index of the field/constant to find
	 */
	async findFieldOrConstantNode(lineIndex: number): Promise<DdsNode | undefined> {
		const search = async (node?: DdsNode): Promise<DdsNode | undefined> => {
			const children = await this.getChildren(node);
			for (const child of children) {
				if ((child.ddsElement.kind === 'field' || child.ddsElement.kind === 'constant') && child.ddsElement.lineIndex === lineIndex) {
					return child;
				}
				const found = await search(child);
				if (found) {
					return found;
				}
			}
			return undefined;
		};
		return search(undefined);
	}

	/**
	 * Gets the current document URI as a string.
	 * @returns The URI string of the current document or undefined
	 */
	private getCurrentDocumentUri(): string | undefined {
		return ExtensionState.lastDdsDocument?.uri.toString();
	}

	/**
	 * Gets the filter for the current document.
	 * @returns The filter for the current document
	 */
	private getCurrentFilter(): DocumentFilter {
		const uri = this.getCurrentDocumentUri();
		if (!uri) {
			return { ...this.defaultFilter };
		}

		if (!this.documentFilters.has(uri)) {
			// Crear una copia del filtro por defecto para este documento
			this.documentFilters.set(uri, {
				visibilityFilter: new Set(this.defaultFilter.visibilityFilter),
				recordFilter: new Set(this.defaultFilter.recordFilter),
				initialized: false,
				knownRecords: new Set()
			});
		}

		return this.documentFilters.get(uri)!;
	}

	/**
	 * Sets the filter for the current document.
	 * @param filter - The new filter
	 */
	private setCurrentFilter(filter: DocumentFilter): void {
		const uri = this.getCurrentDocumentUri();
		if (uri) {
			this.documentFilters.set(uri, filter);
		}
	}

	/**
	 * Cleans up the filter for a closed document.
	 * @param documentUri - The URI of the closed document
	 */
	cleanupDocumentFilter(documentUri: string): void {
		this.documentFilters.delete(documentUri);
	}

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
	 * Updates the StatusBarItem to reflect the currently active filters for current document.
	 * If all elements are visible, the status bar is hidden.
	 */
	private updateStatusBar() {
		if (!this.statusBarItem) this.initStatusBar();
		if (!this.statusBarItem) return;

		const filter = this.getCurrentFilter();
		const allRecords = this.elements.filter(e => e.kind === 'record').map(r => r.name);
		const allTypes: ('field' | 'constant')[] = ['field', 'constant'];

		// Solo está filtrado si hay registros seleccionados pero no todos
		const recordsFiltered = filter.recordFilter.size > 0 &&
			filter.recordFilter.size < allRecords.length;

		// Solo está filtrado si hay tipos seleccionados pero no todos
		const typesFiltered = filter.visibilityFilter.size > 0 &&
			filter.visibilityFilter.size < allTypes.length;

		if (!recordsFiltered && !typesFiltered) {
			this.statusBarItem.hide();
			return;
		}

		const docName = ExtensionState.lastDdsDocument ?
			path.basename(ExtensionState.lastDdsDocument.uri.fsPath) : '';

		let statusText = docName ? `${docName} ` : '';
		if (recordsFiltered) statusText += `Records: ${[...filter.recordFilter].join(', ')} `;
		if (typesFiltered) statusText += `Types: ${[...filter.visibilityFilter].join(', ')}`;

		this.statusBarItem.text = `$(filter) ${statusText}`;
		this.statusBarItem.show();
	}

	/**
	 * Initializes the pending-referenced-fields StatusBarItem if it hasn't been created yet.
	 */
	private initPendingRefStatusBar() {
		if (!this.pendingRefStatusBarItem) {
			this.pendingRefStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
			this.pendingRefStatusBarItem.command = 'dspf-edit.resolve-all-referenced-fields';
			this.pendingRefStatusBarItem.tooltip = 'Click to resolve all pending referenced fields from the connected IBM i';
		}
	}

	/**
	 * Updates the pending-referenced-fields StatusBarItem for the current document. Hidden when
	 * there are none (nothing pending, or no document loaded).
	 */
	private updatePendingRefStatusBar() {
		if (!this.pendingRefStatusBarItem) this.initPendingRefStatusBar();
		if (!this.pendingRefStatusBarItem) return;

		const documentUri = this.getCurrentDocumentUri();
		const pending = documentUri ? getPendingReferencedFields(documentUri, this.elements) : [];

		if (pending.length === 0) {
			this.pendingRefStatusBarItem.hide();
			return;
		}

		this.pendingRefStatusBarItem.text = `$(cloud-download) ${pending.length} referenced field${pending.length > 1 ? 's' : ''} pending`;
		this.pendingRefStatusBarItem.show();
	}

	/**
	 * Public method to update the status bar for the current document.
	 * Call this when switching documents.
	 */
	updateStatusBarForCurrentDocument() {
		this.updateStatusBar();
	}

	/**
	 * Show the QuickPick menu to filter records and element types for current document.
	 * Updates the tree view and status bar after selection.
	 */
	async showFilterMenu() {
		// Initialize status bar if not created yet
		this.initStatusBar();

		const filter = this.getCurrentFilter();

		// Select which records to show
		const recordItems = this.elements
			.filter(e => e.kind === 'record')
			.map(e => ({
				label: `📄 ${e.name}`,
				name: e.name,
				picked: filter.recordFilter.has(e.name)
			}));

		const selectedRecords = await vscode.window.showQuickPick(recordItems, {
			canPickMany: true,
			placeHolder: 'Select records to show',
		});

		if (selectedRecords !== undefined) {
			// Leaving none checked is a valid (if unusual) choice — it means "hide all records",
			// same as the "Hide all" command; it's not silently reinterpreted as "show all".
			filter.recordFilter = new Set(selectedRecords.map(r => r.name));
		}

		// Select which element types to show
		const allElementTypes: ('field' | 'constant')[] = ['field', 'constant'];
		const elementItems = allElementTypes.map(type => ({
			label: type === 'field' ? '🔤 Fields' : '💡 Constants',
			type: type,
			picked: filter.visibilityFilter.has(type)
		}));

		const selectedElements = await vscode.window.showQuickPick(elementItems, {
			canPickMany: true,
			placeHolder: 'Select element types to show'
		});

		if (selectedElements !== undefined) {
			// Same as above: leaving none checked means "hide all types", not a fallback to "all".
			filter.visibilityFilter = new Set(selectedElements.map(e => e.type as 'field' | 'constant'));
		}

		// Guardar filtro actualizado
		filter.initialized = true;
		this.setCurrentFilter(filter);

		// Refresh tree and update status bar
		this.refresh();
		this.updateStatusBar();
	}
	
	/**
	 * Toggle visibility of a specific element type (field or constant) for current document
	 */
	toggleVisibility(kind: 'field' | 'constant') {
		const filter = this.getCurrentFilter();
		if (filter.visibilityFilter.has(kind)) {
			filter.visibilityFilter.delete(kind);
		} else {
			filter.visibilityFilter.add(kind);
		}
		filter.initialized = true;
		this.setCurrentFilter(filter);
		this.refresh();
		this.updateStatusBar();
	}

	/**
	 * Show all records and element types for current document
	 */
	showAll() {
		const filter = this.getCurrentFilter();
		filter.visibilityFilter = new Set(['field', 'constant']);
		filter.recordFilter = new Set(this.elements.filter(e => e.kind === 'record').map(r => r.name));
		filter.initialized = true;
		this.setCurrentFilter(filter);

		this.refresh();
		this.updateStatusBar();

		const docName = ExtensionState.lastDdsDocument ?
			path.basename(ExtensionState.lastDdsDocument.uri.fsPath) : 'this document';
		vscode.window.showInformationMessage(`Showing all elements in ${docName}`);
	}

	/**
	 * Hide all records and element types for current document
	 */
	hideAll() {
		const filter = this.getCurrentFilter();
		filter.visibilityFilter.clear();
		filter.recordFilter.clear();
		filter.initialized = true;
		this.setCurrentFilter(filter);

		this.refresh();
		this.updateStatusBar();

		const docName = ExtensionState.lastDdsDocument ?
			path.basename(ExtensionState.lastDdsDocument.uri.fsPath) : 'this document';
		vscode.window.showInformationMessage(`All elements hidden in ${docName}`);
	}

	// Helper methods to check if an element or record is visible in current document
	private isVisibleKind(kind: 'field' | 'constant'): boolean {
		return this.getCurrentFilter().visibilityFilter.has(kind);
	}

	private isVisibleRecord(name: string): boolean {
		return this.getCurrentFilter().recordFilter.has(name);
	}

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
	 * Root level children: file and records (filtered by current document filter)
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
	 * Return children for a record node, including fields and constants (filtered by current document)
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
		// One AND-group of an OR'd indicator condition (see getIndicatorsGroupChildren) — carries its
		// own group index as a suffix, so it can't be a fixed switch case like the others below.
		if (groupAttr.startsWith('IndicatorGroup:')) {
			return this.getIndicatorLeafNodes((element.ddsElement as DdsGroup).indicators ?? []);
		}
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

	/**
	 * Indicator leaf nodes for a single AND-group (each one a plain "51: ON" row) — shared by the
	 * flat single-group case and each OR'd sub-group below.
	 */
	private getIndicatorLeafNodes(indis: DdsIndicator[]): Thenable<DdsNode[]> {
		return Promise.resolve(indis.map(indi => new DdsNode(`${indi.number.toString().padStart(2, '0')}: ${indi.active ? 'ON' : 'OFF'}`, vscode.TreeItemCollapsibleState.None, { kind: 'indicatornode', indicator: indi, attributes: [], indicators: [], lineIndex: 0 })));
	}

	/**
	 * Children of the "📶 Indicators" node. When the condition is a single AND-group (the
	 * overwhelming common case: one line, up to 3 indicators, no continuation), this stays a flat
	 * list exactly as before. When it spans several OR'd AND-groups (continuation lines — see
	 * DdsIndicator.group), each group gets its own expandable node, with a plain "OR" row between
	 * them so the boolean structure is visible at a glance.
	 */
	private getIndicatorsGroupChildren(element: DdsNode): Thenable<DdsNode[]> {
		const group = element.ddsElement as DdsGroup;
		const indis = group.indicators ?? [];
		const conditionGroups = groupIndicatorsByCondition(indis);

		if (conditionGroups.length <= 1) {
			return this.getIndicatorLeafNodes(indis);
		}

		const nodes: DdsNode[] = [];
		conditionGroups.forEach((conditionGroup, i) => {
			if (i > 0) {
				nodes.push(new DdsNode('──── OR ────', vscode.TreeItemCollapsibleState.None,
					{ kind: 'group', attribute: '', lineIndex: group.lineIndex, children: [], attributes: [], indicators: [] }));
			};
			nodes.push(new DdsNode(`Group ${i + 1} (AND)`, vscode.TreeItemCollapsibleState.Expanded,
				{ kind: 'group', attribute: `IndicatorGroup:${i}`, lineIndex: group.lineIndex, children: [], attributes: [], indicators: conditionGroup } as DdsGroup));
		});
		return Promise.resolve(nodes);
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

	// DRAG AND DROP (records only, for now — reordering them in the tree reorders their whole
	// block of lines in the DDS source; see dspf-edit.move-record.ts for the actual line move)

	readonly dropMimeTypes = ['application/vnd.code.tree.dspf-edit.schema-view'];
	readonly dragMimeTypes = ['application/vnd.code.tree.dspf-edit.schema-view'];

	/**
	 * Starts a drag only when exactly one record node is being dragged — any other selection
	 * (fields, constants, multi-select, group nodes) sets no transfer data, which makes them
	 * silently non-draggable.
	 */
	handleDrag(source: readonly DdsNode[], dataTransfer: vscode.DataTransfer): void {
		if (source.length !== 1 || source[0].ddsElement.kind !== 'record') {
			return;
		};

		dataTransfer.set(
			this.dragMimeTypes[0],
			new vscode.DataTransferItem(source[0].ddsElement.lineIndex)
		);
	}

	/**
	 * Resolves the drop target to a line to move the dragged record before, or 'end', and hands
	 * off to moveRecordInSource. Dropping on the record itself, on a field/constant, on the file
	 * node, etc. is a no-op. No manual tree refresh needed: the applied edit fires the existing
	 * onDidChangeTextDocument -> debounceUpdate -> setElements()/refresh() pipeline.
	 */
	async handleDrop(target: DdsNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
		const transferItem = dataTransfer.get(this.dropMimeTypes[0]);
		if (!transferItem) {
			return;
		};
		const sourceLineIndex = transferItem.value as number;

		let targetLine: number | 'end';
		if (!target) {
			// Dropped in empty space below the list — the only way to reach "after the last
			// record", since dropping on a record always means "insert before it" (VS Code's
			// drop API doesn't expose above/below-row position within a target).
			targetLine = 'end';
		} else if (target.ddsElement.kind === 'record') {
			targetLine = target.ddsElement.lineIndex;
		} else if (target.contextValue === 'group:records') {
			targetLine = 'end';
		} else {
			return;
		};

		await moveRecordInSource(sourceLineIndex, targetLine);
	}
}

/** Whether a tree element is a record carrying an SFLCTL() keyword (a subfile control record). */
function isSflCtlElement(ddsElement: DdsElement): boolean {
	return ddsElement.kind === 'record' && (ddsElement.attributes?.some(attr => attr.value.toUpperCase().startsWith('SFLCTL(')) ?? false);
};

/**
 * Extra contextValue word for a referenced field, distinguishing whether its real type/length has
 * already been resolved from the IBM i (consumed by package.json's view/item/context "when" clauses
 * via a `viewItem =~ /\bword\b/` regex, same convention as the existing "record sflctl" combo).
 */
function referencedFieldContextSuffix(ddsElement: DdsElement): string {
	if (ddsElement.kind !== 'field' || !ddsElement.referenced) {
		return '';
	};

	const documentUri = ExtensionState.lastDdsDocument?.uri.toString();
	const resolved = documentUri ? getResolvedRef(documentUri, ddsElement.recordname, ddsElement.name) : undefined;
	return resolved ? ' referenced-resolved' : ' referenced-pending';
};

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
		this.contextValue = label.includes('📂 Records')
			? 'group:records'
			: isSflCtlElement(ddsElement) ? 'record sflctl' : `${ddsElement.kind}${referencedFieldContextSuffix(ddsElement)}`;

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
		const base = (() => {
			switch (ddsElement.kind) {
				case 'record':
				case 'field':
				case 'constant':
				case 'attribute':
				case 'constantAttribute':
				case 'fieldAttribute':
				case 'file': return ddsElement.kind;
				default: return '';
			}
		})();

		const condition = 'indicators' in ddsElement ? formatIndicatorCondition(ddsElement.indicators) : '';
		return condition ? `${base}\nActive when: ${condition}` : base;
	}
}