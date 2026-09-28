/*
	Rabbi Hossain, 2026
	"DSPF source editing assistance"
	dspf-edit.assist/dspf-edit.keywords.ts
*/

/**
 * Display file DDS keyword dictionary used for completion and hover
 * documentation. Pure data — no VS Code dependencies.
 */

export interface DdsKeyword {
  readonly name: string;
  /** Snippet-style insert text, e.g. "TEXT('${1:description}')". */
  readonly insertText: string;
  readonly signature: string;
  readonly description: string;
  readonly example: string;
}

export const KEYWORDS: readonly DdsKeyword[] = [
  {
    name: "TEXT",
    insertText: "TEXT('${1:description}')",
    signature: "TEXT('description')",
    description:
      "Supplies a text description (up to 50 characters) for a record format or field. Shown by commands such as DSPFFD and used as documentation.",
    example: "TEXT('Customer master record')",
  },
  {
    name: "REF",
    insertText: "REF(${1:library}/${2:file})",
    signature: "REF([library/]file [record-format])",
    description:
      "Names the file used to look up referenced field definitions for fields flagged with R in column 29.",
    example: "REF(MYLIB/FIELDREF)",
  },
  {
    name: "REFFLD",
    insertText: "REFFLD(${1:field} ${2:library}/${3:file})",
    signature: "REFFLD(referenced-field [library/]file)",
    description:
      "Copies the definition of another field. Used with R in column 29 when the referenced field name or file differs from the default.",
    example: "REFFLD(CUSNAM REFLIB/FIELDREF)",
  },
  {
    name: "VALUES",
    insertText: "VALUES(${1:'A' 'B'})",
    signature: "VALUES(value-1 [value-2 ...])",
    description:
      "Restricts valid input to an explicit list of values. Validity checking keyword.",
    example: "VALUES('Y' 'N')",
  },
  {
    name: "RANGE",
    insertText: "RANGE(${1:low} ${2:high})",
    signature: "RANGE(low-value high-value)",
    description: "Restricts valid input to a range of values.",
    example: "RANGE(1 999)",
  },
  {
    name: "COMP",
    insertText: "COMP(${1:EQ} ${2:value})",
    signature: "COMP(operator value)",
    description:
      "Compares input against a value. Operators: EQ, NE, LT, NL, GT, NG, LE, GE.",
    example: "COMP(GT 0)",
  },
  {
    name: "EDTCDE",
    insertText: "EDTCDE(${1:Z})",
    signature: "EDTCDE(edit-code [* | currency-symbol])",
    description:
      "Edits numeric output with a predefined edit code (1-4, A-D, J-Q, W-Z). Z suppresses leading zeros.",
    example: "EDTCDE(Z)",
  },
  {
    name: "EDTWRD",
    insertText: "EDTWRD('${1:edit-word}')",
    signature: "EDTWRD('edit-word')",
    description: "Edits numeric output with a custom edit word mask.",
    example: "EDTWRD('  /  /  ')",
  },
  {
    name: "DFT",
    insertText: "DFT('${1:value}')",
    signature: "DFT('value')",
    description: "Specifies a default value for the field.",
    example: "DFT('N')",
  },
  {
    name: "ALIAS",
    insertText: "ALIAS(${1:alternative_name})",
    signature: "ALIAS(alternative-name)",
    description:
      "Alternative (long) field name, up to 30 characters, used by SQL and high-level languages that support long names.",
    example: "ALIAS(CUSTOMER_NUMBER)",
  },
  {
    name: "CAA",
    insertText: "CA${1:03}(${2:03} '${3:Exit}')",
    signature: "CAnn([response-indicator] ['text'])",
    description:
      "Command Attention key: pressing Fnn sets the indicator without returning field data. (Type CA01-CA24.)",
    example: "CA03(03 'Exit')",
  },
  {
    name: "CFA",
    insertText: "CF${1:04}(${2:04} '${3:Prompt}')",
    signature: "CFnn([response-indicator] ['text'])",
    description:
      "Command Function key: pressing Fnn sets the indicator and returns input data. (Type CF01-CF24.)",
    example: "CF04(04 'Prompt')",
  },
  {
    name: "SFL",
    insertText: "SFL",
    signature: "SFL",
    description: "Record-level keyword: this record format is a subfile.",
    example: "SFL",
  },
  {
    name: "SFLCTL",
    insertText: "SFLCTL(${1:subfile-record})",
    signature: "SFLCTL(subfile-record-format)",
    description: "Marks this record as the subfile control record for the named subfile.",
    example: "SFLCTL(SFLREC)",
  },
  {
    name: "SFLSIZ",
    insertText: "SFLSIZ(${1:0050})",
    signature: "SFLSIZ(number-of-records)",
    description: "Total number of records the subfile can hold.",
    example: "SFLSIZ(0050)",
  },
  {
    name: "SFLPAG",
    insertText: "SFLPAG(${1:0010})",
    signature: "SFLPAG(records-per-page)",
    description: "Number of subfile records shown on the display at one time.",
    example: "SFLPAG(0010)",
  },
  {
    name: "SFLDSP",
    insertText: "SFLDSP",
    signature: "SFLDSP",
    description: "Displays the subfile when the control record is written.",
    example: "SFLDSP",
  },
  {
    name: "SFLDSPCTL",
    insertText: "SFLDSPCTL",
    signature: "SFLDSPCTL",
    description: "Displays the subfile control record fields.",
    example: "SFLDSPCTL",
  },
  {
    name: "SFLCLR",
    insertText: "SFLCLR",
    signature: "SFLCLR",
    description: "Clears all records from the subfile.",
    example: "SFLCLR",
  },
  {
    name: "SFLEND",
    insertText: "SFLEND(${1:*MORE})",
    signature: "SFLEND[(*PLUS | *MORE | *SCRBAR)]",
    description:
      "Shows a 'More...' / '+' / scroll bar indication when more subfile records exist.",
    example: "SFLEND(*MORE)",
  },
  {
    name: "SFLRCDNBR",
    insertText: "SFLRCDNBR",
    signature: "SFLRCDNBR[(CURSOR)]",
    description:
      "Hidden field holding the subfile record number of the page to display first.",
    example: "SFLRCDNBR(CURSOR)",
  },
  {
    name: "OVERLAY",
    insertText: "OVERLAY",
    signature: "OVERLAY",
    description:
      "Writes this record without clearing the rest of the display.",
    example: "OVERLAY",
  },
  {
    name: "WINDOW",
    insertText: "WINDOW(${1:line} ${2:position} ${3:lines} ${4:positions})",
    signature: "WINDOW(start-line start-pos lines positions)",
    description: "Displays this record format as a window on the screen.",
    example: "WINDOW(5 10 12 60)",
  },
  {
    name: "WDWBORDER",
    insertText: "WDWBORDER((*COLOR ${1:BLU}))",
    signature: "WDWBORDER((*COLOR value) (*DSPATR value) (*CHAR 'chars'))",
    description: "Customizes the border of a window.",
    example: "WDWBORDER((*COLOR BLU) (*CHAR '........'))",
  },
  {
    name: "DSPATR",
    insertText: "DSPATR(${1:HI})",
    signature: "DSPATR(attribute [...])",
    description:
      "Display attributes: HI (high intensity), RI (reverse image), UL (underline), BL (blink), CS (column separators), ND (non-display), PC (position cursor), PR (protect).",
    example: "DSPATR(HI UL)",
  },
  {
    name: "COLOR",
    insertText: "COLOR(${1:WHT})",
    signature: "COLOR(BLU | GRN | PNK | RED | TRQ | WHT | YLW)",
    description: "Sets the display color of the field on color displays.",
    example: "COLOR(WHT)",
  },
  {
    name: "ERRMSG",
    insertText: "ERRMSG('${1:message}' ${2:99})",
    signature: "ERRMSG('message-text' [response-indicator])",
    description:
      "Displays an error message on the message line when the option indicator is on.",
    example: "ERRMSG('Customer not found' 99)",
  },
  {
    name: "ERRMSGID",
    insertText: "ERRMSGID(${1:MSG0001} ${2:library}/${3:msgfile})",
    signature: "ERRMSGID(msg-id [library/]msg-file [indicator] [&field])",
    description: "Displays a message from a message file when the option indicator is on.",
    example: "ERRMSGID(CPF9898 QCPFMSG)",
  },
  {
    name: "BLANKS",
    insertText: "BLANKS(${1:99})",
    signature: "BLANKS(response-indicator)",
    description: "Sets the indicator on when the field is blank on input.",
    example: "BLANKS(50)",
  },
  {
    name: "CHANGE",
    insertText: "CHANGE(${1:99})",
    signature: "CHANGE(response-indicator)",
    description: "Sets the indicator on when data is typed into the field.",
    example: "CHANGE(88)",
  },
  {
    name: "CHECK",
    insertText: "CHECK(${1:ME})",
    signature: "CHECK(code [...])",
    description:
      "Validity/keyboard checks: ME (mandatory enter), MF (mandatory fill), AB (allow blanks), LC (lowercase), RB (right-justify blank fill), RZ (right-justify zero fill).",
    example: "CHECK(ME)",
  },
  {
    name: "DATE",
    insertText: "DATE(*YY *MDY)",
    signature: "DATE([*YY | *SYS] [edit])",
    description: "Outputs the current job or system date as a constant field.",
    example: "DATE(*YY)",
  },
  {
    name: "TIME",
    insertText: "TIME",
    signature: "TIME",
    description: "Outputs the current system time as a constant field.",
    example: "TIME",
  },
  {
    name: "EDTMSK",
    insertText: "EDTMSK('${1:mask}')",
    signature: "EDTMSK('edit-mask')",
    description: "Protects parts of an edited input-capable field (used with EDTCDE/EDTWRD).",
    example: "EDTMSK('   &  &   ')",
  },
  {
    name: "INDARA",
    insertText: "INDARA",
    signature: "INDARA",
    description:
      "File-level keyword: passes indicators in a separate 99-byte indicator area instead of the record buffer.",
    example: "INDARA",
  },
  {
    name: "PRINT",
    insertText: "PRINT",
    signature: "PRINT[([library/]printer-file)]",
    description: "Allows the workstation user to print the current display.",
    example: "PRINT",
  },
  {
    name: "VLDCMDKEY",
    insertText: "VLDCMDKEY(${1:99})",
    signature: "VLDCMDKEY(response-indicator)",
    description: "Sets the indicator on when any valid command key is pressed.",
    example: "VLDCMDKEY(70)",
  },
  {
    name: "ASSUME",
    insertText: "ASSUME",
    signature: "ASSUME",
    description:
      "Assumes this record is already on the display when the file is opened; prevents the screen from being cleared.",
    example: "ASSUME",
  },
  {
    name: "KEEP",
    insertText: "KEEP",
    signature: "KEEP",
    description: "Keeps the display contents when the file is closed.",
    example: "KEEP",
  },
  {
    name: "PUTOVR",
    insertText: "PUTOVR",
    signature: "PUTOVR",
    description:
      "Enables override attributes/data (OVRDTA, OVRATR) on an already-displayed record, reducing data transmission.",
    example: "PUTOVR",
  },
  {
    name: "OVRDTA",
    insertText: "OVRDTA",
    signature: "OVRDTA",
    description: "With PUTOVR: sends this field's data again on a re-write.",
    example: "OVRDTA",
  },
  {
    name: "OVRATR",
    insertText: "OVRATR",
    signature: "OVRATR",
    description: "With PUTOVR: overrides this field's display attributes on a re-write.",
    example: "OVRATR",
  },
  {
    name: "ROLLUP",
    insertText: "ROLLUP(${1:25})",
    signature: "ROLLUP(response-indicator)",
    description: "Sets the indicator when the user presses Page Down (Roll Up).",
    example: "ROLLUP(25)",
  },
  {
    name: "ROLLDOWN",
    insertText: "ROLLDOWN(${1:26})",
    signature: "ROLLDOWN(response-indicator)",
    description: "Sets the indicator when the user presses Page Up (Roll Down).",
    example: "ROLLDOWN(26)",
  },
  {
    name: "TIMFMT",
    insertText: "TIMFMT(${1:*ISO})",
    signature: "TIMFMT(*HMS | *ISO | *USA | *EUR | *JIS)",
    description: "Format of a time (T) field.",
    example: "TIMFMT(*ISO)",
  },
  {
    name: "DATFMT",
    insertText: "DATFMT(${1:*ISO})",
    signature: "DATFMT(*MDY | *DMY | *YMD | *JUL | *ISO | *USA | *EUR | *JIS)",
    description: "Format of a date (L) field.",
    example: "DATFMT(*ISO)",
  },
  {
    name: "DATSEP",
    insertText: "DATSEP('${1:-}')",
    signature: "DATSEP('separator')",
    description: "Separator character of a date (L) field.",
    example: "DATSEP('-')",
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
