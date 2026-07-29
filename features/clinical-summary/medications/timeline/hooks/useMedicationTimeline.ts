// Data prep for the medication Gantt timeline.
//
// Inputs:  raw MedicationRequest[] from the clinical-data query, an audience
//          ('medical' | 'patient') for picking localized text, and a time
//          range filter.
// Output:  a list of "drug rows" (each = many "refill bars"), grouped by
//          drug category for the timeline UI to render.
//
// Each MedicationRequest = one refill event, with authoredOn = refill date
// and dispenseRequest.expectedSupplyDuration.value = supply days. We build
// a bar for each refill (start = authoredOn, end = start + supplyDays) and
// group them by canonical drug key.
import { useMemo } from 'react'
import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
import {
  isChronicPrescription,
  medicationClinicalIdentityKey,
  medicationSourceCode,
  pickLocalizedText,
  pickByLocale,
} from '../../utils/fhir-helpers'

export type TimeRange = '3m' | '6m' | '1y' | '3y' | 'all'

export interface RefillBar {
  refillId: string
  startMs: number
  endMs: number
  supplyDays: number
  authoredOnIso: string
  /** Original per-refill source code retained even when package-code variants
   *  share one clinical timeline row. */
  sourceMedicationCode?: string
  pharmacy?: string
  icdCode?: string
  icdText?: string
  isChronic: boolean
}

export interface TimelineDrug {
  drugKey: string
  drugName: string
  /** Medical product/brand name retained for hover details while the compact
   *  timeline label prioritizes ingredient + strength. */
  drugProductName?: string
  drugTerminology?: MedicationEntity['drugTerminology']
  isChronic: boolean
  categoryKey: string
  categoryLabel: string
  bars: RefillBar[]
  firstStartMs: number
  lastStartMs: number
  refillCount: number
}

export interface CategoryGroup {
  key: string
  label: string
  drugs: TimelineDrug[]
  chronicCount: number
  acuteCount: number
}

export interface TimelineData {
  categories: CategoryGroup[]
  /** All drugs flat for "依藥" sort modes / fallback */
  drugs: TimelineDrug[]
  domainStartMs: number
  domainEndMs: number
  totalDrugs: number
  chronicCount: number
  acuteCount: number
}

const RANGE_MONTHS: Record<TimeRange, number | null> = {
  '3m': 3,
  '6m': 6,
  '1y': 12,
  '3y': 36,
  all: null,
}

const FALLBACK_CATEGORY_KEY = '__other__'
const ATC_LEVEL_ONE_CODES = new Set([
  'A', 'B', 'C', 'D', 'G', 'H', 'J',
  'L', 'M', 'N', 'P', 'R', 'S', 'V',
])

function categoryOf(
  medication: any,
  locale: string,
  fallbackCategoryLabel: string,
  atcCategoryLabels: Record<string, string>,
): { key: string; label: string } {
  // The Bridge terminology module owns ATC hierarchy resolution. The App
  // consumes its governed three-character category and never invents a
  // level-2 label by slicing the full ingredient code.
  const atcLevel2Code =
    typeof medication?.drugTerminology?.atcLevel2Code === 'string'
      ? medication.drugTerminology.atcLevel2Code.trim().toUpperCase()
      : ''
  const atcLevel2Name =
    locale === 'en'
      ? medication?.drugTerminology?.atcLevel2NameEn
        || medication?.drugTerminology?.atcLevel2NameZh
      : medication?.drugTerminology?.atcLevel2NameZh
        || medication?.drugTerminology?.atcLevel2NameEn
  if (/^[A-Z]\d{2}$/.test(atcLevel2Code) && typeof atcLevel2Name === 'string') {
    const label = atcLevel2Name.replace(/\s+/g, ' ').trim()
    if (label) {
      return {
        key: `atc-level2:${atcLevel2Code}`,
        label,
      }
    }
  }

  // An explicit source classification is more informative than falling back
  // to the very broad ATC anatomical letter on older, unenriched bundles.
  const sourceCategory = medication?.category?.[0]
  const sourceLabel = pickByLocale(sourceCategory, locale)?.replace(/\s+/g, ' ').trim()
  if (sourceLabel) {
    const sourceKey =
      sourceCategory?.coding?.[0]?.code ||
      sourceCategory?.coding?.[0]?.display ||
      sourceCategory?.text ||
      sourceLabel
    return {
      key: `source:${String(sourceKey).trim()}`,
      label: sourceLabel,
    }
  }

  // Final terminology fallback for an older resource that carries only the
  // full ATC code: use the anatomical level-one group, clearly keyed as such.
  const atcCode = typeof medication?.drugTerminology?.atcCode === 'string'
    ? medication.drugTerminology.atcCode.trim().toUpperCase()
    : ''
  const atcGroup = atcCode.charAt(0)
  if (ATC_LEVEL_ONE_CODES.has(atcGroup)) {
    return {
      key: `atc-level1:${atcGroup}`,
      label: atcCategoryLabels[atcGroup] || `ATC ${atcGroup}`,
    }
  }

  return {
    key: FALLBACK_CATEGORY_KEY,
    label: fallbackCategoryLabel,
  }
}

export function useMedicationTimeline(
  medications: any[],
  audience: 'medical' | 'patient',
  range: TimeRange,
  fallbackCategoryLabel: string,
  locale: string = 'zh-TW',
  atcCategoryLabels: Record<string, string> = {},
): TimelineData {
  return useMemo(() => {
    const empty: TimelineData = {
      categories: [],
      drugs: [],
      domainStartMs: Date.now(),
      domainEndMs: Date.now(),
      totalDrugs: 0,
      chronicCount: 0,
      acuteCount: 0,
    }
    if (!Array.isArray(medications) || medications.length === 0) return empty

    // Vaccine-categorized MedicationRequests stay in the timeline: a
    // therapeutic vaccine prescription has a real supply duration and is
    // a legitimate medication. Preventive-care vaccinations now flow
    // through FHIR Immunization (see useVaccineRows) and never appear in
    // the MedicationRequest stream.

    // ── Step 1: drug-level chronic aggregation (mirror useMedicationRows) ──
    const chronicDrugs = new Set<string>()
    for (const m of medications) {
      if (m && isChronicPrescription(m)) {
        const k = medicationClinicalIdentityKey(m)
        if (k) chronicDrugs.add(k)
      }
    }

    // ── Step 2: time range filter ───────────────────────────────────────
    const months = RANGE_MONTHS[range]
    const now = Date.now()
    const rangeStart = months === null
      ? -Infinity
      : new Date(new Date().setMonth(new Date().getMonth() - months)).getTime()

    // ── Step 3: group MedicationRequest into drug → bars ──────────────────
    const drugsMap = new Map<string, TimelineDrug>()
    let domainMin = Infinity
    let domainMax = -Infinity

    for (const med of medications) {
      if (!med) continue
      const drugKey = medicationClinicalIdentityKey(med)
      if (!drugKey) continue

      const startIso = med.authoredOn || med.effectiveDateTime
      if (!startIso) continue
      const startMs = new Date(startIso).getTime()
      if (Number.isNaN(startMs)) continue
      if (startMs < rangeStart) continue  // out of selected time window

      const supplyDays = Number(med.dispenseRequest?.expectedSupplyDuration?.value) || 30
      const endMs = startMs + supplyDays * 24 * 60 * 60 * 1000

      const isChronic = chronicDrugs.has(drugKey)
      const officialProductName = audience === 'medical'
        ? med.drugTerminology?.officialNameEn || med.drugTerminology?.officialNameZh
        : locale === 'en'
          ? med.drugTerminology?.officialNameEn || med.drugTerminology?.officialNameZh
          : med.drugTerminology?.officialNameZh
      const ingredientName = audience === 'medical'
        ? med.drugTerminology?.ingredientText?.trim()
        : undefined
      const drugName = ingredientName
        || officialProductName
        || pickLocalizedText(med.medicationCodeableConcept, audience, locale)
        || drugKey
      const drugProductName =
        audience === 'medical' &&
        ingredientName &&
        officialProductName &&
        ingredientName.localeCompare(officialProductName, undefined, { sensitivity: 'accent' }) !== 0
          ? officialProductName
          : undefined
      // Category labels follow UI locale (not audience). Prefer the shared
      // Governed ATC level-two group, source category, ATC level one, Other.
      const { key: categoryKey, label: categoryLabel } = categoryOf(
        med,
        locale,
        fallbackCategoryLabel,
        atcCategoryLabels,
      )

      const icdCoding = med.reasonCode?.[0]?.coding?.[0]
      const icdCode = icdCoding?.code as string | undefined
      // ICD description follows UI locale, not audience (see useMedicationRows
      // for rationale). The duplicated leading code prefix is stripped below.
      const rawIcdText = pickByLocale(med.reasonCode?.[0], locale)
      const icdText = rawIcdText
        ? rawIcdText.replace(/^[A-Z]\d+(\.\d+)?\s+/, '').trim() || undefined
        : undefined

      const bar: RefillBar = {
        refillId: med.id || `${medicationSourceCode(med) || drugKey}-${startIso}`,
        startMs,
        endMs,
        supplyDays,
        authoredOnIso: startIso,
        sourceMedicationCode: medicationSourceCode(med) || undefined,
        pharmacy: med.requester?.display?.trim() || undefined,
        icdCode,
        icdText,
        isChronic,
      }

      domainMin = Math.min(domainMin, startMs)
      domainMax = Math.max(domainMax, endMs)

      const existing = drugsMap.get(drugKey)
      if (existing) {
        existing.bars.push(bar)
        if (startMs < existing.firstStartMs) existing.firstStartMs = startMs
        if (startMs > existing.lastStartMs) existing.lastStartMs = startMs
        existing.refillCount++
        // Keep the most recent name/category in case earlier rows had stale
        // localisations; the bridge's latest is usually most correct.
        if (startMs >= existing.lastStartMs) {
          existing.drugName = drugName
          existing.drugProductName = drugProductName
          existing.drugTerminology = med.drugTerminology
          existing.categoryKey = categoryKey
          existing.categoryLabel = categoryLabel
        }
      } else {
        drugsMap.set(drugKey, {
          drugKey,
          drugName,
          drugProductName,
          drugTerminology: med.drugTerminology,
          isChronic,
          categoryKey,
          categoryLabel,
          bars: [bar],
          firstStartMs: startMs,
          lastStartMs: startMs,
          refillCount: 1,
        })
      }
    }

    if (drugsMap.size === 0) return empty

    // ── Step 4: clamp domain — extend right edge to today ──────────────
    domainMax = Math.max(domainMax, now)
    if (domainMin === Infinity) domainMin = now

    // ── Step 5: bucket drugs into category groups ───────────────────────
    const drugs = [...drugsMap.values()].sort((a, b) => {
      // Chronic first, then by first refill date (earliest first → longest
      // history at the top of each section).
      if (a.isChronic !== b.isChronic) return a.isChronic ? -1 : 1
      return a.firstStartMs - b.firstStartMs
    })

    const groupsMap = new Map<string, CategoryGroup>()
    for (const drug of drugs) {
      const existing = groupsMap.get(drug.categoryKey)
      if (existing) {
        existing.drugs.push(drug)
        if (drug.isChronic) existing.chronicCount++
        else existing.acuteCount++
      } else {
        groupsMap.set(drug.categoryKey, {
          key: drug.categoryKey,
          label: drug.categoryLabel,
          drugs: [drug],
          chronicCount: drug.isChronic ? 1 : 0,
          acuteCount: drug.isChronic ? 0 : 1,
        })
      }
    }

    // Sort categories: groups containing any chronic drug first; "其他" last.
    const categories = [...groupsMap.values()].sort((a, b) => {
      if (a.key === FALLBACK_CATEGORY_KEY) return 1
      if (b.key === FALLBACK_CATEGORY_KEY) return -1
      const aHasChronic = a.chronicCount > 0
      const bHasChronic = b.chronicCount > 0
      if (aHasChronic !== bHasChronic) return aHasChronic ? -1 : 1
      const countOrder = b.drugs.length - a.drugs.length
      return countOrder || a.key.localeCompare(b.key)
    })

    return {
      categories,
      drugs,
      domainStartMs: domainMin,
      domainEndMs: domainMax,
      totalDrugs: drugs.length,
      chronicCount: drugs.filter(d => d.isChronic).length,
      acuteCount: drugs.filter(d => !d.isChronic).length,
    }
  }, [medications, audience, range, fallbackCategoryLabel, locale, atcCategoryLabels])
}
