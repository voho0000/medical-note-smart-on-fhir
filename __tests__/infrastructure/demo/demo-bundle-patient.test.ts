import { getPatientDisplayName } from '@/src/core/entities/patient.entity'
import demoBundle from '../../../public/demo/demo-bundle.json'

describe('demo bundle patient identity', () => {
  it('provides both local-script and Romanized display names', () => {
    const patient = demoBundle.entry
      .map((entry: { resource: unknown }) => entry.resource)
      .find((resource: { resourceType?: string }) => resource.resourceType === 'Patient')

    expect(getPatientDisplayName(patient, 'zh-TW')).toBe('陳○明')
    expect(getPatientDisplayName(patient, 'en')).toBe('○-Ming Chen')
  })
})
