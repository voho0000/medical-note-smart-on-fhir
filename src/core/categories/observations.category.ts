// Orphan Observations Category — standalone observations that are NOT
// vitals, NOT lab observations (covered by labReports), and NOT imaging
// observations (covered by imagingReports). These tend to be a low-signal
// catch-all so the category is OFF by default.
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { Observation } from '@/src/shared/types/fhir.types'
import { isWithinTimeRange } from '../utils/date-filter.utils'
import { formatNumberSmart } from '@/features/clinical-summary/reports/utils/number-format.utils'
import { selectOtherObservations } from '../utils/observation-selectors'
import { VitalSignsFilter } from '@/features/data-selection/components/DataFilters'

export const observationsCategory: DataCategory<Observation> = {
  id: 'observations',
  label: 'Other Observations',
  labelKey: 'dataSelection.observations',
  description: 'Standalone observations not covered elsewhere',
  descriptionKey: 'dataSelection.observationsDesc',
  group: 'reports',
  order: 65,

  // Reuses vitalSignsTimeRange filter for consistency with neighbouring vital signs.
  filters: [
    {
      key: 'vitalSignsTimeRange',
      type: 'select',
      label: 'Time Range',
      options: [
        { value: '1w', label: 'Last Week' },
        { value: '1m', label: 'Last Month' },
        { value: '3m', label: 'Last 3 Months' },
        { value: '6m', label: 'Last 6 Months' },
        { value: '1y', label: 'Last Year' },
        { value: 'all', label: 'All Time' }
      ],
      defaultValue: 'all'
    }
  ],

  FilterComponent: VitalSignsFilter,

  extractData: (clinicalData) => {
    // Leftover observations only: NOT lab (-> Lab Reports), NOT imaging
    // (-> Imaging Reports), NOT vital (-> Vital Signs). The exclusion rules are
    // the shared SSOT — see src/core/utils/observation-selectors.ts.
    return selectOtherObservations(clinicalData) as unknown as Observation[]
  },

  getCount: (data, filters) => {
    const timeRange = (filters?.vitalSignsTimeRange as string) || 'all'
    const filtered = timeRange === 'all'
      ? data
      : data.filter((obs) => isWithinTimeRange(obs.effectiveDateTime, timeRange))

    const latestByCode = new Map<string, Observation>()
    for (const obs of filtered) {
      const code = obs.code?.text || 'Unknown'
      const existing = latestByCode.get(code)
      if (!existing || (obs.effectiveDateTime || '') > (existing.effectiveDateTime || '')) {
        latestByCode.set(code, obs)
      }
    }
    return latestByCode.size
  },

  getContextSection: (data, filters): ClinicalContextSection | null => {
    if (data.length === 0) return null

    const timeRange = (filters?.vitalSignsTimeRange as string) || 'all'
    const filtered = timeRange === 'all'
      ? data
      : data.filter((obs) => isWithinTimeRange(obs.effectiveDateTime, timeRange))

    if (filtered.length === 0) return null

    const latestByCode = new Map<string, Observation>()
    for (const obs of filtered) {
      const code = obs.code?.text || 'Unknown'
      const existing = latestByCode.get(code)
      if (!existing || (obs.effectiveDateTime || '') > (existing.effectiveDateTime || '')) {
        latestByCode.set(code, obs)
      }
    }

    const items = Array.from(latestByCode.values())
      .map((obs) => {
        const value = obs.valueQuantity?.value ?? obs.valueString
        const unit = obs.valueQuantity?.unit ? ` ${obs.valueQuantity.unit}` : ''
        const formattedValue = typeof value === 'number' ? formatNumberSmart(value) : value
        return value !== undefined && value !== null
          ? `${obs.code?.text || 'Observation'}: ${formattedValue}${unit}`
          : null
      })
      .filter(Boolean) as string[]

    if (items.length === 0) return null

    return { title: 'Additional Observations', items }
  }
}
