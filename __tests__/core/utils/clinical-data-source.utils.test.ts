import { detectClinicalDataSource } from '@/src/core/utils/clinical-data-source.utils'

const medcloud = { meta: { source: 'https://medcloud2.nhi.gov.tw/', tag: [{ system: 'https://cloud-wildcatch.invalid/fhir/CodeSystem/source-module' }] } }
const healthBank = { meta: { source: 'nhi-fhir-bridge/scraper' } }

describe('detectClinicalDataSource', () => {
  it('reads the bridge from each resource\'s own provenance', () => {
    expect(detectClinicalDataSource({ observations: [medcloud], medications: [{}] })).toBe('nhi-medcloud')
    expect(detectClinicalDataSource({ encounters: [healthBank] })).toBe('nhi-health-bank')
  })

  it('does not mistake the MediCloud bridge\'s vendored health-bank mapper for 健康存摺', () => {
    // The MediCloud bridge vendors the 健康存摺 mapper, so its resources can
    // also say nhi-fhir-bridge; the MediCloud marker decides.
    const vendored = { meta: { source: 'nhi-fhir-bridge/scraper', tag: [{ system: 'https://cloud-wildcatch.invalid/fhir/source-program' }] } }
    expect(detectClinicalDataSource({ observations: [vendored, medcloud] })).toBe('nhi-medcloud')
  })

  it('treats a mixed or unmarked chart as other', () => {
    expect(detectClinicalDataSource({ observations: [medcloud], encounters: [healthBank] })).toBe('other')
    expect(detectClinicalDataSource({ observations: [{}] })).toBe('other')
    expect(detectClinicalDataSource(null)).toBe('other')
  })
})
