"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.view-structure.ts
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
exports.viewStructure = viewStructure;
const vscode = __importStar(require("vscode"));
const dspf_edit_helper_1 = require("./dspf-edit.helper");
const dspf_edit_parser_1 = require("./dspf-edit.parser");
function viewStructure(context, treeProvider) {
    context.subscriptions.push(vscode.commands.registerCommand('dds-aid.view-structure', () => {
        const editor = vscode.window.activeTextEditor;
        const document = editor?.document;
        if (editor && document && (0, dspf_edit_helper_1.isDdsFile)(document)) {
            const text = editor.document.getText();
            treeProvider.setElements((0, dspf_edit_parser_1.parseDocument)(text));
            treeProvider.refresh();
        }
        else {
            treeProvider.setElements([]);
            treeProvider.refresh();
        }
        ;
    }));
}
;
//# sourceMappingURL=dspf-edit.view-structure.js.map