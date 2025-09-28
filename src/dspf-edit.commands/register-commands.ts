/*
	Christian Larsen, 2025
	"RPG structure"
	commands/register-commands.ts
*/

import * as vscode from 'vscode';
import { DdsTreeProvider } from '../dspf-edit.providers/dspf-edit.providers';

import { changePosition } from './dspf-edit.change-position';
import { centerPosition } from './dspf-edit.center';
import { editConstant, addConstant } from './dspf-edit.edit-constant';
import { registerFieldCommands } from './dspf-edit.edit-field';
import { viewStructure } from './dspf-edit.view-structure';
import { copyRecord } from './dspf-edit.copy-record';
import { deleteRecord } from './dspf-edit.delete-record';
import { newRecord } from './dspf-edit.new-record';
import { goToLineHandler } from './dspf-edit.goto-line';
import { addButtons } from './dspf-edit.add-buttons';
import { addColor } from './dspf-edit.add-color';
import { addAttribute } from './dspf-edit.add-attribute';
import { addKeyCommand } from './dspf-edit.add-keys';
import { addValidityCheck } from './dspf-edit.add-validity-check';
import { editingKeywords } from './dspf-edit.add-editing-keywords';
import { addErrorMessage } from './dspf-edit.add-error-messages';
import { addIndicators } from './dspf-edit.add-indicators';
import { fillConstant } from './dspf-edit.fill-constant';
import { windowResize } from './dspf-edit.window-resize';
import { sortElements } from './dspf-edit.sort-elements';
import { copyField } from './dspf-edit.copy-field';
import { copyConstant } from './dspf-edit.copy-constant';
import { removeElement } from './dspf-edit.remove-element';
import { removeAttribute } from './dspf-edit.remove-attribute';

export const commands = [
  { name: 'viewStructure', handler: viewStructure, needsTreeProvider: true },
  { name: 'addConstant', handler: addConstant, needsTreeProvider: false },
  { name: 'editConstant', handler: editConstant, needsTreeProvider: false },
  { name: 'registerFieldCommands', handler: registerFieldCommands, needsTreeProvider: false },
  { name: 'changePosition', handler: changePosition, needsTreeProvider: false },
  { name: 'centerPosition', handler: centerPosition, needsTreeProvider: false },
  { name: 'copyRecord', handler: copyRecord, needsTreeProvider: false },
  { name: 'deleteRecord', handler: deleteRecord, needsTreeProvider: false },
  { name: 'newRecord', handler: newRecord, needsTreeProvider: false },
  { name: 'goToLine', handler: goToLineHandler, needsTreeProvider: false },
  { name: 'addButtons', handler: addButtons, needsTreeProvider: false },
  { name: 'addColor', handler: addColor, needsTreeProvider: false },
  { name: 'addAttribute', handler: addAttribute, needsTreeProvider: false },
  { name: 'addKey', handler: addKeyCommand, needsTreeProvider: false },
  { name: 'addValidityCheck', handler: addValidityCheck, needsTreeProvider: false },
  { name: 'addEditingKeywords', handler: editingKeywords, needsTreeProvider: false },
  { name: 'addErrorMessage', handler: addErrorMessage, needsTreeProvider: false },
  { name: 'addIndicators', handler: addIndicators, needsTreeProvider: false },
  { name: 'fillConstant', handler: fillConstant, needsTreeProvider: false },
  { name: 'windowResize', handler: windowResize, needsTreeProvider: false },
  { name: 'sortElements', handler: sortElements, needsTreeProvider: false },
  { name: 'copyField', handler: copyField, needsTreeProvider: false },
  { name: 'copyConstant', handler: copyConstant, needsTreeProvider: false },
  { name: 'removeElement', handler: removeElement, needsTreeProvider: false },
  { name: 'removeAttribute', handler: removeAttribute, needsTreeProvider: false }
];

/**
 * Register all commands defined
 * @param context - Context
 * @param treeProvider - Tree Provider
 * @param commands - List of commands to register
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    treeProvider: DdsTreeProvider
) {
    commands.forEach(cmd => {
        if (cmd.needsTreeProvider) {
            (cmd.handler as (ctx: vscode.ExtensionContext, tp: DdsTreeProvider) => void)(context, treeProvider);
        } else {
            (cmd.handler as (ctx: vscode.ExtensionContext) => void)(context);
        };
    });
};

