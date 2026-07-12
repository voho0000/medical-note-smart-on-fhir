// Clinical documents — a unified, i18n-free list over BOTH FHIR sources the
// app surfaces as "文件": Composition (IPS-style, narrative in section.text.div)
// and DocumentReference (健保存摺 discharge summaries — a base64 HTML attachment).
//
// SINGLE SOURCE OF TRUTH for the AI-context document text AND the data-selection
// checkbox list, so the document ids the UI ticks match exactly what the context
// builder includes. The feature layer (DocumentSummaryCard) keeps its own
// i18n-rich adapter for pretty display; this stays in core (no i18n / no UI).
import type { ClinicalContextSection } from '../interfaces/data-category.interface'
import type {
  CompositionEntity,
  DocumentReferenceEntity,
} from '../entities/clinical-data.entity'

/** LOINC 18842-5 = 出院病摘 (discharge summary). */
export const DISCHARGE_SUMMARY_LOINC = '18842-5'

export type DocumentMode = 'latestAdmission' | 'recentAdmissions' | 'all' | 'custom'

/** How many admissions 'recentAdmissions' mode includes. */
export const RECENT_ADMISSIONS_COUNT = 3

export interface ClinicalDocumentRef {
  id: string
  date?: string
  title: string
  isDischargeSummary: boolean
  /** Plain-text body for the AI context (HTML/XHTML stripped). */
  text: string
}

interface DocumentSource {
  compositions?: CompositionEntity[]
  documentReferences?: DocumentReferenceEntity[]
}

export function stripHtmlToText(html: string): string {
  return html
    // Drop <style>/<script>/<head> bodies entirely — their contents (CSS/JS)
    // are not document text and otherwise leak in as garbage.
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function hasDischargeLoinc(coding?: Array<{ code?: string }>): boolean {
  return (coding ?? []).some((c) => c.code === DISCHARGE_SUMMARY_LOINC)
}

function decodeBase64(data?: string): string {
  if (!data) return ''
  try {
    if (typeof atob !== 'undefined') {
      // atob yields a Latin-1 binary string; the bridge encodes UTF-8 (Chinese
      // discharge summaries), so re-decode the bytes as UTF-8 — otherwise every
      // multibyte char turns to mojibake (é·åº…).
      const binary = atob(data)
      if (typeof TextDecoder !== 'undefined') {
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
        return new TextDecoder('utf-8').decode(bytes)
      }
      return binary
    }
    // Node / SSR fallback
    return Buffer.from(data, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

// Decoding + HTML-stripping a discharge summary is expensive, and
// listClinicalDocuments is invoked MANY times per UI interaction (several
// consumers × React re-renders × StrictMode double-invoke). Cache the derived
// text per document id so each document is decoded at most once per session,
// regardless of how often it gets re-listed — this is what keeps the
// data-selection checkbox responsive on patients with many discharge summaries.
const decodedTextCache = new Map<string, string>()

function compositionText(c: CompositionEntity): string {
  const key = c.id ? `c:${c.id}` : null
  if (key) { const hit = decodedTextCache.get(key); if (hit !== undefined) return hit }
  const result = (c.section ?? [])
    .map((s) => {
      const t = s.text?.div ? stripHtmlToText(s.text.div) : ''
      if (!t) return ''
      return s.title ? `${s.title}:\n${t}` : t
    })
    .filter(Boolean)
    .join('\n\n')
  if (key) decodedTextCache.set(key, result)
  return result
}

function documentReferenceText(d: DocumentReferenceEntity): string {
  const key = d.id ? `d:${d.id}` : null
  if (key) { const hit = decodedTextCache.get(key); if (hit !== undefined) return hit }
  const att = d.content?.[0]?.attachment
  const ct = att?.contentType?.toLowerCase() ?? ''
  let result: string
  // Discharge summaries ride in attachment.data as base64 text/html.
  if (att?.data && (ct.includes('html') || ct.includes('text') || ct.includes('xml') || !ct)) {
    const decoded = decodeBase64(att.data)
    result = decoded.trim() ? stripHtmlToText(decoded) : (d.description || att?.title || '')
  } else {
    result = d.description || att?.title || ''
  }
  if (key) decodedTextCache.set(key, result)
  return result
}

/** All documents (Composition + DocumentReference), newest-first. */
export function listClinicalDocuments(data?: DocumentSource | null): ClinicalDocumentRef[] {
  if (!data) return []
  const out: ClinicalDocumentRef[] = []
  for (const c of data.compositions ?? []) {
    let textCache: string | undefined
    out.push({
      id: c.id,
      date: c.date,
      title: c.title || c.type?.text || c.type?.coding?.[0]?.display || 'Document',
      isDischargeSummary: hasDischargeLoinc(c.type?.coding),
      // Lazy: decode/HTML-strip is heavy and ONLY the AI-context formatter reads
      // it (for SELECTED docs). The checklist + count badges must not trigger it,
      // or every render re-decodes all documents — the data-selection lag.
      get text() { return (textCache ??= compositionText(c)) },
    })
  }
  for (const d of data.documentReferences ?? []) {
    const att = d.content?.[0]?.attachment
    let textCache: string | undefined
    out.push({
      id: d.id,
      // Prefer the encounter period start (admission date) over
      // DocumentReference.date: the NHI 健保存摺 bridge sets `date` to a
      // registration timestamp that is often shared across a batch (so it
      // clusters — e.g. many docs all showing the same day) and doesn't match
      // the real admission shown in the 文件 panel. The period is the meaningful,
      // distinct date and keeps both views consistent.
      date: d.context?.period?.start ?? d.date,
      title: d.type?.text || d.type?.coding?.[0]?.display || att?.title || 'Document',
      isDischargeSummary: hasDischargeLoinc(d.type?.coding),
      get text() { return (textCache ??= documentReferenceText(d)) },
    })
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

/**
 * The documents to actually include, given the user's mode + custom id list.
 * - latestAdmission  → the single most recent 出院病摘 (fallback: latest doc)
 * - recentAdmissions → the most recent N 出院病摘 (fallback: N latest docs) —
 *                      covers a multi-admission treatment course without dumping
 *                      every discharge summary a frequent-flyer patient has.
 * - all              → every document
 * - custom           → exactly the ticked ids
 * Input is assumed newest-first (as `listClinicalDocuments` returns).
 */
export function resolveSelectedDocuments(
  docs: ClinicalDocumentRef[],
  mode: DocumentMode,
  ids: string[],
): ClinicalDocumentRef[] {
  if (mode === 'all') return docs
  if (mode === 'custom') {
    const set = new Set(ids)
    return docs.filter((d) => set.has(d.id))
  }
  if (mode === 'recentAdmissions') {
    const discharges = docs.filter((d) => d.isDischargeSummary)
    const pool = discharges.length ? discharges : docs
    return pool.slice(0, RECENT_ADMISSIONS_COUNT)
  }
  // latestAdmission
  const discharge = docs.find((d) => d.isDischargeSummary)
  if (discharge) return [discharge]
  return docs.length ? [docs[0]] : []
}

export function formatDocumentsSection(docs: ClinicalDocumentRef[]): ClinicalContextSection | null {
  if (docs.length === 0) return null
  const items = docs.map((d) => {
    const date = d.date ? new Date(d.date).toLocaleDateString() : ''
    const header = `${d.title}${date ? ` (${date})` : ''}`
    return d.text ? `${header}\n${d.text}` : header
  })
  return { title: 'Documents', items }
}
