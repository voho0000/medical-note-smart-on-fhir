// Problem List Context Hook — standalone problems tagged with FHIR category
// `problem-list-item`. ICD descriptions follow UI language only.
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import { lookupIcd, buildIcdDictionary } from "@/src/shared/utils/icd-lookup"
import { useLanguage } from "@/src/application/providers/language.provider"
import { pickByLocale } from "@/src/shared/utils/fhir-display-helpers"
import { makeTimeRangeTest } from "@/src/core/utils/date-filter.utils"

function isProblemListItem(cond: any): boolean {
  const categories = cond?.category
  // FHIR allows category to be absent. A condition without category AND without
  // an encounter link is a standing condition, not a visit billing diagnosis.
  if (!Array.isArray(categories) || categories.length === 0) return !cond?.encounter?.reference
  return categories.some((cat: any) =>
    Array.isArray(cat?.coding) &&
    cat.coding.some((c: any) => c?.code === 'problem-list-item')
  )
}

function isActiveCondition(condition: any): boolean {
  const verification = typeof condition?.verificationStatus === 'string'
    ? condition.verificationStatus.toLowerCase()
    : (condition?.verificationStatus?.coding?.[0]?.code || condition?.verificationStatus?.text || '').toLowerCase()
  if (verification === 'refuted' || verification === 'entered-in-error') return false
  const clinicalStatus = condition?.clinicalStatus
  if (!clinicalStatus) return true
  const statusStr = typeof clinicalStatus === 'string'
    ? clinicalStatus.toLowerCase()
    : (clinicalStatus?.coding?.[0]?.code || clinicalStatus?.text || '').toLowerCase()
  return statusStr === 'active' || statusStr === 'recurrence' || statusStr === 'relapse'
}

export function useProblemListContext(
  includeProblemList: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters,
): ClinicalContextSection | null {
  const { locale } = useLanguage()
  return useMemo(() => {
    if (!includeProblemList || !clinicalData?.conditions?.length) return null

    const data = (clinicalData.conditions as any[]).filter(isProblemListItem)
    if (data.length === 0) return null

    const byStatus = (filters?.problemListStatus ?? 'active') === 'active'
      ? data.filter(isActiveCondition)
      : data
    const inWindow = makeTimeRangeTest(
      filters?.problemListTimeRange ?? 'all',
      clinicalData as { encounters?: any[] },
    )
    const filtered = byStatus.filter((condition: any) =>
      inWindow(condition.recordedDate || condition.onsetDateTime),
    )
    if (filtered.length === 0) return null

    const icdDict = buildIcdDictionary(data, locale)

    const items = filtered.map((c: any) => {
      // ICD descriptions follow UI language only.
      const localized = pickByLocale(c.code, locale)
      const coding = c.code?.coding ?? []
      const icdCoding = coding.find((cc: any) => cc.system?.toLowerCase?.().includes('icd')) || coding[0]
      const code = icdCoding?.code
      const lookup = code ? lookupIcd(code, icdDict) : undefined
      const baseName = localized || lookup || icdCoding?.display || code || 'Unknown problem'
      const name = code && code !== baseName ? `${code} - ${baseName}` : baseName

      const date = c.recordedDate
        ? ` (recorded: ${new Date(c.recordedDate).toLocaleDateString()})`
        : ''
      const status = typeof c.clinicalStatus === 'string'
        ? c.clinicalStatus
        : c.clinicalStatus?.coding?.[0]?.code || c.clinicalStatus?.text
      const statusLabel = status && !isActiveCondition(c) ? ` [${status}]` : ''
      const verification = typeof c.verificationStatus === 'string'
        ? c.verificationStatus
        : c.verificationStatus?.coding?.[0]?.code || c.verificationStatus?.text
      const verificationLabel = verification ? ` [verification: ${verification}]` : ''
      return `${name}${date}${statusLabel}${verificationLabel}`
    })

    if (items.length === 0) return null

    return { title: 'Problem List', items }
  }, [includeProblemList, clinicalData, filters, locale])
}
