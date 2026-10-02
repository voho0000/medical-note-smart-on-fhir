// 影像與病理重點 — the deterministic digest the `reports` lane is asked about.
//
// Clinicians cannot read every report. This module decides, without any
// model, WHICH reports the section covers (every imaging and pathology report
// in the AI scope that carries text and resolves to a catalog key), what each
// one's prompt text is, and how the list is split into requests a slow on-prem
// MoE model can finish. The model then only picks sentences; the finalizer
// verifies each one against `narrative` (the full text kept here) and falls
// back to the deterministic excerpts below for every report it did not cover.
//
// Prompt text is a shortened VIEW of the report (conclusion first, admin lines
// removed, capped); verification always runs against the full narrative, so a
// quote copied from the view still verifies, and a quote that does not occur
// in the report never displays.
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'
import type { SummaryCatalogInput } from './generate-medical-summary.use-case'
import {
  isAiScopeReport,
  reportIdentity,
  reportModality,
  reportNarrative,
  type ReportModalityKind,
} from '@/src/core/utils/report-narrative.utils'
import { estimateTokens } from '@/src/shared/utils/token-estimator'

/** Reports sent to the model; the rest render with the deterministic fallback. */
export const REPORT_DIGEST_MAX_REPORTS = 30
/** Characters of one report's text in the prompt (conclusion first). */
export const REPORT_DIGEST_PER_REPORT_CHARS = 1_800
/** Reports per request. With ≤3 quotes × ≤220 chars each, eight reports keep
 *  one reply short enough for an on-prem model to finish well inside the
 *  card watchdog. */
export const REPORT_DIGEST_CHUNK_REPORTS = 8
/** Estimated report-text tokens per request. On the hospital GPU ~5K tokens of
 *  prompt is ~10.7 s of prefill; 4K of reports plus the short instructions
 *  stays under that. */
export const REPORT_DIGEST_CHUNK_TOKENS = 4_000

/** Deterministic fallback lengths (characters). */
export const REPORT_CONCLUSION_EXCERPT_CHARS = 300
export const REPORT_OPENING_EXCERPT_CHARS = 200

const OMISSION_MARKER = '[…]'

export interface ReportDigestOptions {
  maxReports?: number
  perReportChars?: number
  chunkReports?: number
  chunkTokens?: number
}

export interface ReportDigestInput {
  clinicalData?: SummaryCatalogInput | null
  catalog: readonly SummarySourceCatalogEntry[]
}

export interface ReportDigestItem {
  /** Catalog key, e.g. "L14". Every digest item has one. */
  key: string
  resourceType: string
  resourceId: string
  kind: ReportModalityKind
  /** Fine-grained modality class (the dedupe unit) and its rank. */
  modalityClass: string
  rank: number
  /** Catalog display of the report. */
  title: string
  date?: string
  organization?: string
  /** The FULL report text — what every quote is verified against. */
  narrative: string
  /** Header line plus the shortened report view sent to the model. */
  promptText: string
  estimatedTokens: number
  /** Whether a header-anchored conclusion section was found. */
  hasConclusion: boolean
}

export interface ReportDigestChunk {
  items: ReportDigestItem[]
  promptText: string
  estimatedTokens: number
}

export interface ReportDigest {
  /** Reports sent to the model, newest first (≤ maxReports). */
  items: ReportDigestItem[]
  /** Reports past the cap, newest first. Rendered with the fallback. */
  overflow: ReportDigestItem[]
  /** `items` split into requests. */
  chunks: ReportDigestChunk[]
  /** Every chunk's prompt text, in order. */
  promptText: string
}

/** Every report the section renders, in display order (newest first). */
export function allDigestItems(digest: ReportDigest): ReportDigestItem[] {
  return [...digest.items, ...digest.overflow]
}

const PROMPT_KIND_LABEL: Record<ReportModalityKind, string> = {
  pathology: 'Pathology',
  pet: 'PET',
  ct: 'CT',
  mri: 'MRI',
  echo: 'Echo',
  us: 'Ultrasound',
  ecg: 'ECG',
  xray: 'X-ray',
  other: 'Other',
}

// ---------------------------------------------------------------------------
// Line-level text helpers
// ---------------------------------------------------------------------------

interface LineSpan {
  start: number
  /** Exclusive; the line terminator is not part of the span. */
  end: number
  text: string
}

/** Report text arrives with \n, \r\n, and — from some NHI exports — a bare
 *  \r between lines. All three end a line. */
const LINE_BREAK = /\r\n|\r|\n/g

function lineSpans(text: string): LineSpan[] {
  const spans: LineSpan[] = []
  let start = 0
  LINE_BREAK.lastIndex = 0
  for (let match = LINE_BREAK.exec(text); match; match = LINE_BREAK.exec(text)) {
    spans.push({ start, end: match.index, text: text.slice(start, match.index) })
    start = match.index + match[0].length
  }
  spans.push({ start, end: text.length, text: text.slice(start) })
  return spans
}

// Labels that never occur in clinical prose: matched anywhere on a short line.
const ADMIN_LABEL_ANYWHERE =
  /(?:申請序號|開醫囑者|開單醫師|報告人|報告醫師|醫檢師|病理號|簽收時間|病歷號碼?|身分證(?:字號|號)?)[ \t]*[:：]/
// Patient-identity and sign-off fields: matched only as a line's leading label.
const ADMIN_LABEL_AT_START =
  /^[ \t]*(?:姓名|性別|出生(?:日期)?|年齡|床號|patient(?:[ \t]+(?:name|id|no\.?))?|name|sex|gender|age|d\.?o\.?b\.?|date[ \t]+of[ \t]+birth|chart[ \t]*(?:no\.?|number)|mrn|medical[ \t]+record[ \t]+(?:no\.?|number)|reported[ \t]+by|signed[ \t]+by|verified[ \t]+by|accession(?:[ \t]+(?:no\.?|number))?)[ \t]*[:：]/i
/** A one-line NHI report can hold every field; never drop a long line whole. */
const ADMIN_LINE_MAX_CHARS = 160

/** An administrative line: patient identity, order and sign-off fields. */
export function isAdministrativeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > ADMIN_LINE_MAX_CHARS) return false
  return ADMIN_LABEL_ANYWHERE.test(trimmed) || ADMIN_LABEL_AT_START.test(trimmed)
}

function stripAdministrativeLines(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .filter((line) => !isAdministrativeLine(line))
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Header-anchored: the header opens its line and is followed by a colon or by
// nothing. "Clinical diagnosis:" (the requester's working diagnosis) and a
// sentence such as "Diagnosis of ..." are deliberately not headers.
const CONCLUSION_HEADER =
  /^[ \t]{0,40}(?:[#*•>\-–]{1,4}[ \t]{0,8})?(?:\d{1,3}[.)][ \t]{0,8})?[【[(（]?[ \t]{0,8}(?:(?:(?:patholog(?:ic|ical)|final|sonar|sonographic|ultrasound|imaging|radiologic(?:al)?)[ \t]{1,8})?diagnos[ie]s|impressions?(?:[ \t]{1,8}and[ \t]{1,8}recommendations?)?|conclusions?|(?:病理|最終|影像)?(?:診斷|結論|印象))[ \t]{0,8}[】\])）]?[ \t]{0,8}(?:[:：]|$)/i

// A line that is only a section heading ("Other Interpretations:", "建議：")
// closes the conclusion section that precedes it.
const BARE_SECTION_HEADING = /^[ \t]*[A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff /&()（）-]{1,40}[:：][ \t]*$/

export interface ConclusionSection {
  /** Offset of the header line. */
  headerStart: number
  /** Offset of the first character after the header (and its colon). */
  contentStart: number
  /** Exclusive end: the next administrative line or bare section heading,
   *  or the end of the text. */
  end: number
}

/** The report's conclusion section, or null. The LAST matching header wins:
 *  an addendum's impression supersedes the original one above it. */
export function findConclusionSection(narrative: string): ConclusionSection | null {
  const spans = lineSpans(narrative)
  let found: ConclusionSection | null = null
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index]
    const match = CONCLUSION_HEADER.exec(span.text)
    if (!match) continue
    const contentStart = span.start + match[0].length
    let end = narrative.length
    let sawContent = Boolean(narrative.slice(contentStart, span.end).trim())
    for (let next = index + 1; next < spans.length; next += 1) {
      const line = spans[next].text
      if (isAdministrativeLine(line) || (sawContent && BARE_SECTION_HEADING.test(line))) {
        end = spans[next].start
        break
      }
      if (line.trim()) sawContent = true
    }
    if (!narrative.slice(contentStart, end).trim()) continue
    found = { headerStart: span.start, contentStart, end }
  }
  return found
}

// A period after a digit is usually list numbering ("2. Senile atrophy"), not
// the end of a sentence.
const RULER_LINE = /^[-=_─━]{3,}$/

/** Drop trailing ruler lines ("-----"): layout, not content. Line by line on
 *  purpose — a nested-quantifier regex here backtracks exponentially on a
 *  long ruler that is not at the end. The result stays a prefix of `text`. */
function stripTrailingRulers(text: string): string {
  let end = text.trimEnd().length
  for (;;) {
    const lineStart = Math.max(text.lastIndexOf('\n', end - 1), text.lastIndexOf('\r', end - 1)) + 1
    if (lineStart === 0 || !RULER_LINE.test(text.slice(lineStart, end).trim())) {
      return text.slice(0, end)
    }
    end = text.slice(0, lineStart).trimEnd().length
  }
}

const SENTENCE_END = /[。！？；;!?]|(?<!\d)\.(?=\s|$)|\r\n|\r|\n/g

/**
 * Cut `text` to at most `max` characters, preferring the end of a sentence or
 * line. The result is always a prefix of `text` (trimmed), so a deterministic
 * excerpt stays verbatim. `truncated` is true only when no boundary fit and
 * the cut lands mid-sentence.
 */
export function cutAtSentenceBoundary(
  text: string,
  max: number,
  minBoundaryFraction = 0,
): { text: string; truncated: boolean } {
  const trimmed = stripTrailingRulers(text.trim())
  if (trimmed.length <= max) return { text: trimmed, truncated: false }
  let best = -1
  SENTENCE_END.lastIndex = 0
  for (let match = SENTENCE_END.exec(trimmed); match; match = SENTENCE_END.exec(trimmed)) {
    const isLineBreak = match[0] === '\n' || match[0] === '\r' || match[0] === '\r\n'
    const cut = isLineBreak ? match.index : match.index + match[0].length
    if (cut > max) break
    best = cut
  }
  if (best > 0 && best >= max * minBoundaryFraction) {
    const cutText = stripTrailingRulers(trimmed.slice(0, best).trim())
    if (cutText) return { text: cutText, truncated: false }
  }
  // No boundary: hard cut, never splitting a surrogate pair.
  let end = max
  const code = trimmed.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1
  return { text: trimmed.slice(0, end).trimEnd(), truncated: true }
}

/** Shortened report view for the prompt: conclusion first, then the rest of
 *  the body, administrative lines removed, capped with an omission marker. */
export function buildReportPromptBody(
  narrative: string,
  maxChars = REPORT_DIGEST_PER_REPORT_CHARS,
): { text: string; hasConclusion: boolean } {
  const section = findConclusionSection(narrative)
  const parts = section
    ? [
        narrative.slice(section.headerStart, section.end),
        narrative.slice(0, section.headerStart),
        narrative.slice(section.end),
      ]
    : [narrative]
  const text = parts
    .map(stripAdministrativeLines)
    .filter(Boolean)
    .join('\n\n')
  if (text.length <= maxChars) return { text, hasConclusion: Boolean(section) }
  const room = Math.max(1, maxChars - OMISSION_MARKER.length - 1)
  // Prefer a boundary in the back half so a long first sentence is not
  // reduced to a stub; otherwise cut hard.
  const cut = cutAtSentenceBoundary(text, room, 0.5)
  return { text: `${cut.text}\n${OMISSION_MARKER}`, hasConclusion: Boolean(section) }
}

export interface DeterministicReportExcerpt {
  excerpt: string
  source: 'conclusion' | 'opening'
  truncated: boolean
}

/** The fallback a row shows when no model quote survived verification: the
 *  conclusion section, else the opening of the report. Always a contiguous
 *  slice of the narrative. */
export function deterministicReportExcerpt(narrative: string): DeterministicReportExcerpt | null {
  const section = findConclusionSection(narrative)
  if (section) {
    const cut = cutAtSentenceBoundary(
      narrative.slice(section.contentStart, section.end),
      REPORT_CONCLUSION_EXCERPT_CHARS,
    )
    if (cut.text) return { excerpt: cut.text, source: 'conclusion', truncated: cut.truncated }
  }
  const spans = lineSpans(narrative)
  const firstIndex = spans.findIndex((span) => span.text.trim() && !isAdministrativeLine(span.text))
  if (firstIndex < 0) return null
  let end = narrative.length
  for (let next = firstIndex + 1; next < spans.length; next += 1) {
    if (isAdministrativeLine(spans[next].text)) {
      end = spans[next].start
      break
    }
  }
  const cut = cutAtSentenceBoundary(
    narrative.slice(spans[firstIndex].start, end),
    REPORT_OPENING_EXCERPT_CHARS,
  )
  return cut.text ? { excerpt: cut.text, source: 'opening', truncated: cut.truncated } : null
}

// ---------------------------------------------------------------------------
// Digest
// ---------------------------------------------------------------------------

function keyNumber(key: string): number {
  const n = Number(key.replace(/^\D+/, ''))
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
}

function chunkItems(
  items: ReportDigestItem[],
  chunkReports: number,
  chunkTokens: number,
): ReportDigestChunk[] {
  const chunks: ReportDigestChunk[] = []
  let current: ReportDigestItem[] = []
  let tokens = 0
  const flush = () => {
    if (current.length === 0) return
    chunks.push({
      items: current,
      promptText: current.map((item) => item.promptText).join('\n\n'),
      estimatedTokens: tokens,
    })
    current = []
    tokens = 0
  }
  for (const item of items) {
    if (
      current.length > 0 &&
      (current.length >= chunkReports || tokens + item.estimatedTokens > chunkTokens)
    ) flush()
    current.push(item)
    tokens += item.estimatedTokens
  }
  flush()
  return chunks
}

function computeReportDigest(
  input: ReportDigestInput,
  options: ReportDigestOptions,
): ReportDigest {
  const maxReports = Math.max(0, options.maxReports ?? REPORT_DIGEST_MAX_REPORTS)
  const perReportChars = Math.max(200, options.perReportChars ?? REPORT_DIGEST_PER_REPORT_CHARS)
  const chunkReports = Math.max(1, options.chunkReports ?? REPORT_DIGEST_CHUNK_REPORTS)
  const chunkTokens = Math.max(1, options.chunkTokens ?? REPORT_DIGEST_CHUNK_TOKENS)

  const entryByResourceId = new Map(
    input.catalog
      .filter((entry) => entry.resourceType === 'DiagnosticReport')
      .map((entry) => [entry.resourceId, entry]),
  )
  const seen = new Set<string>()
  const items: ReportDigestItem[] = []
  for (const report of input.clinicalData?.diagnosticReports ?? []) {
    if (!isAiScopeReport(report)) continue
    const entry = report.id ? entryByResourceId.get(report.id) : undefined
    // A report without a catalog key cannot be cited, navigated or verified.
    if (!entry) continue
    const narrative = reportNarrative(report)
    if (!narrative.trim()) continue
    const { cls, rank, kind } = reportModality(report)
    // Same study twice (bilingual bridge rows): keep the first, exactly as the
    // overview snapshot does.
    const identity = reportIdentity(report, cls, entry.date ?? '')
    if (seen.has(identity)) continue
    seen.add(identity)
    const body = buildReportPromptBody(narrative, perReportChars)
    const header = [
      `[${entry.key}] ${PROMPT_KIND_LABEL[kind]}`,
      entry.date ?? 'date unknown',
      entry.organization?.trim(),
      entry.display.replace(/\s+/g, ' ').trim(),
    ].filter(Boolean).join(' · ')
    const promptText = `${header}\n${body.text}`
    items.push({
      key: entry.key,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      kind,
      modalityClass: cls,
      rank,
      title: entry.display,
      ...(entry.date ? { date: entry.date } : {}),
      ...(entry.organization ? { organization: entry.organization } : {}),
      narrative,
      promptText,
      estimatedTokens: estimateTokens(promptText),
      hasConclusion: body.hasConclusion,
    })
  }
  items.sort((a, b) =>
    (b.date ?? '').localeCompare(a.date ?? '') ||
    b.rank - a.rank ||
    keyNumber(a.key) - keyNumber(b.key))
  const selected = items.slice(0, maxReports)
  const chunks = chunkItems(selected, chunkReports, chunkTokens)
  return {
    items: selected,
    overflow: items.slice(maxReports),
    chunks,
    promptText: chunks.map((chunk) => chunk.promptText).join('\n\n'),
  }
}

// The finalizer runs on every streamed card; the default digest of one scoped
// bundle is built once.
const defaultDigestCache = new WeakMap<object, WeakMap<object, ReportDigest>>()

/** Imaging & pathology reports to summarise, newest first, with the request
 *  chunks and prompt text. Pure and deterministic. */
export function buildReportDigest(
  input: ReportDigestInput,
  options?: ReportDigestOptions,
): ReportDigest {
  const clinicalData = input.clinicalData
  const cacheable = !options && clinicalData && typeof clinicalData === 'object'
  if (cacheable) {
    const cached = defaultDigestCache.get(clinicalData)?.get(input.catalog)
    if (cached) return cached
  }
  const digest = computeReportDigest(input, options ?? {})
  if (cacheable) {
    const byCatalog = defaultDigestCache.get(clinicalData) ?? new WeakMap()
    byCatalog.set(input.catalog, digest)
    defaultDigestCache.set(clinicalData, byCatalog)
  }
  return digest
}
