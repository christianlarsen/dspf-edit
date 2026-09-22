/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.column-parser.ts
*/

/**
 * Pure DDS line parser. No VS Code dependencies — reusable and unit-testable.
 */

import {
  COMMENT_COLUMN,
  DDS_LINE_WIDTH,
  FileType,
  ColumnRegion,
  regionAt,
} from "./dspf-edit.columns";

export type LineKind =
  | "blank"
  | "comment"
  | "record"
  | "key"
  | "select"
  | "omit"
  | "join"
  | "help"
  | "field"
  | "keywordContinuation"
  | "unknown";

export interface ParsedLine {
  readonly lineNumber: number;
  readonly raw: string;
  readonly kind: LineKind;
  /** Value of the name area (19-28), trimmed. */
  readonly name: string;
  /** Name type letter in column 17 (upper-cased) or "". */
  readonly nameType: string;
  /** Length area (30-34), trimmed. */
  readonly length: string;
  /** Data type letter in column 35 (upper-cased) or "". */
  readonly dataType: string;
  /** Decimal positions (36-37), trimmed. */
  readonly decimals: string;
  /** Usage letter in column 38 (upper-cased) or "". */
  readonly usage: string;
  /** Location line (39-41), trimmed. */
  readonly locationLine: string;
  /** Location position (42-44), trimmed. */
  readonly locationPosition: string;
  /** Keyword area (45-80), right-trimmed. */
  readonly keywords: string;
  /** Reference flag column 29 (upper-cased) or "". */
  readonly reference: string;
  /** True when any non-blank text exists past column 80. */
  readonly overflows: boolean;
}

/** Extract a 1-based inclusive column range from a raw line. */
export function slice(raw: string, start: number, end: number): string {
  return raw.slice(start - 1, end);
}

function area(raw: string, start: number, end: number): string {
  return slice(raw, start, end).trim();
}

const NAME_TYPE_KINDS: Record<string, LineKind> = {
  R: "record",
  K: "key",
  S: "select",
  O: "omit",
  J: "join",
  H: "help",
};

export function parseLine(raw: string, lineNumber: number): ParsedLine {
  const base: Omit<ParsedLine, "kind"> = {
    lineNumber,
    raw,
    name: area(raw, 19, 28),
    nameType: area(raw, 17, 17).toUpperCase(),
    length: area(raw, 30, 34),
    dataType: area(raw, 35, 35).toUpperCase(),
    decimals: area(raw, 36, 37),
    usage: area(raw, 38, 38).toUpperCase(),
    locationLine: area(raw, 39, 41),
    locationPosition: area(raw, 42, 44),
    keywords: slice(raw, 45, DDS_LINE_WIDTH).trimEnd().trim(),
    reference: area(raw, 29, 29).toUpperCase(),
    overflows: raw.length > DDS_LINE_WIDTH && raw.slice(DDS_LINE_WIDTH).trim().length > 0,
  };

  if (raw.trim().length === 0) {
    return { ...base, kind: "blank" };
  }
  if (slice(raw, COMMENT_COLUMN, COMMENT_COLUMN) === "*") {
    return { ...base, kind: "comment" };
  }

  const kindFromType = NAME_TYPE_KINDS[base.nameType];
  if (kindFromType) {
    return { ...base, kind: kindFromType };
  }

  const hasFieldData =
    base.name !== "" || base.length !== "" || base.dataType !== "" || base.usage !== "";
  if (hasFieldData) {
    return { ...base, kind: "field" };
  }
  if (base.keywords !== "") {
    return { ...base, kind: "keywordContinuation" };
  }
  return { ...base, kind: "unknown" };
}

export function parseSource(text: string): ParsedLine[] {
  return text.split(/\r?\n/).map((raw, i) => parseLine(raw, i));
}

/** Infer the DDS file type from a file name / extension. */
export function fileTypeFromName(fileName: string): FileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pf")) {
    return "PF";
  }
  if (lower.endsWith(".lf")) {
    return "LF";
  }
  if (lower.endsWith(".dspf")) {
    return "DSPF";
  }
  if (lower.endsWith(".prtf")) {
    return "PRTF";
  }
  return "UNKNOWN";
}

export interface ColumnInfo {
  /** 1-based column. */
  readonly column: number;
  readonly region: ColumnRegion;
  /** Raw text of the region on this line. */
  readonly text: string;
  readonly parsed: ParsedLine;
}

/**
 * Column Service: given a raw line and a 0-based character offset,
 * describe what the cursor is on. Everything (status bar, highlight,
 * hover) relies on this.
 */
export function columnInfoAt(
  raw: string,
  lineNumber: number,
  characterZeroBased: number,
): ColumnInfo {
  const column = characterZeroBased + 1;
  const region = regionAt(column);
  const parsed = parseLine(raw, lineNumber);
  const text =
    region.end === Number.MAX_SAFE_INTEGER
      ? raw.slice(region.start - 1)
      : slice(raw, region.start, region.end);
  return { column, region, text, parsed };
}
