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
import { isChronicPrescription, pickLocalizedText } from '../../utils/fhir-helpers'

export type TimeRange = '3m' | '6m' | '1y' | '3y' | 'all'

export interface RefillBar {
  refillId: string
  startMs: number
  endMs: number
  supplyDays: number
  authoredOnIso: string
  pharmacy?: string
  icdCode?: string
  icdText?: string
  isChronic: boolean
}

export interface TimelineDrug {
  drugKey: string
  drugName: string
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

function drugKeyOf(m: any): string {
  return (
    m?.medicationCodeableConcept?.coding?.[0]?.code ||
    m?.medicationCodeableConcept?.text ||
    m?.medicationReference?.display ||
    m?.code?.text ||
    ''
  )
}

function categoryKeyOf(m: any): string {
  return (
    m?.category?.[0]?.coding?.[0]?.display ||
    m?.category?.[0]?.text ||
    FALLBACK_CATEGORY_KEY
  )
}

export function useMedicationTimeline(
  medications: any[],
  audience: 'medical' | 'patient',
  range: TimeRange,
  fallbackCategoryLabel: string,
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

    // ── Step 1: drug-level chronic aggregation (mirror useMedicationRows) ──
    const chronicDrugs = new Set<string>()
    for (const m of medications) {
      if (m && isChronicPrescription(m)) {
        const k = drugKeyOf(m)
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
      const drugKey = drugKeyOf(med)
      if (!drugKey) continue

      const startIso = med.authoredOn || med.effectiveDateTime
      if (!startIso) continue
      const startMs = new Date(startIso).getTime()
      if (Number.isNaN(startMs)) continue
      if (startMs < rangeStart) continue  // out of selected time window

      const supplyDays = Number(med.dispenseRequest?.expectedSupplyDuration?.value) || 30
      const endMs = startMs + supplyDays * 24 * 60 * 60 * 1000

      const isChronic = chronicDrugs.has(drugKey)
      const drugName = pickLocalizedText(med.medicationCodeableConcept, audience) || drugKey
      const categoryKey = categoryKeyOf(med)
      const categoryLabel =
        pickLocalizedText(med.category?.[0], audience) || fallbackCategoryLabel

      const icdCoding = med.reasonCode?.[0]?.coding?.[0]
      const icdCode = icdCoding?.code as string | undefined
      const rawIcdText = med.reasonCode?.[0]?.text || icdCoding?.display || ''
      const icdText = rawIcdText
        ? rawIcdText.replace(/^[A-Z]\d+(\.\d+)?\s+/, '').trim() || undefined
        : undefined

      const bar: RefillBar = {
        refillId: med.id || `${drugKey}-${startIso}`,
        startMs,
        endMs,
        supplyDays,
        authoredOnIso: startIso,
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
          existing.categoryKey = categoryKey
          existing.categoryLabel = categoryLabel
        }
      } else {
        drugsMap.set(drugKey, {
          drugKey,
          drugName,
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
      return b.drugs.length - a.drugs.length
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
  }, [medications, audience, range, fallbackCategoryLabel])
}
