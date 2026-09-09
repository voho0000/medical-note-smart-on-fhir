"use client"

// Single source of truth for everything the 總覽 tab renders.
//
// This hook owns NO fetching and NO clinical judgement of its own: it reuses
// the very hooks the 報告 / 用藥 / 就診 tabs use, applies the overview time
// window, and hands back per-section rows plus the counts the header tiles
// show. Tiles and card headers therefore can never disagree — they read the
// same object.
import { useMemo } from 'react'
import { useAudience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { buildIcdDictionary } from '@/src/shared/utils/icd-lookup'
import { formatOrganizationDisplay } from '@/src/shared/utils/organization-display'
import { buildLabPivots, type LabCell } from '@/src/shared/utils/lab-pivot.utils'
import { categorizeObservation, LAB_CATEGORIES } from '@/src/shared/utils/lab-categories'
import { getLabRowDisplayParts } from '@/src/shared/utils/lab-analyte-display.utils'
import type { DisplayLang } from '@voho0000/clinical-lab-normalization/display'
import { medicationClinicalIdentityKey } from '@/src/shared/utils/fhir-display-helpers'
import { humanDoseAmount, displayDosageInstruction } from '@/features/clinical-summary/medications/utils/dose-helpers'
import { useMedicationRows } from '@/features/clinical-summary/medications/hooks/useMedicationRows'
import { useGroupedMedications } from '@/features/clinical-summary/medications/hooks/useGroupedMedications'
import type { MedicationRow } from '@/features/clinical-summary/medications/types'
import { useReportsData } from '@/features/clinical-summary/reports/hooks/useReportsData'
import { useProcedureRows } from '@/features/clinical-summary/reports/hooks/useProcedureRows'
import type { ReportGroup, Row } from '@/features/clinical-summary/reports/types'
import { useVisitHistory, type VisitRecord } from '@/features/clinical-summary/visit-history/hooks/useVisitHistory'
import { useEncounterDetails, type EncounterDetails } from '@/features/clinical-summary/visit-history/hooks/useEncounterDetails'
import { useClinicalNotes } from '@/features/clinical-summary/visit-history/hooks/useClinicalNotes'
import { useVisitStats } from '@/features/clinical-summary/visit-history/hooks/useVisitStats'
import { useDocumentSummaries } from '@/features/clinical-summary/document-summary/hooks/useDocumentSummaries'
import { useDocumentSummaryStrings } from '@/features/clinical-summary/document-summary/utils/strings'
import type { DocumentEntry } from '@/features/clinical-summary/document-summary/types'
import {
  classifyMedicationChanges,
  isOverviewPinnedAnalyte,
  isWithinOverviewWindow,
  overlapsOverviewWindow,
  toDayKey,
  type OverviewMedChange,
  type OverviewMedFact,
  type OverviewWindow,
} from '../utils/overview-selectors'

/** Collection days shown as pivot columns. Older days stay in the 報告 tab. */
export const OVERVIEW_LAB_COLUMN_LIMIT = 5

export interface OverviewLabColumn {
  day: string
  /** Short institution label under the date, when the source named one. */
  institution?: string
}

export interface OverviewLabRow {
  mapKey: string
  categoryId: string
  categoryLabel: string
  testKey: string
  name: string
  unit?: string
  isPinned: boolean
  hasAbnormal: boolean
  cells: (LabCell | undefined)[]
}

export interface OverviewLabsData {
  columns: OverviewLabColumn[]
  rows: OverviewLabRow[]
  pinnedRowCount: number
  /** Collection days inside the window that did not fit the column budget. */
  hiddenDayCount: number
  /** Distinct analyte × day results represented by the pivot. */
  resultCount: number
  abnormalCount: number
  /** In-window results the lab taxonomy could not place in any pivot. */
  unpivotedCount: number
  /** An Observation id used to jump into the 報告 tab. */
  navResourceId?: string
}

export interface OverviewReportItem {
  id: string
  title: string
  group: ReportGroup
  institution?: string
  day?: string
  summary: string
  fullText: string
  /** Resource the 報告 tab should scroll-flash. */
  navResourceType: 'DiagnosticReport' | 'Procedure' | 'Observation'
  navResourceId: string
}

export interface OverviewReportsData {
  items: OverviewReportItem[]
  /** Report groups actually present in the window, in taxonomy order. */
  groups: ReportGroup[]
  count: number
}

export interface OverviewMedItem {
  id: string
  key: string
  title: string
  doseText: string
  category?: string
  institution?: string
  day?: string
  isChronic: boolean
  isInactive: boolean
  daysRemaining?: number
  change?: OverviewMedChange
  row: MedicationRow
}

export interface OverviewMedsData {
  items: OverviewMedItem[]
  count: number
  changeCount: number
  chronicCount: number
}

export interface OverviewVisitItem {
  visit: VisitRecord
  details?: EncounterDetails
  documents?: DocumentEntry[]
  abnormalCount: number
  testCount: number
  reportCount: number
  diagnosisCount: number
  medicationCount: number
}

export interface OverviewVisitsData {
  items: OverviewVisitItem[]
  count: number
  emergencyCount: number
  inpatientCount: number
  outpatientCount: number
}

export interface OverviewData {
  isLoading: boolean
  error: Error | null
  labs: OverviewLabsData
  reports: OverviewReportsData
  meds: OverviewMedsData
  visits: OverviewVisitsData
  /** Newest day carrying data of ANY of the four kinds, ignoring the window. */
  latestDataDay?: string
  isEmpty: boolean
}

const REPORT_GROUP_ORDER: ReportGroup[] = [
  'imaging',
  'pathology',
  'procedures',
  'cancer-screening',
  'vitals',
  'other',
]

/** DiagnosticReport / ImagingStudy date, matching the 報告 tab's preference. */
function reportRowDay(row: Row): string | undefined {
  return toDayKey(row.effectiveDate)
}

/** First non-empty line of the report narrative, used as the collapsed summary. */
function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return ''
}

function reportNarrative(row: Row): string {
  const summary = row.obs?.find(
    (observation) => observation?.code?.text === 'Report Summary',
  )
  const value = typeof summary?.valueString === 'string' ? summary.valueString.trim() : ''
  return value
}

export function useOverviewData(window: OverviewWindow): OverviewData {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const {
    encounters = [],
    medications = [],
    diagnosticReports = [],
    imagingStudies = [],
    observations = [],
    procedures = [],
    conditions = [],
    documentReferences = [],
    compositions = [],
    resourceReady,
    error,
  } = useClinicalData()

  // The overview renders all four kinds side by side, so it waits for the
  // union of what each section needs. Types it never draws (allergies,
  // devices, care plans) do not hold it back.
  const isLoading = !resourceReady.encounters
    || !resourceReady.medications
    || !resourceReady.diagnosticReports
    || !resourceReady.observations
    || !resourceReady.procedures
    || !resourceReady.conditions

  const displayLang: DisplayLang = locale === 'zh-TW' ? 'zh-TW' : 'en'

  // ── Window-scoped source slices ──────────────────────────────────────────
  // Filtering before the heavy builders keeps this tab from re-deriving the
  // patient's whole chart on every range change.
  const windowedObservations = useMemo(
    () => (Array.isArray(observations) ? observations : []).filter(
      (observation: any) => isWithinOverviewWindow(observation?.effectiveDateTime, window),
    ),
    [observations, window],
  )
  const windowedReports = useMemo(
    () => (Array.isArray(diagnosticReports) ? diagnosticReports : []).filter(
      (report: any) => isWithinOverviewWindow(report?.effectiveDateTime ?? report?.issued, window),
    ),
    [diagnosticReports, window],
  )
  const windowedStudies = useMemo(
    () => (Array.isArray(imagingStudies) ? imagingStudies : []).filter(
      (study: any) => isWithinOverviewWindow(study?.started, window),
    ),
    [imagingStudies, window],
  )
  const windowedProcedures = useMemo(
    () => (Array.isArray(procedures) ? procedures : []).filter((procedure: any) => (
      isWithinOverviewWindow(procedure?.performedDateTime, window)
      || overlapsOverviewWindow(
        procedure?.performedPeriod?.start,
        procedure?.performedPeriod?.end,
        window,
      )
    )),
    [procedures, window],
  )

  // ── 檢驗 ────────────────────────────────────────────────────────────────
  const pivots = useMemo(() => buildLabPivots(windowedObservations), [windowedObservations])
  const categoryLabels = (t.reports as any)?.cumulativeCategories as Record<string, string> | undefined

  const labs = useMemo<OverviewLabsData>(() => {
    // Institution per collection day: the label under the date header. Take the
    // most frequently reported performer so one stray record cannot rename the
    // column. Observation.performer is 0..*; only Reference.display is human
    // readable, so entries without one are skipped rather than guessed at.
    const dayInstitutionCounts = new Map<string, Map<string, number>>()
    let unpivotedCount = 0
    for (const observation of windowedObservations as any[]) {
      const day = toDayKey(observation?.effectiveDateTime)
      if (!day) continue
      if (!categorizeObservation(observation)) {
        unpivotedCount += 1
        continue
      }
      const performers = Array.isArray(observation?.performer) ? observation.performer : []
      for (const performer of performers) {
        const display = typeof performer?.display === 'string' ? performer.display.trim() : ''
        if (!display) continue
        const bucket = dayInstitutionCounts.get(day) ?? new Map<string, number>()
        bucket.set(display, (bucket.get(display) ?? 0) + 1)
        dayInstitutionCounts.set(day, bucket)
        break
      }
    }

    const allDays = new Set<string>()
    for (const category of LAB_CATEGORIES) {
      for (const day of pivots[category.id]?.dates ?? []) allDays.add(day)
    }
    // Newest-first decides WHICH days survive the column limit — a bounded
    // card must keep the most recent draws, never the oldest. The kept days
    // are then reversed for display so time runs left → right across the
    // pivot, the way a trend reads. (The 累積報告 itself is transposed —
    // dates are rows, newest at the top — so there is no left/right
    // convention there to match.)
    const sortedDays = [...allDays].sort((a, b) => b.localeCompare(a))
    const shownDays = sortedDays.slice(0, OVERVIEW_LAB_COLUMN_LIMIT).reverse()
    const columns: OverviewLabColumn[] = shownDays.map((day) => {
      const counts = dayInstitutionCounts.get(day)
      let best: string | undefined
      let bestCount = 0
      counts?.forEach((count, name) => {
        if (count > bestCount) {
          best = name
          bestCount = count
        }
      })
      return {
        day,
        institution: best ? formatOrganizationDisplay(best, locale) : undefined,
      }
    })

    const rows: OverviewLabRow[] = []
    let resultCount = 0
    let abnormalCount = 0
    let pinnedRowCount = 0
    let navResourceId: string | undefined

    for (const category of LAB_CATEGORIES) {
      const pivot = pivots[category.id]
      if (!pivot) continue
      for (const row of pivot.rows) {
        const cells = shownDays.map((day) => row.values.get(day))
        // Pinned stub rows (injected so a standard panel always shows its
        // columns) carry no values — the overview only lists analytes the
        // patient actually has inside the window.
        if (!cells.some(Boolean)) continue
        const hasAbnormal = cells.some((cell) => !!cell?.isAbnormal)
        for (const cell of cells) {
          if (!cell) continue
          resultCount += 1
          if (cell.isAbnormal) abnormalCount += 1
        }
        const isPinned = isOverviewPinnedAnalyte(category.id, row.testKey)
        if (isPinned) pinnedRowCount += 1
        const parts = getLabRowDisplayParts(row, audience, displayLang)
        rows.push({
          mapKey: `${category.id}:${row.mapKey}`,
          categoryId: category.id,
          categoryLabel: categoryLabels?.[category.id] ?? category.id,
          testKey: row.testKey,
          name: parts.abbr ? `${parts.name} (${parts.abbr})` : parts.name,
          unit: row.unit,
          isPinned,
          hasAbnormal,
          cells,
        })
      }
    }

    // Any in-window Observation that made it into a pivot is a valid landing
    // point for 「在報告分頁看全部」.
    for (const observation of windowedObservations as any[]) {
      if (typeof observation?.id === 'string' && categorizeObservation(observation)) {
        navResourceId = observation.id
        break
      }
    }

    return {
      columns,
      rows,
      pinnedRowCount,
      hiddenDayCount: Math.max(0, sortedDays.length - shownDays.length),
      resultCount,
      abnormalCount,
      unpivotedCount,
      navResourceId,
    }
  }, [audience, categoryLabels, displayLang, locale, pivots, windowedObservations])

  // ── 影像／檢查報告 ───────────────────────────────────────────────────────
  const { reportRows } = useReportsData(windowedReports, windowedStudies)
  const procedureRows = useProcedureRows(windowedProcedures)

  const reports = useMemo<OverviewReportsData>(() => {
    const items: OverviewReportItem[] = []
    const push = (row: Row, navResourceType: OverviewReportItem['navResourceType']) => {
      const narrative = reportNarrative(row)
      items.push({
        id: `${navResourceType}:${row.id}`,
        title: row.title,
        group: row.group,
        institution: row.institution,
        day: reportRowDay(row),
        summary: firstLine(narrative),
        fullText: narrative,
        navResourceType,
        navResourceId: row.diagnosticReportIds?.[0]
          ?? row.imagingStudyIds?.[0]
          ?? row.id,
      })
    }
    for (const row of reportRows) {
      // Lab results live in the pivot above; this card is the narrative half of
      // the 報告 tab.
      if (row.group === 'lab') continue
      push(row, row.diagnosticReportIds?.length ? 'DiagnosticReport' : 'Observation')
    }
    for (const row of procedureRows as Row[]) push(row, 'Procedure')

    items.sort((a, b) => (b.day ?? '').localeCompare(a.day ?? ''))
    const present = new Set(items.map((item) => item.group))
    return {
      items,
      groups: REPORT_GROUP_ORDER.filter((group) => present.has(group)),
      count: items.length,
    }
  }, [procedureRows, reportRows])

  // ── 用藥 ────────────────────────────────────────────────────────────────
  const medicationRows = useMedicationRows(medications, audience, locale)
  const { activeMedications, inactiveMedicationGroups } = useGroupedMedications(medicationRows)

  // Change detection reads the RAW prescriptions (every refill, including those
  // before the window) so "first ever record" and "dose before the window" are
  // real answers rather than window artefacts.
  const { medicationFacts, medicationDaysByRowId } = useMemo(() => {
    const inactiveStatuses = new Set(['stopped', 'completed'])
    const activeById = new Map<string, MedicationRow>()
    for (const row of medicationRows) activeById.set(row.id, row)
    const days = new Map<string, { startDay?: string; endDay?: string }>()
    const facts = (Array.isArray(medications) ? medications : []).map((medication: any, index: number) => {
      // `useMedicationRows` derives its row id from the same array position, so
      // this id round-trips exactly and keeps raw ISO dates (never the
      // locale-formatted display strings) as the basis for every comparison.
      const rowId = medication?.id || `med-${index}`
      const row = activeById.get(rowId)
      const dosage = medication?.dosageInstruction?.[0] || medication?.dosage?.[0]
      const dose = humanDoseAmount(dosage?.doseAndRate, dosage?.text)
      const frequency = displayDosageInstruction(dosage)
      const signature = [dose, frequency]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter((part) => part && part !== '—')
        .join(' · ')
      const status = typeof medication?.status === 'string'
        ? medication.status.toLowerCase()
        : ''
      const startDay = toDayKey(
        medication?.authoredOn
        ?? medication?.effectiveDateTime
        ?? medication?.dispenseRequest?.validityPeriod?.start,
      )
      const endDay = toDayKey(
        medication?.dispenseRequest?.validityPeriod?.end
        ?? dosage?.timing?.repeat?.boundsPeriod?.end
        ?? (inactiveStatuses.has(status)
          ? medication?.effectiveDateTime ?? medication?.authoredOn
          : undefined),
      )
      days.set(rowId, { startDay, endDay })
      return {
        key: medicationClinicalIdentityKey(medication)
          || (typeof medication?.medicationCodeableConcept?.text === 'string'
            ? medication.medicationCodeableConcept.text
            : rowId),
        startDay,
        endDay,
        // Prefer the row model's verdict — it already folds in an elapsed
        // supply window — and fall back to the raw status when a raw record
        // has no matching row (defensive; ids come from the same array).
        isActive: row ? !row.isInactive : !inactiveStatuses.has(status),
        doseSignature: signature || undefined,
      } satisfies OverviewMedFact
    })
    return { medicationFacts: facts, medicationDaysByRowId: days }
  }, [medicationRows, medications])

  const medChanges = useMemo(
    () => classifyMedicationChanges(medicationFacts, window),
    [medicationFacts, window],
  )

  const meds = useMemo<OverviewMedsData>(() => {
    // One row per therapy: the deduplicated active rows the 用藥 tab shows,
    // plus the newest fill of each drug that is no longer running.
    const candidates: MedicationRow[] = [...activeMedications]
    for (const group of inactiveMedicationGroups) {
      const newest = group.medications[0]
      if (newest) candidates.push(newest)
    }

    const items: OverviewMedItem[] = []
    for (const row of candidates) {
      const key = row.drugKey || row.title
      const change = medChanges.get(key)
      const { startDay, endDay } = medicationDaysByRowId.get(row.id) ?? {}
      // A prescription belongs to this window when it was written inside it or
      // when its supply period still overlaps it (an ongoing chronic script).
      if (!overlapsOverviewWindow(startDay, endDay ?? startDay, window)) continue
      const doseText = [row.dose, row.frequency]
        .filter((part) => part && part !== '—')
        .join(' · ')
      items.push({
        id: row.id,
        key,
        title: row.title,
        doseText,
        category: row.category,
        institution: row.pharmacy,
        day: startDay,
        isChronic: row.isChronic,
        isInactive: row.isInactive,
        daysRemaining: row.displayRemainingDays ?? row.daysRemaining,
        change,
        row,
      })
    }

    // Changed therapies lead — they are the reason to open this card — then the
    // rest by most recent prescription.
    items.sort((a, b) => {
      const aChanged = a.change ? 0 : 1
      const bChanged = b.change ? 0 : 1
      if (aChanged !== bChanged) return aChanged - bChanged
      return (b.day ?? '').localeCompare(a.day ?? '')
    })

    return {
      items,
      count: items.length,
      changeCount: items.filter((item) => !!item.change).length,
      chronicCount: items.filter((item) => item.isChronic).length,
    }
  }, [activeMedications, inactiveMedicationGroups, medChanges, medicationDaysByRowId, window])

  // ── 就診 ────────────────────────────────────────────────────────────────
  const clinicalNotes = useClinicalNotes(documentReferences, compositions)
  const encounterDetails = useEncounterDetails(
    medications, diagnosticReports, observations, procedures,
    clinicalNotes, conditions, locale, audience, medicationRows,
  )
  const icdDict = useMemo(() => buildIcdDictionary(conditions, locale), [conditions, locale])
  const visitHistory = useVisitHistory(encounters, icdDict)
  const visitStats = useVisitStats(encounterDetails)
  const docStrings = useDocumentSummaryStrings()
  const { entries: documentEntries } = useDocumentSummaries(docStrings.docTypes)
  const docsByEncounter = useMemo(() => {
    const map = new Map<string, DocumentEntry[]>()
    for (const entry of documentEntries) {
      const encounterId = entry.encounterRef?.split('/').pop()
      if (!encounterId) continue
      const bucket = map.get(encounterId) ?? []
      bucket.push(entry)
      map.set(encounterId, bucket)
    }
    return map
  }, [documentEntries])

  const visits = useMemo<OverviewVisitsData>(() => {
    const items: OverviewVisitItem[] = []
    for (const visit of visitHistory) {
      // An admission that began before the window but discharged inside it is
      // still part of this window's story, so periods are matched by overlap.
      if (!overlapsOverviewWindow(visit.date, visit.endDate ?? visit.date, window)) continue
      const details = encounterDetails.get(visit.id)
      const stats = visitStats.get(visit.id)
      items.push({
        visit,
        details,
        documents: docsByEncounter.get(visit.id),
        abnormalCount: stats?.abnormalCount ?? 0,
        testCount: details?.tests.length ?? 0,
        reportCount: details?.reports.length ?? 0,
        diagnosisCount: details?.diagnoses.length ?? 0,
        medicationCount: details?.medications.length ?? 0,
      })
    }
    return {
      items,
      count: items.length,
      emergencyCount: items.filter((item) => item.visit.type === 'emergency').length,
      inpatientCount: items.filter((item) => item.visit.type === 'inpatient').length,
      outpatientCount: items.filter((item) => (
        item.visit.type === 'outpatient' || item.visit.type === 'outpatient-or-emergency'
      )).length,
    }
  }, [docsByEncounter, encounterDetails, visitHistory, visitStats, window])

  // ── Empty-chart fallback ────────────────────────────────────────────────
  const latestDataDay = useMemo(() => {
    let latest: string | undefined
    const consider = (value: unknown) => {
      const day = toDayKey(value)
      if (day && (!latest || day > latest)) latest = day
    }
    for (const observation of observations as any[]) consider(observation?.effectiveDateTime)
    for (const report of diagnosticReports as any[]) consider(report?.effectiveDateTime ?? report?.issued)
    for (const medication of medications as any[]) consider(medication?.authoredOn ?? medication?.effectiveDateTime)
    for (const encounter of encounters as any[]) consider(encounter?.period?.start)
    return latest
  }, [diagnosticReports, encounters, medications, observations])

  const isEmpty = labs.rows.length === 0
    && reports.items.length === 0
    && meds.items.length === 0
    && visits.items.length === 0

  return {
    isLoading,
    error: error ?? null,
    labs,
    reports,
    meds,
    visits,
    latestDataDay,
    isEmpty,
  }
}
