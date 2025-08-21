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
const dspf_edit_providers_1 = require("./dspf-edit.providers");
const dspf_edit_change_position_1 = require("./dspf-edit.change-position");
const dspf_edit_center_1 = require("./dspf-edit.center");
const dspf_edit_edit_constant_1 = require("./dspf-edit.edit-constant");
const dspf_edit_edit_field_1 = require("./dspf-edit.edit-field");
const dspf_edit_view_structure_1 = require("./dspf-edit.view-structure");
const dspf_edit_generate_structure_1 = require("./dspf-edit.generate-structure");
const dspf_edit_copy_record_1 = require("./dspf-edit.copy-record");
const dspf_edit_delete_record_1 = require("./dspf-edit.delete-record");
const dspf_edit_new_record_1 = require("./dspf-edit.new-record");
const dspf_edit_goto_line_1 = require("./dspf-edit.goto-line");
const dspf_edit_helper_1 = require("./dspf-edit.helper");
const dspf_edit_add_buttons_1 = require("./dspf-edit.add-buttons");
const dspf_edit_add_color_1 = require("./dspf-edit.add-color");
const dspf_edit_add_attribute_1 = require("./dspf-edit.add-attribute");
const dspf_edit_add_keys_1 = require("./dspf-edit.add-keys");
const dspf_edit_add_validity_check_1 = require("./dspf-edit.add-validity-check");
const dspf_edit_add_editing_keywords_1 = require("./dspf-edit.add-editing-keywords");
const dspf_edit_add_error_messages_1 = require("./dspf-edit.add-error-messages");
const dspf_edit_add_indicators_1 = require("./dspf-edit.add-indicators");
let updateTimeout;
// Activate extension
function activate(context) {
    // Registers the tree data provider
    const treeProvider = new dspf_edit_providers_1.DdsTreeProvider();
    vscode.window.registerTreeDataProvider('ddsStructureView', treeProvider);
    // Generates the DDS structure
    (0, dspf_edit_generate_structure_1.generateStructure)(treeProvider);
    // If the document changes, the extension re-generates the DDS structure
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document) {
            debounceUpdate(treeProvider, event.document);
        }
    }));
    // If user changes active editor, the extension re-generates the DDS structure
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        debounceUpdate(treeProvider, editor?.document);
    }));
    ;
    const commands = [
        { name: 'viewStructure', handler: dspf_edit_view_structure_1.viewStructure, needsTreeProvider: true },
        { name: 'addConstant', handler: dspf_edit_edit_constant_1.addConstant, needsTreeProvider: false },
        { name: 'editConstant', handler: dspf_edit_edit_constant_1.editConstant, needsTreeProvider: false },
        { name: 'registerFieldCommands', handler: dspf_edit_edit_field_1.registerFieldCommands, needsTreeProvider: false },
        { name: 'changePosition', handler: dspf_edit_change_position_1.changePosition, needsTreeProvider: false },
        { name: 'centerPosition', handler: dspf_edit_center_1.centerPosition, needsTreeProvider: false },
        { name: 'copyRecord', handler: dspf_edit_copy_record_1.copyRecord, needsTreeProvider: false },
        { name: 'deleteRecord', handler: dspf_edit_delete_record_1.deleteRecord, needsTreeProvider: false },
        { name: 'newRecord', handler: dspf_edit_new_record_1.newRecord, needsTreeProvider: false },
        { name: 'goToLine', handler: dspf_edit_goto_line_1.goToLineHandler, needsTreeProvider: false },
        { name: 'addButtons', handler: dspf_edit_add_buttons_1.addButtons, needsTreeProvider: false },
        { name: 'addColor', handler: dspf_edit_add_color_1.addColor, needsTreeProvider: false },
        { name: 'addAttribute', handler: dspf_edit_add_attribute_1.addAttribute, needsTreeProvider: false },
        { name: 'addKey', handler: dspf_edit_add_keys_1.addKeyCommand, needsTreeProvider: false },
        { name: 'addValidityCheck', handler: dspf_edit_add_validity_check_1.addValidityCheck, needsTreeProvider: false },
        { name: 'addEditingKeywords', handler: dspf_edit_add_editing_keywords_1.editingKeywords, needsTreeProvider: false },
        { name: 'addErrorMessage', handler: dspf_edit_add_error_messages_1.addErrorMessage, needsTreeProvider: false },
        { name: 'addIndicators', handler: dspf_edit_add_indicators_1.addIndicators, needsTreeProvider: false }
    ];
    // Register all commands
    commands.forEach(cmd => {
        if (cmd.needsTreeProvider) {
            cmd.handler(context, treeProvider);
        }
        else {
            cmd.handler(context);
        }
    });
}
;
function deactivate() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = undefined;
    }
    ;
}
;
function debounceUpdate(treeProvider, document) {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
    }
    updateTimeout = setTimeout(() => {
        (0, dspf_edit_helper_1.updateTreeProvider)(treeProvider, document);
    }, 150);
}
;
//# sourceMappingURL=extension.js.map