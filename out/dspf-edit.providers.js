"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.providers.ts
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DdsNode = exports.DdsTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const dspf_edit_helper_1 = require("./dspf-edit.helper");
// DDS TREE PROVIDER CLASS
/**
 * Tree data provider for displaying DDS file structure in VS Code's tree view.
 * Provides hierarchical view of files, records, fields, constants, and their attributes.
 */
class DdsTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    elements = [];
    /**
     * Refreshes the tree view by firing the change event.
     */
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    ;
    /**
     * Sets the DDS elements to be displayed in the tree.
     * @param elements - Array of DDS elements to display
     */
    setElements(elements) {
        this.elements = elements;
    }
    ;
    /**
     * Returns the tree item representation of the given element.
     * @param element - The DDS node to get tree item for
     * @returns The corresponding VS Code tree item
     */
    getTreeItem(element) {
        return element;
    }
    ;
    /**
     * Determines if an element should have an attributes group as a child.
     * @param el - The DDS element to check
     * @returns True if the element should have attributes group
     */
    shouldHaveAttributesGroup(el) {
        return el.kind === 'record' || el.kind === 'field' || el.kind === 'constant';
    }
    ;
    /**
     * Gets the children of a tree node. This is the main method that builds the tree structure.
     * @param element - The parent node (undefined for root level)
     * @returns Promise resolving to array of child nodes
     */
    getChildren(element) {
        const elements = this.elements;
        // Root level - shows "File" and "Records" nodes
        if (!element) {
            return this.getRootChildren(elements);
        }
        ;
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
        }
        ;
    }
    ;
    // CHILDREN PROVIDER METHODS
    /**
     * Gets the root level children (File and Records nodes).
     * @param elements - All DDS elements
     * @returns Promise resolving to root level nodes
     */
    getRootChildren(elements) {
        const file = elements.find(e => e.kind === 'file');
        const editor = vscode.window.activeTextEditor;
        const fileName = editor ? path.basename(editor.document.fileName) : 'Unknown';
        let fileNode;
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
        return Promise.resolve([fileNode, recordRoot].filter(Boolean));
    }
    ;
    /**
     * Gets children for a file node (typically attributes).
     * @param element - The file node
     * @returns Promise resolving to file's child nodes
     */
    getFileChildren(element) {
        const children = [];
        const fileAttributes = element.ddsElement.attributes ?? [];
        const attrGroup = {
            kind: 'group',
            attribute: 'Attributes',
            lineIndex: element.ddsElement.lineIndex,
            children: [],
            attributes: fileAttributes,
            indicators: []
        };
        const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0;
        children.push(new DdsNode(`⚙️ Attributes`, hasAttributes
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None, attrGroup));
        return Promise.resolve(children);
    }
    ;
    /**
     * Gets children for a record node (attributes and fields/constants).
     * @param element - The record node
     * @returns Promise resolving to record's child nodes
     */
    getRecordChildren(element) {
        const children = [];
        // Add attributes group
        const recordAttributes = element.ddsElement.attributes ?? [];
        const attrGroup = {
            kind: 'group',
            attribute: 'Attributes',
            lineIndex: element.ddsElement.lineIndex,
            children: [],
            attributes: recordAttributes,
            indicators: []
        };
        const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0;
        children.push(new DdsNode(`⚙️ Attributes`, hasAttributes
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None, attrGroup));
        // Add fields and constants group
        const fieldsAndConstants = this.getFieldsAndConstantsForRecord(element.ddsElement.lineIndex);
        if (fieldsAndConstants.length > 0) {
            children.push(new DdsNode(`🧾 Fields and Constants`, vscode.TreeItemCollapsibleState.Collapsed, {
                kind: 'group',
                attribute: 'FieldsAndConstants',
                children: fieldsAndConstants,
                lineIndex: element.ddsElement.lineIndex,
            }));
        }
        ;
        return Promise.resolve(children);
    }
    ;
    /**
     * Gets children for a field node (indicators and attributes).
     * @param element - The field node
     * @returns Promise resolving to field's child nodes
     */
    getFieldChildren(element) {
        const children = [];
        const fieldIndicators = element.ddsElement.indicators ?? [];
        const fieldAttributes = element.ddsElement.attributes ?? [];
        // Add indicators group
        const indiGroup = {
            kind: 'group',
            attribute: 'Indicators',
            lineIndex: element.ddsElement.lineIndex,
            children: [],
            attributes: [],
            indicators: fieldIndicators
        };
        // Add attributes group
        const attrGroup = {
            kind: 'group',
            attribute: 'FieldAttributes',
            lineIndex: element.ddsElement.lineIndex,
            children: [],
            attributes: fieldAttributes,
            indicators: []
        };
        const hasIndicators = indiGroup.indicators && indiGroup.indicators.length > 0;
        children.push(new DdsNode(`📶 Indicators`, hasIndicators
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None, indiGroup));
        const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0;
        children.push(new DdsNode(`⚙️ Attributes`, hasAttributes
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None, attrGroup));
        return Promise.resolve(children);
    }
    ;
    /**
     * Gets children for a constant node (indicators and attributes).
     * @param element - The constant node
     * @returns Promise resolving to constant's child nodes
     */
    getConstantChildren(element) {
        const children = [];
        const constantIndicators = element.ddsElement.indicators ?? [];
        const constantAttributes = element.ddsElement.attributes ?? [];
        // Add indicators group
        const indiGroup = {
            kind: 'group',
            attribute: 'Indicators',
            lineIndex: element.ddsElement.lineIndex,
            children: [],
            attributes: [],
            indicators: constantIndicators
        };
        // Add attributes group
        const attrGroup = {
            kind: 'group',
            attribute: 'ConstantAttributes',
            lineIndex: element.ddsElement.lineIndex,
            children: [],
            attributes: constantAttributes,
            indicators: []
        };
        const hasIndicators = indiGroup.indicators && indiGroup.indicators.length > 0;
        children.push(new DdsNode(`📶 Indicators`, hasIndicators
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None, indiGroup));
        const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0;
        children.push(new DdsNode(`⚙️ Attributes`, hasAttributes
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None, attrGroup));
        return Promise.resolve(children);
    }
    ;
    /**
     * Gets children for a group node (attributes, indicators, or nested elements).
     * @param element - The group node
     * @returns Promise resolving to group's child nodes
     */
    getGroupChildren(element) {
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
    }
    ;
    // GROUP CHILDREN HELPER METHODS
    /**
     * Gets children for an attributes group.
     * @param element - The attributes group node
     * @returns Promise resolving to attribute nodes
     */
    getAttributesGroupChildren(element) {
        const group = element.ddsElement;
        const attrs = group.attributes ?? [];
        return Promise.resolve(attrs.length === 0
            ? []
            : attrs.map(attr => new DdsNode(`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `, vscode.TreeItemCollapsibleState.None, {
                ...attr,
                kind: 'attribute',
            })));
    }
    ;
    /**
     * Gets children for a constant attributes group.
     * @param element - The constant attributes group node
     * @returns Promise resolving to constant attribute nodes
     */
    getConstantAttributesGroupChildren(element) {
        const group = element.ddsElement;
        const attrs = group.attributes ?? [];
        return Promise.resolve(attrs.length === 0
            ? []
            : attrs.map(attr => new DdsNode(`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `, vscode.TreeItemCollapsibleState.None, {
                ...attr,
                kind: 'constantAttribute',
            })));
    }
    ;
    /**
     * Gets children for a field attributes group.
     * @param element - The field attributes group node
     * @returns Promise resolving to field attribute nodes
     */
    getFieldAttributesGroupChildren(element) {
        const group = element.ddsElement;
        const attrs = group.attributes ?? [];
        return Promise.resolve(attrs.length === 0
            ? []
            : attrs.map(attr => new DdsNode(`⚙️ ${'value' in attr ? attr.value : 'Attribute'} `, vscode.TreeItemCollapsibleState.None, {
                ...attr,
                kind: 'fieldAttribute',
            })));
    }
    ;
    /**
     * Gets children for an indicators group.
     * @param element - The indicators group node
     * @returns Promise resolving to indicator nodes
     */
    getIndicatorsGroupChildren(element) {
        const group = element.ddsElement;
        const indis = group.indicators ?? [];
        return Promise.resolve(indis.length === 0
            ? []
            : indis.map(indi => new DdsNode(`${indi.number.toString().padStart(2, '0')}: ${indi.active ? 'ON' : 'OFF'}`, vscode.TreeItemCollapsibleState.None, {
                kind: 'indicatornode',
                indicator: indi,
                attributes: [],
                indicators: [],
                lineIndex: 0
            })));
    }
    ;
    /**
     * Gets children for a default group (records, fields, constants).
     * @param element - The default group node
     * @returns Promise resolving to child element nodes
     */
    getDefaultGroupChildren(element) {
        return Promise.resolve((element.ddsElement.children ?? []).map(rec => new DdsNode(this.getElementLabel(rec), this.shouldHaveAttributesGroup(rec)
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None, rec)));
    }
    ;
    // UTILITY METHODS
    /**
     * Gets fields and constants that belong to a specific record.
     * @param recordLineIndex - The line index of the record
     * @returns Array of fields and constants belonging to the record
     */
    getFieldsAndConstantsForRecord(recordLineIndex) {
        const nextRecord = this.elements.find(el => el.kind === 'record' && el.lineIndex > recordLineIndex);
        const nextRecordLine = nextRecord ? nextRecord.lineIndex : Number.MAX_SAFE_INTEGER;
        return this.elements.filter(el => (el.kind === 'field' || el.kind === 'constant') &&
            el.lineIndex > recordLineIndex &&
            el.lineIndex < nextRecordLine);
    }
    ;
    /**
     * Gets the appropriate label for a DDS element based on its kind.
     * @param element - The DDS element
     * @returns The formatted label string
     */
    getElementLabel(element) {
        switch (element.kind) {
            case 'record':
                return `📄 ${element.name}`;
            case 'field':
                return `🔤 ${element.name}`;
            case 'constant':
                return `💡 ${element.name}`;
            default:
                return `📦 ${element.kind}`;
        }
        ;
    }
    ;
}
exports.DdsTreeProvider = DdsTreeProvider;
;
// DDS NODE CLASS
/**
 * Represents a node in the DDS tree view.
 * Extends VS Code's TreeItem to provide custom functionality for DDS elements.
 */
class DdsNode extends vscode.TreeItem {
    label;
    collapsibleState;
    ddsElement;
    constructor(label, collapsibleState, ddsElement) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.ddsElement = ddsElement;
        // Configure node properties
        this.tooltip = this.getTooltip(ddsElement);
        this.description = this.getDescription(ddsElement);
        this.contextValue = ddsElement.kind;
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
    shouldHaveNavigationCommand(ddsElement) {
        return (ddsElement.lineIndex !== undefined &&
            (ddsElement.kind === 'record' ||
                ddsElement.kind === 'field' ||
                ddsElement.kind === 'constant'));
    }
    ;
    /**
     * Gets the description text for the tree node based on element type.
     * @param ddsElement - The DDS element
     * @returns The description string to display
     */
    getDescription(ddsElement) {
        switch (ddsElement.kind) {
            case 'file':
                return (0, dspf_edit_helper_1.describeDdsFile)(ddsElement);
            case 'record':
                return (0, dspf_edit_helper_1.describeDdsRecord)(ddsElement);
            case 'field':
                return (0, dspf_edit_helper_1.describeDdsField)(ddsElement);
            case 'constant':
                return (0, dspf_edit_helper_1.describeDdsConstant)(ddsElement);
            case 'attribute':
                return '';
            case 'constantAttribute':
                return (0, dspf_edit_helper_1.formatDdsIndicators)(ddsElement.indicators);
            case 'fieldAttribute':
                return (0, dspf_edit_helper_1.formatDdsIndicators)(ddsElement.indicators);
            default:
                return '';
        }
        ;
    }
    ;
    /**
     * Gets the tooltip text for the tree node.
     * @param ddsElement - The DDS element
     * @returns The tooltip string to display on hover
     */
    getTooltip(ddsElement) {
        switch (ddsElement.kind) {
            case 'record':
            case 'field':
            case 'constant':
            case 'attribute':
            case 'file':
                return ddsElement.kind;
            default:
                return '';
        }
        ;
    }
    ;
}
exports.DdsNode = DdsNode;
;
//# sourceMappingURL=dspf-edit.providers.js.map