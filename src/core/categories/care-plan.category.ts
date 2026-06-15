// Care Plans Category (FHIR CarePlan — plan of care / 照護計畫)
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { CarePlanEntity } from '../entities/clinical-data.entity'
import { getCodeableConceptText } from '../utils/data-grouping.utils'

const planTitle = (cp: CarePlanEntity): string =>
  cp.title ||
  (getCodeableConceptText(cp.category?.[0]) !== 'Unknown'
    ? getCodeableConceptText(cp.category?.[0])
    : cp.description) ||
  'Care plan'

const isActive = (cp: CarePlanEntity): boolean => cp.status === 'active'

export const carePlansCategory: DataCategory<CarePlanEntity> = {
  id: 'carePlans',
  label: 'Care Plans',
  labelKey: 'dataSelection.carePlans',
  description: 'Disease-management / home-care plans',
  descriptionKey: 'dataSelection.carePlansDesc',
  group: 'patient',
  order: 8,

  filters: [
    {
      key: 'carePlanStatus',
      type: 'select',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active Only' },
        { value: 'all', label: 'All Plans' },
      ],
      defaultValue: 'active',
    },
  ],

  filterComponentKey: undefined,

  extractData: (clinicalData) => clinicalData?.carePlans || [],

  getCount: (data, filters) => {
    const activeOnly = (filters.carePlanStatus ?? 'active') === 'active'
    return (activeOnly ? data.filter(isActive) : data).length
  },

  getContextSection: (data, filters): ClinicalContextSection | null => {
    if (data.length === 0) return null
    const activeOnly = (filters.carePlanStatus ?? 'active') === 'active'
    const filtered = activeOnly ? data.filter(isActive) : data
    if (filtered.length === 0) return null

    const items = filtered.map((cp) => {
      const status = cp.status ? ` – ${cp.status}` : ''
      const period = [cp.period?.start, cp.period?.end]
        .filter(Boolean)
        .map((d) => new Date(d as string).toLocaleDateString())
        .join(' ~ ')
      const periodPart = period ? ` (${period})` : ''
      const activities = (cp.activity || [])
        .map((a) => a.detail?.description || getCodeableConceptText(a.detail?.code, ''))
        .filter(Boolean)
      const activityPart = activities.length ? `: ${activities.join('、')}` : ''
      return `${planTitle(cp)}${status}${periodPart}${activityPart}`.trim()
    })
    return { title: 'Care Plans', items }
  },
}
