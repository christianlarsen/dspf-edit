/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.hover.ts
*/

import * as vscode from "vscode";
import { columnInfoAt } from "./dspf-edit.column-parser";
import { regionById } from "./dspf-edit.columns";
import { findKeyword } from "./dspf-edit.keywords";
import { readSettings } from "./dspf-edit.settings";

function columnHover(line: string, lineNumber: number, character: number): vscode.MarkdownString {
  const info = columnInfoAt(line, lineNumber, character);
  const region = info.region;

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${region.label}** — columns ${region.start}`);
  if (region.end !== region.start && region.end !== Number.MAX_SAFE_INTEGER) {
    md.appendMarkdown(`–${region.end}`);
  }
  md.appendMarkdown(`\n\n${region.purpose}\n`);

  if (region.values && region.values.length > 0) {
    md.appendMarkdown(`\n**Typical values**\n\n`);
    for (const value of region.values) {
      md.appendMarkdown(`- \`${value}\`\n`);
    }
  }
  if (region.examples && region.examples.length > 0) {
    md.appendMarkdown(`\n**Examples**\n\n`);
    for (const example of region.examples) {
      md.appendMarkdown(`- \`${example}\`\n`);
    }
  }
  if (region.notes) {
    md.appendMarkdown(`\n_${region.notes}_\n`);
  }
  md.appendMarkdown(`\n\n---\n\n$(layout-panel-justify) You are at column **${info.column}**.`);
  md.supportThemeIcons = true;
  return md;
}

/** Matches a DDS keyword name under the cursor within the keyword area. */
function keywordAt(line: string, character: number): { name: string; start: number; end: number } | undefined {
  const pattern = /[A-Z][A-Z0-9]*/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (character >= start && character < end) {
      return { name: match[0], start, end };
    }
  }
  return undefined;
}

export class DdsHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    if (!readSettings().hoverEnabled) {
      return undefined;
    }
    const line = document.lineAt(position.line).text;
    const column = position.character + 1;
    const keywordRegion = regionById("keywords");

    // Keyword documentation takes precedence inside the keyword area.
    if (keywordRegion && column >= keywordRegion.start) {
      const word = keywordAt(line, position.character);
      if (word) {
        const keyword = findKeyword(word.name);
        if (keyword) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**${keyword.name}** · \`${keyword.signature}\`\n\n`);
          md.appendMarkdown(`${keyword.description}\n\n`);
          md.appendCodeblock(keyword.example, "dds");
          return new vscode.Hover(
            md,
            new vscode.Range(position.line, word.start, position.line, word.end),
          );
        }
      }
    }

    return new vscode.Hover(columnHover(line, position.line, position.character));
  }
}
