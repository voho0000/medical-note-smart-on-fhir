import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

const patient = { resourceType: 'Patient', id: 'patient-1' }

function remainingBasic(id: string, system = 'https://cloud-wildcatch.invalid/fhir/CodeSystem/medcloud-basic-resource-type') {
  return {
    resourceType: 'Basic',
    id,
    code: {
      coding: [{ system, code: 'medication-remaining-summary' }],
      text: 'THYROXINE，一般錠劑膠囊劑',
    },
    extension: [{
      url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-medication-remaining-summary',
      extension: [
        { url: 'adherenceExpectedRemainingDays', valueQuantity: { value: 14, code: 'd' } },
        { url: 'relatedMedicationRequest', valueReference: { reference: 'MedicationRequest/med-1' } },
      ],
    }],
  }
}

describe('LocalBundleService.parse — MediCloud v0.8 remaining supply', () => {
  it('keeps canonical Basic summaries out of the medication collection', () => {
    const data = LocalBundleService.parse({
      resourceType: 'Bundle',
      timestamp: '2026-08-28T02:00:00Z',
      entry: [
        { resource: patient },
        { resource: {
          resourceType: 'MedicationRequest',
          id: 'med-1',
          status: 'active',
          medicationCodeableConcept: { text: 'ELTROXIN 50 mcg' },
          extension: [{
            url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-single-prescription-remaining-days',
            valueQuantity: { value: 7, code: 'd' },
          }],
        } },
        { resource: remainingBasic('summary-1') },
      ],
    })

    expect(data?.collection.medications).toHaveLength(1)
    expect(data?.collection.medications[0]._sourceCapturedAt)
      .toBe('2026-08-28T02:00:00Z')
    expect(data?.collection.medicationRemainingSummaries).toEqual([
      expect.objectContaining({
        id: 'summary-1',
        adherenceExpectedRemainingDays: 14,
        calculatedAt: '2026-08-28T02:00:00Z',
      }),
    ])
  })

  it('ignores ordinary or lookalike Basic resources', () => {
    const data = LocalBundleService.parse({
      resourceType: 'Bundle',
      entry: [
        { resource: patient },
        { resource: remainingBasic('lookalike', 'https://other.example/CodeSystem/medcloud-basic-resource-type') },
        { resource: {
          resourceType: 'Basic',
          id: 'ordinary-basic',
          code: { text: 'Not a medication summary' },
        } },
      ],
    })

    expect(data?.collection.medicationRemainingSummaries).toEqual([])
  })
})
