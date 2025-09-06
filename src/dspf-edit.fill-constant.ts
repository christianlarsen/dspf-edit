/*
    Christian Larsen, 2025
    "RPG structure"
    dspf-edit.fill-constant.ts
*/

import * as vscode from 'vscode';
import { DdsNode } from './dspf-edit.providers';
import { DdsConstant } from './dspf-edit.model';
import { updateExistingConstant } from './dspf-edit.edit-constant';
import { lastDdsDocument, lastDdsEditor } from './extension';

// INTERFACES AND TYPES

interface FillInformation {
    fillCharacter: string;
    fillEnd: string;
    totalSize : number;
};

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
export function fillConstant(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("dspf-edit.fill-constant", async (node: DdsNode) => {
            await handleFillConstantCommand(node);
        })
    );
};

// COMMAND HANDLER

/**
 * Handles the fill constant command for DDS constants.
 * Allows users to fill a constant with a character (and end it with a different character).
 * @param node - The DDS node containing the field or constant
 */
async function handleFillConstantCommand(node: DdsNode): Promise<void> {
    try {
        const editor = lastDdsEditor;
        const document = editor?.document ?? lastDdsDocument;
        if (!document || !editor) {
            vscode.window.showErrorMessage('No DDS editor found.');
            return;
        };

        // Validate element type
        if (node.ddsElement.kind !== 'constant') {
            vscode.window.showWarningMessage('Only constants can be filled.');
            return;
        };

        // Collect information to fill the constant
        const fillInformation : (FillInformation | undefined) = await collectFillInformationFromUser(node.ddsElement.name);

        if (fillInformation === undefined) {
            vscode.window.showInformationMessage('No fill information added.');
            return;
        };

        // Fill the constant with the collected information 
        await fillElement(editor, node.ddsElement, fillInformation);

        vscode.window.showInformationMessage(
            `${node.ddsElement.name} filled.`
        );

    } catch (error) {
        console.error('Error filling constant:', error);
        vscode.window.showErrorMessage('An error occurred while filling constant.');
    };
};

// USER INTERACTION FUNCTIONS

async function collectFillInformationFromUser(constant: string): Promise<FillInformation | undefined> {

    // Step 1: fill character(s)
    const fillChar = await vscode.window.showInputBox({
        title: `Fill Constant with Characters`,
        prompt: `Enter character(s) to repeat after the constant (e.g., '.', '. ', ...)`,
        placeHolder: '.',
        validateInput: (value: string) => {
            if (!value.trim()) return 'Please enter at least one character';
            return undefined;
        }
    });
    if (!fillChar) return undefined;

    // Step 2: final character.
    const endChar = await vscode.window.showInputBox({
        title: `Final Character`,
        prompt: `Enter final character (e.g., ':', '-', ...)`,
        placeHolder: ':',
        validateInput: (value: string) => {
            if (!value.trim()) return 'Please enter a final character';
            if (value.length > 1) return 'Only one character is allowed here';
            return undefined;
        }
    });
    if (!endChar) return undefined;

    // Step 3: total size of the final constant
    const trimmedConstant = constant.slice(1, -1);
    const totalSizeStr = await vscode.window.showInputBox({
        title: `Total Size of the Final Constant`,
        prompt: `Enter total size (must be greater than constant length = ${trimmedConstant.length})`,
        placeHolder: (trimmedConstant.length + 1).toString(),
        validateInput: (value: string) => {
            const num = parseInt(value.trim(), 10);
            if (isNaN(num)) return 'Please enter a valid number';
            if (num <= trimmedConstant.length) {
                return `Total size must be greater than ${trimmedConstant.length}`;
            };
            return undefined;
        }
    });
    if (!totalSizeStr) return undefined;

    const totalSize = parseInt(totalSizeStr, 10);

    return {
        fillCharacter: fillChar,
        fillEnd: endChar,
        totalSize
      };
      
};

// DDS MODIFICATION FUNCTIONS

/**
 * Fill constant by adding the fill information to the constant.
 * @param editor - The active text editor
 * @param constant - The constant to fill
 * @param fillInformation - Fill information
 */
async function fillElement(
    editor: vscode.TextEditor,
    constant: DdsConstant,
    fillInformation: FillInformation
): Promise<void> {
    const replacementPoint = constant.lineIndex;
    const constantToFill = constant.name.slice(1, -1);
    
    if (replacementPoint <= 0 || replacementPoint > editor.document.lineCount) {
        throw new Error('Could not find position of the constant.');
    };
    
    // Fill the constant.
    const filledConstant = fillConstantWithInfo(constantToFill, fillInformation);
    
    // Apply the constant update
    await updateExistingConstant(editor, constant, filledConstant);    

};

// HELPER FUNCTIONS

function fillConstantWithInfo(constant: string, info: FillInformation): string {
    const { fillCharacter, fillEnd, totalSize } = info;

    // Available space for filling = totalSize - (constant length + final length)
    const availableSpace = totalSize - ((constant.length + 1) + fillEnd.length);
    if (availableSpace <= 0) {
        // If no space available, returns constant plus end
        return constant + fillEnd;
    };

    // Repeat until fill space
    let repeated = "";
    while (repeated.length < availableSpace) {
        repeated += fillCharacter;
    };

    // Cut at the exact length
    repeated = repeated.substring(0, availableSpace);

    return constant + ' ' + repeated + fillEnd;
};
