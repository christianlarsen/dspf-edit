/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.rules.ts
*/

/**
 * Pure diagnostic rules for display file DDS lines. No VS Code dependencies.
 */

import { DDS_LINE_WIDTH, regionById } from "./dspf-edit.columns";
import { ParsedLine, slice } from "./dspf-edit.column-parser";

export type IssueSeverity = "error" | "warning" | "information";

export interface Issue {
  readonly line: number;
  /** 1-based inclusive start column. */
  readonly startColumn: number;
  /** 1-based inclusive end column. */
  readonly endColumn: number;
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly code: string;
}

/** Data type / keyboard shift entries a display file accepts in column 35. */
const VALID_DATA_TYPES = new Set([
  "A", "X", "N", "S", "Y", "D", "M", "I", "W", "F", "L", "T", "Z", "G",
  // DBCS
  "J", "E", "O",
]);

/** Name types a display file accepts in column 17 (blank means "field"). */
const VALID_NAME_TYPES = new Set(["R", "H"]);

/** Usage entries a display file accepts in column 38. */
const VALID_USAGE = new Set(["B", "I", "O", "H", "M", "P"]);

/**
 * Entries that are perfectly valid DDS but belong to physical and logical
 * files. They are reported as warnings naming the reason rather than as plain
 * "invalid" errors, because a line carrying one is nearly always copied from a
 * database file rather than mistyped.
 */
const DATABASE_ONLY_DATA_TYPES = new Set(["P", "B", "H"]);
const DATABASE_ONLY_NAME_TYPES = new Set(["K", "S", "O", "J"]);
const DATABASE_ONLY_USAGE = new Set(["N"]);

const NAME_PATTERN = /^[A-Z@#$][A-Z0-9@#$_]*$/i;

function regionRange(id: string): { start: number; end: number } {
  const region = regionById(id);
  return region ? { start: region.start, end: region.end } : { start: 1, end: 1 };
}

function push(
  issues: Issue[],
  line: ParsedLine,
  regionId: string,
  severity: IssueSeverity,
  message: string,
  code: string,
): void {
  const { start, end } = regionRange(regionId);
  issues.push({
    line: line.lineNumber,
    startColumn: start,
    endColumn: end,
    severity,
    message,
    code,
  });
}

export function checkLine(line: ParsedLine): Issue[] {
  const issues: Issue[] = [];
  if (line.kind === "blank" || line.kind === "comment") {
    return issues;
  }

  // Form type: column 6 should be 'A' on any specification line.
  const formType = slice(line.raw, 6, 6).toUpperCase();
  if (line.raw.length >= 6 && formType !== "A" && formType.trim() !== "") {
    push(
      issues,
      line,
      "formType",
      "warning",
      `Column 6 should contain 'A' (found '${formType}').`,
      "dds-form-type",
    );
  }

  // Text past column 80.
  if (line.overflows) {
    issues.push({
      line: line.lineNumber,
      startColumn: DDS_LINE_WIDTH + 1,
      endColumn: line.raw.length,
      severity: "error",
      message: "DDS statements end at column 80. Text beyond column 80 is not allowed.",
      code: "dds-overflow",
    });
  }

  // Name validation (records, keys, fields).
  if (line.name !== "") {
    if (line.name.length > 10) {
      push(
        issues,
        line,
        "name",
        "error",
        `Name '${line.name}' is longer than 10 characters.`,
        "dds-name-length",
      );
    } else if (!NAME_PATTERN.test(line.name)) {
      push(
        issues,
        line,
        "name",
        "warning",
        `Name '${line.name}' contains invalid characters. Use A-Z, 0-9, @, #, $ or _ and do not start with a digit.`,
        "dds-name-chars",
      );
    }
    // Name must start in column 19 (left-justified).
    const nameArea = slice(line.raw, 19, 28);
    if (nameArea.length > 0 && nameArea[0] === " " && nameArea.trim() !== "") {
      push(
        issues,
        line,
        "name",
        "warning",
        "Names should be left-justified starting in column 19.",
        "dds-name-alignment",
      );
    }
  }

  // Name type letter.
  if (line.nameType !== "" && !VALID_NAME_TYPES.has(line.nameType)) {
    const databaseOnly = DATABASE_ONLY_NAME_TYPES.has(line.nameType);
    push(
      issues,
      line,
      "nameType",
      "warning",
      databaseOnly
        ? `Name type '${line.nameType}' belongs to physical and logical files. A display file uses R, H or blank.`
        : `'${line.nameType}' is not a valid name type. Expected R, H or blank.`,
      "dds-name-type",
    );
  }

  // Length: digits only, right-justified.
  if (line.length !== "") {
    if (!/^\d+$/.test(line.length)) {
      push(
        issues,
        line,
        "length",
        "error",
        `Length '${line.length}' must contain digits only.`,
        "dds-length-digits",
      );
    } else {
      const lengthArea = slice(line.raw, 30, 34);
      if (lengthArea.trimEnd().length !== lengthArea.length && lengthArea.trim() !== "") {
        push(
          issues,
          line,
          "length",
          "warning",
          "Length should be right-justified ending in column 34.",
          "dds-length-alignment",
        );
      }
    }
  }

  // Data type letter.
  if (line.dataType !== "" && !VALID_DATA_TYPES.has(line.dataType)) {
    const databaseOnly = DATABASE_ONLY_DATA_TYPES.has(line.dataType);
    push(
      issues,
      line,
      "dataType",
      databaseOnly ? "warning" : "error",
      databaseOnly
        ? `Data type '${line.dataType}' belongs to physical and logical files. A display file uses S or Y for numeric fields.`
        : `'${line.dataType}' is not a valid display file data type.`,
      "dds-data-type",
    );
  }

  // Decimals: digits only, and only meaningful on numeric types.
  if (line.decimals !== "") {
    if (!/^\d+$/.test(line.decimals)) {
      push(
        issues,
        line,
        "decimals",
        "error",
        `Decimal positions '${line.decimals}' must contain digits only.`,
        "dds-decimals-digits",
      );
    } else if (line.dataType === "A" || line.dataType === "H" || line.dataType === "G") {
      push(
        issues,
        line,
        "decimals",
        "warning",
        `Decimal positions are not valid for data type '${line.dataType}'.`,
        "dds-decimals-type",
      );
    } else if (line.length !== "" && /^\d+$/.test(line.length)) {
      if (parseInt(line.decimals, 10) > parseInt(line.length, 10)) {
        push(
          issues,
          line,
          "decimals",
          "error",
          "Decimal positions cannot exceed the field length.",
          "dds-decimals-length",
        );
      }
    }
  }

  // Packed/zoned lengths: max 63 digits.
  if ((line.dataType === "P" || line.dataType === "S") && /^\d+$/.test(line.length)) {
    if (parseInt(line.length, 10) > 63) {
      push(
        issues,
        line,
        "length",
        "error",
        "Packed and zoned fields cannot exceed 63 digits.",
        "dds-numeric-length",
      );
    }
  }

  // Character length: max 32766.
  if (line.dataType === "A" && /^\d+$/.test(line.length)) {
    if (parseInt(line.length, 10) > 32766) {
      push(
        issues,
        line,
        "length",
        "error",
        "Character fields cannot exceed 32766 characters.",
        "dds-char-length",
      );
    }
  }

  // Usage letter.
  if (line.usage !== "" && !VALID_USAGE.has(line.usage)) {
    const databaseOnly = DATABASE_ONLY_USAGE.has(line.usage);
    push(
      issues,
      line,
      "usage",
      "warning",
      databaseOnly
        ? `Usage '${line.usage}' belongs to logical files. A display file uses B, I, O, H, M, P or blank.`
        : `'${line.usage}' is not a valid usage. Expected B, I, O, H, M, P or blank.`,
      "dds-usage",
    );
  }

  // Record lines should not carry length/type data.
  if (line.kind === "record" && (line.length !== "" || line.dataType !== "")) {
    push(
      issues,
      line,
      "length",
      "warning",
      "Record format lines (R) should not specify length or data type.",
      "dds-record-data",
    );
  }

  return issues;
}

export function checkSource(lines: ParsedLine[]): Issue[] {
  const issues: Issue[] = [];
  for (const line of lines) {
    issues.push(...checkLine(line));
  }
  return issues;
}
