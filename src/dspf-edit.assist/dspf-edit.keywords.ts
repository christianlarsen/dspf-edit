/*
	Rabbi Hossain, 2026
	"DDS editing assistance"
	dspf-edit.assist/dspf-edit.keywords.ts
*/

/**
 * DDS keyword dictionary used for completion and hover documentation.
 * Pure data — no VS Code dependencies.
 */

import { FileType } from "./dspf-edit.columns";

export interface DdsKeyword {
  readonly name: string;
  /** Snippet-style insert text, e.g. "TEXT('${1:description}')". */
  readonly insertText: string;
  readonly signature: string;
  readonly description: string;
  readonly example: string;
  /** File types the keyword applies to. Empty means all. */
  readonly fileTypes: readonly FileType[];
}

const ALL: readonly FileType[] = [];
const PF_LF: readonly FileType[] = ["PF", "LF"];
const DSPF: readonly FileType[] = ["DSPF"];
const PRTF: readonly FileType[] = ["PRTF"];
const DSPF_PRTF: readonly FileType[] = ["DSPF", "PRTF"];

export const KEYWORDS: readonly DdsKeyword[] = [
  {
    name: "TEXT",
    insertText: "TEXT('${1:description}')",
    signature: "TEXT('description')",
    description:
      "Supplies a text description (up to 50 characters) for a record format or field. Shown by commands such as DSPFFD and used as documentation.",
    example: "TEXT('Customer master record')",
    fileTypes: ALL,
  },
  {
    name: "COLHDG",
    insertText: "COLHDG('${1:heading}')",
    signature: "COLHDG('line1' ['line2' ['line3']])",
    description:
      "Column headings for the field, up to three lines of 20 characters each. Used by Query, SQL and DSPFFD.",
    example: "COLHDG('Customer' 'Number')",
    fileTypes: PF_LF,
  },
  {
    name: "REF",
    insertText: "REF(${1:library}/${2:file})",
    signature: "REF([library/]file [record-format])",
    description:
      "Names the file used to look up referenced field definitions for fields flagged with R in column 29.",
    example: "REF(MYLIB/FIELDREF)",
    fileTypes: ALL,
  },
  {
    name: "REFFLD",
    insertText: "REFFLD(${1:field} ${2:library}/${3:file})",
    signature: "REFFLD(referenced-field [library/]file)",
    description:
      "Copies the definition of another field. Used with R in column 29 when the referenced field name or file differs from the default.",
    example: "REFFLD(CUSNAM REFLIB/FIELDREF)",
    fileTypes: ALL,
  },
  {
    name: "VALUES",
    insertText: "VALUES(${1:'A' 'B'})",
    signature: "VALUES(value-1 [value-2 ...])",
    description:
      "Restricts valid input to an explicit list of values. Validity checking keyword.",
    example: "VALUES('Y' 'N')",
    fileTypes: ALL,
  },
  {
    name: "RANGE",
    insertText: "RANGE(${1:low} ${2:high})",
    signature: "RANGE(low-value high-value)",
    description: "Restricts valid input to a range of values.",
    example: "RANGE(1 999)",
    fileTypes: ALL,
  },
  {
    name: "COMP",
    insertText: "COMP(${1:EQ} ${2:value})",
    signature: "COMP(operator value)",
    description:
      "Compares input against a value. Operators: EQ, NE, LT, NL, GT, NG, LE, GE.",
    example: "COMP(GT 0)",
    fileTypes: ALL,
  },
  {
    name: "EDTCDE",
    insertText: "EDTCDE(${1:Z})",
    signature: "EDTCDE(edit-code [* | currency-symbol])",
    description:
      "Edits numeric output with a predefined edit code (1-4, A-D, J-Q, W-Z). Z suppresses leading zeros.",
    example: "EDTCDE(Z)",
    fileTypes: ALL,
  },
  {
    name: "EDTWRD",
    insertText: "EDTWRD('${1:edit-word}')",
    signature: "EDTWRD('edit-word')",
    description: "Edits numeric output with a custom edit word mask.",
    example: "EDTWRD('  /  /  ')",
    fileTypes: ALL,
  },
  {
    name: "DFT",
    insertText: "DFT('${1:value}')",
    signature: "DFT('value')",
    description: "Specifies a default value for the field.",
    example: "DFT('N')",
    fileTypes: ALL,
  },
  {
    name: "ALIAS",
    insertText: "ALIAS(${1:alternative_name})",
    signature: "ALIAS(alternative-name)",
    description:
      "Alternative (long) field name, up to 30 characters, used by SQL and high-level languages that support long names.",
    example: "ALIAS(CUSTOMER_NUMBER)",
    fileTypes: ALL,
  },
  {
    name: "UNIQUE",
    insertText: "UNIQUE",
    signature: "UNIQUE",
    description:
      "File-level keyword: key values must be unique. Duplicate key insert/update fails.",
    example: "UNIQUE",
    fileTypes: PF_LF,
  },
  {
    name: "PFILE",
    insertText: "PFILE(${1:library}/${2:file})",
    signature: "PFILE([library/]physical-file)",
    description:
      "Logical file record level keyword: names the physical file the logical file is based on.",
    example: "PFILE(MYLIB/CUSTOMER)",
    fileTypes: ["LF"],
  },
  {
    name: "JFILE",
    insertText: "JFILE(${1:file1} ${2:file2})",
    signature: "JFILE(file-1 file-2 [...])",
    description: "Join logical file: names the physical files being joined.",
    example: "JFILE(CUSTOMER ORDERS)",
    fileTypes: ["LF"],
  },
  {
    name: "JOIN",
    insertText: "JOIN(${1:1} ${2:2})",
    signature: "JOIN(from-file to-file)",
    description: "Identifies which pair of files a join specification joins.",
    example: "JOIN(1 2)",
    fileTypes: ["LF"],
  },
  {
    name: "JFLD",
    insertText: "JFLD(${1:field1} ${2:field2})",
    signature: "JFLD(from-field to-field)",
    description: "Names the fields whose values are matched in a join.",
    example: "JFLD(CUSNO CUSNO)",
    fileTypes: ["LF"],
  },
  {
    name: "DESCEND",
    insertText: "DESCEND",
    signature: "DESCEND",
    description: "Key field keyword: sorts this key in descending order.",
    example: "DESCEND",
    fileTypes: PF_LF,
  },
  {
    name: "CAA",
    insertText: "CA${1:03}(${2:03} '${3:Exit}')",
    signature: "CAnn([response-indicator] ['text'])",
    description:
      "Command Attention key: pressing Fnn sets the indicator without returning field data. (Type CA01-CA24.)",
    example: "CA03(03 'Exit')",
    fileTypes: DSPF,
  },
  {
    name: "CFA",
    insertText: "CF${1:04}(${2:04} '${3:Prompt}')",
    signature: "CFnn([response-indicator] ['text'])",
    description:
      "Command Function key: pressing Fnn sets the indicator and returns input data. (Type CF01-CF24.)",
    example: "CF04(04 'Prompt')",
    fileTypes: DSPF,
  },
  {
    name: "SFL",
    insertText: "SFL",
    signature: "SFL",
    description: "Record-level keyword: this record format is a subfile.",
    example: "SFL",
    fileTypes: DSPF,
  },
  {
    name: "SFLCTL",
    insertText: "SFLCTL(${1:subfile-record})",
    signature: "SFLCTL(subfile-record-format)",
    description: "Marks this record as the subfile control record for the named subfile.",
    example: "SFLCTL(SFLREC)",
    fileTypes: DSPF,
  },
  {
    name: "SFLSIZ",
    insertText: "SFLSIZ(${1:0050})",
    signature: "SFLSIZ(number-of-records)",
    description: "Total number of records the subfile can hold.",
    example: "SFLSIZ(0050)",
    fileTypes: DSPF,
  },
  {
    name: "SFLPAG",
    insertText: "SFLPAG(${1:0010})",
    signature: "SFLPAG(records-per-page)",
    description: "Number of subfile records shown on the display at one time.",
    example: "SFLPAG(0010)",
    fileTypes: DSPF,
  },
  {
    name: "SFLDSP",
    insertText: "SFLDSP",
    signature: "SFLDSP",
    description: "Displays the subfile when the control record is written.",
    example: "SFLDSP",
    fileTypes: DSPF,
  },
  {
    name: "SFLDSPCTL",
    insertText: "SFLDSPCTL",
    signature: "SFLDSPCTL",
    description: "Displays the subfile control record fields.",
    example: "SFLDSPCTL",
    fileTypes: DSPF,
  },
  {
    name: "SFLCLR",
    insertText: "SFLCLR",
    signature: "SFLCLR",
    description: "Clears all records from the subfile.",
    example: "SFLCLR",
    fileTypes: DSPF,
  },
  {
    name: "SFLEND",
    insertText: "SFLEND(${1:*MORE})",
    signature: "SFLEND[(*PLUS | *MORE | *SCRBAR)]",
    description:
      "Shows a 'More...' / '+' / scroll bar indication when more subfile records exist.",
    example: "SFLEND(*MORE)",
    fileTypes: DSPF,
  },
  {
    name: "SFLRCDNBR",
    insertText: "SFLRCDNBR",
    signature: "SFLRCDNBR[(CURSOR)]",
    description:
      "Hidden field holding the subfile record number of the page to display first.",
    example: "SFLRCDNBR(CURSOR)",
    fileTypes: DSPF,
  },
  {
    name: "OVERLAY",
    insertText: "OVERLAY",
    signature: "OVERLAY",
    description:
      "Writes this record without clearing the rest of the display.",
    example: "OVERLAY",
    fileTypes: DSPF,
  },
  {
    name: "WINDOW",
    insertText: "WINDOW(${1:line} ${2:position} ${3:lines} ${4:positions})",
    signature: "WINDOW(start-line start-pos lines positions)",
    description: "Displays this record format as a window on the screen.",
    example: "WINDOW(5 10 12 60)",
    fileTypes: DSPF,
  },
  {
    name: "WDWBORDER",
    insertText: "WDWBORDER((*COLOR ${1:BLU}))",
    signature: "WDWBORDER((*COLOR value) (*DSPATR value) (*CHAR 'chars'))",
    description: "Customizes the border of a window.",
    example: "WDWBORDER((*COLOR BLU) (*CHAR '........'))",
    fileTypes: DSPF,
  },
  {
    name: "DSPATR",
    insertText: "DSPATR(${1:HI})",
    signature: "DSPATR(attribute [...])",
    description:
      "Display attributes: HI (high intensity), RI (reverse image), UL (underline), BL (blink), CS (column separators), ND (non-display), PC (position cursor), PR (protect).",
    example: "DSPATR(HI UL)",
    fileTypes: DSPF,
  },
  {
    name: "COLOR",
    insertText: "COLOR(${1:WHT})",
    signature: "COLOR(BLU | GRN | PNK | RED | TRQ | WHT | YLW)",
    description: "Sets the display color of the field on color displays.",
    example: "COLOR(WHT)",
    fileTypes: DSPF,
  },
  {
    name: "ERRMSG",
    insertText: "ERRMSG('${1:message}' ${2:99})",
    signature: "ERRMSG('message-text' [response-indicator])",
    description:
      "Displays an error message on the message line when the option indicator is on.",
    example: "ERRMSG('Customer not found' 99)",
    fileTypes: DSPF,
  },
  {
    name: "ERRMSGID",
    insertText: "ERRMSGID(${1:MSG0001} ${2:library}/${3:msgfile})",
    signature: "ERRMSGID(msg-id [library/]msg-file [indicator] [&field])",
    description: "Displays a message from a message file when the option indicator is on.",
    example: "ERRMSGID(CPF9898 QCPFMSG)",
    fileTypes: DSPF,
  },
  {
    name: "BLANKS",
    insertText: "BLANKS(${1:99})",
    signature: "BLANKS(response-indicator)",
    description: "Sets the indicator on when the field is blank on input.",
    example: "BLANKS(50)",
    fileTypes: DSPF,
  },
  {
    name: "CHANGE",
    insertText: "CHANGE(${1:99})",
    signature: "CHANGE(response-indicator)",
    description: "Sets the indicator on when data is typed into the field.",
    example: "CHANGE(88)",
    fileTypes: DSPF,
  },
  {
    name: "CHECK",
    insertText: "CHECK(${1:ME})",
    signature: "CHECK(code [...])",
    description:
      "Validity/keyboard checks: ME (mandatory enter), MF (mandatory fill), AB (allow blanks), LC (lowercase), RB (right-justify blank fill), RZ (right-justify zero fill).",
    example: "CHECK(ME)",
    fileTypes: DSPF,
  },
  {
    name: "DATE",
    insertText: "DATE(*YY *MDY)",
    signature: "DATE([*YY | *SYS] [edit])",
    description: "Outputs the current job or system date as a constant field.",
    example: "DATE(*YY)",
    fileTypes: DSPF_PRTF,
  },
  {
    name: "TIME",
    insertText: "TIME",
    signature: "TIME",
    description: "Outputs the current system time as a constant field.",
    example: "TIME",
    fileTypes: DSPF_PRTF,
  },
  {
    name: "EDTMSK",
    insertText: "EDTMSK('${1:mask}')",
    signature: "EDTMSK('edit-mask')",
    description: "Protects parts of an edited input-capable field (used with EDTCDE/EDTWRD).",
    example: "EDTMSK('   &  &   ')",
    fileTypes: DSPF,
  },
  {
    name: "INDARA",
    insertText: "INDARA",
    signature: "INDARA",
    description:
      "File-level keyword: passes indicators in a separate 99-byte indicator area instead of the record buffer.",
    example: "INDARA",
    fileTypes: DSPF_PRTF,
  },
  {
    name: "PRINT",
    insertText: "PRINT",
    signature: "PRINT[([library/]printer-file)]",
    description: "Allows the workstation user to print the current display.",
    example: "PRINT",
    fileTypes: DSPF,
  },
  {
    name: "VLDCMDKEY",
    insertText: "VLDCMDKEY(${1:99})",
    signature: "VLDCMDKEY(response-indicator)",
    description: "Sets the indicator on when any valid command key is pressed.",
    example: "VLDCMDKEY(70)",
    fileTypes: DSPF,
  },
  {
    name: "ASSUME",
    insertText: "ASSUME",
    signature: "ASSUME",
    description:
      "Assumes this record is already on the display when the file is opened; prevents the screen from being cleared.",
    example: "ASSUME",
    fileTypes: DSPF,
  },
  {
    name: "KEEP",
    insertText: "KEEP",
    signature: "KEEP",
    description: "Keeps the display contents when the file is closed.",
    example: "KEEP",
    fileTypes: DSPF,
  },
  {
    name: "PUTOVR",
    insertText: "PUTOVR",
    signature: "PUTOVR",
    description:
      "Enables override attributes/data (OVRDTA, OVRATR) on an already-displayed record, reducing data transmission.",
    example: "PUTOVR",
    fileTypes: DSPF,
  },
  {
    name: "OVRDTA",
    insertText: "OVRDTA",
    signature: "OVRDTA",
    description: "With PUTOVR: sends this field's data again on a re-write.",
    example: "OVRDTA",
    fileTypes: DSPF,
  },
  {
    name: "OVRATR",
    insertText: "OVRATR",
    signature: "OVRATR",
    description: "With PUTOVR: overrides this field's display attributes on a re-write.",
    example: "OVRATR",
    fileTypes: DSPF,
  },
  {
    name: "ROLLUP",
    insertText: "ROLLUP(${1:25})",
    signature: "ROLLUP(response-indicator)",
    description: "Sets the indicator when the user presses Page Down (Roll Up).",
    example: "ROLLUP(25)",
    fileTypes: DSPF,
  },
  {
    name: "ROLLDOWN",
    insertText: "ROLLDOWN(${1:26})",
    signature: "ROLLDOWN(response-indicator)",
    description: "Sets the indicator when the user presses Page Up (Roll Down).",
    example: "ROLLDOWN(26)",
    fileTypes: DSPF,
  },
  {
    name: "SKIPB",
    insertText: "SKIPB(${1:1})",
    signature: "SKIPB(line-number)",
    description: "Printer file: skip to the given line before printing.",
    example: "SKIPB(1)",
    fileTypes: PRTF,
  },
  {
    name: "SKIPA",
    insertText: "SKIPA(${1:1})",
    signature: "SKIPA(line-number)",
    description: "Printer file: skip to the given line after printing.",
    example: "SKIPA(1)",
    fileTypes: PRTF,
  },
  {
    name: "SPACEB",
    insertText: "SPACEB(${1:1})",
    signature: "SPACEB(lines)",
    description: "Printer file: space the given number of lines before printing.",
    example: "SPACEB(1)",
    fileTypes: PRTF,
  },
  {
    name: "SPACEA",
    insertText: "SPACEA(${1:1})",
    signature: "SPACEA(lines)",
    description: "Printer file: space the given number of lines after printing.",
    example: "SPACEA(2)",
    fileTypes: PRTF,
  },
  {
    name: "PAGNBR",
    insertText: "PAGNBR",
    signature: "PAGNBR",
    description: "Printer file: prints the current page number (4-digit zoned field).",
    example: "PAGNBR",
    fileTypes: PRTF,
  },
  {
    name: "UNDERLINE",
    insertText: "UNDERLINE",
    signature: "UNDERLINE",
    description: "Printer file: underlines the field when printed.",
    example: "UNDERLINE",
    fileTypes: PRTF,
  },
  {
    name: "HIGHLIGHT",
    insertText: "HIGHLIGHT",
    signature: "HIGHLIGHT",
    description: "Printer file: prints the field in bold.",
    example: "HIGHLIGHT",
    fileTypes: PRTF,
  },
  {
    name: "CPI",
    insertText: "CPI(${1:10})",
    signature: "CPI(characters-per-inch)",
    description: "Printer file: sets characters per inch.",
    example: "CPI(15)",
    fileTypes: PRTF,
  },
  {
    name: "TIMFMT",
    insertText: "TIMFMT(${1:*ISO})",
    signature: "TIMFMT(*HMS | *ISO | *USA | *EUR | *JIS)",
    description: "Format of a time (T) field.",
    example: "TIMFMT(*ISO)",
    fileTypes: ALL,
  },
  {
    name: "DATFMT",
    insertText: "DATFMT(${1:*ISO})",
    signature: "DATFMT(*MDY | *DMY | *YMD | *JUL | *ISO | *USA | *EUR | *JIS)",
    description: "Format of a date (L) field.",
    example: "DATFMT(*ISO)",
    fileTypes: ALL,
  },
  {
    name: "DATSEP",
    insertText: "DATSEP('${1:-}')",
    signature: "DATSEP('separator')",
    description: "Separator character of a date (L) field.",
    example: "DATSEP('-')",
    fileTypes: ALL,
  },
  {
    name: "ALWNULL",
    insertText: "ALWNULL",
    signature: "ALWNULL",
    description: "Allows the null value in this field.",
    example: "ALWNULL",
    fileTypes: PF_LF,
  },
  {
    name: "VARLEN",
    insertText: "VARLEN(${1:allocated-length})",
    signature: "VARLEN([allocated-length])",
    description: "Makes a character field variable length.",
    example: "VARLEN(50)",
    fileTypes: PF_LF,
  },
  {
    name: "FORMAT",
    insertText: "FORMAT(${1:library}/${2:file})",
    signature: "FORMAT([library/]file)",
    description: "Shares the record format of another file.",
    example: "FORMAT(MYLIB/CUSTOMER)",
    fileTypes: PF_LF,
  },
  {
    name: "RENAME",
    insertText: "RENAME(${1:old-name})",
    signature: "RENAME(physical-file-field)",
    description: "Logical file: renames a field from the based-on physical file.",
    example: "RENAME(CUSNO)",
    fileTypes: ["LF"],
  },
  {
    name: "CONCAT",
    insertText: "CONCAT(${1:field1} ${2:field2})",
    signature: "CONCAT(field-1 field-2 [...])",
    description: "Logical file: concatenates physical file fields into one field.",
    example: "CONCAT(FIRST LAST)",
    fileTypes: ["LF"],
  },
  {
    name: "SST",
    insertText: "SST(${1:field} ${2:start} ${3:length})",
    signature: "SST(field start-position [length])",
    description: "Logical file: defines a substring of a physical file field.",
    example: "SST(PHONE 1 3)",
    fileTypes: ["LF"],
  },
  {
    name: "DYNSLT",
    insertText: "DYNSLT",
    signature: "DYNSLT",
    description:
      "Logical file: performs select/omit dynamically at read time instead of maintaining an access path.",
    example: "DYNSLT",
    fileTypes: ["LF"],
  },
  {
    name: "FCFO",
    insertText: "FCFO",
    signature: "FCFO",
    description: "Duplicate keys are retrieved first-changed-first-out.",
    example: "FCFO",
    fileTypes: PF_LF,
  },
  {
    name: "FIFO",
    insertText: "FIFO",
    signature: "FIFO",
    description: "Duplicate keys are retrieved first-in-first-out.",
    example: "FIFO",
    fileTypes: PF_LF,
  },
  {
    name: "LIFO",
    insertText: "LIFO",
    signature: "LIFO",
    description: "Duplicate keys are retrieved last-in-first-out.",
    example: "LIFO",
    fileTypes: PF_LF,
  },
] as const;

/** Case-insensitive lookup, also resolving CA01-CA24 / CF01-CF24. */
export function findKeyword(name: string): DdsKeyword | undefined {
  const upper = name.toUpperCase();
  const direct = KEYWORDS.find((k) => k.name === upper);
  if (direct) {
    return direct;
  }
  const fkey = /^(CA|CF)(0[1-9]|1\d|2[0-4])$/.exec(upper);
  if (fkey) {
    return KEYWORDS.find((k) => k.name === (fkey[1] === "CA" ? "CAA" : "CFA"));
  }
  return undefined;
}

/** Keywords applicable to a file type (UNKNOWN gets everything). */
export function keywordsFor(fileType: FileType): readonly DdsKeyword[] {
  if (fileType === "UNKNOWN") {
    return KEYWORDS;
  }
  return KEYWORDS.filter(
    (k) => k.fileTypes.length === 0 || k.fileTypes.includes(fileType),
  );
}
