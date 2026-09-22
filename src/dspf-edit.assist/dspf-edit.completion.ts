/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.completion.ts
*/

import * as vscode from "vscode";
import { regionById } from "./dspf-edit.columns";
import { keywordsFor } from "./dspf-edit.keywords";
import { fileTypeFromName } from "./dspf-edit.column-parser";
import { readSettings } from "./dspf-edit.settings";

/**
 * Suggests DDS keywords when the cursor is inside the keyword area
 * (columns 45-80). Suggestions are filtered by file type.
 */
export class DdsCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    if (!readSettings().completionEnabled) {
      return undefined;
    }
    const keywordRegion = regionById("keywords");
    if (!keywordRegion || position.character + 1 < keywordRegion.start) {
      return undefined;
    }

    const fileType = fileTypeFromName(document.fileName);
    return keywordsFor(fileType).map((keyword) => {
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
