/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.columns.ts
*/

/**
 * The single source of truth for the DDS positional layout.
 *
 * Every feature (status bar, hovers, decorations, diagnostics, quick fixes)
 * derives its knowledge of "what lives in which column" from this module.
 *
 * All columns are 1-based and inclusive, matching IBM documentation.
 */

export type FileType = "PF" | "LF" | "DSPF" | "PRTF" | "UNKNOWN";

export interface ColumnRegion {
  /** Stable identifier, e.g. "fieldName". */
  readonly id: string;
  /** Human readable label, e.g. "Field Name". */
  readonly label: string;
  /** First column of the region (1-based, inclusive). */
  readonly start: number;
  /** Last column of the region (1-based, inclusive). */
  readonly end: number;
  /** One-sentence purpose shown in hovers and the column reference. */
  readonly purpose: string;
  /** Typical values, shown in hovers. */
  readonly values?: readonly string[];
  /** Concrete examples, shown in hovers. */
  readonly examples?: readonly string[];
  /** Extra IBM notes. */
  readonly notes?: string;
}

/** Last column of a valid DDS statement. */
export const DDS_LINE_WIDTH = 80;

/** Column that holds the comment flag ("*"). */
export const COMMENT_COLUMN = 7;

export const REGIONS: readonly ColumnRegion[] = [
  {
    id: "sequence",
    label: "Sequence Number",
    start: 1,
    end: 5,
    purpose: "Optional source sequence number. Ignored by the DDS compiler.",
    examples: ["00010", "00020"],
    notes: "On IBM i the sequence number lives in the source member metadata; in stream files it is usually left blank.",
  },
  {
    id: "formType",
    label: "Form Type",
    start: 6,
    end: 6,
    purpose: "Identifies the line as a DDS specification. Always 'A'.",
    values: ["A"],
    examples: ["A"],
  },
  {
    id: "andOr",
    label: "Comment / And-Or",
    start: 7,
    end: 7,
    purpose:
      "'*' makes the whole line a comment. 'A' (and) or 'O' (or) combines conditioning indicators with the previous line.",
    values: ["*", "A", "O", "(blank)"],
  },
  {
    id: "indicators",
    label: "Conditioning Indicators",
    start: 8,
    end: 16,
    purpose:
      "Up to three indicator conditions (display and printer files). Each condition is an optional 'N' (not) followed by a two-digit indicator.",
    examples: ["N50", "50 51", "N31N32"],
    notes: "Columns 8-9-10, 11-12-13 and 14-15-16 each hold one condition.",
  },
  {
    id: "nameType",
    label: "Name Type",
    start: 17,
    end: 17,
    purpose: "Declares what the name in columns 19-28 is.",
    values: [
      "R = Record format",
      "K = Key field",
      "S = Select (LF)",
      "O = Omit (LF)",
      "J = Join (LF)",
      "H = Help (DSPF)",
      "(blank) = Field",
    ],
  },
  {
    id: "reserved",
    label: "Reserved",
    start: 18,
    end: 18,
    purpose: "Reserved. Must be blank.",
    values: ["(blank)"],
  },
  {
    id: "name",
    label: "Name",
    start: 19,
    end: 28,
    purpose:
      "Record, field or key field name, left-justified. Maximum 10 characters.",
    examples: ["CUSTOMER", "ORDERNO", "CUSREC"],
    notes:
      "Valid characters: A-Z, 0-9, @, #, $ and _. The first character cannot be a digit or underscore.",
  },
  {
    id: "reference",
    label: "Reference",
    start: 29,
    end: 29,
    purpose:
      "'R' means the field definition is copied from a referenced field (see REF / REFFLD).",
    values: ["R", "(blank)"],
  },
  {
    id: "length",
    label: "Length",
    start: 30,
    end: 34,
    purpose: "Field length, right-justified. Digits only.",
    examples: ["   10", "    7", "   30"],
    notes: "For numeric fields this is the number of digits, not bytes.",
  },
  {
    id: "dataType",
    label: "Data Type",
    start: 35,
    end: 35,
    purpose:
      "Data type (physical/logical files) or data type / keyboard shift (display and printer files).",
    values: [
      "A = Character",
      "P = Packed decimal",
      "S = Zoned decimal",
      "B = Binary",
      "F = Floating point",
      "L = Date",
      "T = Time",
      "Z = Timestamp",
      "H = Hexadecimal",
      "G = Graphic",
      "Y = Numeric only (DSPF)",
      "X = Alphabetic only (DSPF)",
    ],
  },
  {
    id: "decimals",
    label: "Decimal Positions",
    start: 36,
    end: 37,
    purpose:
      "Number of decimal positions for numeric fields, right-justified. Blank for character fields.",
    examples: [" 0", " 2"],
  },
  {
    id: "usage",
    label: "Usage",
    start: 38,
    end: 38,
    purpose: "How the field is used.",
    values: [
      "(blank) = default (data / output)",
      "B = Both input and output",
      "I = Input only",
      "O = Output only",
      "H = Hidden (DSPF)",
      "M = Message (DSPF)",
      "P = Program-to-system (DSPF)",
      "N = Neither (LF)",
    ],
  },
  {
    id: "locationLine",
    label: "Location: Line",
    start: 39,
    end: 41,
    purpose:
      "Screen line (display files) or print line (printer files) where the field appears. Right-justified.",
    examples: ["  3", " 12"],
    notes: "Unused for physical and logical files.",
  },
  {
    id: "locationPosition",
    label: "Location: Position",
    start: 42,
    end: 44,
    purpose:
      "Screen or print column where the field starts. Right-justified.",
    examples: ["  2", " 25"],
    notes: "Unused for physical and logical files.",
  },
  {
    id: "keywords",
    label: "Keywords",
    start: 45,
    end: 80,
    purpose:
      "DDS keywords and constants, e.g. TEXT('...'), COLHDG('...'), EDTCDE(Z). Continues on following lines when needed.",
    examples: ["TEXT('Customer name')", "COLHDG('Order' 'Number')", "EDTCDE(Z)"],
  },
] as const;

/** Region describing anything past column 80 (invalid area). */
export const BEYOND_REGION: ColumnRegion = {
  id: "beyond",
  label: "Beyond Column 80",
  start: DDS_LINE_WIDTH + 1,
  end: Number.MAX_SAFE_INTEGER,
  purpose: "DDS statements end at column 80. Text here is ignored or invalid.",
};

/** Returns the region containing the given 1-based column. */
export function regionAt(column: number): ColumnRegion {
  for (const region of REGIONS) {
    if (column >= region.start && column <= region.end) {
      return region;
    }
  }
  return BEYOND_REGION;
}

export function regionById(id: string): ColumnRegion | undefined {
  return REGIONS.find((r) => r.id === id);
}

/**
 * Column boundaries used for visual guides: the last column of each
 * meaningful region (a guide is drawn after that column).
 */
export const DEFAULT_GUIDE_COLUMNS: readonly number[] = [
  5, 6, 16, 18, 28, 29, 34, 35, 37, 38, 41, 44, 80,
];
