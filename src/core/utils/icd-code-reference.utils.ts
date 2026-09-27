/**
 * ICD code reference for custom-summary templates that demand ICD-9 codes.
 *
 * The HMC SOAP template requires an ICD-9 block, but MedCloud records carry
 * only ICD-10-CM billing codes. Without a code to copy, tvghbrain3.5 recalled
 * ICD-9 codes from memory and enumerated the code table until the 4096-token
 * limit. This
 * module translates only the billing codes already present in the context,
 * with an explicit count and end marker, plus a matching system guard.
 */

export interface IcdCrosswalk {
  /** ICD-10-CM code without decimal point -> ICD-9-CM codes without decimal point. */
  map: Record<string, string[]>
  /** ICD-9-CM code without decimal point -> CMS long description. */
  names: Record<string, string>
}

const BILLING_LINE = /ICD codes on visit record \(billing, not confirmed diagnoses\): (.+)$/gm
const ICD10_CODE = /\b[A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?\b/g

export const ICD_CODE_GUARD =
  'DIAGNOSIS CODES: In any ICD code list, use only codes that appear in the supplied record or its ICD code reference. ' +
  'Never recall or enumerate codes from memory; for a supported diagnosis without a supplied code, write the name and leave the code blank. ' +
  'Write each diagnosis at most once per block, then continue to the next section.'

/** True when a user template asks for ICD-9 codes (e.g. the HMC SOAP template). */
export function templateRequestsIcd9(prompt: string): boolean {
  return /\bICD[-\s]?9\b/i.test(prompt)
}

/** Distinct billed ICD-10 codes in first-seen order, with the record's own description. */
export function extractBilledIcd10Codes(context: string): Map<string, string> {
  const items = new Map<string, string>()
  for (const [, list] of context.matchAll(BILLING_LINE)) {
    const found = [...list.matchAll(ICD10_CODE)]
    found.forEach((match, index) => {
      const next = found[index + 1]?.index ?? list.length
      const description = list
        .slice((match.index ?? 0) + match[0].length, next)
        .replace(/^[\s\-:]+|[\s;,]+$/g, '')
      if (!items.has(match[0])) items.set(match[0], description)
    })
  }
  return items
}

function dottedIcd9(code: string): string {
  const head = code.startsWith('E') ? 4 : 3
  return code.length > head ? `${code.slice(0, head)}.${code.slice(head)}` : code
}

/** Reference block prepended to the clinical context, or '' when no billed code exists. */
export function buildIcdCodeReference(context: string, crosswalk: IcdCrosswalk): string {
  const items = [...extractBilledIcd10Codes(context)]
  if (!items.length) return ''
  const rows = items.map(([code, description], index) => {
    const targets = crosswalk.map[code.replace('.', '')] ?? []
    const icd9 = targets.length
      ? targets.map((target) => `${dottedIcd9(target)} ${(crosswalk.names[target] ?? '').toUpperCase()}`.trim()).join(' / ')
      : '(no ICD-9-CM equivalent)'
    return `${index + 1}. billed ICD-10-CM ${code}${description ? ` ${description}` : ''} | ICD-9-CM equivalent: ${icd9}`
  })
  return (
    `ICD code reference: ${items.length} distinct billed code(s) in this record. ICD-9-CM equivalents were computed by software ` +
    'with the CMS 2018 General Equivalence Mapping; this is a code translation, not a record entry, and billing codes are not confirmed diagnoses. ' +
    'No other ICD code exists in this record.\n' +
    rows.join('\n') +
    `\nEnd of ICD code reference (${items.length} code(s)).\n\n`
  )
}
