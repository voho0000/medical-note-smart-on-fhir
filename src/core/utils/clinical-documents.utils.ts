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

export type DocumentMode = 'latestAdmission' | 'all' | 'custom'

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

function compositionText(c: CompositionEntity): string {
  return (c.section ?? [])
    .map((s) => {
      const t = s.text?.div ? stripHtmlToText(s.text.div) : ''
      if (!t) return ''
      return s.title ? `${s.title}:\n${t}` : t
    })
    .filter(Boolean)
    .join('\n\n')
}

function documentReferenceText(d: DocumentReferenceEntity): string {
  const att = d.content?.[0]?.attachment
  const ct = att?.contentType?.toLowerCase() ?? ''
  // Discharge summaries ride in attachment.data as base64 text/html.
  if (att?.data && (ct.includes('html') || ct.includes('text') || ct.includes('xml') || !ct)) {
    const decoded = decodeBase64(att.data)
    if (decoded.trim()) return stripHtmlToText(decoded)
  }
  return d.description || att?.title || ''
}

/** All documents (Composition + DocumentReference), newest-first. */
export function listClinicalDocuments(data?: DocumentSource | null): ClinicalDocumentRef[] {
  if (!data) return []
  const out: ClinicalDocumentRef[] = []
  for (const c of data.compositions ?? []) {
    out.push({
      id: c.id,
      date: c.date,
      title: c.title || c.type?.text || c.type?.coding?.[0]?.display || 'Document',
      isDischargeSummary: hasDischargeLoinc(c.type?.coding),
      text: compositionText(c),
    })
  }
  for (const d of data.documentReferences ?? []) {
    const att = d.content?.[0]?.attachment
    out.push({
      id: d.id,
      date: d.date,
      title: d.type?.text || d.type?.coding?.[0]?.display || att?.title || 'Document',
      isDischargeSummary: hasDischargeLoinc(d.type?.coding),
      text: documentReferenceText(d),
    })
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

/**
 * The documents to actually include, given the user's mode + custom id list.
 * - latestAdmission → the single most recent 出院病摘 (fallback: latest doc)
 * - all            → every document
 * - custom         → exactly the ticked ids
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
