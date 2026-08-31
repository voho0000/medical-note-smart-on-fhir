import {
  getPatientDisplayName,
  type PatientEntity,
} from '@/src/core/entities/patient.entity'
import demoBundle from '../../../public/demo/demo-bundle.json'

function isPatientEntity(resource: unknown): resource is PatientEntity {
  if (!resource || typeof resource !== 'object') return false
  const candidate = resource as { resourceType?: unknown; id?: unknown }
  return candidate.resourceType === 'Patient' && typeof candidate.id === 'string'
}

describe('demo bundle patient identity', () => {
  it('provides both local-script and Romanized display names', () => {
    const patient = demoBundle.entry
      .map((entry: { resource: unknown }) => entry.resource)
      .find(isPatientEntity)

    expect(patient).toBeDefined()
    expect(getPatientDisplayName(patient ?? null, 'zh-TW')).toBe('陳○明')
    expect(getPatientDisplayName(patient ?? null, 'en')).toBe('○-Ming Chen')
  })
})
