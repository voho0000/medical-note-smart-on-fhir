// Free-text PII scrub for OUTBOUND AI payloads.
//
// The structured scrub (_scrub-pii.ts) strips id / identifier / birthDate /
// provider display fields, but NHI discharge summaries and report conclusions
// routinely embed the patient's name, chart number and 身分證字號 inside free
// text — the highest-density PHI channel. This module masks those before any
// text is sent to a cloud LLM.
//
// Scope rules:
// - OUTBOUND ONLY. Never use this for display — the UI must keep showing the
//   source data verbatim (bridge bugs must stay visible).
// - Conservative patterns: mask only what is positively identifying — a TW
//   national/resident ID shape, or a value directly labeled 病歷號/姓名 —
//   plus caller-provided literals (the loaded patient's own name/identifier).
//   Clinical content must survive untouched.

// 身分證字號 / 居留證統一證號: 1 uppercase letter + gender/type digit (1/2
// legacy national, 8/9 new-format resident) + 8 digits, word-bounded.
const TW_NATIONAL_ID = /\b[A-Z][1289]\d{8}\b/g

// Values explicitly labeled as chart numbers — masking only labeled values
// keeps bare numbers (lab values, order ids) intact.
const LABELED_CHART_NO = /(病歷號碼?|病歷號|Chart\s*(?:No\.?|Number)|MRN)(\s*[:：]?\s*)[A-Za-z0-9-]{3,}/gi

// Values explicitly labeled as the patient's name.
// Keep the fallback deliberately name-shaped. The former "anything until
// whitespace" expression could swallow adjacent table cells such as
// `姓名：王小明診斷：肺炎`, deleting clinical content after HTML tags were stripped.
const LABELED_NAME = /(姓\s*名|Patient(?:'s)?\s*Name)(\s*[:：]\s*)([\p{Script=Han}○〇Ｏ*＊Xx·•．.]{2,8}|[A-Za-z](?:[A-Za-z .'-]{0,37}[A-Za-z])?)/giu

const MASK = '[已遮蔽]'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Collect the loaded patient's own name / identifier literals so they can be
 * masked wherever they appear in free text. Accepts a raw FHIR Patient or a
 * PatientEntity-shaped object; returns [] for anything else.
 */
export function buildPatientTextLiterals(patient: unknown): string[] {
  if (!patient || typeof patient !== 'object') return []
  const p = patient as Record<string, any>
  const literals: string[] = []

  const names = Array.isArray(p.name) ? p.name : []
  for (const n of names) {
    if (typeof n?.text === 'string') literals.push(n.text)
    const given = Array.isArray(n?.given) ? n.given.filter((g: unknown) => typeof g === 'string') : []
    if (typeof n?.family === 'string') {
      literals.push(n.family + given.join(''))       // CJK: 王小明
      if (given.length) literals.push(`${given.join(' ')} ${n.family}`) // Western order
    }
  }
  if (typeof p.name === 'string') literals.push(p.name) // entity shape: plain string

  const identifiers = Array.isArray(p.identifier) ? p.identifier : []
  for (const id of identifiers) {
    if (typeof id?.value === 'string') literals.push(id.value)
  }
  if (typeof p.id === 'string') literals.push(p.id)

  // Too-short literals (1 char, or 1–2 digit ids) would mass-mask clinical
  // text; require ≥2 chars and skip pure 1–3 digit strings.
  return literals
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^\d{1,3}$/.test(s))
}

/**
 * Mask identifying free text: TW national/resident IDs, labeled chart
 * numbers, labeled names, and any caller-provided literals (the loaded
 * patient's own name / identifier values).
 */
export function scrubFreeText(text: string, literals: string[] = []): string {
  if (!text) return text
  let out = text
  for (const literal of literals) {
    if (!literal) continue
    out = out.replace(new RegExp(escapeRegExp(literal), 'g'), MASK)
  }
  out = out.replace(TW_NATIONAL_ID, MASK)
  out = out.replace(LABELED_CHART_NO, (_m, label: string, sep: string) => `${label}${sep}${MASK}`)
  out = out.replace(LABELED_NAME, (_m, label: string, sep: string) => `${label}${sep}${MASK}`)
  return out
}
