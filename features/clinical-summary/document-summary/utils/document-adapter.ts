// document-adapter.ts
// Converts the two FHIR document carriers — Composition and DocumentReference —
// into a unified DocumentEntry view model. Keeps the card logic source-agnostic.
//
// IMPORTANT: this module is pure and does NOT decode base64 / sanitise HTML.
// Both are deferred to the renderer so the cost is paid only for documents the
// user actually opens.
import type {
  CompositionEntity,
  DocumentReferenceEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { DocumentEntry } from '../types'
import { hasNarrativeContent } from './sanitize-narrative'
import {
  DOCUMENT_TYPE_LOINC,
  getDocumentTypeCode,
  isIpsComposition,
} from './loinc-document-types'

const DISCHARGE_SUMMARY_LOINC = '18842-5'

/**
 * Looks up the localised label for a LOINC document type code.
 * `docTypeStrings` is the `documentSummary.docTypes` map from i18n; callers
 * pass it in to avoid coupling the adapter to the language provider.
 */
function pickLoincTypeLabel(
  code: string | null,
  docTypeStrings: Record<string, string>,
): string | null {
  if (!code) return null
  const i18nKey = DOCUMENT_TYPE_LOINC[code]
  if (!i18nKey) return null
  return docTypeStrings[i18nKey] ?? null
}

/** Inline DocumentReference attachment shape — mirrors the entity to avoid
 *  index-signature contortions in callers that need the renderer payload. */
type DocRefAttachment = NonNullable<
  NonNullable<DocumentReferenceEntity['content']>[number]['attachment']
>

/**
 * Looks up the first attachment with a usable payload (data or url).
 * Returns undefined if the DocumentReference has no usable attachments —
 * the caller drops the entry rather than rendering an empty card.
 */
function pickRenderableAttachment(
  docRef: DocumentReferenceEntity,
): DocRefAttachment | undefined {
  const contents = Array.isArray(docRef.content) ? docRef.content : []
  for (const c of contents) {
    const att = c?.attachment
    if (!att) continue
    const ct = (att.contentType || '').toLowerCase()
    // Renderable inline: HTML / XHTML / plain text. PDFs and images have their
    // own viewers elsewhere (ReportImageDialog etc.); we don't surface them
    // here to avoid pretending we can render them as readable text.
    const isRenderable =
      ct.startsWith('text/html') ||
      ct.startsWith('application/xhtml') ||
      ct.startsWith('text/plain')
    if (!isRenderable) continue
    if (att.data || att.url) return att
  }
  return undefined
}

/**
 * "出院病摘 — 長庚嘉義 2025-05-18~2025-05-22" → "長庚嘉義" (institution segment).
 * Returns undefined if the title doesn't follow the bridge's `<type> — <inst> <period>` shape.
 *
 * The bridge title is the only place 健保存摺 ships the institution name today
 * (custodian/author references aren't set), so this string heuristic is the
 * cleanest path until the bridge adds dedicated fields.
 */
function extractInstitutionFromTitle(title?: string): string | undefined {
  if (!title) return undefined
  // Bridge separator: " — " (em-dash) or " - " (hyphen with spaces).
  const sepMatch = title.match(/\s[—-]\s(.+)$/)
  if (!sepMatch) return undefined
  const afterDash = sepMatch[1].trim()
  // Strip trailing " YYYY-MM-DD~YYYY-MM-DD" or " YYYY-MM-DD" date suffix.
  const inst = afterDash.replace(/\s+\d{4}-\d{2}-\d{2}(?:~\d{4}-\d{2}-\d{2})?\s*$/, '').trim()
  return inst || undefined
}

/**
 * Adapt a FHIR Composition to a DocumentEntry. Returns null when the
 * Composition has no renderable narrative content (every section.text.div is
 * empty/whitespace), since the structured data is already shown in other
 * cards and an empty narrative panel would be noise.
 */
export function compositionToEntry(
  comp: CompositionEntity,
  docTypeStrings: Record<string, string>,
): DocumentEntry | null {
  const sections = Array.isArray(comp.section) ? comp.section : []
  const hasAny = sections.some((s) => hasNarrativeContent(s?.text?.div))
  if (!hasAny) return null

  const typeCode = getDocumentTypeCode(comp)
  const loincLabel = pickLoincTypeLabel(typeCode, docTypeStrings)
  const typeLabel =
    loincLabel ||
    comp.title?.trim() ||
    comp.type?.text?.trim() ||
    '—'

  return {
    id: comp.id || `composition-${comp.date ?? Math.random()}`,
    date: comp.date ?? '',
    typeLabel,
    typeCode,
    sourceKind: 'composition',
    isIps: isIpsComposition(comp),
    isDischargeSummary: typeCode === DISCHARGE_SUMMARY_LOINC,
    composition: comp,
  }
}

/**
 * Adapt a FHIR DocumentReference to a DocumentEntry. Returns null when no
 * usable inline attachment exists (PDF/image/url-only DocumentReferences are
 * intentionally skipped — see pickRenderableAttachment).
 */
export function documentReferenceToEntry(
  docRef: DocumentReferenceEntity,
  docTypeStrings: Record<string, string>,
): DocumentEntry | null {
  const att = pickRenderableAttachment(docRef)
  if (!att) return null

  const codings = Array.isArray(docRef.type?.coding) ? docRef.type!.coding! : []
  const typeCode = codings.find((c) => c?.code)?.code ?? null
  const loincLabel = pickLoincTypeLabel(typeCode, docTypeStrings)
  const typeLabel =
    loincLabel ||
    docRef.type?.text?.trim() ||
    att.title?.trim() ||
    '—'

  const institution = extractInstitutionFromTitle(att.title)
  const period = docRef.context?.period
  const encounterRef = docRef.context?.encounter?.[0]?.reference

  return {
    id: docRef.id || `documentReference-${docRef.date ?? Math.random()}`,
    date: docRef.date ?? period?.start ?? '',
    typeLabel,
    typeCode,
    sourceKind: 'documentReference',
    isIps: false,
    isDischargeSummary: typeCode === DISCHARGE_SUMMARY_LOINC,
    institution,
    period: period ? { start: period.start, end: period.end } : undefined,
    subtitle: att.title?.trim(),
    attachment: att,
    encounterRef,
  }
}

/**
 * Adapt both source arrays into a unified, deduplicated, newest-first list
 * suitable for direct iteration in DocumentSummaryCard.
 */
export function buildDocumentEntries(
  compositions: CompositionEntity[] | undefined,
  documentReferences: DocumentReferenceEntity[] | undefined,
  docTypeStrings: Record<string, string>,
): DocumentEntry[] {
  const entries: DocumentEntry[] = []
  for (const c of compositions ?? []) {
    const e = compositionToEntry(c, docTypeStrings)
    if (e) entries.push(e)
  }
  for (const d of documentReferences ?? []) {
    const e = documentReferenceToEntry(d, docTypeStrings)
    if (e) entries.push(e)
  }
  // Newest-first; entries without a date sink to the bottom.
  entries.sort((a, b) => {
    if (a.date && !b.date) return -1
    if (!a.date && b.date) return 1
    if (a.date === b.date) return 0
    return b.date.localeCompare(a.date)
  })
  return entries
}
