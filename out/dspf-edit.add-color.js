"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.add-color.ts
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
exports.addColor = addColor;
const vscode = __importStar(require("vscode"));
function addColor(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.add-color", async (node) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        ;
        if (node.ddsElement.kind !== 'constant' && node.ddsElement.kind !== 'field') {
            return;
        }
        ;
        const listOfColors = ['BLU', 'GRN', 'PNK', 'RED', 'TRQ', 'WHT', 'YLW'];
        let selectedColors = [];
        // Retrieves the colors already active for the constant/field and removes them
        // from the list, and add them to the selectedColors list.
        // ????
        // Collect colors to be active for the constant/field
        while (true) {
            const selectedColor = await vscode.window.showQuickPick(listOfColors, {
                title: 'Add Color (Press ESC to End)',
                placeHolder: 'Select colour from list'
            });
            if (selectedColor && selectedColor !== '') {
                selectedColors.push(selectedColor);
            }
            else {
                break;
            }
        }
        ;
        // One finished, the colors are added to the source file with this format "COLOR(BLU)"
        // in the same order they are inserted
        // ??????
    }));
}
;
//# sourceMappingURL=dspf-edit.add-color.js.map