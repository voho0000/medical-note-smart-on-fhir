// One vocabulary for ordinal (qualitative) lab results, so the same result
// spelled differently — "Negative", "NEG", "neg.", 「陰性」, "(-)", full-width
// "ＮＥＧ" — is recognised as the same kind of value everywhere it is read.

/** Canonical ordinal value → every spelling hospitals print for it. Spellings
 *  are matched after NFKC, upper-casing and removing whitespace. */
export const ORDINAL_VALUE_SPELLINGS: Readonly<Record<string, readonly string[]>> = {
  NEGATIVE: ['NEGATIVE', 'NEG', 'NEGA', '(-)', '-', '陰性', '陰', 'NEGATIVE(-)'],
  POSITIVE: ['POSITIVE', 'POS', 'POSI', '(+)', '+', '陽性', '陽'],
  WEAKLY_POSITIVE: ['WEAKLYPOSITIVE', 'WEAKPOSITIVE', 'WEAKLYPOS', 'WEAKPOS', 'WPOS', 'W+', 'WEAKLYREACTIVE', 'WEAKREACTIVE', '弱陽性', '弱陽'],
  STRONGLY_POSITIVE: ['STRONGLYPOSITIVE', 'STRONGPOSITIVE', '強陽性'],
  NONREACTIVE: ['NONREACTIVE', 'NON-REACTIVE', 'NONREACT', 'NON-REACT', 'NR', 'N.R.', '無反應'],
  REACTIVE: ['REACTIVE', 'REACT', 'R', '有反應'],
  BORDERLINE: ['BORDERLINE', 'BORDER', 'BL', 'EQUIVOCAL', 'EQUIV', 'EQV', 'INDETERMINATE', 'INDET', 'GRAYZONE', 'GREYZONE', '(±)', '±', '+/-', '可疑', '臨界'],
  TRACE: ['TRACE', 'TR', '微量'],
  DETECTED: ['DETECTED', 'DETECTABLE', 'PRESENT', '檢出', '有檢出'],
  NOT_DETECTED: ['NOTDETECTED', 'NOT-DETECTED', 'UNDETECTED', 'NONDETECTED', 'UNDETECTABLE', 'ND', 'N.D.', 'ABSENT', '未檢出', '未檢測到'],
  GRADE_1: ['1+', '+1'],
  GRADE_2: ['2+', '+2', '++'],
  GRADE_3: ['3+', '+3', '+++'],
  GRADE_4: ['4+', '+4', '++++'],
}

const SPELLING_TO_ORDINAL: ReadonlyArray<readonly [string, string]> = Object.entries(ORDINAL_VALUE_SPELLINGS)
  .flatMap(([canonical, spellings]) => spellings.map((spelling) => [spelling, canonical] as const))
  // Longest first: "NONREACTIVE" before "NR" before "R", "+++" before "+".
  .sort((a, b) => b[0].length - a[0].length)

const isLatinLetter = (ch: string | undefined) => !!ch && /[A-Z]/.test(ch)

/**
 * The canonical ordinal value a result starts with, or null. Trailing detail
 * is allowed ("Negative (<1:40)", 「陰性(-)」, "NEG 0.2 S/CO"), but a spelling
 * must end where a word ends ("R" is not the start of "RBC", "POS" not of
 * "POSSIBLE"), and a bare sign must not be a number's sign ("-5", "+0.3").
 */
export function ordinalValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFKC').toUpperCase().replace(/\s+/g, '')
  if (!text) return null
  for (const [spelling, canonical] of SPELLING_TO_ORDINAL) {
    if (!text.startsWith(spelling)) continue
    const next = text[spelling.length]
    if (isLatinLetter(spelling.slice(-1)) && isLatinLetter(next)) continue
    if (/^[-+]+$/.test(spelling) && next !== undefined && /[\d.]/.test(next)) continue
    if (/\d$/.test(spelling) && next !== undefined && /[\d.]/.test(next)) continue
    return canonical
  }
  return null
}

export function isOrdinalValue(value: unknown): boolean {
  return ordinalValue(value) !== null
}
