// Encounters Category
// Encounter-centric view: each visit grouped with its diagnoses, medications,
// tests, and procedures. The actual context generation lives in
// useEncountersContext (see clinical-context hooks). This category exists for
// the data-selection UI (count, label, toggle).
import type { DataCategory } from '../interfaces/data-category.interface'
import { isWithinTimeRange } from '../utils/date-filter.utils'

export const encountersCategory: DataCategory<any> = {
  id: 'encounters',
  label: 'Visits',
  labelKey: 'dataSelection.encounters',
  description: 'Encounter-centric: each visit with its diagnoses, medications, tests',
  descriptionKey: 'dataSelection.encountersDesc',
  group: 'visit',
  order: 5,

  filters: [
    {
      key: 'encounterTimeRange',
      type: 'select',
      label: 'Time Range',
      options: [
        { value: '3m', label: 'Last 3 Months' },
        { value: '6m', label: 'Last 6 Months' },
        { value: '1y', label: 'Last Year' },
        { value: '3y', label: 'Last 3 Years' },
        { value: '5y', label: 'Last 5 Years' },
        { value: 'all', label: 'All Time' },
      ],
      defaultValue: '6m',
    },
  ],

  extractData: (clinicalData) => clinicalData?.encounters || [],

  // Count visits whose period.start falls inside the selected range. Mirrors
  // the hook's graceful fallback: if NOTHING is in range, report the full count
  // so the badge matches what the context will actually show (the hook falls
  // back to the most-recent visits rather than rendering an empty section).
  getCount: (data, filters) => {
    const range = (filters?.encounterTimeRange as string) || 'all'
    if (!range || range === 'all') return data.length
    const inRange = data.filter((e: any) =>
      e?.period?.start ? isWithinTimeRange(e.period.start, range) : false
    )
    return inRange.length > 0 ? inRange.length : data.length
  },

  // Context generation handled by useEncountersContext hook in aggregator.
  // Returning null here means the registry path is bypassed; the legacy hook
  // path produces the actual section text.
  getContextSection: () => null,
}
