// Immunizations Category — FHIR R4 Immunization resources (preventive
// vaccinations from 疾病管制署 CDC bridge). Therapeutic vaccines stay in
// the medication list.
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { ImmunizationEntity } from '@/src/core/entities/clinical-data.entity'
import { isWithinTimeRange } from '../utils/date-filter.utils'

function vaccineName(imm: any): string {
  return (
    imm?.vaccineCode?.text ||
    imm?.vaccineCode?.coding?.[0]?.display ||
    imm?.vaccineCode?.coding?.[0]?.code ||
    'Unknown Vaccine'
  )
}

export const immunizationsCategory: DataCategory<ImmunizationEntity> = {
  id: 'immunizations',
  label: 'Vaccines',
  labelKey: 'dataSelection.immunizations',
  description: 'Preventive vaccinations (FHIR Immunization)',
  descriptionKey: 'dataSelection.immunizationsDesc',
  group: 'medication',
  order: 32,

  filters: [
    {
      key: 'immunizationTimeRange',
      type: 'select',
      label: 'Time Range',
      options: [
        { value: '1y', label: 'Last Year' },
        { value: '3y', label: 'Last 3 Years' },
        { value: '5y', label: 'Last 5 Years' },
        { value: 'all', label: 'All Time' }
      ],
      defaultValue: 'all'
    }
  ],

  filterComponentKey: 'immunization',

  extractData: (clinicalData) => clinicalData?.immunizations || [],

  getCount: (data, filters) => {
    const timeRange = (filters?.immunizationTimeRange as string) || 'all'
    if (timeRange === 'all') return data.length
    const filtered = data.filter((imm: any) =>
      isWithinTimeRange(imm.occurrenceDateTime, timeRange)
    )
    return filtered.length
  },

  getContextSection: (data, filters): ClinicalContextSection | null => {
    if (!Array.isArray(data) || data.length === 0) return null

    const timeRange = (filters?.immunizationTimeRange as string) || 'all'
    const filtered = timeRange === 'all'
      ? data
      : data.filter((imm: any) => isWithinTimeRange(imm.occurrenceDateTime, timeRange))

    if (filtered.length === 0) return null

    const items = [...filtered]
      .sort((a, b) => (b.occurrenceDateTime || '').localeCompare(a.occurrenceDateTime || ''))
      .map((imm) => {
        const datePart = imm.occurrenceDateTime
          ? ` (${new Date(imm.occurrenceDateTime).toLocaleDateString()})`
          : ''
        const status = imm.status || 'unknown'
        const invalid = status === 'entered-in-error' ? '; INVALIDATED—do not treat as administered' : ''
        const meta = [
          `status=${status}${invalid}`,
          imm.lotNumber ? `lot=${imm.lotNumber}` : null,
          imm.manufacturer?.display ? `manufacturer=${imm.manufacturer.display}` : null,
        ].filter(Boolean).join('; ')
        return `${vaccineName(imm)}${datePart} [${meta}]`
      })

    return { title: 'Immunizations', items }
  }
}
