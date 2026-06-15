// Medical Devices Category (FHIR Device — implants / DME)
import type { DataCategory, ClinicalContextSection } from '../interfaces/data-category.interface'
import type { DeviceEntity } from '../entities/clinical-data.entity'
import { getCodeableConceptText } from '../utils/data-grouping.utils'

const deviceName = (d: DeviceEntity): string => {
  const fromType = getCodeableConceptText(d.type)
  if (fromType !== 'Unknown') return fromType
  return d.deviceName?.[0]?.name || 'Device'
}

export const medicalDevicesCategory: DataCategory<DeviceEntity> = {
  id: 'medicalDevices',
  label: 'Medical Devices',
  labelKey: 'dataSelection.medicalDevices',
  description: 'Implants and durable medical equipment',
  descriptionKey: 'dataSelection.medicalDevicesDesc',
  group: 'patient',
  order: 6,

  extractData: (clinicalData) => clinicalData?.devices || [],

  getCount: (data) => data.length,

  getContextSection: (data): ClinicalContextSection | null => {
    if (data.length === 0) return null
    const items = data.map((d) => {
      const meta = [
        d.status ? `status: ${d.status}` : null,
        d.manufacturer ? `mfr: ${d.manufacturer}` : null,
        d.modelNumber ? `model: ${d.modelNumber}` : null,
      ].filter(Boolean).join(', ')
      return meta ? `${deviceName(d)} (${meta})` : deviceName(d)
    })
    return { title: 'Medical Devices', items }
  },
}
