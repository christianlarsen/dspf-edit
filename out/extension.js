"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    extension.ts
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const dds_aid_parser_1 = require("./dds-aid.parser");
const dds_aid_helper_1 = require("./dds-aid.helper");
const dds_aid_providers_1 = require("./dds-aid.providers");
const dds_aid_change_position_1 = require("./dds-aid.change-position");
const dds_aid_center_1 = require("./dds-aid.center");
const dds_aid_edit_constant_1 = require("./dds-aid.edit-constant");
const dds_aid_view_structure_1 = require("./dds-aid.view-structure");
const dds_aid_generate_structure_1 = require("./dds-aid.generate-structure");
// Activate extension
function activate(context) {
    // Registers the tree data provider
    const treeProvider = new dds_aid_providers_1.DdsTreeProvider();
    vscode.window.registerTreeDataProvider('ddsStructureView', treeProvider);
    // Generates the DDS structure
    (0, dds_aid_generate_structure_1.generateStructure)(treeProvider);
    // If the document changes, the extension re-generates the DDS structure
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document &&
            (0, dds_aid_helper_1.isDdsFile)(event.document)) {
            const text = event.document.getText();
            treeProvider.setElements((0, dds_aid_parser_1.parseDdsElements)(text));
            treeProvider.refresh();
        }
        else {
            treeProvider.setElements([]);
            treeProvider.refresh();
        }
        ;
    }));
    // If user changes active editor, the extension re-generates the DDS structure
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && (0, dds_aid_helper_1.isDdsFile)(editor.document)) {
            const text = editor.document.getText();
            treeProvider.setElements((0, dds_aid_parser_1.parseDdsElements)(text));
            treeProvider.refresh();
        }
        else {
            treeProvider.setElements([]);
            treeProvider.refresh();
        }
        ;
    }));
    // Commands
    // "View-Structure" command
    (0, dds_aid_view_structure_1.viewStructure)(context, treeProvider);
    // "Edit-Constant" command
    (0, dds_aid_edit_constant_1.editConstant)(context);
    // "Change-Position" command
    (0, dds_aid_change_position_1.changePosition)(context);
    // "Center" command
    (0, dds_aid_center_1.centerPosition)(context);
}
;
function deactivate() { }
//# sourceMappingURL=extension.js.map