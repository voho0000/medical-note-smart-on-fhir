// Immunizations Category — FHIR R4 Immunization resources (preventive
// vaccinations from 疾病管制署 CDC bridge). Therapeutic vaccines stay in
// the medication list.
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { ImmunizationEntity } from '@/src/core/entities/clinical-data.entity'
import { isWithinTimeRange } from '../utils/date-filter.utils'
import { ImmunizationFilter } from '@/features/data-selection/components/DataFilters'

function vaccineKey(imm: any): string {
  return (
    imm?.vaccineCode?.coding?.[0]?.code ||
    imm?.vaccineCode?.text ||
    imm?.vaccineCode?.coding?.[0]?.display ||
    ''
  )
}

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

  FilterComponent: ImmunizationFilter,

  extractData: (clinicalData) => clinicalData?.immunizations || [],

  getCount: (data, filters) => {
    const timeRange = (filters?.immunizationTimeRange as string) || 'all'
    if (timeRange === 'all') {
      const keys = new Set(data.map((imm: any) => vaccineKey(imm)).filter(Boolean))
      return keys.size || data.length
    }
    const filtered = data.filter((imm: any) =>
      isWithinTimeRange(imm.occurrenceDateTime, timeRange)
    )
    const keys = new Set(filtered.map((imm: any) => vaccineKey(imm)).filter(Boolean))
    return keys.size || filtered.length
  },

  getContextSection: (data, filters): ClinicalContextSection | null => {
    if (!Array.isArray(data) || data.length === 0) return null

    const timeRange = (filters?.immunizationTimeRange as string) || 'all'
    const filtered = timeRange === 'all'
      ? data
      : data.filter((imm: any) => isWithinTimeRange(imm.occurrenceDateTime, timeRange))

    if (filtered.length === 0) return null

    const byKey = new Map<string, { name: string; latest?: string; count: number }>()
    for (const imm of filtered as any[]) {
      const key = vaccineKey(imm)
      if (!key) continue
      const name = vaccineName(imm)
      const date = imm.occurrenceDateTime
      const existing = byKey.get(key)
      if (existing) {
        existing.count += 1
        if (date && (!existing.latest || date > existing.latest)) {
          existing.latest = date
        }
      } else {
        byKey.set(key, { name, latest: date, count: 1 })
      }
    }

    if (byKey.size === 0) return null

    const items = Array.from(byKey.values())
      .sort((a, b) => (b.latest || '').localeCompare(a.latest || ''))
      .map((v) => {
        const datePart = v.latest
          ? ` (last dose: ${new Date(v.latest).toLocaleDateString()})`
          : ''
        const dosesPart = v.count > 1 ? `, ${v.count} doses` : ''
        return `${v.name}${datePart}${dosesPart}`
      })

    return { title: 'Immunizations', items }
  }
}
