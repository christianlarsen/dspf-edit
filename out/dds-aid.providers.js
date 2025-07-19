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
    getChildren(element) {
        const elements = this.elements;
        if (!element) {
            const file = elements.find(e => e.kind === 'file');
            const fileNode = file ? new DdsNode(`File`, vscode.TreeItemCollapsibleState.Expanded, file) : undefined;
            const recordRoot = new DdsNode(`Records`, vscode.TreeItemCollapsibleState.Expanded, {
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
            const attrs = element.ddsElement.attributes ?? [];
            return Promise.resolve(attrs.map(attr => new DdsNode(`⚙️ ${attr.value}`, vscode.TreeItemCollapsibleState.None, {
                kind: 'attribute',
                lineIndex: attr.lineIndex,
                value: attr.value,
                indicators: [],
                attributes: [],
            })));
        }
        ;
        // "Group"
        if (element.ddsElement.kind === 'group') {
            return Promise.resolve((element.ddsElement.children ?? []).map(rec => new DdsNode(rec.kind === 'record' ? `📄 ${rec.name}` :
                rec.kind === 'field' ? `🔤 ${rec.name}` :
                    rec.kind === 'constant' ? `💡 ${rec.name}` :
                        `📦 ${rec.kind}`, (rec.attributes?.length && rec.attributes.length > 0) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, rec)));
        }
        ;
        // "Record"
        if (element.ddsElement.kind === 'record') {
            const recordLine = element.ddsElement.lineIndex;
            const children = elements.filter(e => (e.kind === 'field' || e.kind === 'constant') &&
                e.lineIndex > recordLine &&
                !elements.some(parent => parent.kind === 'record' && parent.lineIndex > recordLine && parent.lineIndex < e.lineIndex));
            return Promise.resolve(children.map(child => {
                let label = '';
                if (child.kind === 'field') {
                    label = `🔤 ${child.name}`;
                }
                else if (child.kind === 'constant') {
                    label = `💡 ${child.name}`;
                }
                ;
                return new DdsNode(label, child.attributes?.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, child);
            }));
        }
        ;
        // "Field" or "Constant"
        // ????? I have to add here :
        // ????? -> Indicators
        // ????? -> If field, type+size
        // ????? -> Attributes
        if (element.ddsElement.kind === 'field' || element.ddsElement.kind === 'constant') {
            const attrs = element.ddsElement.attributes ?? [];
            return Promise.resolve(attrs.map(attr => new DdsNode(`⚙️ ${attr.value}`, vscode.TreeItemCollapsibleState.None, {
                kind: 'attribute',
                lineIndex: attr.lineIndex,
                value: attr.value,
                indicators: [],
                attributes: []
            })));
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