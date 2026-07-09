import { useMemo } from "react"
import { getReferenceId, getCodeText, getMedicationNameLocalized, formatDateTime, valueWithUnit, refRangeText, getInterpTag } from "../utils/formatters"
import { checkReferenceRangeAbnormal, isAbnormalInterpretationLabel, isReferenceRangeAssessmentUnavailable } from "@/features/clinical-summary/reports/utils/interpretation-helpers"
import { getCodeableConceptText, getConceptText } from "@/features/clinical-summary/reports/utils/fhir-helpers"
import { inferGroupFromCategory } from "@/features/clinical-summary/reports/utils/grouping-helpers"
import { isChronicPrescription } from "@/features/clinical-summary/medications/utils/fhir-helpers"
import { getAnalyteDisplayForObs, getAnalyteLabel, getAnalyteCanonicalKey, type DisplayLang } from "@/src/shared/utils/lab-normalize"
import {
  LAB_CATEGORIES,
  CANONICAL_TO_CATEGORY,
  categorizeObservation,
  compareTestsByPreferred,
} from "@/src/shared/utils/lab-categories"
import { decodeBase64Utf8 } from "@/src/shared/utils/base64.utils"
import type { Observation, ReportImage, Row } from "@/features/clinical-summary/reports/types"
import type { EncounterObservation } from "../components/EncounterObservationCard"
import type { EncounterMedication, EncounterProcedure } from "../components/EncounterCards"
import type { ClinicalNote } from "./useClinicalNotes"

// Clinical reading order across categories (blood count → coag → biochem → …
// → urine). Lab tests within a single visit arrive interleaved from multiple
// DiagnosticReports / standalone Observations; grouping by category and
// ordering by this rank stops 血液/生化 etc. from mixing together.
const CATEGORY_RANK: Map<string, number> = new Map(
  LAB_CATEGORIES.map((c, i) => [c.id, i]),
)
const CATEGORY_BY_ID: Map<string, (typeof LAB_CATEGORIES)[number]> = new Map(
  LAB_CATEGORIES.map((c) => [c.id, c]),
)

// Inpatient claims expose 給藥總量 (total quantity) but no per-drug 給藥日數, so
// the bridge ships those meds with a structured dispenseRequest.quantity but NO
// pre-formatted dosageInstruction.text — and the row then showed no dose at all.
// When the text is missing, fall back to the quantity NHI did report (健保存摺
// shows it). Kept in 給藥總量 wording to match the bridge's zh-only dosage
// strings on sibling rows. 給藥日數 is only appended when the bridge actually
// provided a supply duration — never fabricated.
function medicationQuantityDetail(med: any): string | undefined {
  const qty = med?.dispenseRequest?.quantity?.value
  if (qty == null) return undefined
  const days = med?.dispenseRequest?.expectedSupplyDuration?.value
  return days != null ? `給藥總量 ${qty}，給藥日數 ${days} 天` : `給藥總量 ${qty}`
}

export type EncounterDiagnosis = {
  id: string
  title: string
  code?: string
  clinicalStatus?: string
  verificationStatus?: string
  recordedDate?: string
}

/** A narrative diagnostic report linked to a visit — EKG, imaging (CXR/CT/
 *  ultrasound), endoscopy, pathology. Its finding lives in `conclusion`, with
 *  no member Observations, so without surfacing it here it stays invisible
 *  under the visit even though the FHIR `encounter` link is present. */
export type EncounterReport = {
  id: string
  title: string
  conclusion: string
  effectiveDateTime?: string
  status?: string
  row: Row
}

export type EncounterTestGroup = {
  /** Lab-category id (cbc / chem / urine / …) or null for uncategorized tests.
   *  Resolve the display label via t.reports.cumulativeCategories[categoryId]. */
  categoryId: string | null
  tests: EncounterObservation[]
  /** When the visit is multi-day, tests within each category are also
   *  re-grouped by analyte so callers can show "WBC ▼ 4 筆" trend rows
   *  instead of 4 identical-looking standalone rows. Empty when not multi-day
   *  or when no analyte has 2+ values in this category. */
  testSeries: EncounterTestSeries[]
}

/**
 * Multiple values of the same analyte across days within one encounter —
 * the core view-model behind the multi-day discharge / inpatient list.
 * The renderer collapses these into a single trend row; the consumer
 * expands to see the per-day values.
 */
export type EncounterTestSeries = {
  /** Stable id (canonical key when present, else display title). */
  id: string
  /** Audience-aware display title for the analyte (e.g. WBC / 白血球). */
  title: string
  /** Within-category sort key (canonical short code or fallback title). */
  sortKey: string
  /** Each measurement, sorted oldest-first by effectiveDateTime. */
  values: EncounterObservation[]
  /** Count of abnormal values (refRangeAbnormal or interpretation H/L/…). */
  abnormalCount: number
}

/** Same idea for medications: when an inpatient stay carries several days of
 *  one drug (typical for daily prophylaxis / chronic meds), the consumer can
 *  collapse them into a single drug row with the date range, leaving the
 *  per-refill detail behind a click. */
export type EncounterMedSeries = {
  id: string
  name: string
  isChronic: boolean
  /** First → last refill date for the date-range header. */
  firstDate?: string
  lastDate?: string
  /** Each refill, sorted oldest-first by authoredOn. */
  refills: EncounterMedication[]
}

export type EncounterDetails = {
  diagnoses: EncounterDiagnosis[]
  medications: EncounterMedication[]
  /** Per-drug grouping for multi-day visits. Empty when not multi-day or
   *  when every drug has only one refill. */
  medSeries: EncounterMedSeries[]
  tests: EncounterObservation[]
  /** tests grouped by lab category in clinical reading order; flat `tests`
   *  is kept for stats/search. Each group additionally carries `testSeries`
   *  for the multi-day collapsed view. */
  testGroups: EncounterTestGroup[]
  /** Narrative reports (EKG / imaging / endoscopy / pathology) linked to this
   *  visit — finding text only, no numeric member observations. */
  reports: EncounterReport[]
  procedures: EncounterProcedure[]
  clinicalNotes: ClinicalNote[]
  /** True when this encounter's tests / meds span 2+ distinct calendar days
   *  (typical inpatient stays / emergency observation). Drives the per-row
   *  date column and the analyte-series collapse in VisitItem. */
  isMultiDay: boolean
}

const toEncounterObservation = (
  observation: any,
  source: "diagnosticReport" | "observation",
  audience: 'medical' | 'patient',
  displayLang: DisplayLang,
): EncounterObservation => {
  // Audience-aware analyte label: medical → canonical short code (WBC / Na),
  // patient → long-form translation in the active UI language. Non-canonical
  // rows (cultures, panels, free-text) keep their bridge-sent label.
  const title = getCodeText(observation?.code)
    ? getAnalyteDisplayForObs(observation, audience, displayLang)
    : "Observation"
  // Canonical analyte key (audience-independent) drives both the category
  // lookup and the within-category sort. categorizeObservation handles
  // LOINC/short-code obs; CANONICAL_TO_CATEGORY catches Chinese-text bridge
  // data (no LOINC) the same way useReportsData does for its panel sort.
  // Use getAnalyteCanonicalKey (the raw UPPERCASE key) for the exact-match
  // category lookup — getAnalyteLabel returns the mixed-case DISPLAY form
  // ('HbA1c'), which would only match after a defensive .toUpperCase(). For
  // non-canonical rows the key is null, so fall back to the medical label as
  // the sort key (compareTestsByPreferred normalises both sides anyway).
  const canonicalKey = getAnalyteCanonicalKey(observation)
  const sortKey = canonicalKey ?? getAnalyteLabel(observation)
  const category =
    categorizeObservation(observation) ||
    (canonicalKey ? CANONICAL_TO_CATEGORY.get(canonicalKey) : null) ||
    null
  const interpretation = getInterpTag(observation?.interpretation)
  const referenceText = refRangeText(observation?.referenceRange)
  const components = Array.isArray(observation?.component)
    ? observation.component.map((component: any, index: number) => {
        const componentInterpretation = getInterpTag(component?.interpretation)
        return {
          id: component?.id || `${observation?.id || "component"}-${index}`,
          title: getCodeText(component?.code)
            ? getAnalyteDisplayForObs(component, audience, displayLang)
            : "Component",
          value: component?.valueQuantity
            ? valueWithUnit(component.valueQuantity)
            : component?.valueString || "—",
          interpretationLabel: componentInterpretation?.label,
          interpretationStyle: componentInterpretation?.style,
          referenceText: refRangeText(component?.referenceRange),
          refRangeAbnormal: checkReferenceRangeAbnormal(component),
          refRangeUnassessed: isReferenceRangeAssessmentUnavailable(component),
        }
      })
    : []

  return {
    id: observation?.id || `${source}-${Math.random().toString(36).slice(2, 10)}`,
    title,
    value: observation?.valueQuantity
      ? valueWithUnit(observation.valueQuantity)
      : observation?.valueString || "—",
    interpretationLabel: interpretation?.label,
    interpretationStyle: interpretation?.style,
    referenceText,
    refRangeAbnormal: checkReferenceRangeAbnormal(observation),
    refRangeUnassessed: isReferenceRangeAssessmentUnavailable(observation),
    effectiveDateTime: observation?.effectiveDateTime,
    status: observation?.status,
    source,
    components,
    categoryId: category?.id,
    sortKey,
  }
}

// Cluster a visit's flat test list into category groups in clinical reading
// order, sorting within each group by the category's preferredOrder.
// When `multiDay` is true, the function additionally rolls up same-analyte
// observations within each category into a series, so the renderer can
// collapse "HB ×4" into a single trend row.
function buildTestGroups(
  tests: EncounterObservation[],
  multiDay: boolean,
): EncounterTestGroup[] {
  if (tests.length === 0) return []
  const sorted = [...tests].sort((a, b) => {
    const ra = a.categoryId ? CATEGORY_RANK.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
    const rb = b.categoryId ? CATEGORY_RANK.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    const cat = a.categoryId ? CATEGORY_BY_ID.get(a.categoryId) : undefined
    if (cat) {
      const cmp = compareTestsByPreferred(cat)(a.sortKey || a.title, b.sortKey || b.title)
      if (cmp !== 0) return cmp
    }
    return (a.sortKey || a.title).localeCompare(b.sortKey || b.title)
  })

  const groups: EncounterTestGroup[] = []
  for (const test of sorted) {
    const id = test.categoryId ?? null
    const last = groups[groups.length - 1]
    if (last && last.categoryId === id) last.tests.push(test)
    else groups.push({ categoryId: id, tests: [test], testSeries: [] })
  }
  if (multiDay) {
    for (const group of groups) {
      group.testSeries = buildTestSeries(group.tests)
    }
  }
  return groups
}

/** Roll up a single category's tests into per-analyte series sorted oldest-
 *  first by effectiveDateTime. Preserves the input order between analytes —
 *  the caller already sorted by category preferredOrder. */
function buildTestSeries(tests: EncounterObservation[]): EncounterTestSeries[] {
  const seriesByKey = new Map<string, EncounterTestSeries>()
  const keyOrder: string[] = []
  for (const t of tests) {
    // Group key: prefer canonical sortKey (WBC/NA), fall back to display title.
    // Bridge sometimes ships the same analyte with slightly different display
    // strings; the canonical key absorbs that.
    const key = t.sortKey || t.title
    let s = seriesByKey.get(key)
    if (!s) {
      s = { id: key, title: t.title, sortKey: t.sortKey || t.title, values: [], abnormalCount: 0 }
      seriesByKey.set(key, s)
      keyOrder.push(key)
    }
    s.values.push(t)
    // Interpretation wins when present; range flag is only a no-interpretation
    // fallback (2026-07-08 policy).
    const abnormal = t.interpretationLabel
      ? isAbnormalInterpretationLabel(t.interpretationLabel)
      : !!t.refRangeAbnormal
    if (abnormal) {
      s.abnormalCount++
    }
  }
  // Sort each series' values by effectiveDateTime ascending; undated rows
  // sink to the bottom so the timeline still reads left-to-right.
  for (const s of seriesByKey.values()) {
    s.values.sort((a, b) => {
      const ad = a.effectiveDateTime ?? ''
      const bd = b.effectiveDateTime ?? ''
      if (ad && !bd) return -1
      if (!ad && bd) return 1
      return ad.localeCompare(bd)
    })
  }
  return keyOrder.map((k) => seriesByKey.get(k)!)
}

/** Returns true when `tests` carries 2+ distinct calendar dates (YYYY-MM-DD).
 *  Hour/minute differences within the same day do NOT count — a 08:00 and
 *  14:00 draw on 2025-05-18 is one day. Tests with no effectiveDateTime are
 *  ignored for this signal. */
function detectMultiDay(tests: EncounterObservation[]): boolean {
  const days = new Set<string>()
  for (const t of tests) {
    const d = t.effectiveDateTime?.slice(0, 10)
    if (d) days.add(d)
    if (days.size >= 2) return true
  }
  return false
}

function getDiagnosticReportInstitution(report: any): string | undefined {
  return report?._observations?.[0]?.performer?.[0]?.display
    || report?.performer?.[0]?.display
    || undefined
}

function getDiagnosticReportDate(report: any): string | undefined {
  return report?.effectiveDateTime || report?.issued
}

function getDiagnosticReportCategoryText(report: any): string {
  const category = report?.category
  const text = Array.isArray(category)
    ? category.map((c: any) => getCodeableConceptText(c)).filter((s: string) => s && s !== '—').join(', ')
    : getCodeableConceptText(category)
  return text && text !== '—' ? text : 'Report'
}

function collectReportPayload(report: any): { text: string; images: ReportImage[] } {
  const parts: string[] = []
  const images: ReportImage[] = []

  if (typeof report?.conclusion === 'string' && report.conclusion.trim()) {
    parts.push(report.conclusion.trim())
  }

  const conclusionCodes = getConceptText(report?.conclusionCode)
  if (conclusionCodes && conclusionCodes !== '—') {
    parts.push(`Conclusion Codes: ${conclusionCodes}`)
  }

  if (Array.isArray(report?.note)) {
    for (const note of report.note) {
      if (typeof note?.text === 'string' && note.text.trim()) {
        parts.push(note.text.trim())
      }
    }
  }

  if (Array.isArray(report?.presentedForm)) {
    for (const form of report.presentedForm) {
      const contentType = (form?.contentType || '').toLowerCase()
      if (form?._imageRef) {
        images.push({
          ref: form._imageRef,
          contentType: form.contentType || 'image/jpeg',
          title: form.title,
          size: form.size,
        })
        continue
      }
      if (form?.data && contentType.startsWith('image/')) {
        images.push({
          data: form.data,
          contentType: form.contentType || 'image/jpeg',
          title: form.title,
          size: form.size,
        })
        continue
      }
      if (form?.data && contentType.startsWith('text/') && !contentType.includes('html')) {
        try {
          const decoded = decodeBase64Utf8(form.data).trim()
          if (decoded) parts.push(decoded)
        } catch {
          // Ignore malformed attachment text; the report row still shows any
          // conclusion/note/images that were valid.
        }
      }
    }
  }

  return { text: parts.join('\n\n'), images }
}

function toEncounterReportRow(report: any, title: string, text: string, images: ReportImage[]): Row {
  const rawDate = getDiagnosticReportDate(report)
  const status = report?.status
  const reportId = report?.id || `encounter-report-${Math.random().toString(36).slice(2, 10)}`
  const summaryObservation: Observation = {
    resourceType: 'Observation',
    id: `dr-summary-${reportId}`,
    code: { text: 'Report Summary' },
    valueString: text,
    effectiveDateTime: rawDate,
    status,
  } as Observation

  return {
    id: reportId,
    title,
    rawTitle: title,
    meta: `${getDiagnosticReportCategoryText(report)} • ${status || '—'}`,
    obs: [summaryObservation],
    group: inferGroupFromCategory(report?.category),
    institution: getDiagnosticReportInstitution(report),
    effectiveDate: rawDate,
    images: images.length > 0 ? images : undefined,
  }
}

/** Group medications by drug name. Only invoked when the visit is multi-day
 *  AND the drug appears multiple times — single-refill drugs stay in the flat
 *  `medications` list (the renderer falls back to those for the non-grouped
 *  display path). */
function buildMedSeries(medications: EncounterMedication[]): EncounterMedSeries[] {
  const byName = new Map<string, EncounterMedication[]>()
  const nameOrder: string[] = []
  for (const m of medications) {
    const key = m.name
    if (!byName.has(key)) {
      byName.set(key, [])
      nameOrder.push(key)
    }
    byName.get(key)!.push(m)
  }
  // Helper: pull a sortable ISO-ish prefix out of "when" (which is a
  // locale-formatted string like "2025/05/18 08:00"). Falls back to '' so
  // undated refills sink to the end.
  const sortKey = (m: EncounterMedication): string => {
    if (!m.when) return ''
    // Replace separators so a lexicographic compare works on YYYY?MM?DD prefix.
    return m.when.replace(/[/.]/g, '-')
  }
  return nameOrder.map((name) => {
    const refills = byName.get(name)!
    refills.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    const dated = refills.map(sortKey).filter(Boolean)
    return {
      id: name,
      name,
      isChronic: refills.some((r) => r.isChronic),
      firstDate: dated[0]?.slice(0, 10),
      lastDate: dated[dated.length - 1]?.slice(0, 10),
      refills,
    }
  })
}

export function useEncounterDetails(
  medications: any[],
  diagnosticReports: any[],
  observations: any[],
  procedures: any[],
  clinicalNotes: ClinicalNote[],
  conditions: any[],
  locale: string = "en-US",
  audience: 'medical' | 'patient' = 'medical',
) {
  return useMemo(() => {
    const map = new Map<string, EncounterDetails>()
    // getAnalyteDisplayForObs only branches on zh-TW vs en; collapse the
    // incoming locale string to the DisplayLang the helper expects.
    const displayLang: DisplayLang = locale === 'zh-TW' ? 'zh-TW' : 'en'

    const ensureEntry = (encounterId: string) => {
      if (!map.has(encounterId)) {
        map.set(encounterId, {
          diagnoses: [], medications: [], medSeries: [],
          tests: [], testGroups: [], reports: [],
          procedures: [], clinicalNotes: [],
          isMultiDay: false,
        })
      }
      return map.get(encounterId)!
    }

    if (Array.isArray(medications)) {
      // Drug-level chronic aggregation: the bridge tags each refill individually,
      // and a chronic drug may have occasional acute refills. Treat a drug as
      // chronic for this patient if ANY refill in the whole dataset was tagged.
      // Mirrors the same aggregation used in features/clinical-summary/medications/
      // hooks/useMedicationRows.ts so the badge appears consistently across views.
      const chronicDrugKeys = new Set<string>()
      for (const m of medications) {
        if (!m) continue
        if (!isChronicPrescription(m)) continue
        const key =
          m.medicationCodeableConcept?.coding?.[0]?.code ||
          m.medicationCodeableConcept?.text ||
          m.medicationReference?.display ||
          m.code?.text ||
          ''
        if (key) chronicDrugKeys.add(key)
      }

      medications.forEach((med: any) => {
        const encounterId = getReferenceId(med?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const medId = med?.id || `${encounterId}-med-${entry.medications.length}`
        if (entry.medications.some((item) => item.id === medId)) return

        const drugKey =
          med?.medicationCodeableConcept?.coding?.[0]?.code ||
          med?.medicationCodeableConcept?.text ||
          med?.medicationReference?.display ||
          med?.code?.text ||
          ''
        const isChronic = !!drugKey && chronicDrugKeys.has(drugKey)

        entry.medications.push({
          id: medId,
          name: getMedicationNameLocalized(med, audience, locale),
          status: med?.status,
          detail: med?.dosageInstruction?.[0]?.text || medicationQuantityDetail(med),
          when: formatDateTime(med?.authoredOn, locale),
          isChronic,
        })
      })
    }

    if (Array.isArray(diagnosticReports)) {
      diagnosticReports.forEach((report: any) => {
        const encounterId = getReferenceId(report?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const observations = Array.isArray(report?._observations)
          ? report._observations
          : []

        observations.forEach((obs: any) => {
          const normalized = toEncounterObservation(obs, "diagnosticReport", audience, displayLang)
          if (entry.tests.some((item) => item.id === normalized.id)) return
          entry.tests.push(normalized)
        })

        // Narrative report (EKG / imaging / endoscopy / pathology): the finding
        // lives in `conclusion` with no member Observations, so it produced no
        // test rows above. Surface it as its own row — otherwise a linked EKG
        // etc. is invisible under the visit despite the encounter link.
        const payload = collectReportPayload(report)
        if (payload.text || payload.images.length > 0) {
          const reportId = report?.id || `${encounterId}-report-${entry.reports.length}`
          if (!entry.reports.some((r) => r.id === reportId)) {
            const title = getCodeText(report?.code) || "Report"
            entry.reports.push({
              id: reportId,
              title,
              conclusion: payload.text,
              effectiveDateTime: getDiagnosticReportDate(report),
              status: report?.status,
              row: toEncounterReportRow(report, title, payload.text, payload.images),
            })
          }
        }
      })
    }

    if (Array.isArray(observations)) {
      observations.forEach((obs: any) => {
        const encounterId = getReferenceId(obs?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const normalized = toEncounterObservation(obs, "observation", audience, displayLang)
        if (entry.tests.some((item) => item.id === normalized.id)) return
        entry.tests.push(normalized)
      })
    }

    if (Array.isArray(procedures)) {
      procedures.forEach((procedure: any) => {
        const encounterId = getReferenceId(procedure?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const id = procedure?.id || `${encounterId}-procedure-${entry.procedures.length}`
        if (entry.procedures.some((existing) => existing.id === id)) return

        entry.procedures.push({
          id,
          title: getCodeText(procedure?.code) || "Procedure",
          status: procedure?.status,
          performer: procedure?.performer?.[0]?.actor?.display,
          performed: procedure?.performedDateTime || procedure?.performedPeriod?.start,
          category: getCodeText(procedure?.category),
          outcome: getCodeText(procedure?.outcome),
          report: Array.isArray(procedure?.report)
            ? procedure.report.map((ref: any) => ref?.display || ref?.reference).filter(Boolean)
            : [],
        })
      })
    }

    // Associate clinical notes with encounters
    if (Array.isArray(clinicalNotes)) {
      clinicalNotes.forEach((note: ClinicalNote) => {
        const encounterId = getReferenceId({ reference: note.encounterRef })
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        if (entry.clinicalNotes.some((existing) => existing.id === note.id)) return
        entry.clinicalNotes.push(note)
      })
    }

    // Group conditions by encounter reference
    if (Array.isArray(conditions)) {
      conditions.forEach((condition: any) => {
        const encounterId = getReferenceId(condition?.encounter)
        if (!encounterId) return
        const entry = ensureEntry(encounterId)
        const id = condition?.id || `${encounterId}-dx-${entry.diagnoses.length}`
        if (entry.diagnoses.some((d) => d.id === id)) return

        const coding = condition?.code?.coding
        const icdCode = coding?.find((c: any) =>
          c.system?.toLowerCase().includes('icd')
        )?.code || coding?.[0]?.code

        entry.diagnoses.push({
          id,
          title: condition?.code?.text
            || coding?.[0]?.display
            || coding?.[0]?.code
            || 'Unknown diagnosis',
          code: icdCode,
          clinicalStatus: condition?.clinicalStatus?.coding?.[0]?.code
            || (typeof condition?.clinicalStatus === 'string' ? condition.clinicalStatus : undefined),
          verificationStatus: condition?.verificationStatus?.coding?.[0]?.code
            || (typeof condition?.verificationStatus === 'string' ? condition.verificationStatus : undefined),
          recordedDate: condition?.recordedDate || condition?.dateRecorded,
        })
      })
    }

    // Detect multi-day stays (≥2 distinct test dates), then build the
    // collapsed-by-analyte test groups and the per-drug medication series.
    // Single-day visits skip both rollups; the renderer just iterates the
    // flat lists in that case (preserves existing outpatient UX).
    map.forEach((entry) => {
      entry.isMultiDay = detectMultiDay(entry.tests)
      entry.testGroups = buildTestGroups(entry.tests, entry.isMultiDay)
      entry.medSeries = entry.isMultiDay ? buildMedSeries(entry.medications) : []
    })

    return map
  }, [medications, diagnosticReports, observations, procedures, clinicalNotes, conditions, locale, audience])
}
