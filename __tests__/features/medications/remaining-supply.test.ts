import {
  isLegacyRemainingSupplyMedication,
  isSnapshotFromToday,
  partitionMedicationRecords,
  relatedMedicationNavigationTarget,
  resolveSinglePrescriptionRemainingDisplay,
  singlePrescriptionRemainingDays,
} from '@/features/clinical-summary/medications/utils/remaining-supply'
import type {
  MedicationEntity,
  MedicationRemainingSummaryEntity,
} from '@/src/core/entities/clinical-data.entity'

describe('MediCloud remaining-supply readers', () => {
  it('reads a zero-day IMUE0008 snapshot from the exact canonical extension', () => {
    const medication: MedicationEntity = {
      id: 'prescription-1',
      extension: [{
        url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-single-prescription-remaining-days',
        valueQuantity: { value: 0, unit: 'days', code: 'd' },
      }],
    }

    expect(singlePrescriptionRemainingDays(medication)).toBe(0)
  })

  it('ignores a lookalike extension URL and invalid values', () => {
    expect(singlePrescriptionRemainingDays({
      id: 'lookalike',
      extension: [{
        url: 'https://other.example/StructureDefinition/medcloud-single-prescription-remaining-days',
        valueQuantity: { value: 7 },
      }],
    })).toBeUndefined()
    expect(singlePrescriptionRemainingDays({
      id: 'fraction',
      extension: [{
        url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-single-prescription-remaining-days',
        valueQuantity: { value: 1.5 },
      }],
    })).toBeUndefined()
  })

  it('uses the local calendar day to determine whether a snapshot is current', () => {
    const now = new Date(2026, 7, 28, 15, 0, 0).getTime()
    expect(isSnapshotFromToday('2026-08-28T01:00:00+08:00', now)).toBe(true)
    expect(isSnapshotFromToday('2026-08-27T23:59:59+08:00', now)).toBe(false)
    expect(isSnapshotFromToday(undefined, now)).toBe(false)
  })

  it('prefers today cloud value even when it differs, then falls back to the App estimate', () => {
    const medication: MedicationEntity = {
      id: 'prescription-1',
      _sourceCapturedAt: '2026-08-28T10:00:00+08:00',
      extension: [{
        url: 'https://cloud-wildcatch.invalid/fhir/StructureDefinition/medcloud-single-prescription-remaining-days',
        valueQuantity: { value: 7 },
      }],
    }
    const today = new Date(2026, 7, 28, 15, 0, 0).getTime()
    const tomorrow = new Date(2026, 7, 29, 15, 0, 0).getTime()

    expect(resolveSinglePrescriptionRemainingDisplay(medication, 6, today))
      .toEqual(expect.objectContaining({
        displayDays: 7,
        displaySource: 'cloud-single',
        isCurrent: true,
      }))
    expect(resolveSinglePrescriptionRemainingDisplay(medication, 5, tomorrow))
      .toEqual(expect.objectContaining({
        displayDays: 5,
        displaySource: 'app-estimate',
        isCurrent: false,
      }))
  })

  it('keeps a legacy IMUE0120 MedicationRequest out of prescription consumers', () => {
    const legacy: MedicationEntity = {
      id: 'legacy-remaining',
      meta: {
        tag: [{
          system: 'https://cloud-wildcatch.invalid/fhir/CodeSystem/source-module',
          code: 'imue0120',
        }],
      },
      dosageInstruction: [{ text: 'ASORDER' }],
    }
    const prescription: MedicationEntity = {
      id: 'prescription-qod',
      dosageInstruction: [{ text: 'QOD' }],
    }

    expect(isLegacyRemainingSupplyMedication(legacy)).toBe(true)
    const result = partitionMedicationRecords([legacy, prescription])
    expect(result.prescriptions.map((medication) => medication.id))
      .toEqual(['prescription-qod'])
    expect(result.legacyRemainingSupply.map((medication) => medication.id))
      .toEqual(['legacy-remaining'])
  })

  it('marks related-medication navigation to reveal the owning refill history', () => {
    const summary: MedicationRemainingSummaryEntity = {
      id: 'remaining-1',
      groupName: 'THYROXINE，一般錠劑膠囊劑',
      sourceMedicationDate: '2026-08-05',
      relatedMedicationRequestReferences: ['MedicationRequest/med-1'],
    }

    expect(relatedMedicationNavigationTarget(
      summary,
      'MedicationRequest/med-1',
    )).toEqual({
      resourceType: 'MedicationRequest',
      resourceId: 'med-1',
      display: 'THYROXINE，一般錠劑膠囊劑',
      date: '2026-08-05',
      expandMedicationHistory: true,
    })
  })
})
