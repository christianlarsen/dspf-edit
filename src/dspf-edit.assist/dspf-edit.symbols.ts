/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.symbols.ts
*/

import * as vscode from "vscode";
import { parseSource, ParsedLine } from "./dspf-edit.column-parser";

const KIND_BY_LINE: Partial<Record<ParsedLine["kind"], vscode.SymbolKind>> = {
  record: vscode.SymbolKind.Struct,
  field: vscode.SymbolKind.Field,
  key: vscode.SymbolKind.Key,
};

/**
 * Outline view: record formats as parents, fields and keys as children.
 */
export class DdsDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const lines = parseSource(document.getText());
    const roots: vscode.DocumentSymbol[] = [];
    let currentRecord: vscode.DocumentSymbol | undefined;

    for (const line of lines) {
      const kind = KIND_BY_LINE[line.kind];
      if (!kind || line.name === "") {
        continue;
      }
      const range = new vscode.Range(
        line.lineNumber,
        0,
        line.lineNumber,
        Math.max(1, line.raw.length),
      );
      const detail =
        line.kind === "field" && line.length !== ""
          ? `${line.length}${line.dataType !== "" ? line.dataType : ""}${line.decimals !== "" ? `,${line.decimals}` : ""}`
          : line.kind === "key"
            ? "key"
            : "";
      const symbol = new vscode.DocumentSymbol(line.name, detail, kind, range, range);

      if (line.kind === "record") {
        roots.push(symbol);
        currentRecord = symbol;
      } else if (currentRecord) {
        currentRecord.children.push(symbol);
        currentRecord.range = new vscode.Range(currentRecord.range.start, range.end);
      } else {
        roots.push(symbol);
      }
    }
    return roots;
  }
}
