// Unit tests for the _sourceResourceType marker that LocalBundleService.parse
// stamps onto medications during ingestion. The marker lets MedListCard
// distinguish bridge-style MedicationRequest data (the dominant 80% source,
// which gets no extra UI) from imported IPS-style MedicationStatement data
// (which gets a card-level "目前服用中" hint).
//
// Sanity checks here lock in:
//   - MedicationRequest in → marker = 'MedicationRequest'
//   - MedicationStatement in → marker = 'MedicationStatement'
//   - MedicationStatement with medicationReference resolves the linked
//     Medication.code AND still carries the marker
//   - A mixed bundle keeps both markers distinct on the merged list
//   - Pure-bridge bundles (just MedicationRequest) are unchanged in shape

import { LocalBundleService } from '@/src/infrastructure/fhir/services/local-bundle.service'

function bundle(resources: any[]) {
  return {
    resourceType: 'Bundle',
    entry: resources.map((r) => ({ resource: r })),
  }
}

const patient = { resourceType: 'Patient', id: 'p1' }

describe('LocalBundleService.parse — _sourceResourceType marker', () => {
  it('stamps MedicationRequest as the source for bridge-style entries', () => {
    const data = LocalBundleService.parse(
      bundle([
        patient,
        {
          resourceType: 'MedicationRequest',
          id: 'mr1',
          status: 'active',
          medicationCodeableConcept: { text: 'Amlodipine 5 mg' },
          authoredOn: '2026-01-15',
        },
      ]),
    )
    expect(data).not.toBeNull()
    expect(data!.collection.medications).toHaveLength(1)
    expect(data!.collection.medications[0]._sourceResourceType).toBe('MedicationRequest')
  })

  it('stamps MedicationStatement as the source for IPS-style entries', () => {
    const data = LocalBundleService.parse(
      bundle([
        patient,
        {
          resourceType: 'MedicationStatement',
          id: 'ms1',
          status: 'active',
          medicationCodeableConcept: { text: 'Aspirin 81 mg' },
          effectiveDateTime: '2026-04-01',
          dosage: [{ text: '1 tab PO daily' }],
        },
      ]),
    )
    expect(data).not.toBeNull()
    expect(data!.collection.medications).toHaveLength(1)
    const med = data!.collection.medications[0]
    expect(med._sourceResourceType).toBe('MedicationStatement')
    // Field-name normalization should still run alongside the marker so the
    // rest of the pipeline keeps working.
    expect(med.authoredOn).toBe('2026-04-01')
    expect(med.dosageInstruction?.[0]?.text).toBe('1 tab PO daily')
  })

  it('resolves MedicationStatement.medicationReference and keeps the marker', () => {
    const data = LocalBundleService.parse(
      bundle([
        patient,
        {
          resourceType: 'Medication',
          id: 'med-aspirin',
          code: { text: 'Aspirin 81 mg', coding: [{ code: '1191', display: 'aspirin' }] },
        },
        {
          resourceType: 'MedicationStatement',
          id: 'ms2',
          status: 'active',
          medicationReference: { reference: 'Medication/med-aspirin' },
          effectiveDateTime: '2026-04-01',
        },
      ]),
    )
    expect(data).not.toBeNull()
    const med = data!.collection.medications[0]
    expect(med._sourceResourceType).toBe('MedicationStatement')
    // The reference resolution should have promoted Medication.code into
    // medicationCodeableConcept so display helpers find a name.
    expect(med.medicationCodeableConcept?.text).toBe('Aspirin 81 mg')
  })

  it('distinguishes both source types in a mixed bundle', () => {
    const data = LocalBundleService.parse(
      bundle([
        patient,
        {
          resourceType: 'MedicationRequest',
          id: 'mr1',
          status: 'active',
          medicationCodeableConcept: { text: 'Lisinopril 10 mg' },
          authoredOn: '2026-01-15',
        },
        {
          resourceType: 'MedicationStatement',
          id: 'ms1',
          status: 'active',
          medicationCodeableConcept: { text: 'Metformin 500 mg' },
          effectiveDateTime: '2026-04-01',
        },
      ]),
    )
    expect(data).not.toBeNull()
    const meds = data!.collection.medications
    expect(meds).toHaveLength(2)
    const sources = meds.map((m) => m._sourceResourceType).sort()
    expect(sources).toEqual(['MedicationRequest', 'MedicationStatement'])
  })
})
