import { useMemo } from "react"
import { getReferenceId, getCodeText, getMedicationName, getMedicationNameLocalized, formatDateTime, valueWithUnit, refRangeText, getInterpTag } from "../utils/formatters"
import { checkReferenceRangeAbnormal } from "@/features/clinical-summary/reports/utils/interpretation-helpers"
import { isChronicPrescription } from "@/features/clinical-summary/medications/utils/fhir-helpers"
import { getAnalyteDisplayForObs, getAnalyteLabel, getAnalyteCanonicalKey, type DisplayLang } from "@/src/shared/utils/lab-normalize"
import {
  LAB_CATEGORIES,
  CANONICAL_TO_CATEGORY,
  categorizeObservation,
  compareTestsByPreferred,
} from "@/src/shared/utils/lab-categories"
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

export type EncounterDiagnosis = {
  id: string
  title: string
  code?: string
  clinicalStatus?: string
  verificationStatus?: string
  recordedDate?: string
}

export type EncounterTestGroup = {
  /** Lab-category id (cbc / chem / urine / …) or null for uncategorized tests.
   *  Resolve the display label via t.reports.cumulativeCategories[categoryId]. */
  categoryId: string | null
  tests: EncounterObservation[]
}

export type EncounterDetails = {
  diagnoses: EncounterDiagnosis[]
  medications: EncounterMedication[]
  tests: EncounterObservation[]
  /** tests grouped by lab category in clinical reading order; flat `tests`
   *  is kept for stats/search. */
  testGroups: EncounterTestGroup[]
  procedures: EncounterProcedure[]
  clinicalNotes: ClinicalNote[]
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
function buildTestGroups(tests: EncounterObservation[]): EncounterTestGroup[] {
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
    else groups.push({ categoryId: id, tests: [test] })
  }
  return groups
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
        map.set(encounterId, { diagnoses: [], medications: [], tests: [], testGroups: [], procedures: [], clinicalNotes: [] })
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
          detail: med?.dosageInstruction?.[0]?.text,
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

    // Cluster each encounter's interleaved tests into clinically ordered
    // category groups for rendering. Flat `tests` stays as-is for stats/search.
    map.forEach((entry) => {
      entry.testGroups = buildTestGroups(entry.tests)
    })

    return map
  }, [medications, diagnosticReports, observations, procedures, clinicalNotes, conditions, locale, audience])
}
