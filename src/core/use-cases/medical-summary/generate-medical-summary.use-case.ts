// Use Case: Generate the Medical Summary (醫療摘要) — pure AI narrative +
// decisions + timeline curation, constrained to a fixed schema and to citing
// ONLY app-issued source-catalog keys. No state, no framework — unit-testable.
//
// Anti-hallucination contract:
//  - The app builds a numbered SOURCE LIST from the bundle (buildSourceCatalog)
//    and appends it to the prompt. The model cites those keys.
//  - finalizeResult() resolves every citation against the catalog: unknown keys
//    are flagged unverified (shown, never silently dropped — 不遮蔽 principle);
//    timeline picks with unknown refs ARE dropped (their date can't be trusted)
//    but the drop is counted and surfaced.
//  - Dates / organizations / resource types always come from the bundle.
import type { AiMessage } from '@/src/core/entities/ai.entity'
import type {
  EncounterEntity,
  MedicationEntity,
  ObservationEntity,
  ProcedureEntity,
  DiagnosticReportEntity,
  ConditionEntity,
  CarePlanEntity,
  CompositionEntity,
  DocumentReferenceEntity,
} from '@/src/core/entities/clinical-data.entity'
import {
  MedicalSummaryAiResultSchema,
  normaliseTimelineCategory,
  normaliseProblemKind,
  normaliseInvestigationKind,
  normaliseInvestigationDirection,
  normaliseMedicationChangeType,
  normaliseMedicationReconciliationReason,
  type InvestigationDirection,
  type MedicalSummaryAiResult,
  type MedicalSummaryResult,
  type ResolvedSourceRef,
  type SummaryCoverageStats,
  type SummarySourceCatalogEntry,
} from '@/src/core/entities/medical-summary.entity'
import { referenceId } from '@/src/core/utils/observation-selectors'
import { inferGroupFromCategory } from '@/src/shared/utils/report-grouping-helpers'
import { listClinicalDocuments } from '@/src/core/utils/clinical-documents.utils'
import { scrubFreeText } from '@/src/shared/utils/pii-text-scrub'
import { tryExtractJsonValue } from '@/src/core/utils/llm-json.utils'

// Same pinned fast model as the safety scan: clean JSON, big context window
// for multi-year cross-hospital bundles, and it never rides the user's
// possibly-slow chat model (GPT-Nano on a large context ≈ 77s).
export const MEDICAL_SUMMARY_MODEL_ID = 'gemini-3.1-flash-lite'

// Caps keep the catalog prompt bounded on multi-year bundles. Items are taken
// most-recent-first; coverage stats always count EVERYTHING (uncapped).
const CATALOG_CAPS = {
  encounters: 40,
  medications: 40,
  labs: 30,
  procedures: 20,
  conditions: 20,
  carePlans: 15,
  documents: 20,
} as const

const LONGITUDINAL_MAX_LAB_SERIES = 16
const LONGITUDINAL_MAX_LAB_POINTS = 8
const LONGITUDINAL_MAX_IMAGING_SERIES = 8
const LONGITUDINAL_MAX_IMAGING_POINTS = 5

// Highlight guardrail bounds (see finalizeResult). 24 chars fits a zh
// diagnosis name or a value trend like "HbA1c 7.2→8.4"; a whole sentence
// never does.
export const EMPHASIS_MAX_CHARS = 24
export const EMPHASIS_MAX_COUNT = 5

type SummarySegment = { text: string; emphasis: boolean; sourceKeys: string[] }

/**
 * Citation coalescing: with the summary split into many small segments, each
 * fragment carrying its own superscript scatters numbers mid-sentence
 * ("包含¹ 慢性腎臟病¹ …"). A citation supports a CLAIM, so defer fragment
 * citations forward and render them only at natural boundaries — right after
 * a highlighted phrase, or at sentence end — deduped within each group.
 */
const SENTENCE_END = /[。．！？!?；;]\s*$/
export function coalesceCitations(segments: SummarySegment[]): SummarySegment[] {
  let pending: string[] = []
  return segments.map((seg, i) => {
    pending.push(...seg.sourceKeys)
    const isBoundary =
      seg.emphasis || SENTENCE_END.test(seg.text.trim()) || i === segments.length - 1
    if (!isBoundary) return { ...seg, sourceKeys: [] }
    const keys = [...new Set(pending)]
    pending = []
    return { ...seg, sourceKeys: keys }
  })
}

/**
 * Rescue pass for a zero-highlight summary: Flash-Lite sometimes ignores the
 * split-into-segments instruction and instead wraps key phrases in 「」 inside
 * one long segment (which the length guardrail then rightly demotes). Those
 * quotes ARE the model signalling importance — harvest them deterministically:
 * split each segment on short 「…」 spans and promote the quoted text to a
 * highlight (quotes stripped; the highlight replaces them). Runs ONLY when no
 * emphasis survived the guardrail, so compliant outputs are never rewritten.
 */
export function rescueEmphasisFromQuotes(segments: SummarySegment[]): SummarySegment[] {
  let budget = EMPHASIS_MAX_COUNT
  const out: SummarySegment[] = []
  for (const seg of segments) {
    // Odd indices of the split are the captured quoted spans.
    const parts = seg.text.split(new RegExp(`「([^「」]{1,${EMPHASIS_MAX_CHARS}})」`))
    if (parts.length === 1 || budget === 0) {
      out.push(seg)
      continue
    }
    const pieces: SummarySegment[] = []
    parts.forEach((part, i) => {
      const isQuoted = i % 2 === 1
      if (!part) return
      if (isQuoted && budget > 0) {
        budget -= 1
        pieces.push({ text: part, emphasis: true, sourceKeys: [] })
      } else {
        // Budget exhausted → keep the original quoting so no signal is lost.
        pieces.push({ text: isQuoted ? `「${part}」` : part, emphasis: false, sourceKeys: [] })
      }
    })
    if (pieces.length === 0) {
      out.push(seg)
      continue
    }
    // The citation superscript renders after a segment's last piece — keep
    // the original segment's sources there so numbering stays identical.
    pieces[pieces.length - 1].sourceKeys = seg.sourceKeys
    out.push(...pieces)
  }
  return out
}

export interface SummaryCatalogInput {
  encounters?: EncounterEntity[]
  medications?: MedicationEntity[]
  observations?: ObservationEntity[]
  procedures?: ProcedureEntity[]
  diagnosticReports?: DiagnosticReportEntity[]
  conditions?: ConditionEntity[]
  carePlans?: CarePlanEntity[]
  compositions?: CompositionEntity[]
  documentReferences?: DocumentReferenceEntity[]
}

const day = (iso?: string): string | undefined =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : iso || undefined

const codeText = (c?: { text?: string; coding?: Array<{ display?: string }> }) =>
  c?.text ?? c?.coding?.[0]?.display

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string | undefined): T[] {
  return [...items].sort((a, b) => (getDate(b) ?? '').localeCompare(getDate(a) ?? ''))
}

/**
 * Derive 住院/急診/門診 from FHIR `Encounter.class` — deterministic, never the
 * AI's guess. R4 says class is a Coding, but the bridge may send a
 * CodeableConcept-ish shape, so both are handled (FHIR-generic rule). Falls
 * back to display/text keywords when the v3-ActCode code is absent.
 */
export function classifyEncounterClass(
  cls?: { code?: string; display?: string; text?: string; coding?: Array<{ code?: string; display?: string }> },
): 'inpatient' | 'emergency' | 'outpatient' | undefined {
  if (!cls) return undefined
  const code = (cls.code ?? cls.coding?.[0]?.code ?? '').toUpperCase()
  // v3-ActCode: IMP=inpatient, ACUTE/NONAC=inpatient subtypes, EMER=emergency,
  // AMB=ambulatory, SS=short stay (counts as inpatient for display purposes)
  if (['IMP', 'ACUTE', 'NONAC', 'SS'].includes(code)) return 'inpatient'
  if (code === 'EMER') return 'emergency'
  if (code === 'AMB') return 'outpatient'
  const text = `${cls.display ?? ''} ${cls.text ?? ''} ${cls.coding?.[0]?.display ?? ''}`.toLowerCase()
  if (/住院|inpatient/.test(text)) return 'inpatient'
  if (/急診|emergency/.test(text)) return 'emergency'
  if (/門診|ambulatory|outpatient/.test(text)) return 'outpatient'
  return undefined
}

/**
 * Build the citable source catalog deterministically from the bundle.
 * Key prefixes: E=Encounter, M=MedicationRequest, P=Procedure,
 * L=DiagnosticReport, C=Condition, K=CarePlan, D=clinical document.
 */
export function buildSourceCatalog(input: SummaryCatalogInput): SummarySourceCatalogEntry[] {
  const entries: SummarySourceCatalogEntry[] = []

  sortByDateDesc(input.encounters ?? [], (e) => e.period?.start)
    .slice(0, CATALOG_CAPS.encounters)
    .forEach((e, i) => {
      const type = codeText(e.type?.[0]) ?? e.class?.display ?? 'Encounter'
      const reason = codeText(e.reasonCode?.[0])
      entries.push({
        key: `E${i + 1}`,
        resourceType: 'Encounter',
        resourceId: e.id,
        display: reason ? `${type}（${reason}）` : type,
        date: day(e.period?.start),
        organization: e.serviceProvider?.display,
        encounterClass: classifyEncounterClass(e.class),
      })
    })

  sortByDateDesc(input.medications ?? [], (m) => m.authoredOn)
    .slice(0, CATALOG_CAPS.medications)
    .forEach((m, i) => {
      entries.push({
        key: `M${i + 1}`,
        resourceType: m._sourceResourceType ?? 'MedicationRequest',
        resourceId: m.id,
        display: codeText(m.medicationCodeableConcept) ?? 'Medication',
        date: day(m.authoredOn),
        organization: m.requester?.display,
      })
    })

  sortByDateDesc(input.procedures ?? [], (p) => p.performedDateTime ?? p.performedPeriod?.start)
    .slice(0, CATALOG_CAPS.procedures)
    .forEach((p, i) => {
      entries.push({
        key: `P${i + 1}`,
        resourceType: 'Procedure',
        resourceId: p.id,
        display: codeText(p.code) ?? 'Procedure',
        date: day(p.performedDateTime ?? p.performedPeriod?.start),
        organization: p.performer?.[0]?.actor?.display ?? p.performer?.[0]?.display,
      })
    })

  sortByDateDesc(input.diagnosticReports ?? [], (r) => r.effectiveDateTime ?? r.issued)
    .slice(0, CATALOG_CAPS.labs)
    .forEach((r, i) => {
      entries.push({
        key: `L${i + 1}`,
        resourceType: 'DiagnosticReport',
        resourceId: r.id,
        display: codeText(r.code) ?? 'Report',
        date: day(r.effectiveDateTime ?? r.issued),
        organization: r.performer?.[0]?.display,
      })
    })

  sortByDateDesc(input.conditions ?? [], (c) => c.recordedDate ?? c.onsetDateTime)
    .slice(0, CATALOG_CAPS.conditions)
    .forEach((c, i) => {
      entries.push({
        key: `C${i + 1}`,
        resourceType: 'Condition',
        resourceId: c.id,
        display: codeText(c.code) ?? 'Condition',
        date: day(c.recordedDate ?? c.onsetDateTime),
      })
    })

  // Care plans (照護計畫) — a distinct, more authoritative evidence source for
  // the problem list. Key prefix 'K' (single-letter, distinct from C/P) so the
  // model can't confuse a care plan with a Condition/Procedure.
  sortByDateDesc(input.carePlans ?? [], (cp) => cp.period?.start ?? cp.created)
    .slice(0, CATALOG_CAPS.carePlans)
    .forEach((cp, i) => {
      entries.push({
        key: `K${i + 1}`,
        resourceType: 'CarePlan',
        resourceId: cp.id,
        display: cp.title?.trim() || codeText(cp.category?.[0]) || cp.description?.trim() || 'CarePlan',
        date: day(cp.period?.start ?? cp.created),
        organization: cp.author?.display?.trim() || undefined,
      })
    })

  // Clinical documents are first-class evidence. Their decoded narrative is
  // already present in the AI clinical context; these D keys make claims based
  // on that narrative auditable and directly navigable to the source document.
  const documents: Array<{
    resourceType: 'Composition' | 'DocumentReference'
    resourceId: string
    display: string
    date?: string
    organization?: string
    getContentText: () => string
  }> = [
    ...(input.compositions ?? []).map((document) => ({
      resourceType: 'Composition' as const,
      resourceId: document.id,
      display: document.title?.trim() || codeText(document.type) || 'Clinical document',
      date: day(document.date),
      organization: document.author?.[0]?.display?.trim() || undefined,
      getContentText: () => listClinicalDocuments({ compositions: [document] })[0]?.text ?? '',
    })),
    ...(input.documentReferences ?? []).map((document) => ({
      resourceType: 'DocumentReference' as const,
      resourceId: document.id,
      display:
        codeText(document.type) ||
        document.description?.trim() ||
        document.content?.[0]?.attachment?.title?.trim() ||
        'Clinical document',
      // Admission date is the meaningful date for NHI discharge summaries;
      // DocumentReference.date is often only the batch registration timestamp.
      date: day(document.context?.period?.start ?? document.date),
      organization: document.author?.[0]?.display?.trim() || undefined,
      getContentText: () => listClinicalDocuments({ documentReferences: [document] })[0]?.text ?? '',
    })),
  ]
  sortByDateDesc(documents, (document) => document.date)
    .slice(0, CATALOG_CAPS.documents)
    .forEach((document, index) => {
      entries.push({
        key: `D${index + 1}`,
        ...document,
      })
    })

  return entries
}

// Both the summary hook AND the safety hook need the catalog for the same
// bundle; memoise by input reference (react-query hands both the same object)
// so the 160+-entry build runs once per bundle, not once per hook.
const catalogCache = new WeakMap<object, SummarySourceCatalogEntry[]>()
export function getSourceCatalog(input: SummaryCatalogInput): SummarySourceCatalogEntry[] {
  const cached = catalogCache.get(input)
  if (cached) return cached
  const built = buildSourceCatalog(input)
  catalogCache.set(input, built)
  return built
}

/** Keep only the clinical documents that were actually inserted into this
 * consumer's AI context, then renumber D keys densely for a clear prompt. */
export function scopeDocumentSources(
  catalog: SummarySourceCatalogEntry[],
  includedDocumentIds: string[],
): SummarySourceCatalogEntry[] {
  const included = new Set(includedDocumentIds)
  let documentIndex = 0
  return catalog.flatMap((source) => {
    if (!['DocumentReference', 'Composition'].includes(source.resourceType)) return [source]
    if (!included.has(source.resourceId)) return []
    documentIndex += 1
    return [{ ...source, key: `D${documentIndex}` }]
  })
}

/** Coverage card numbers — deterministic, uncapped, zero AI. */
export function buildCoverageStats(input: SummaryCatalogInput): SummaryCoverageStats {
  const dates: string[] = []
  const orgs = new Set<string>()

  for (const e of input.encounters ?? []) {
    const d = day(e.period?.start)
    if (d) dates.push(d)
    if (e.serviceProvider?.display) orgs.add(e.serviceProvider.display)
  }
  for (const m of input.medications ?? []) {
    const d = day(m.authoredOn)
    if (d) dates.push(d)
    if (m.requester?.display) orgs.add(m.requester.display)
  }
  for (const p of input.procedures ?? []) {
    const d = day(p.performedDateTime ?? p.performedPeriod?.start)
    if (d) dates.push(d)
    const org = p.performer?.[0]?.actor?.display ?? p.performer?.[0]?.display
    if (org) orgs.add(org)
  }
  for (const r of input.diagnosticReports ?? []) {
    const d = day(r.effectiveDateTime ?? r.issued)
    if (d) dates.push(d)
  }
  for (const cp of input.carePlans ?? []) {
    const d = day(cp.period?.start ?? cp.created)
    if (d) dates.push(d)
    if (cp.author?.display) orgs.add(cp.author.display)
  }

  dates.sort()
  return {
    start: dates[0],
    end: dates[dates.length - 1],
    organizations: orgs.size,
    encounters: input.encounters?.length ?? 0,
    medications: input.medications?.length ?? 0,
    labs: input.diagnosticReports?.length ?? 0,
    procedures: input.procedures?.length ?? 0,
  }
}

interface LongitudinalLabPoint {
  label: string
  key: string
  date: string
  value: string
  sourceKey: string
  abnormal?: string
}

interface LongitudinalImagingPoint {
  label: string
  key: string
  date: string
  finding: string
  sourceKey: string
}

const compactWhitespace = (s: string): string => s.replace(/\s+/g, ' ').trim()

const truncateText = (s: string, max = 150): string => {
  const cleaned = compactWhitespace(s)
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

const canonicalKey = (label: string): string => {
  const s = label.toUpperCase().replace(/\s+/g, ' ').trim()
  if (/(HBA1C|HB-A1C|A1C|GLYCATED|糖化血色素)/.test(s)) return 'HBA1C'
  if (/(EGFR|ESTIMATED GFR|腎絲球過濾率)/.test(s)) return 'EGFR'
  if (/(CREATININE|CREA|肌酸酐|肌酐)/.test(s)) return 'CREATININE'
  if (/(PSA|攝護腺特異抗原|前列腺特異抗原)/.test(s)) return 'PSA'
  if (/(CHEST|CXR|胸腔|胸部|胸片)/.test(s)) return 'CHEST_IMAGING'
  if (/(ALBUMIN.*URINE|URINE.*ALBUMIN|微量白蛋白|尿.*白蛋白)/.test(s)) return 'URINE_ALBUMIN'
  if (/(HEMOGLOBIN|^HB$|血色素)/.test(s)) return 'HEMOGLOBIN'
  if (/(TSH|甲促素|甲狀腺刺激素)/.test(s)) return 'TSH'
  return s.replace(/[^A-Z0-9\u4E00-\u9FFF]+/g, '')
}

const investigationPriority = (key: string, label: string): number => {
  const s = `${key} ${label}`.toUpperCase()
  if (/HBA1C|EGFR|CREATININE|URINE_ALBUMIN/.test(s)) return 0
  if (/PSA|AFP|CEA|CA125|CA-125|CA199|CA19-9|FERRITIN/.test(s)) return 1
  if (/HEMOGLOBIN|PLATELET|WBC|CRP|TSH|LDL|CHOLESTEROL/.test(s)) return 2
  return 3
}

const conceptText = (c?: { text?: string; coding?: Array<{ code?: string; display?: string }> }): string | undefined =>
  c?.text?.trim() || c?.coding?.find((coding) => coding.display?.trim())?.display?.trim() || c?.coding?.find((coding) => coding.code?.trim())?.code?.trim()

const obsDate = (o: ObservationEntity): string | undefined => {
  const extra = o as ObservationEntity & { effectivePeriod?: { start?: string }; issued?: string }
  return day(o.effectiveDateTime ?? extra.effectivePeriod?.start ?? extra.issued)
}

const obsValue = (o: ObservationEntity): string | null => {
  const value =
    o.valueQuantity?.value ??
    o.valueString ??
    o.valueCodeableConcept?.text ??
    o.valueCodeableConcept?.coding?.find((coding) => coding.display)?.display
  if (value === undefined || value === null || value === '') return null
  const text = typeof value === 'number' ? String(value) : compactWhitespace(String(value))
  const unit = o.valueQuantity?.unit?.trim()
  return unit ? `${text} ${unit}` : text
}

function reportObservationMap(observations?: ObservationEntity[]): Map<string, ObservationEntity> {
  const map = new Map<string, ObservationEntity>()
  for (const obs of observations ?? []) {
    if (obs.id) map.set(obs.id, obs)
  }
  return map
}

function observationsForReport(
  report: DiagnosticReportEntity,
  byObservationId: Map<string, ObservationEntity>,
): ObservationEntity[] {
  const out: ObservationEntity[] = []
  const seen = new Set<string>()
  const add = (obs: ObservationEntity | undefined) => {
    if (!obs) return
    const key = obs.id ?? `${conceptText(obs.code) ?? ''}-${obsDate(obs) ?? ''}-${obsValue(obs) ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(obs)
  }
  for (const obs of report._observations ?? []) add(obs)
  for (const ref of report.result ?? []) {
    const id = referenceId(ref.reference)
    if (id) add(byObservationId.get(id))
  }
  return out
}

function collectLongitudinalLabPoints(
  input: SummaryCatalogInput,
  sourceByResourceId: Map<string, SummarySourceCatalogEntry>,
): LongitudinalLabPoint[] {
  const byObservationId = reportObservationMap(input.observations)
  const points: LongitudinalLabPoint[] = []
  for (const report of input.diagnosticReports ?? []) {
    if (inferGroupFromCategory(report.category) !== 'lab') continue
    const reportKey = report.id ? sourceByResourceId.get(report.id)?.key : undefined
    if (!reportKey) continue
    const reportDate = day(report.effectiveDateTime ?? report.issued)
    const observations = observationsForReport(report, byObservationId)
    for (const obs of observations) {
      const value = obsValue(obs)
      const date = obsDate(obs) ?? reportDate
      if (!value || !date) continue
      const label = conceptText(obs.code) ?? conceptText(report.code) ?? 'Lab'
      points.push({
        label,
        key: canonicalKey(label),
        date,
        value,
        sourceKey: reportKey,
        abnormal: obs.interpretation?.text ?? obs.interpretation?.coding?.[0]?.code,
      })
    }
  }
  return points
}

function collectLongitudinalImagingPoints(
  input: SummaryCatalogInput,
  sourceByResourceId: Map<string, SummarySourceCatalogEntry>,
): LongitudinalImagingPoint[] {
  const points: LongitudinalImagingPoint[] = []
  for (const report of input.diagnosticReports ?? []) {
    if (inferGroupFromCategory(report.category) !== 'imaging') continue
    const reportKey = report.id ? sourceByResourceId.get(report.id)?.key : undefined
    const date = day(report.effectiveDateTime ?? report.issued)
    if (!reportKey || !date) continue
    const finding = report.conclusion || report.note?.map((n) => n.text).filter(Boolean).join(' ')
    if (!finding) continue
    const label = conceptText(report.code) ?? 'Imaging'
    points.push({
      label,
      key: canonicalKey(label),
      date,
      finding: truncateText(finding),
      sourceKey: reportKey,
    })
  }
  return points
}

function formatLongitudinalLabLines(points: LongitudinalLabPoint[]): string[] {
  const byKey = new Map<string, LongitudinalLabPoint[]>()
  for (const point of points) {
    const arr = byKey.get(point.key)
    if (arr) arr.push(point)
    else byKey.set(point.key, [point])
  }
  return [...byKey.values()]
    .filter((series) => new Set(series.map((p) => p.date)).size >= 2)
    .sort((a, b) => {
      const pa = investigationPriority(a[0].key, a[0].label)
      const pb = investigationPriority(b[0].key, b[0].label)
      if (pa !== pb) return pa - pb
      if (b.length !== a.length) return b.length - a.length
      return b[b.length - 1].date.localeCompare(a[a.length - 1].date)
    })
    .slice(0, LONGITUDINAL_MAX_LAB_SERIES)
    .map((series) => {
      const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
      const recent = sorted.slice(-LONGITUDINAL_MAX_LAB_POINTS)
      const omitted = sorted.length - recent.length
      const seq = recent
        .map((p) => `${p.value}${p.abnormal ? `[${p.abnormal}]` : ''} (${p.date}; ${p.sourceKey})`)
        .join(' → ')
      return `- ${sorted[0].label}: ${omitted > 0 ? `…(${omitted} earlier) → ` : ''}${seq}`
    })
}

function formatLongitudinalImagingLines(points: LongitudinalImagingPoint[]): string[] {
  const byKey = new Map<string, LongitudinalImagingPoint[]>()
  for (const point of points) {
    const arr = byKey.get(point.key)
    if (arr) arr.push(point)
    else byKey.set(point.key, [point])
  }
  return [...byKey.values()]
    .filter((series) => new Set(series.map((p) => p.date)).size >= 2)
    .sort((a, b) => {
      const latestA = [...a].sort((x, y) => y.date.localeCompare(x.date))[0]?.date ?? ''
      const latestB = [...b].sort((x, y) => y.date.localeCompare(x.date))[0]?.date ?? ''
      return latestB.localeCompare(latestA) || b.length - a.length
    })
    .slice(0, LONGITUDINAL_MAX_IMAGING_SERIES)
    .map((series) => {
      const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
      const recent = sorted.slice(-LONGITUDINAL_MAX_IMAGING_POINTS)
      const omitted = sorted.length - recent.length
      const seq = recent
        .map((p) => `${p.date}; ${p.sourceKey}: ${p.finding}`)
        .join(' → ')
      return `- ${sorted[0].label}: ${omitted > 0 ? `…(${omitted} earlier) → ` : ''}${seq}`
    })
}

/**
 * App-derived longitudinal evidence for the fixed Medical Summary card.
 *
 * The normal chat/insights context follows the user's Data Selection time
 * window, which is correct for free-form prompts but too narrow for the fixed
 * "test trends" card. This appendix is built from all available
 * DiagnosticReports so chronic markers (HbA1c, PSA, eGFR, imaging follow-up)
 * are not mislabeled as a single latest result.
 */
export function buildLongitudinalInvestigationContext(
  input: SummaryCatalogInput,
  catalog: SummarySourceCatalogEntry[],
): string {
  const sourceByResourceId = new Map(catalog.map((entry) => [entry.resourceId, entry]))
  const labLines = formatLongitudinalLabLines(collectLongitudinalLabPoints(input, sourceByResourceId))
  const imagingLines = formatLongitudinalImagingLines(collectLongitudinalImagingPoints(input, sourceByResourceId))
  if (labLines.length === 0 && imagingLines.length === 0) return ''

  const sections = [
    '## Longitudinal Investigation Evidence (app-derived from all available DiagnosticReports)',
    'Use this section for the medical-summary "investigations" card. If a topic below has 2+ dated points/reports, it is NOT a single result; use the sequence and cite the shown L keys.',
  ]
  if (labLines.length > 0) {
    sections.push('### Serial lab values (oldest → newest)', ...labLines)
  }
  if (imagingLines.length > 0) {
    sections.push('### Serial imaging reports (oldest → newest)', ...imagingLines)
  }
  return sections.join('\n')
}

function guardedInvestigationDirection(
  rawDirection: string | undefined,
  label: string,
  rawSources: string[] | undefined,
  catalogByKey: Map<string, SummarySourceCatalogEntry>,
  catalog: SummarySourceCatalogEntry[],
): InvestigationDirection {
  const direction = normaliseInvestigationDirection(rawDirection)
  if (direction !== 'single') return direction
  const diagnosticReportDates = new Set(
    (rawSources ?? [])
      .map((rawKey) => catalogByKey.get(rawKey.trim()))
      .filter((entry): entry is SummarySourceCatalogEntry =>
        entry?.resourceType === 'DiagnosticReport' && !!entry.date,
      )
      .map((entry) => entry.date),
  )
  if (diagnosticReportDates.size >= 2) return 'unknown'

  const labelKey = canonicalKey(label)
  const topicDates = new Set(
    catalog
      .filter((entry) => entry.resourceType === 'DiagnosticReport' && entry.date)
      .filter((entry) => canonicalKey(entry.display) === labelKey)
      .map((entry) => entry.date),
  )
  return topicDates.size >= 2 ? 'unknown' : 'single'
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SCHEMA_HINT =
  '{"headline": "<one-line patient positioning>", ' +
  '"summary": [{"text": "<narrative segment>", "emphasis": <true for pivotal segments>, "sources": ["<catalog key like E1>"]}], ' +
  '"investigations": [{"label": "<disease-relevant test or imaging group>", "kind": "lab|imaging|pathology|other", "direction": "improving|stable|worsening|fluctuating|single|unknown", "trend": "<actual serial values or imaging change; say single result when only one>", "interpretation": "<why this matters for this patient>", "sources": ["<catalog key>"]}], ' +
  '"medicationEducation": [{"name": "<medicine or medicine group in the records>", "benefit": "<plain-language explanation of how it may help this patient>", "attention": "<one calm, practical use reminder>", "sources": ["<catalog key, including at least one M key>"]}], ' +
  '"medicationReview": {"regimen": [{"group": "<treatment area>", "name": "<medicine or clinically coherent group>", "sig": "<dose/frequency only when recorded>", "sources": ["<M key>"]}], "changes": [{"type": "new|stopped|resumed|changed|cross-facility|uncertain", "medication": "<medicine>", "summary": "<record-supported recent change>", "sources": ["<M key>"]}], "reconciliation": [{"reason": "status-conflict|missing-sig|multi-facility|uncertain-current|possible-same-drug|other", "text": "<specific item to verify during medication reconciliation>", "sources": ["<M key>"]}]}, ' +
  '"problems": [{"label": "<condition name, e.g. 第二型糖尿病>", "basis": "<short basis e.g. 5 次檢驗異常 / 藥局調劑>", "kind": "diagnosis|lab|medication|careplan|discharge|other", "sources": ["<catalog key>"]}], ' +
  '"decisions": [], ' +
  '"timeline": [{"ref": "<catalog key>", "label": "<one-line event label>", "category": "diagnosis|procedure|medication|encounter|lab|followup"}]}'

const SHARED_RULES =
  '\n\nData-integrity rules (CRITICAL): ' +
  'The data is from Taiwan NHI 健康存摺 — cross-hospital insurance records, NOT a complete hospital chart. ' +
  'Self-paid items and some hospitals\' lab values are absent; records from the last 2–4 weeks may not be uploaded yet. ' +
  'NEVER treat absence of data as absence of care (e.g. never claim "no recent visits" or "not taking medication"). ' +
  'Do NOT speculate about in-hospital findings that are not in the data (e.g. ER workup conclusions). ' +
  'Cite sources ONLY with reference keys that appear in the SOURCE LIST (e.g. "E1", "M3"); never invent keys. ' +
  'Every key in a claim\'s "sources" must DIRECTLY support that specific claim — do not attach loosely-related keys. ' +
  'Do NOT fabricate values — use only values present in the data. ' +
  'Diagnosis-code caution (CRITICAL): the ICD / diagnosis codes on claims and on a visit\'s reason-for-encounter are BILLING codes, ' +
  'NOT confirmed diagnoses — they are routinely provisional, "rule-out", suspected, or carried forward across visits for reimbursement. ' +
  'Do NOT assert a coded condition as an established diagnosis on a claim code alone, and NEVER recommend workup, referral, or staging for it on that basis ' +
  '(e.g. do not advise "refer to hemato-oncology to assess the myeloma" merely because a myeloma claim code appears on a visit). ' +
  'When a condition rests ONLY on a claim/reason code, either hedge it ("健保申報碼曾登錄…" / "claim records list…") or corroborate it with labs, ' +
  'dispensed medications, or care plans before presenting it as an active problem or acting on it. ' +
  'Corroboration MUST be CONDITION-SPECIFIC — the lab/imaging/med must directly evidence THAT condition (an echocardiogram for valvular disease; an ECG or an unrelated cardiac test does NOT confirm a valve diagnosis; a HbA1c for diabetes, not any blood test). ' +
  'Before citing a DiagnosticReport for a condition, CHECK ITS CONTENT: read the report\'s actual result values / conclusion text in the data and cite it ONLY if that content itself mentions or measures the condition. ' +
  'A plausible title or same-day timing is NOT a link — e.g. an abdominal ultrasound whose conclusion says "fatty liver, gallbladder sludge, renal stones" says NOTHING about 胃息肉 and must not be cited as its evidence ' +
  '(while it IS direct evidence for 脂肪肝/膽囊沉積物/腎結石 — report those findings instead of leaving them out). ' +
  'The same applies to documents: write 出院病摘 as a "basis" ONLY if the discharge summary text actually mentions that condition — do not attribute a condition to a document that never names it. ' +
  'Clinical-document evidence: when a claim is supported by a discharge summary or other clinical document, cite its matching D# source key. ' +
  'A diagnosis explicitly documented in a discharge summary remains valid documentary evidence even when there is no separate endoscopy/pathology/report resource; do NOT discard it merely because that standalone report is absent. ' +
  'However, a documented diagnosis does NOT prove that a specific procedure was performed: say the document records the diagnosis, and claim gastroscopy/endoscopy/biopsy only when the document text itself explicitly says it was performed. ' +
  'A test that does not measure or name the condition is NOT corroboration, and must not be cited in that claim\'s "sources". ' +
  'When a condition rests only on claim codes (with or without related medications), the "basis" must say what the evidence actually is ' +
  '(e.g. "3次門診申報及用藥") — NOT a phrase like "門診追蹤" that implies clinical confirmation, and not a test that never assessed it. ' +
  'Do NOT recommend routine follow-up of a code-only condition as if it were established; if anything, suggest the confirmatory test. ' +
  'NEVER name an examination or report type as evidence when no such report exists in the data — do not write 內視鏡/胃鏡/切片/心臟超音波 (or any test) in a "basis" unless that report is actually present ' +
  '(a 息肉/polyp claim code does NOT mean an endoscopy report exists; a cardiac claim code does NOT mean an echo exists — check the actual reports). ' +
  'Temporal honesty: call an event 近期/recent ONLY if it is within ~3 months of the newest record; otherwise state the actual date or timeframe. ' +
  'Trend honesty (ALL audiences, including the patient version): when serial values show a direction (e.g. eGFR 35→33→32), describe it faithfully — ' +
  'NEVER call a worsening value 穩定/stable; in patient language prefer calm-but-true phrasing (e.g. 數值逐漸下降，醫師正在追蹤) over false reassurance. ' +
  'For "investigations", create a disease-oriented overview of the 3–6 MOST clinically relevant laboratory, pathology, and imaging topics for THIS patient, not a dump of every test. ' +
  'Choose topics from the active clinical context: for a cancer patient prioritize documented tumor markers, pathology, and serial imaging; for diabetes prioritize HbA1c, renal function/eGFR, and urine albumin when present; adapt similarly for other conditions. ' +
  'Each item must cite the DiagnosticReport source(s) that contain the stated values/findings. Put the actual data sequence in "trend" (include units when present) and a concise patient-specific meaning in "interpretation". ' +
  'Use "direction" for CLINICAL direction, not numeric direction (e.g. falling eGFR is "worsening"). Claim a trend only with at least 2 comparable time points; with one report use "single" and explicitly say it is a single result. ' +
  'If the Longitudinal Investigation Evidence section lists 2+ dated points/reports for a topic, NEVER label that topic "single" and NEVER write "single result" for it; summarize the serial pattern instead. ' +
  'Never infer stability from one value, never invent a test that is absent, never mix non-comparable units/methods into one sequence, and do not repeat routine normal tests unless they materially answer an active problem. ' +
  'For "medicationEducation": this is ONLY for the patient audience; for the medical audience return an empty array. ' +
  'For patients, select 3–5 of the most relevant recent or long-term medicines (or clinically coherent medicine groups) that actually appear in the records. ' +
  'Lead with BENEFIT: explain in plain language how each medicine may support a documented condition or care goal. Then give exactly one calm, practical "attention" reminder. ' +
  'Do NOT use fear-provoking labels such as dangerous/high-risk medicine, do NOT dump rare or severe adverse effects, and do NOT imply that a medicine caused a past fall, confusion, admission, or other event. ' +
  'Never advise the patient to start, stop, skip, or change a dose. Prefer actionable wording such as taking it as directed, rising slowly if dizziness occurs, or asking the doctor/pharmacist when a symptom persists. ' +
  'Do not claim the medicine is currently being taken merely because it appears in NHI history; say the records include/show it. Only state a medicine purpose when you are confident from the drug identity and patient context; otherwise describe its recorded care area and invite confirmation. ' +
  'Every item must cite at least one matching medication key (M#). Additional condition/report keys may be included only when they directly support the linked care goal. Merge refills and pharmacy duplicates into one item. ' +
  'For "medicationReview": this is ONLY for the medical audience; for the patient audience return empty regimen, changes, and reconciliation arrays. ' +
  'This is a medication-reconciliation workflow card, NOT another safety card: do not repeat interactions, renal-dose warnings, laboratory monitoring, disease problems, or patient education. ' +
  'For "regimen", select 4–8 clinically important recent or long-term medicines, grouped by treatment area. Include dose/frequency in "sig" only when the source explicitly records it. ' +
  'For "changes", include only date/status-supported new appearances, stops, resumptions, dose/frequency changes, or cross-facility records. When initiation is uncertain, say "newly appears in recent records" rather than claiming it was started. ' +
  'For "reconciliation", include only concrete data/workflow gaps: conflicting status, missing SIG, multiple facilities, uncertain current status, or possible aliases of the same drug. Do not assign severity or recommend clinical dose changes. ' +
  'NHI dispensing does not prove adherence or current use. Every medicationReview item must cite at least one matching M key; merge routine refills and prescribing-clinic/pharmacy representations of the same prescription. ' +
  'Completeness sweep: before finalizing "problems", re-scan the labs and the long-term medication list for clearly-supported conditions you have not yet listed ' +
  '(e.g. abnormal TSH → 甲狀腺問題, chronic urate-lowering therapy → 高尿酸血症, repeated past-year events such as 譫妄就診) — ' +
  'a complex multi-morbid patient typically yields 8–12 problems, not 5–6. ' +
  'The summary is a flowing narrative split into segments: consecutive segments are concatenated into ONE paragraph, so include the connecting punctuation yourself. ' +
  'Highlighting ("emphasis": true) renders as a marker-pen highlight — it only works when RARE and SHORT. ' +
  'Split each sentence so the key phrase is its OWN tiny segment: mark at most 5 segments in the whole summary, ' +
  'each under ~15 characters (a diagnosis name, a value trend like "HbA1c 7.2→8.4", a status word) — ' +
  'NEVER a whole sentence. Everything else stays "emphasis": false. ' +
  'Do NOT wrap key phrases in 「」 quotes as a substitute for highlighting — split them out instead. ' +
  'Example: instead of ONE segment {"text": "近期診斷為「肺炎」伴隨咳嗽。"}, output THREE: ' +
  '[{"text": "近期診斷為", "emphasis": false, "sources": []}, {"text": "肺炎", "emphasis": true, "sources": ["E3"]}, {"text": "伴隨咳嗽。", "emphasis": false, "sources": []}]. ' +
  'For the timeline, surface only the clinically SIGNIFICANT events — milestones and turning points ' +
  '(a hospital admission, an ER visit, a first/major new diagnosis, starting a care plan, a key imaging study or procedure) — ' +
  'NOT every routine follow-up visit or repeat-prescription pickup. Aim for ~5–8 such events for a case like this (only a very complex multi-year, multi-hospital course justifies more). ' +
  'The timeline is the OBJECTIVE care journey, so choose the SAME significant events REGARDLESS of audience: the patient version changes only the WORDING of each label into plain language — it must NOT show more events, fewer events, or different events than the clinician version would. ' +
  'Curate — the full record list is already visible elsewhere; the app supplies date and hospital, you supply only the label. ' +
  'For "problems", infer the patient\'s ACTIVE problem list by SYNTHESISING across ALL data — not just claim diagnosis codes: ' +
  'coded diagnoses, ABNORMAL LAB patterns (e.g. repeatedly low Hb → 貧血), DISPENSED MEDICATIONS that imply a condition ' +
  '(e.g. glaucoma eye drops → 青光眼, BPH drugs like Harnalidge/Detrusitol → 良性攝護腺增生), care plans, and discharge summaries. ' +
  'Each problem is a plain condition NAME (e.g. 第二型糖尿病) — do NOT include ICD or any other codes. ' +
  'Give each a SHORT "basis" phrase naming the evidence type and count (e.g. "5 次檢驗異常", "藥局調劑", "照護計畫", "6 次就診申報"), ' +
  'the matching "kind", and the catalog key(s) in "sources". Merge duplicates; order by clinical importance; at most ~12 problems. ' +
  'Cross-hospital lens: surface care fragmented across providers and follow-up gaps. ' +
  'For duplicate medications, be strict: these are NHI cross-facility records where ONE prescription appears twice (the prescribing clinic AND the 藥局 / pharmacy that dispenses the 慢箋), ' +
  'and same-clinic refills are one ongoing therapy — NEITHER is duplication. Only call out duplication when the SAME drug (or same-class additive drugs) is prescribed by TWO DIFFERENT CLINICS in a short window. ' +
  'Output ONLY a JSON object matching this schema, with NO markdown fences and NO other text:\n' +
  SCHEMA_HINT

const SYSTEM_MEDICAL =
  'You are preparing a structured cross-hospital patient summary for a physician who is seeing this patient ' +
  'without knowing their history at other facilities. Precise clinical language; cite actual values and trends. ' +
  'Return "decisions" as an empty array. Follow-up and safety actions are handled by the separate safety analysis. ' +
  'Return "medicationEducation" as an empty array; this benefit-first education card is patient-facing. ' +
  'Populate "medicationReview" as a concise clinician medication-reconciliation overview.' +
  SHARED_RULES

const SYSTEM_PATIENT =
  'You are helping a patient (a layperson, NOT a clinician) understand their own NHI 健康存摺 records. ' +
  'Plain, everyday language at a junior-high reading level; explain any necessary medical term; ' +
  'no ICD/ATC codes, no prognosis speculation, no probability statements — when uncertain, point them to their doctor. ' +
  'Positive facts (e.g. stable results) may be emphasised to reassure. ' +
  'Choose wording that does NOT make the patient anxious, fearful, or panicked (用詞避免引起病患恐慌或焦慮): ' +
  'stay calm, matter-of-fact and reassuring; avoid frightening or worst-case phrasing, and do NOT tie a past scary event ' +
  '(confusion, a fall, a hospital visit) to a current medicine as cause-and-effect — frame anything to review as a routine ' +
  'check with the doctor, not a danger. ' +
  'Return "decisions" as an empty array. Follow-up and safety actions are handled by the separate safety analysis. ' +
  'Populate "medicationEducation" as benefit-first, reassuring medication education ' +
  'grounded in the patient\'s medication records. ' +
  'Return "medicationReview" with empty regimen, changes, and reconciliation arrays.' +
  SHARED_RULES

export interface GenerateMedicalSummaryInput {
  clinicalContext: string
  catalog: SummarySourceCatalogEntry[]
  locale: 'en' | 'zh-TW'
  audience?: 'medical' | 'patient'
}

// Accept pre-v3 cached/test objects during the rollout; live parseResult always
// materialises newer arrays via schema defaults.
type FinalizableMedicalSummary = Omit<MedicalSummaryAiResult, 'investigations' | 'medicationEducation' | 'medicationReview'> & {
  investigations?: MedicalSummaryAiResult['investigations']
  medicationEducation?: MedicalSummaryAiResult['medicationEducation']
  medicationReview?: MedicalSummaryAiResult['medicationReview']
}

export class GenerateMedicalSummaryUseCase {
  buildMessages(input: GenerateMedicalSummaryInput): AiMessage[] {
    const system = input.audience === 'patient' ? SYSTEM_PATIENT : SYSTEM_MEDICAL
    const lang =
      input.locale === 'zh-TW'
        ? '\n\nWrite every "headline", "text", "rationale", "label", "trend", "interpretation", "name", "benefit" and "attention" value in Traditional Chinese (繁體中文).'
        : '\n\nWrite all values in English.'
    const catalogBlock = input.catalog
      .map((c) => {
        const parts = [c.resourceType, c.date ?? '?', c.organization ?? '', c.display]
        return `[${c.key}] ${parts.filter(Boolean).join(' | ')}`
      })
      .join('\n')
    return [
      { role: 'system', content: system + lang },
      {
        role: 'user',
        // scrubFreeText: outbound PII mask (身分證 / labeled 病歷號/姓名) —
        // idempotent over what getFullClinicalContext already scrubbed, and
        // covers the longitudinal-investigation block appended after it
        // (imaging conclusions can carry patient identifiers).
        content:
          `Patient clinical data:\n${scrubFreeText(input.clinicalContext)}\n\n` +
          `SOURCE LIST (cite these keys in "sources" / "timeline.ref"):\n${catalogBlock}`,
      },
    ]
  }

  /**
   * Parse the model's reply, or null if it isn't valid JSON for the schema.
   * Failures log a truncated head of the raw reply — Flash-Lite occasionally
   * returns malformed/truncated JSON on large contexts, and a silent null
   * makes those one-off failures undiagnosable from the browser console.
   */
  parseResult(text: string): MedicalSummaryAiResult | null {
    const fail = (reason: string): null => {
      // Dev-only: the reply head contains PHI-derived text; keep it out of
      // production consoles (the reason alone is enough signal there).
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[medical-summary] parseResult failed (${reason}); reply head:`,
          (text ?? '').slice(0, 300),
        )
      } else {
        console.warn(`[medical-summary] parseResult failed (${reason})`)
      }
      return null
    }
    const raw = tryExtractJsonValue(text)
    if (raw === null) return fail('no parseable JSON found')
    const parsed = MedicalSummaryAiResultSchema.safeParse(raw)
    if (parsed.success) return parsed.data
    // Zod paths/codes carry no PHI — safe to log in prod, and without them a
    // "schema mismatch" is undiagnosable (2026-07: Haiku's verbose outputs
    // failed here for weeks before anyone could say WHICH rule broke).
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    return fail(`schema mismatch — ${issues}`)
  }

  /**
   * Resolve every AI citation against the app-built catalog.
   * - narrative/decision sources: unknown keys stay visible but unverified.
   * - timeline picks: unknown refs are dropped (no trustworthy date) and counted.
   */
  finalizeResult(
    ai: FinalizableMedicalSummary,
    catalog: SummarySourceCatalogEntry[],
  ): MedicalSummaryResult {
    const byKey = new Map(catalog.map((c) => [c.key, c]))

    // Number sources by first appearance: summary segments first, then decisions.
    const sourceIndex: ResolvedSourceRef[] = []
    const numByKey = new Map<string, number>()
    const registerKey = (rawKey: string): string => {
      const key = rawKey.trim()
      if (!numByKey.has(key)) {
        const entry = byKey.get(key)
        const num = sourceIndex.length + 1
        numByKey.set(key, num)
        sourceIndex.push({
          key,
          num,
          verified: !!entry,
          resourceType: entry?.resourceType,
          resourceId: entry?.resourceId,
          display: entry?.display,
          date: entry?.date,
          organization: entry?.organization,
        })
      }
      return key
    }

    // Highlight guardrail: Flash-Lite tends to mark whole sentences (or every
    // segment) as pivotal, turning the marker-pen highlight into wallpaper.
    // The prompt asks for ≤5 short phrases; enforce it deterministically —
    // over-long segments are demoted, and only the first
    // EMPHASIS_MAX_COUNT survivors keep the highlight.
    let emphasisBudget = EMPHASIS_MAX_COUNT
    let summary = ai.summary.map((seg) => {
      let emphasis = seg.emphasis ?? false
      if (emphasis && (seg.text.trim().length > EMPHASIS_MAX_CHARS || emphasisBudget === 0)) {
        emphasis = false
      }
      if (emphasis) emphasisBudget -= 1
      return {
        text: seg.text,
        emphasis,
        sourceKeys: (seg.sources ?? []).map(registerKey),
      }
    })
    // Zero highlights after the guardrail = the model quoted its key phrases
    // instead of splitting them — harvest those (see rescueEmphasisFromQuotes).
    if (!summary.some((s) => s.emphasis)) {
      summary = rescueEmphasisFromQuotes(summary)
    }
    // Citations belong to claims — move fragment citations to the highlight /
    // sentence boundary they support instead of scattering them mid-sentence.
    summary = coalesceCitations(summary)
    // Investigations render directly after the narrative, so register their
    // evidence before problem/decision sources to keep citation numbers
    // increasing top-to-bottom on the page.
    const investigations = (ai.investigations ?? []).map((item) => ({
      label: item.label,
      kind: normaliseInvestigationKind(item.kind),
      direction: guardedInvestigationDirection(item.direction, item.label, item.sources, byKey, catalog),
      trend: item.trend,
      interpretation: item.interpretation,
      sourceKeys: (item.sources ?? []).map(registerKey),
    }))

    // Patient medication education renders after investigations and before
    // problems, so register its medication records in that same order.
    const medicationEducation = (ai.medicationEducation ?? []).flatMap((item) => {
      const rawSources = item.sources ?? []
      // A patient-facing medicine explanation without a real medication record
      // is too risky to render. Unlike ordinary narrative citations, require at
      // least one verified Medication* source before the item enters the card.
      const hasVerifiedMedication = rawSources.some((rawKey) =>
        byKey.get(rawKey.trim())?.resourceType.startsWith('Medication'),
      )
      if (!hasVerifiedMedication) return []
      return [{
        name: item.name,
        benefit: item.benefit,
        attention: item.attention,
        sourceKeys: rawSources.map(registerKey),
      }]
    })

    const hasVerifiedMedicationSource = (rawSources: string[]) =>
      rawSources.some((rawKey) => byKey.get(rawKey.trim())?.resourceType.startsWith('Medication'))

    // The clinician medication card follows the same evidence rule as patient
    // education: an item without a real Medication* record is omitted. Dates
    // and organizations remain app-resolved through sourceIndex.
    const rawMedicationReview = ai.medicationReview ?? {
      regimen: [],
      changes: [],
      reconciliation: [],
    }
    const medicationReview = {
      regimen: rawMedicationReview.regimen.flatMap((item) => {
        const rawSources = item.sources ?? []
        if (!hasVerifiedMedicationSource(rawSources)) return []
        return [{
          group: item.group,
          name: item.name,
          sig: item.sig?.trim() || undefined,
          sourceKeys: rawSources.map(registerKey),
        }]
      }),
      changes: rawMedicationReview.changes.flatMap((item) => {
        const rawSources = item.sources ?? []
        if (!hasVerifiedMedicationSource(rawSources)) return []
        return [{
          type: normaliseMedicationChangeType(item.type),
          medication: item.medication,
          summary: item.summary,
          sourceKeys: rawSources.map(registerKey),
        }]
      }),
      reconciliation: rawMedicationReview.reconciliation.flatMap((item) => {
        const rawSources = item.sources ?? []
        if (!hasVerifiedMedicationSource(rawSources)) return []
        return [{
          reason: normaliseMedicationReconciliationReason(item.reason),
          text: item.text,
          sourceKeys: rawSources.map(registerKey),
        }]
      }),
    }

    // Problems register BEFORE decisions: registerKey numbers sources by first
    // appearance, and the page renders investigations → problems → decisions, so
    // this keeps superscript numbers increasing top-to-bottom.
    const problems = (ai.problems ?? []).map((p) => ({
      label: p.label,
      basis: p.basis?.trim() || undefined,
      kind: normaliseProblemKind(p.kind),
      sourceKeys: (p.sources ?? []).map(registerKey),
    }))

    const decisions = ai.decisions.map((d) => ({
      text: d.text,
      urgency: d.urgency,
      rationale: d.rationale,
      sourceKeys: (d.sources ?? []).map(registerKey),
    }))

    let droppedTimelineCount = 0
    const timeline = ai.timeline
      .flatMap((pick) => {
        const entry = byKey.get(pick.ref.trim())
        if (!entry || !entry.date) {
          droppedTimelineCount += 1
          return []
        }
        return [
          {
            key: entry.key,
            date: entry.date,
            label: pick.label,
            category: normaliseTimelineCategory(pick.category),
            organization: entry.organization,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            // 住院/急診/門診 from the bundle's Encounter.class — the AI's
            // category can only say "encounter", which used to render 門診
            // even for admissions.
            encounterClass: entry.encounterClass,
          },
        ]
      })
      // Newest first — the most recent events carry the clinical weight and
      // sit at the top; scroll down for history.
      .sort((a, b) => b.date.localeCompare(a.date))

    return {
      headline: ai.headline,
      summary,
      investigations,
      medicationEducation,
      medicationReview,
      problems,
      decisions,
      timeline,
      sourceIndex,
      droppedTimelineCount,
    }
  }
}

export const generateMedicalSummaryUseCase = new GenerateMedicalSummaryUseCase()
