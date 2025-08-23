"use strict";
/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.fill-constant.ts
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
exports.fillConstant = fillConstant;
const vscode = __importStar(require("vscode"));
const dspf_edit_edit_constant_1 = require("./dspf-edit.edit-constant");
;
// To "fill" a string like "Customer", then you should write,
// fillCharacter = '.' and fillEnd = ':', ... and the size (i.e. 10), so the resulting constant will be
// "Customer :"
// If you select size 15, then:
// "Customer .....:"
// COMMAND REGISTRATION
/**
 * Registers the fill constant command for DDS constants.
 * Allows users to fill a constant with a character (and end it with a different character).
 * @param context - The VS Code extension context
 */
function fillConstant(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dspf-edit.fill-constant", async (node) => {
        await handleFillConstantCommand(node);
    }));
}
;
// COMMAND HANDLER
/**
 * Handles the fill constant command for DDS constants.
 * Allows users to fill a constant with a character (and end it with a different character).
 * @param node - The DDS node containing the field or constant
 */
async function handleFillConstantCommand(node) {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        ;
        // Validate element type
        if (node.ddsElement.kind !== 'constant') {
            vscode.window.showWarningMessage('Only constants can be filled.');
            return;
        }
        ;
        // Collect information to fill the constant
        const fillInformation = await collectFillInformationFromUser(node.ddsElement.name);
        if (fillInformation === undefined) {
            vscode.window.showInformationMessage('No fill information added.');
            return;
        }
        ;
        // Fill the constant with the collected information 
        await fillElement(editor, node.ddsElement, fillInformation);
        vscode.window.showInformationMessage(`${node.ddsElement.name} filled.`);
    }
    catch (error) {
        console.error('Error filling constant:', error);
        vscode.window.showErrorMessage('An error occurred while filling constant.');
    }
    ;
}
;
// USER INTERACTION FUNCTIONS
async function collectFillInformationFromUser(constant) {
    // Step 1: fill character(s)
    const fillChar = await vscode.window.showInputBox({
        title: `Fill Constant with Characters`,
        prompt: `Enter character(s) to repeat after the constant (e.g., '.', '. ', ...)`,
        placeHolder: '.',
        validateInput: (value) => {
            if (!value.trim())
                return 'Please enter at least one character';
            return undefined;
        }
    });
    if (!fillChar)
        return undefined;
    // Step 2: final character.
    const endChar = await vscode.window.showInputBox({
        title: `Final Character`,
        prompt: `Enter final character (e.g., ':', '-', ...)`,
        placeHolder: ':',
        validateInput: (value) => {
            if (!value.trim())
                return 'Please enter a final character';
            if (value.length > 1)
                return 'Only one character is allowed here';
            return undefined;
        }
    });
    if (!endChar)
        return undefined;
    // Step 3: total size of the final constant
    const trimmedConstant = constant.slice(1, -1);
    const totalSizeStr = await vscode.window.showInputBox({
        title: `Total Size of the Final Constant`,
        prompt: `Enter total size (must be greater than constant length = ${trimmedConstant.length})`,
        placeHolder: (trimmedConstant.length + 1).toString(),
        validateInput: (value) => {
            const num = parseInt(value.trim(), 10);
            if (isNaN(num))
                return 'Please enter a valid number';
            if (num <= trimmedConstant.length) {
                return `Total size must be greater than ${trimmedConstant.length}`;
            }
            ;
            return undefined;
        }
    });
    if (!totalSizeStr)
        return undefined;
    const totalSize = parseInt(totalSizeStr, 10);
    return {
        fillCharacter: fillChar,
        fillEnd: endChar,
        totalSize
    };
}
;
// DDS MODIFICATION FUNCTIONS
/**
 * Fill constant by adding the fill information to the constant.
 * @param editor - The active text editor
 * @param constant - The constant to fill
 * @param fillInformation - Fill information
 */
async function fillElement(editor, constant, fillInformation) {
    const replacementPoint = constant.lineIndex;
    const constantToFill = constant.name.slice(1, -1);
    if (replacementPoint <= 0 || replacementPoint > editor.document.lineCount) {
        throw new Error('Could not find position of the constant.');
    }
    ;
    // Fill the constant.
    const filledConstant = fillConstantWithInfo(constantToFill, fillInformation);
    // Apply the constant update
    await (0, dspf_edit_edit_constant_1.updateExistingConstant)(editor, constant, filledConstant);
}
;
// HELPER FUNCTIONS
function fillConstantWithInfo(constant, info) {
    const { fillCharacter, fillEnd, totalSize } = info;
    // Available space for filling = totalSize - (constant length + final length)
    const availableSpace = totalSize - ((constant.length + 1) + fillEnd.length);
    if (availableSpace <= 0) {
        // If no space available, returns constant plus end
        return constant + fillEnd;
    }
    ;
    // Repeat until fill space
    let repeated = "";
    while (repeated.length < availableSpace) {
        repeated += fillCharacter;
    }
    ;
    // Cut at the exact length
    repeated = repeated.substring(0, availableSpace);
    return constant + ' ' + repeated + fillEnd;
}
;
//# sourceMappingURL=dspf-edit.fill-constant.js.map