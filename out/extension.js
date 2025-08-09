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
const dspf_edit_parser_1 = require("./dspf-edit.parser");
const dspf_edit_helper_1 = require("./dspf-edit.helper");
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
// Variable para el timeout del debounce
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
        { name: 'editConstant', handler: dspf_edit_edit_constant_1.editConstant, needsTreeProvider: false },
        { name: 'editField', handler: dspf_edit_edit_field_1.editField, needsTreeProvider: false },
        { name: 'changePosition', handler: dspf_edit_change_position_1.changePosition, needsTreeProvider: false },
        { name: 'centerPosition', handler: dspf_edit_center_1.centerPosition, needsTreeProvider: false },
        { name: 'copyRecord', handler: dspf_edit_copy_record_1.copyRecord, needsTreeProvider: false },
        { name: 'deleteRecord', handler: dspf_edit_delete_record_1.deleteRecord, needsTreeProvider: false },
        { name: 'newRecord', handler: dspf_edit_new_record_1.newRecord, needsTreeProvider: false }
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
    /*
        // "View-Structure" command
        viewStructure(context, treeProvider);
    
        // "Edit-Constant" command
        editConstant(context);
    
        // "Edit-Field" command
        editField(context);
    
        // "Change-Position" command
        changePosition(context);
    
        // "Center" command
        centerPosition(context);
    
        // "Copy-Record" command
        copyRecord(context);
    
        // "Delete-Record" command
        deleteRecord(context);
    
        // "New-Record" command
        newRecord(context);
    */
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
        updateTreeProvider(treeProvider, document);
    }, 150);
}
;
function updateTreeProvider(treeProvider, document) {
    try {
        if (document && (0, dspf_edit_helper_1.isDdsFile)(document)) {
            const text = document.getText();
            const elements = (0, dspf_edit_parser_1.parseDocument)(text);
            treeProvider.setElements(elements);
        }
        else {
            treeProvider.setElements([]);
        }
        ;
        treeProvider.refresh();
    }
    catch (error) {
        console.error('Error updating DDS tree:', error);
        vscode.window.showErrorMessage('Error parsing DDS file');
        treeProvider.setElements([]);
        treeProvider.refresh();
    }
    ;
}
;
//# sourceMappingURL=extension.js.map