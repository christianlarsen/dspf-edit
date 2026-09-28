/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.completion.ts
*/

import * as vscode from "vscode";
import { regionById } from "./dspf-edit.columns";
import { KEYWORDS } from "./dspf-edit.keywords";
import { readSettings } from "./dspf-edit.settings";

/**
 * Suggests display file DDS keywords when the cursor is inside the keyword area
 * (columns 45-80).
 */
export class DdsCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    _document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    if (!readSettings().completionEnabled) {
      return undefined;
    }
    const keywordRegion = regionById("keywords");
    if (!keywordRegion || position.character + 1 < keywordRegion.start) {
      return undefined;
    }

    return KEYWORDS.map((keyword) => {
      const item = new vscode.CompletionItem(
        keyword.name === "CAA" ? "CAnn" : keyword.name === "CFA" ? "CFnn" : keyword.name,
        vscode.CompletionItemKind.Keyword,
      );
      item.insertText = new vscode.SnippetString(keyword.insertText);
      item.detail = keyword.signature;
      const doc = new vscode.MarkdownString();
      doc.appendMarkdown(`${keyword.description}\n\n`);
      doc.appendCodeblock(keyword.example, "dds");
      item.documentation = doc;
      return item;
    });
  }
}
