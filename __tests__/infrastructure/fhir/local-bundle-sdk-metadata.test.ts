import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'
import type { ClinicalSourceMetadata } from '@/src/core/entities/clinical-data.entity'

describe('LocalBundleService SDK conversion metadata', () => {
  it('keeps the encrypted-sidecar summary and excludes the converter software Device', () => {
    const metadata: ClinicalSourceMetadata = {
      source: 'health-bank-sdk-json',
      convertedAt: '2000-01-01T00:00:00Z',
      converterVersion: '0.1.0',
      resourceCounts: { Patient: 1, Device: 2 },
      warnings: [],
      labDuplicateMerge: {
        sourceCount: 2,
        convertedCount: 1,
        mergedCount: 1,
        conflictingValueGroupCount: 0,
      },
      unitInference: {
        policyVersion: 'sdk-unit-policy-v1',
        inferredCount: 1,
        unitlessCount: 0,
        unresolvedCount: 0,
      },
      sourceCapabilities: [],
    }
    const parsed = LocalBundleService.parse({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'patient-1' } },
        {
          resource: {
            resourceType: 'Device',
            id: 'sdk-unit-policy-v1',
            deviceName: [{ name: 'NHI-FHIR-Bridge sdk-unit-policy-v1' }],
          },
        },
        {
          resource: {
            resourceType: 'Device',
            id: 'implant-1',
            patient: { reference: 'Patient/patient-1' },
            deviceName: [{ name: 'Pacemaker' }],
          },
        },
      ],
    }, metadata)

    expect(parsed?.collection.devices.map((device) => device.id)).toEqual(['implant-1'])
    expect(parsed?.collection.sourceMetadata).toEqual(metadata)
  })
})
