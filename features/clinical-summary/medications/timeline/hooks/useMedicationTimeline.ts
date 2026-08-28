// Data preparation for the medication refill timeline.
//
// Medication rows can be grouped by the governed ATC hierarchy or by the
// prescribing/dispensing organization carried by MedicationRequest.requester.
// ATC labels are consumed from the pinned hierarchy, either through official
// drug-master terminology or the strict source-WHO-ATC fallback; this hook
// never invents level 2-4 labels by slicing a full ingredient code.
import { useMemo, useState } from 'react'
import { formatOrganizationDisplay } from '@/src/shared/utils/organization-display'
import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
import {
  isChronicPrescription,
  medicationClinicalIdentityKey,
  medicationSourceCode,
  pickLocalizedText,
  pickByLocale,
} from '../../utils/fhir-helpers'
import { displayDosageInstruction } from '../../utils/dose-helpers'

export type TimeRange = '3m' | '6m' | '1y' | '3y' | 'all'
export type TimelineGroupingMode = 'atc' | 'organization'
export type TimelineAtcLevel = '2' | '4'

export interface RefillBar {
  refillId: string
  startMs: number
  endMs: number
  supplyDays: number
  authoredOnIso: string
  sourceMedicationCode?: string
  frequency?: string
  pharmacy?: string
  icdCode?: string
  icdText?: string
  isChronic: boolean
}

interface TimelineClassification {
  key: string
  code?: string
  label: string
  nameEn?: string
  nameZh?: string
  level: 1 | 2 | 3 | 4 | 'source' | 'other'
}

export interface TimelineDrug {
  /** Unique rendered row key. Organization mode includes the organization. */
  drugKey: string
  clinicalDrugKey: string
  drugName: string
  drugProductName?: string
  drugTerminology?: MedicationEntity['drugTerminology']
  isChronic: boolean
  categoryKey: string
  categoryLabel: string
  atcLevel2?: TimelineClassification
  atcLevel4?: TimelineClassification
  organizationKey: string
  organizationLabel: string
  bars: RefillBar[]
  firstStartMs: number
  lastStartMs: number
  refillCount: number
}

export interface CategoryGroup {
  key: string
  code?: string
  label: string
  /** Keep both governed names so translated labels can disclose the WHO
   * English source without adding another persistent line to the timeline. */
  nameEn?: string
  nameZh?: string
  /** Direct drug rows. A hierarchy header may also contain child headers. */
  drugs: TimelineDrug[]
  children?: CategoryGroup[]
  depth?: number
  level?: 1 | 2 | 3 | 4 | 'source' | 'other' | 'organization'
  drugCount?: number
  chronicCount: number
  nonChronicCount: number
}

export interface TimelineData {
  categories: CategoryGroup[]
  /** Flat rendered rows. Organization mode may repeat a drug by organization. */
  drugs: TimelineDrug[]
  domainStartMs: number
  domainEndMs: number
  /** Unique clinical drugs in the selected time range. */
  totalDrugs: number
  /** Rendered rows; differs from totalDrugs when a drug spans organizations. */
  totalRows: number
  chronicCount: number
  nonChronicCount: number
  organizationCount: number
}

const RANGE_MONTHS: Record<TimeRange, number | null> = {
  '3m': 3,
  '6m': 6,
  '1y': 12,
  '3y': 36,
  all: null,
}

const FALLBACK_CATEGORY_KEY = '__other__'
const FALLBACK_ORGANIZATION_KEY = '__unknown_organization__'
const ATC_LEVEL_ONE_CODES = new Set([
  'A', 'B', 'C', 'D', 'G', 'H', 'J',
  'L', 'M', 'N', 'P', 'R', 'S', 'V',
])

type MedicationAtcData =
  | NonNullable<MedicationEntity['drugTerminology']>
  | NonNullable<MedicationEntity['atcClassification']>

function medicationAtcData(medication: any): MedicationAtcData | undefined {
  return medication?.drugTerminology ?? medication?.atcClassification
}

function localizedTerminologyName(
  terminology: MedicationAtcData | undefined,
  level: 2 | 4,
  locale: string,
): string {
  const nameEn = terminology?.[`atcLevel${level}NameEn`]
  const nameZh = terminology?.[`atcLevel${level}NameZh`]
  const value = locale === 'en' ? nameEn || nameZh : nameZh || nameEn
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function normalizedTerminologyName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

function governedAtcClassification(
  medication: any,
  level: 2 | 4,
  locale: string,
): TimelineClassification | undefined {
  const terminology = medicationAtcData(medication)
  const codeValue = terminology?.[`atcLevel${level}Code`]
  const code = typeof codeValue === 'string'
    ? codeValue.trim().toUpperCase()
    : ''
  const pattern = level === 2
    ? /^[A-Z]\d{2}$/
    : /^[A-Z]\d{2}[A-Z]{2}$/
  const nameEn = normalizedTerminologyName(
    terminology?.[`atcLevel${level}NameEn`],
  )
  const nameZh = normalizedTerminologyName(
    terminology?.[`atcLevel${level}NameZh`],
  )
  const label = localizedTerminologyName(terminology, level, locale)
  if (!pattern.test(code) || !label) return undefined
  return {
    key: `atc-level${level}:${code}`,
    code,
    label,
    ...(nameEn ? { nameEn } : {}),
    ...(nameZh ? { nameZh } : {}),
    level,
  }
}

function primaryCategoryOf(
  medication: any,
  locale: string,
  fallbackCategoryLabel: string,
  atcCategoryLabels: Record<string, string>,
): TimelineClassification {
  const atcLevel2 = governedAtcClassification(medication, 2, locale)
  if (atcLevel2) return atcLevel2

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
      level: 'source',
    }
  }

  const terminology = medicationAtcData(medication)
  const atcCode = typeof terminology?.atcCode === 'string'
    ? terminology.atcCode.trim().toUpperCase()
    : ''
  const atcGroup = atcCode.charAt(0)
  if (ATC_LEVEL_ONE_CODES.has(atcGroup)) {
    return {
      key: `atc-level1:${atcGroup}`,
      code: atcGroup,
      label: atcCategoryLabels[atcGroup] || `ATC ${atcGroup}`,
      level: 1,
    }
  }

  return {
    key: FALLBACK_CATEGORY_KEY,
    label: fallbackCategoryLabel,
    level: 'other',
  }
}

function organizationOf(
  medication: any,
  fallbackOrganizationLabel: string,
): { key: string; label: string } {
  const label = typeof medication?.requester?.display === 'string'
    ? formatOrganizationDisplay(medication.requester.display).replace(/\s+/g, ' ').trim()
    : ''
  if (!label) {
    return { key: FALLBACK_ORGANIZATION_KEY, label: fallbackOrganizationLabel }
  }
  return {
    key: `organization:${label.toLocaleLowerCase()}`,
    label,
  }
}

function countGroup(drugs: TimelineDrug[]) {
  return {
    chronicCount: drugs.filter((drug) => drug.isChronic).length,
    nonChronicCount: drugs.filter((drug) => !drug.isChronic).length,
  }
}

function sortGroups(groups: CategoryGroup[]): CategoryGroup[] {
  return groups.sort((a, b) => {
    const aFallback = a.key === FALLBACK_CATEGORY_KEY
      || a.key === FALLBACK_ORGANIZATION_KEY
    const bFallback = b.key === FALLBACK_CATEGORY_KEY
      || b.key === FALLBACK_ORGANIZATION_KEY
    if (aFallback !== bFallback) return aFallback ? 1 : -1
    const aHasChronic = a.chronicCount > 0
    const bHasChronic = b.chronicCount > 0
    if (aHasChronic !== bHasChronic) return aHasChronic ? -1 : 1
    const countOrder = (b.drugCount ?? b.drugs.length) - (a.drugCount ?? a.drugs.length)
    return countOrder || a.key.localeCompare(b.key)
  })
}

function childGroups(
  drugs: TimelineDrug[],
  depth: number,
): { directDrugs: TimelineDrug[]; children: CategoryGroup[] } {
  const directDrugs: TimelineDrug[] = []
  const byClassification = new Map<string, {
    classification: TimelineClassification
    drugs: TimelineDrug[]
  }>()

  for (const drug of drugs) {
    const classification = drug.atcLevel4
    if (!classification) {
      directDrugs.push(drug)
      continue
    }
    const existing = byClassification.get(classification.key)
    if (existing) existing.drugs.push(drug)
    else byClassification.set(classification.key, { classification, drugs: [drug] })
  }

  const children = [...byClassification.values()].map(({ classification, drugs: grouped }) => {
    const counts = countGroup(grouped)
    return {
      key: classification.key,
      code: classification.code,
      label: classification.label,
      nameEn: classification.nameEn,
      nameZh: classification.nameZh,
      level: 4,
      depth,
      drugs: grouped,
      children: [],
      drugCount: grouped.length,
      ...counts,
    } satisfies CategoryGroup
  })

  return { directDrugs, children: sortGroups(children) }
}

export function useMedicationTimeline(
  medications: any[],
  audience: 'medical' | 'patient',
  range: TimeRange,
  fallbackCategoryLabel: string,
  locale: string = 'zh-TW',
  atcCategoryLabels: Record<string, string> = {},
  groupingMode: TimelineGroupingMode = 'atc',
  atcLevel: TimelineAtcLevel = '4',
  fallbackOrganizationLabel: string = locale === 'en' ? 'Unknown organization' : '未提供機構',
): TimelineData {
  const [now] = useState(() => Date.now())

  return useMemo(() => {
    const empty: TimelineData = {
      categories: [],
      drugs: [],
      domainStartMs: now,
      domainEndMs: now,
      totalDrugs: 0,
      totalRows: 0,
      chronicCount: 0,
      nonChronicCount: 0,
      organizationCount: 0,
    }
    if (!Array.isArray(medications) || medications.length === 0) return empty

    const chronicDrugs = new Set<string>()
    for (const medication of medications) {
      if (medication && isChronicPrescription(medication)) {
        const key = medicationClinicalIdentityKey(medication)
        if (key) chronicDrugs.add(key)
      }
    }

    const months = RANGE_MONTHS[range]
    const rangeStart = months === null
      ? -Infinity
      : (() => {
          const start = new Date(now)
          start.setMonth(start.getMonth() - months)
          return start.getTime()
        })()

    const drugsMap = new Map<string, TimelineDrug>()
    const clinicalDrugKeys = new Set<string>()
    let domainMin = Infinity
    let domainMax = -Infinity

    for (const med of medications) {
      if (!med) continue
      const clinicalDrugKey = medicationClinicalIdentityKey(med)
      if (!clinicalDrugKey) continue

      const startIso = med.authoredOn || med.effectiveDateTime
      if (!startIso) continue
      const startMs = new Date(startIso).getTime()
      if (Number.isNaN(startMs) || startMs < rangeStart) continue

      const supplyDays = Number(med.dispenseRequest?.expectedSupplyDuration?.value) || 30
      const endMs = startMs + supplyDays * 24 * 60 * 60 * 1000
      const isChronic = chronicDrugs.has(clinicalDrugKey)
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
        || clinicalDrugKey
      const drugProductName =
        audience === 'medical'
        && ingredientName
        && officialProductName
        && ingredientName.localeCompare(
          officialProductName,
          undefined,
          { sensitivity: 'accent' },
        ) !== 0
          ? officialProductName
          : undefined

      const category = primaryCategoryOf(
        med,
        locale,
        fallbackCategoryLabel,
        atcCategoryLabels,
      )
      const atcLevel2 = governedAtcClassification(med, 2, locale)
      const atcLevel4 = governedAtcClassification(med, 4, locale)
      const organization = organizationOf(med, fallbackOrganizationLabel)
      const rowKey = groupingMode === 'organization'
        ? `${organization.key}::${clinicalDrugKey}`
        : clinicalDrugKey

      const icdCoding = med.reasonCode?.[0]?.coding?.[0]
      const icdCode = icdCoding?.code as string | undefined
      const rawIcdText = pickByLocale(med.reasonCode?.[0], locale)
      const icdText = rawIcdText
        ? rawIcdText.replace(/^[A-Z]\d+(\.\d+)?\s+/, '').trim() || undefined
        : undefined
      const dosage = med.dosageInstruction?.[0] || med.dosage?.[0]
      const frequency = displayDosageInstruction(dosage)
      const requesterDisplay = med.requester?.display
        ? formatOrganizationDisplay(med.requester.display)
        : ''

      const bar: RefillBar = {
        refillId: med.id || `${medicationSourceCode(med) || clinicalDrugKey}-${startIso}`,
        startMs,
        endMs,
        supplyDays,
        authoredOnIso: startIso,
        sourceMedicationCode: medicationSourceCode(med) || undefined,
        frequency: frequency || undefined,
        pharmacy: requesterDisplay || undefined,
        icdCode,
        icdText,
        isChronic,
      }

      clinicalDrugKeys.add(clinicalDrugKey)
      domainMin = Math.min(domainMin, startMs)
      domainMax = Math.max(domainMax, endMs)

      const existing = drugsMap.get(rowKey)
      if (existing) {
        const isLatest = startMs >= existing.lastStartMs
        existing.bars.push(bar)
        existing.firstStartMs = Math.min(existing.firstStartMs, startMs)
        existing.lastStartMs = Math.max(existing.lastStartMs, startMs)
        existing.refillCount++
        if (isLatest) {
          existing.drugName = drugName
          existing.drugProductName = drugProductName
          existing.drugTerminology = med.drugTerminology
          existing.categoryKey = category.key
          existing.categoryLabel = category.label
          existing.atcLevel2 = atcLevel2
          existing.atcLevel4 = atcLevel4
          existing.organizationKey = organization.key
          existing.organizationLabel = organization.label
        }
      } else {
        drugsMap.set(rowKey, {
          drugKey: rowKey,
          clinicalDrugKey,
          drugName,
          drugProductName,
          drugTerminology: med.drugTerminology,
          isChronic,
          categoryKey: category.key,
          categoryLabel: category.label,
          atcLevel2,
          atcLevel4,
          organizationKey: organization.key,
          organizationLabel: organization.label,
          bars: [bar],
          firstStartMs: startMs,
          lastStartMs: startMs,
          refillCount: 1,
        })
      }
    }

    if (drugsMap.size === 0) return empty

    domainMax = Math.max(domainMax, now)
    if (domainMin === Infinity) domainMin = now

    const drugs = [...drugsMap.values()].sort((a, b) => {
      if (a.isChronic !== b.isChronic) return a.isChronic ? -1 : 1
      return a.firstStartMs - b.firstStartMs
    })

    let categories: CategoryGroup[]

    if (groupingMode === 'organization') {
      const groupsMap = new Map<string, CategoryGroup>()
      for (const drug of drugs) {
        const existing = groupsMap.get(drug.organizationKey)
        if (existing) {
          existing.drugs.push(drug)
          existing.drugCount = (existing.drugCount ?? 0) + 1
          if (drug.isChronic) existing.chronicCount++
          else existing.nonChronicCount++
        } else {
          groupsMap.set(drug.organizationKey, {
            key: drug.organizationKey,
            label: drug.organizationLabel,
            level: 'organization',
            depth: 0,
            drugs: [drug],
            children: [],
            drugCount: 1,
            chronicCount: drug.isChronic ? 1 : 0,
            nonChronicCount: drug.isChronic ? 0 : 1,
          })
        }
      }
      const organizationGroups = [...groupsMap.values()]
      for (const group of organizationGroups) {
        group.drugs.sort((a, b) => {
          const prescribedDateOrder = a.firstStartMs - b.firstStartMs
          if (prescribedDateOrder !== 0) return prescribedDateOrder
          const nameOrder = a.drugName.localeCompare(b.drugName, locale)
          return nameOrder || a.drugKey.localeCompare(b.drugKey)
        })
      }
      categories = sortGroups(organizationGroups)
    } else {
      const baseGroups = new Map<string, {
        classification: TimelineClassification
        drugs: TimelineDrug[]
      }>()
      for (const drug of drugs) {
        const classification = drug.atcLevel2 ?? {
          key: drug.categoryKey,
          label: drug.categoryLabel,
          level: drug.categoryKey.startsWith('atc-level1:')
            ? 1
            : drug.categoryKey === FALLBACK_CATEGORY_KEY
              ? 'other'
              : 'source',
        } satisfies TimelineClassification
        const existing = baseGroups.get(classification.key)
        if (existing) existing.drugs.push(drug)
        else baseGroups.set(classification.key, { classification, drugs: [drug] })
      }

      categories = [...baseGroups.values()].map(({ classification, drugs: grouped }) => {
        const counts = countGroup(grouped)
        const showLevel4 = classification.level === 2
          && atcLevel === '4'
        const nested = showLevel4
          ? childGroups(grouped, 1)
          : { directDrugs: grouped, children: [] }
        return {
          key: classification.key,
          code: classification.code,
          label: classification.label,
          nameEn: classification.nameEn,
          nameZh: classification.nameZh,
          level: classification.level,
          depth: 0,
          drugs: nested.directDrugs,
          children: nested.children,
          drugCount: grouped.length,
          ...counts,
        } satisfies CategoryGroup
      })
      categories = sortGroups(categories)
    }

    return {
      categories,
      drugs,
      domainStartMs: domainMin,
      domainEndMs: domainMax,
      totalDrugs: clinicalDrugKeys.size,
      totalRows: drugs.length,
      chronicCount: drugs.filter((drug) => drug.isChronic).length,
      nonChronicCount: drugs.filter((drug) => !drug.isChronic).length,
      organizationCount: groupingMode === 'organization' ? categories.length : 0,
    }
  }, [
    medications,
    audience,
    range,
    fallbackCategoryLabel,
    locale,
    atcCategoryLabels,
    groupingMode,
    atcLevel,
    fallbackOrganizationLabel,
    now,
  ])
}
