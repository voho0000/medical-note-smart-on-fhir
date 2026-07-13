// Problem List Category — standalone problems tagged with FHIR category
// `problem-list-item`. Distinct from `conditions` (which includes all
// encounter-bound diagnoses).
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { Condition } from '@/src/shared/types/fhir.types'
import { makeTimeRangeTest } from '../utils/date-filter.utils'

const withinProblemRange = (
  conditions: Condition[],
  range: string,
  clinicalData?: { encounters?: any[] } | null,
): Condition[] => {
  const inWindow = makeTimeRangeTest(range, clinicalData)
  return conditions.filter((condition: any) =>
    inWindow(condition.recordedDate || condition.onsetDateTime),
  )
}

function isProblemListItem(cond: any): boolean {
  const categories = cond?.category
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

export const problemListCategory: DataCategory<Condition> = {
  id: 'problemList',
  label: 'Problem List',
  labelKey: 'dataSelection.problemList',
  description: 'Standalone problem-list items (FHIR problem-list-item)',
  descriptionKey: 'dataSelection.problemListDesc',
  group: 'patient',
  order: 3,

  filters: [
    {
      key: 'problemListStatus',
      type: 'select',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active Only' },
        { value: 'all', label: 'All Problems' }
      ],
      defaultValue: 'active'
    },
    {
      key: 'problemListTimeRange',
      type: 'select',
      label: 'Time Range',
      options: [
        { value: '1m', label: 'Last Month' },
        { value: '3m', label: 'Last 3 Months' },
        { value: '6m', label: 'Last 6 Months' },
        { value: '1y', label: 'Last Year' },
        { value: '3y', label: 'Last 3 Years' },
        { value: '5y', label: 'Last 5 Years' },
        { value: 'all', label: 'All Time' }
      ],
      defaultValue: 'all'
    }
  ],

  filterComponentKey: 'problemList',

  extractData: (clinicalData) =>
    (clinicalData?.conditions || []).filter(isProblemListItem),

  getCount: (data, filters, allClinicalData) => {
    const byStatus = (filters?.problemListStatus ?? 'active') === 'active' ? data.filter(isActiveCondition) : data
    return withinProblemRange(byStatus, (filters?.problemListTimeRange as string) ?? 'all', allClinicalData).length
  },

  getContextSection: (data, filters, allClinicalData): ClinicalContextSection | null => {
    if (data.length === 0) return null

    const byStatus = (filters?.problemListStatus ?? 'active') === 'active'
      ? data.filter(isActiveCondition)
      : data
    const filtered = withinProblemRange(byStatus, (filters?.problemListTimeRange as string) ?? 'all', allClinicalData)

    if (filtered.length === 0) return null

    const items = filtered.map((c: any) => {
      const name = c.code?.text || c.code?.coding?.[0]?.display || 'Unknown problem'
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
  }
}
