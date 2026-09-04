// Imaging report narrative reduction for the AI clinical context.
//
// A radiology / pathology narrative is 5-15 headed sections (INDICATION,
// TECHNIQUE, COMPARISON, FINDINGS, …) of which exactly one carries the
// reportable conclusion. On a data-dense chart the descriptive sections are
// the single biggest non-document cost in the context, and they restate what
// the impression already says. These helpers isolate the conclusion section so
// the context can carry impressions instead of whole reports.
//
// SAFETY RULE: reduction only happens when a conclusion header is actually
// recognised. When no header is found the caller must fall back to the full
// text — never guess which paragraph is the conclusion.

/** One recognised conclusion section: its own header plus the section body. */
export interface ImagingImpression {
  /** Header exactly as written in the source (e.g. "IMPRESSION", "診斷"). */
  header: string
  /** Section body with surrounding whitespace collapsed. */
  body: string
}

interface NarrativeSection {
  header?: string
  lines: string[]
}

/**
 * A section header line: an ALL-CAPS latin phrase or a short CJK phrase
 * followed by a colon. Deliberately strict — "Presented form 1:" (mixed case)
 * and "SYNTHETIC TEST REPORT; no real patient." (no colon) are not headers.
 */
const SECTION_HEADER_RE =
  /^[ \t]*([A-Z][A-Z0-9 /&()'.’-]{1,60}|[一-鿿]{2,12})[ \t]*[:：][ \t]*/

/**
 * Conclusion headers, normalised (latin upper-cased, CJK as written). Matched
 * as a whole header or as its leading words ("IMPRESSION AND RECOMMENDATION").
 * Intentionally conservative: descriptive headers such as FINDINGS, MICROSCOPIC
 * DESCRIPTION or COMMENT are NOT conclusions.
 */
const CONCLUSION_HEADERS = [
  'IMPRESSION',
  'IMPRESSIONS',
  'CONCLUSION',
  'CONCLUSIONS',
  'DIAGNOSIS',
  'DIAGNOSES',
  'FINAL DIAGNOSIS',
  'PATHOLOGIC DIAGNOSIS',
  'PATHOLOGICAL DIAGNOSIS',
  'INTERPRETATION',
  'ASSESSMENT',
  'OPINION',
  '診斷',
  '影像診斷',
  '病理診斷',
  '診斷意見',
  '結論',
  '印象',
  '判讀',
  '判讀結果',
  '檢查結論',
] as const

const CJK_RE = /[一-鿿]/

function normalizeHeader(header: string): string {
  const trimmed = header.trim().replace(/\s+/g, ' ')
  return CJK_RE.test(trimmed) ? trimmed : trimmed.toUpperCase()
}

function isConclusionHeader(header: string): boolean {
  const normalized = normalizeHeader(header)
  return CONCLUSION_HEADERS.some(
    (candidate) =>
      normalized === candidate
      // "IMPRESSION AND PLAN" / "診斷及建議" still lead with the conclusion.
      || normalized.startsWith(`${candidate} `)
      || (CJK_RE.test(candidate) && normalized.startsWith(candidate)),
  )
}

/** Split a narrative into its headed sections, preserving source order. */
function splitNarrativeSections(text: string): NarrativeSection[] {
  const sections: NarrativeSection[] = [{ lines: [] }]
  for (const line of text.split(/\r?\n/)) {
    const match = SECTION_HEADER_RE.exec(line)
    if (match) {
      sections.push({ header: match[1].trim(), lines: [line.slice(match[0].length)] })
    } else {
      sections[sections.length - 1].lines.push(line)
    }
  }
  return sections
}

/**
 * The report's conclusion section, or null when no conclusion header exists.
 *
 * The LAST conclusion header wins: radiology and pathology both place the
 * reportable conclusion at the end, after the descriptive sections, and a
 * pathology report may mention "diagnosis" in an earlier clinical-history
 * section header.
 */
export function extractImagingImpression(text?: string | null): ImagingImpression | null {
  if (!text?.trim()) return null
  const sections = splitNarrativeSections(text)
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const section = sections[index]
    if (!section.header || !isConclusionHeader(section.header)) continue
    const body = section.lines.join('\n').trim()
    if (!body) continue
    return { header: section.header, body }
  }
  return null
}

/**
 * The impression section rendered back as text, or the untouched narrative when
 * no conclusion header was recognised. This is the value that belongs in the AI
 * context for a report the model should read in full.
 */
export function impressionOrFullText(text?: string | null): string {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return ''
  const impression = extractImagingImpression(trimmed)
  return impression ? `${impression.header}: ${impression.body}` : trimmed
}

// CJK full stops are not followed by a space, so they end a sentence on their
// own; latin terminators need the trailing space so "43.5 mm" stays one sentence.
const SENTENCE_END_RE = /[。！？]|[.!?](?=\s|$)/

/** Hard ceiling for a one-line summary, even when the first sentence is long. */
const MAX_SUMMARY_CHARS = 240

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars).trimEnd()}…`
}

/**
 * One-line gist of a report: the first sentence of its impression, or — when no
 * conclusion header exists — the first `maxChars` characters of the narrative.
 */
export function imagingImpressionSummary(text?: string | null, maxChars = 120): string {
  const trimmed = text?.replace(/\s+/g, ' ').trim() ?? ''
  if (!trimmed) return ''
  const impression = extractImagingImpression(text)
  if (!impression) return truncate(trimmed, maxChars)
  const body = impression.body.replace(/\s+/g, ' ').trim()
  const end = SENTENCE_END_RE.exec(body)
  const sentence = end ? body.slice(0, end.index + 1) : body
  return truncate(sentence, MAX_SUMMARY_CHARS)
}

// ── Modality / body-region derivation ───────────────────────────────────────
// Used to decide which report is the current one for a given kind of imaging.
// Both are derived ONLY from structured identity (code, title, body site,
// ImagingStudy metadata) — never from the narrative, whose incidental mentions
// ("prior breast surgery") would mis-file the report.

const MODALITY_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['PET', /\bpet\b|正子/i],
  ['NM', /scintigra|bone scan|\bnm\b|核醫|核子醫學/i],
  ['CT', /\bct\b|computed tomograph|電腦斷層/i],
  ['MR', /\bmri?\b|magnetic resonance|磁振造影|核磁共振/i],
  ['US', /ultraso|sonogra|\bus\b|超音波/i],
  ['MG', /mammogra|乳房攝影/i],
  ['PATH', /patholog|cytolog|histolog|biopsy|immunohistochem|\bihc\b|病理|細胞學|切片/i],
  ['ANGIO', /angiogra|血管攝影/i],
  ['XR', /x-?ray|radiogra|\bxr\b|\bcxr\b|\bkub\b|Ｘ光|X光|胸腔檢查/i],
  ['ENDO', /endoscop|colonoscop|gastroscop|內視鏡|大腸鏡|胃鏡/i],
]

const REGION_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  // NOT a bare 腦: 電腦斷層 (CT) contains it, and matched every CT as a head study.
  ['head', /\bhead\b|brain|cranial|skull|intracranial|頭部|顱|腦部|大腦|小腦|頭顱/i],
  ['neck', /\bneck\b|thyroid|頸/i],
  ['breast', /breast|乳房|乳腺/i],
  ['chest', /chest|thora|lung|pulmonar|pleur|mediastin|\bcxr\b|胸|肺|縱膈/i],
  ['abdomen', /abdom|liver|hepat|renal|kidney|pancrea|biliar|\bkub\b|腹|肝|腎|胰/i],
  ['pelvis', /pelvi|prostat|uter|ovar|bladder|骨盆|攝護腺|子宮|膀胱/i],
  ['spine', /spine|spinal|vertebr|lumbar|thoracolumbar|脊椎|脊柱|腰椎|頸椎/i],
  ['extremity', /extremit|\blimb\b|knee|shoulder|\bhip\b|femur|tibia|humerus|四肢|膝|肩|髖/i],
  ['wholebody', /whole[- ]body|全身/i],
]

/** Imaging modality code (CT / MR / XR / US / PATH / …), or '' when unknown. */
export function deriveImagingModality(identityText: string): string {
  for (const [modality, pattern] of MODALITY_PATTERNS) {
    if (pattern.test(identityText)) return modality
  }
  return ''
}

/**
 * Body regions named by the study identity, joined with '+' in anatomical
 * order, or '' when none can be derived. Multi-region studies ("CT chest
 * abdomen pelvis" / 胸腹骨盆電腦斷層) intentionally resolve to the same key
 * regardless of the language the title is written in.
 */
export function deriveImagingRegion(identityText: string): string {
  const regions = REGION_PATTERNS
    .filter(([, pattern]) => pattern.test(identityText))
    .map(([region]) => region)
  return regions.join('+')
}

/**
 * Grouping key for "the current report of this kind". Falls back to modality
 * alone when no region can be derived, and to the study title when neither can
 * — a report is never silently merged into an unrelated group.
 */
export function imagingGroupKey(identityText: string): {
  modality: string
  region: string
  key: string
  label: string
} {
  const modality = deriveImagingModality(identityText)
  const region = deriveImagingRegion(identityText)
  const key = modality || region
    ? `${modality}|${region}`
    : `title|${identityText.trim().toLowerCase()}`
  const label = [modality, region].filter(Boolean).join(' ')
  return { modality, region, key, label }
}
