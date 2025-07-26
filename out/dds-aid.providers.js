"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dds-aid.providers.ts
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
const dds_aid_helper_1 = require("./dds-aid.helper");
class DdsTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    elements = [];
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    ;
    setElements(elements) {
        this.elements = elements;
    }
    ;
    getTreeItem(element) {
        return element;
    }
    ;
    shouldHaveAttributesGroup(el) {
        return el.kind === 'record' || el.kind === 'field' || el.kind === 'constant';
    }
    ;
    getChildren(element) {
        const elements = this.elements;
        // Shows "File" and "Records" nodes.
        if (!element) {
            const file = elements.find(e => e.kind === 'file');
            const editor = vscode.window.activeTextEditor;
            const fileName = editor ? path.basename(editor.document.fileName) : 'Unknown';
            let fileNode;
            if (file) {
                fileNode = new DdsNode(`📂 File (${fileName})`, vscode.TreeItemCollapsibleState.Collapsed, file);
            }
            ;
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
        // "File"
        if (element.ddsElement.kind === 'file') {
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
            const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0 ? true : false;
            children.push(new DdsNode(`⚙️ Attributes`, hasAttributes ?
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None, attrGroup));
            return Promise.resolve(children);
        }
        ;
        // "Record"
        if (element.ddsElement.kind === 'record') {
            const children = [];
            const recordAttributes = element.ddsElement.attributes ?? [];
            const attrGroup = {
                kind: 'group',
                attribute: 'Attributes',
                lineIndex: element.ddsElement.lineIndex,
                children: [],
                attributes: recordAttributes,
                indicators: []
            };
            const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0 ? true : false;
            children.push(new DdsNode(`⚙️ Attributes`, hasAttributes ?
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None, attrGroup));
            // Record constant&fields group
            const thisRecordLine = element.ddsElement.lineIndex;
            const nextRecord = this.elements.find(el => el.kind === 'record' && el.lineIndex > thisRecordLine);
            const nextRecordLine = nextRecord ? nextRecord.lineIndex : Number.MAX_SAFE_INTEGER;
            const fieldsAndConstants = this.elements.filter(el => (el.kind === 'field' || el.kind === 'constant') &&
                el.lineIndex > thisRecordLine &&
                el.lineIndex < nextRecordLine);
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
        // "Field" 
        if (element.ddsElement.kind === 'field') {
            const children = [];
            const fieldIndicators = element.ddsElement.indicators ?? [];
            const fieldAttributes = element.ddsElement.attributes ?? [];
            const indiGroup = {
                kind: 'group',
                attribute: 'Indicators',
                lineIndex: element.ddsElement.lineIndex,
                children: [],
                attributes: [],
                indicators: fieldIndicators
            };
            const attrGroup = {
                kind: 'group',
                attribute: 'Attributes',
                lineIndex: element.ddsElement.lineIndex,
                children: [],
                attributes: fieldAttributes,
                indicators: []
            };
            const hasIndicators = indiGroup.indicators && indiGroup.indicators.length > 0 ? true : false;
            children.push(new DdsNode(`📶 Indicators`, hasIndicators ?
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None, indiGroup));
            const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0 ? true : false;
            children.push(new DdsNode(`⚙️ Attributes`, hasAttributes ?
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None, attrGroup));
            return Promise.resolve(children);
        }
        ;
        // "Constant"
        if (element.ddsElement.kind === 'constant') {
            const children = [];
            const constantIndicators = element.ddsElement.indicators ?? [];
            const constantAttributes = element.ddsElement.attributes ?? [];
            const indiGroup = {
                kind: 'group',
                attribute: 'Indicators',
                lineIndex: element.ddsElement.lineIndex,
                children: [],
                attributes: [],
                indicators: constantIndicators
            };
            const attrGroup = {
                kind: 'group',
                attribute: 'Attributes',
                lineIndex: element.ddsElement.lineIndex,
                children: [],
                attributes: constantAttributes,
                indicators: []
            };
            const hasIndicators = indiGroup.indicators && indiGroup.indicators.length > 0 ? true : false;
            children.push(new DdsNode(`📶 Indicators`, hasIndicators ?
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None, indiGroup));
            const hasAttributes = attrGroup.attributes && attrGroup.attributes.length > 0 ? true : false;
            children.push(new DdsNode(`⚙️ Attributes`, hasAttributes ?
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None, attrGroup));
            return Promise.resolve(children);
        }
        ;
        // "Group"
        if (element.ddsElement.kind === 'group') {
            const groupAttr = element.ddsElement.attribute;
            // "Attributes" group
            if (groupAttr === 'Attributes') {
                const group = element.ddsElement;
                const attrs = group.attributes ?? [];
                return Promise.resolve(attrs.length === 0 ?
                    [] :
                    attrs.map(attr => new DdsNode(`⚙️ ${'value' in attr ? attr.value : 'Attribute'}`, vscode.TreeItemCollapsibleState.None, {
                        ...attr,
                        kind: 'attribute',
                    })));
                // "Indicators" group
            }
            else if (groupAttr === 'Indicators') {
                const group = element.ddsElement;
                const indis = group.indicators ?? [];
                return Promise.resolve(indis.length === 0 ?
                    [] :
                    indis.map(indi => new DdsNode(`${indi.number.toString().padStart(2, '0')}: ${indi.active ? 'ON' : 'OFF'}`, vscode.TreeItemCollapsibleState.None, {
                        kind: 'indicatornode',
                        indicator: indi,
                        attributes: [],
                        indicators: [],
                        lineIndex: 0
                    })));
                // "Record/Field/Constant" group		
            }
            else {
                return Promise.resolve((element.ddsElement.children ?? []).map(rec => new DdsNode(rec.kind === 'record' ? `📄 ${rec.name}` :
                    rec.kind === 'field' ? `🔤 ${rec.name}` :
                        rec.kind === 'constant' ? `💡 ${rec.name}` :
                            `📦 ${rec.kind}`, this.shouldHaveAttributesGroup(rec) ?
                    vscode.TreeItemCollapsibleState.Collapsed :
                    vscode.TreeItemCollapsibleState.None, rec)));
            }
            ;
        }
        ;
        return Promise.resolve([]);
    }
    ;
}
exports.DdsTreeProvider = DdsTreeProvider;
;
class DdsNode extends vscode.TreeItem {
    label;
    collapsibleState;
    ddsElement;
    constructor(label, collapsibleState, ddsElement) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.ddsElement = ddsElement;
        // Let's show the information on screen
        this.tooltip = this.getTooltip(ddsElement);
        this.description = this.getDescription(ddsElement);
        this.contextValue = ddsElement.kind;
    }
    ;
    // Get description of the "node"
    getDescription(ddsElement) {
        switch (ddsElement.kind) {
            case 'file':
                return (0, dds_aid_helper_1.describeDdsFile)(ddsElement);
            case 'record':
                return (0, dds_aid_helper_1.describeDdsRecord)(ddsElement);
            case 'field':
                return (0, dds_aid_helper_1.describeDdsField)(ddsElement);
            case 'constant':
                return (0, dds_aid_helper_1.describeDdsConstant)(ddsElement);
            case 'attribute':
                return '';
            default:
                return '';
        }
        ;
    }
    ;
    // Get "toop tip" for the "node"
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
//# sourceMappingURL=dds-aid.providers.js.map