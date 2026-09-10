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
import { groupMultiRegionStudies } from '@/features/clinical-summary/reports/utils/multi-region-grouping'
import { decodeReportEntities, separateGluedOrderCode } from '@/src/shared/utils/report-text-format'
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
  /** Carries images or a viewer request, whether or not it has report text. */
  hasImages?: boolean
  /** >0 when this row stands for a multi-region study the bridge could not
   *  pair (Row.groupedRows). */
  groupedCount?: number
  /** The cluster shares one NHI order code across body parts — the bridge
   *  cannot say which report belongs to which image. */
  hasAmbiguity?: boolean
  /** How many of the cluster's records actually carry report text. */
  narrativeCount?: number
  /** Each member report of a merged cluster, kept apart. */
  reports?: { id: string; text: string }[]
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
  /** Product name when it differs from the ingredient name (medical audience). */
  secondaryTitle?: string
  doseText: string
  category?: string
  institution?: string
  day?: string
  isChronic: boolean
  isInactive: boolean
  /** Still running, or finished within MEDICATION_RECENTLY_FINISHED_DAYS. */
  isCurrent: boolean
  daysRemaining?: number
  change?: OverviewMedChange
  row: MedicationRow
}

export interface OverviewMedsData {
  items: OverviewMedItem[]
  count: number
  changeCount: number
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

const MEDICATION_INACTIVE_STATUSES = new Set(['stopped', 'completed'])

/**
 * How long a finished prescription stays on the overview's medication list.
 *
 * The card answers "what is this patient on?", and over a three-month window
 * that question was drowned by every short course an admission or an ER visit
 * dispensed. So the default list is what is still running, plus what ran out
 * recently — because "ran out and has not come back" is itself worth seeing.
 *
 * 14 days rather than 7: a 28-day chronic supply that lapsed ten days ago is
 * exactly the case a summary should surface, while an antibiotic course from a
 * stay three weeks ago is not. 異動 is unaffected — a therapy stopped earlier
 * in the window still shows there, because that is the question that filter
 * asks.
 */
const MEDICATION_RECENTLY_FINISHED_DAYS = 14

function daysBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`)
  const to = Date.parse(`${toDay}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.POSITIVE_INFINITY
  return Math.round((to - from) / 86400000)
}

/**
 * The supply span a prescription covers, as raw source days.
 *
 * Shared by the display filter and the change-detection fact list so the two
 * can never disagree about when a prescription ran — a disagreement there
 * would show a drug in the list while classifying it out of the window, or
 * the reverse.
 */
function medicationWindowDays(
  medication: any,
  knownStatus?: string,
): { startDay?: string; endDay?: string } {
  const dosage = medication?.dosageInstruction?.[0] || medication?.dosage?.[0]
  const status = knownStatus ?? (typeof medication?.status === 'string'
    ? medication.status.toLowerCase()
    : '')
  return {
    startDay: toDayKey(
      medication?.authoredOn
      ?? medication?.effectiveDateTime
      ?? medication?.dispenseRequest?.validityPeriod?.start,
    ),
    endDay: toDayKey(
      medication?.dispenseRequest?.validityPeriod?.end
      ?? dosage?.timing?.repeat?.boundsPeriod?.end
      ?? (MEDICATION_INACTIVE_STATUSES.has(status)
        ? medication?.effectiveDateTime ?? medication?.authoredOn
        : undefined),
    ),
  }
}

/**
 * What 影像／檢查報告 shows: exactly the 影像 and 病理 sub-tabs of 報告 — the
 * narrative studies a clinician actually reads.
 *
 * NOT 處置. Those are billed procedure lines (耳垢嵌塞取出, 呼吸運動,
 * 脈動式血氧飽和度監測…) with no report text to read, and they outnumber real
 * imaging by enough to push it out of a bounded card entirely. They remain on
 * the 報告 tab's own 處置 sub-tab and inside each visit's detail.
 */
const REPORT_GROUPS_SHOWN = new Set<ReportGroup>(['imaging', 'pathology'])

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
    // Keep every collection day for the expanded list. The card applies its
    // own width budget; cutting dates here would also
    // discard older-only analytes and undercount the window's results.
    const shownDays = [...allDays].sort((a, b) => a.localeCompare(b))
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
      hiddenDayCount: 0,
      resultCount,
      abnormalCount,
      unpivotedCount,
      navResourceId,
    }
  }, [audience, categoryLabels, displayLang, locale, pivots, windowedObservations])

  // ── 影像／檢查報告 ───────────────────────────────────────────────────────
  const { reportRows } = useReportsData(windowedReports, windowedStudies)

  const reports = useMemo<OverviewReportsData>(() => {
    const items: OverviewReportItem[] = []
    const push = (row: Row, navResourceType: OverviewReportItem['navResourceType']) => {
      const narrative = separateGluedOrderCode(decodeReportEntities(reportNarrative(row)))
      // The row PREVIEW does not pass through formatReportText, so it decodes
      // the source's XML escaping itself — otherwise a summary line shows
      // "L&apos;t knee" while the opened report shows "L't knee".
      const members = row.groupedRows ?? []
      // A grouped row's narrative lives on its members. Keep them SEPARATE:
      // the cluster is several distinct reports on different body parts that
      // merely share an NHI order code, and running them together into one
      // block reads as a single report about all of them.
      const memberReports = members
        .map((member) => ({
          id: member.id,
          text: separateGluedOrderCode(decodeReportEntities(reportNarrative(member))),
        }))
        .filter((entry) => !!entry.text)
      items.push({
        id: `${navResourceType}:${row.id}`,
        title: row.title,
        group: row.group,
        institution: row.institution,
        day: reportRowDay(row),
        summary: firstLine(narrative || memberReports[0]?.text || ''),
        fullText: narrative,
        reports: memberReports.length ? memberReports : undefined,
        hasImages: !!row.images?.length || !!row.viewerActions?.length
          || members.some((member) => !!member.images?.length || !!member.viewerActions?.length),
        groupedCount: members.length,
        hasAmbiguity: !!row.hasAmbiguity,
        narrativeCount: members.length ? memberReports.length : (narrative ? 1 : 0),
        navResourceType,
        navResourceId: row.diagnosticReportIds?.[0]
          ?? row.imagingStudyIds?.[0]
          ?? row.id,
      })
    }
    // The 報告 tab merges the multi-region clusters at the display layer
    // (ReportsCard → groupMultiRegionStudies), not inside useReportsData — so
    // reusing only the hook left 總覽 showing the raw members: several rows
    // with the same title, date and institution, some with no report text at
    // all. Same function, same clusters, same 「健保碼共用」 caveat.
    const shownRows = groupMultiRegionStudies(
      reportRows.filter((row) => REPORT_GROUPS_SHOWN.has(row.group)),
    )
    for (const row of shownRows) {
      push(row, row.diagnosticReportIds?.length ? 'DiagnosticReport' : 'Observation')
    }

    items.sort((a, b) => (b.day ?? '').localeCompare(a.day ?? ''))
    const present = new Set(items.map((item) => item.group))
    return {
      items,
      groups: REPORT_GROUP_ORDER.filter((group) => present.has(group)),
      count: items.length,
    }
  }, [reportRows])

  // ── 用藥 ────────────────────────────────────────────────────────────────
  // Every record gets an explicit id FIRST. `useMedicationRows` falls back to
  // the array position for an id-less record, so the fact list below could
  // only match rows back to raw prescriptions while both walked the identical
  // array. Pinning ids here breaks that coupling, which is what lets the row
  // model be built from a subset without silently repointing every id.
  const identifiedMedications = useMemo(
    () => (Array.isArray(medications) ? medications : []).map(
      (medication: any, index: number) => (
        medication?.id ? medication : { ...medication, id: `med-${index}` }
      ),
    ),
    [medications],
  )

  // Rows are a DISPLAY model — NHI drug-master lookup, dose formatting, i18n —
  // and on a decade-long chart the overview was paying for all of it on every
  // refill ever dispensed (measured: ~50-450ms for 440 prescriptions) to show
  // about twenty. Only prescriptions that touch the window can appear, so only
  // those become rows. An undated record is kept: it cannot be ruled out.
  const displayMedications = useMemo(
    () => identifiedMedications.filter((medication: any) => {
      const { startDay, endDay } = medicationWindowDays(medication)
      if (!startDay && !endDay) return true
      return overlapsOverviewWindow(startDay, endDay, window)
    }),
    [identifiedMedications, window],
  )

  const medicationRows = useMedicationRows(displayMedications, audience, locale)
  const { activeMedications, inactiveMedicationGroups } = useGroupedMedications(medicationRows)

  // Change detection reads the RAW prescriptions (every refill, including those
  // before the window) so "first ever record" and "dose before the window" are
  // real answers rather than window artefacts.
  const { medicationFacts, medicationDaysByRowId } = useMemo(() => {
    const inactiveStatuses = MEDICATION_INACTIVE_STATUSES
    const activeById = new Map<string, MedicationRow>()
    for (const row of medicationRows) activeById.set(row.id, row)
    const days = new Map<string, { startDay?: string; endDay?: string }>()
    const facts = identifiedMedications.map((medication: any) => {
      // Ids are pinned above, so this round-trips whether or not the record
      // became a row. Dates stay raw ISO (never the locale-formatted display
      // strings) as the basis for every comparison.
      const rowId = medication.id
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
      const { startDay, endDay } = medicationWindowDays(medication, status)
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
  }, [identifiedMedications, medicationRows])

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
      // Still running, or finished inside the recent tail (see the constant).
      // An undated record cannot be ruled out, so it counts as current.
      const finishedDay = endDay ?? startDay
      const isCurrent = !row.isInactive || !finishedDay
        || daysBetween(finishedDay, window.endDay) <= MEDICATION_RECENTLY_FINISHED_DAYS
      const doseText = [row.dose, row.frequency]
        .filter((part) => part && part !== '—')
        .join(' · ')
      items.push({
        id: row.id,
        key,
        title: row.title,
        // 商品名, present only when it differs from the ingredient name. Two
        // different products can share one ingredient name — "永豐"生理食鹽水
        // and "濟生"氯化鈉 are both SODIUM CHLORIDE — so the rows are correct
        // but indistinguishable without it.
        secondaryTitle: row.secondaryTitle,
        doseText,
        category: row.category,
        institution: row.pharmacy,
        day: startDay,
        isChronic: row.isChronic,
        isInactive: row.isInactive,
        isCurrent,
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
      // The header counts what the default list shows, so it can never promise
      // more rows than the card is willing to render.
      count: items.filter((item) => item.isCurrent).length,
      changeCount: items.filter((item) => !!item.change).length,
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
