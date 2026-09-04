import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
import {
  assessMedicationClass,
  classifyCurrentMedications,
} from '@/features/clinical-decision-support/adapters/medication-classifier'

/**
 * The antithrombotic and heart-failure add-on classes the heart-failure pack
 * added. Both routes into a class are pinned: the governed ATC code the NHI
 * drug master resolves, and the ingredient or trade name in the prescription
 * text, because a real record may carry only one of the two.
 *
 * ATC codes below are taken from the vendored WHO ATC hierarchy and the NHI
 * drug master snapshot, not from memory: aspirin B01AC06 (and N02BA01 as the
 * analgesic salicylate), clopidogrel B01AC04, ticlopidine B01AC05, prasugrel
 * B01AC22, ticagrelor B01AC24.
 */

function medication(overrides: Partial<MedicationEntity>): MedicationEntity {
  return {
    id: overrides.id ?? 'med-1',
    status: 'active',
    ...overrides,
  } as MedicationEntity
}

type DrugTerminology = NonNullable<MedicationEntity['drugTerminology']>

function drugMaster(fields: Partial<DrugTerminology>): DrugTerminology {
  return { source: 'nhi-official-drug-master', snapshotId: 's1', ...fields }
}

const NOW = new Date('2026-07-29T00:00:00Z')

function stateOf(entities: readonly MedicationEntity[], classId: string) {
  return assessMedicationClass(
    classifyCurrentMedications(entities, NOW),
    classId as Parameters<typeof assessMedicationClass>[1],
  ).state
}

describe('antithrombotic medication classes', () => {
  it('reads aspirin from its antiplatelet ATC code with no ingredient name', () => {
    expect(stateOf([medication({
      medicationCodeableConcept: { text: '腸溶微粒膠囊 100 毫克' },
      drugTerminology: drugMaster({ atcCode: 'B01AC06' }),
    })], 'aspirin')).toBe('confirmed-current')
  })

  it('reads aspirin from the prescription text alone', () => {
    expect(stateOf([medication({
      medicationCodeableConcept: { text: 'BOKEY ENTERIC-MICROENCAPSULATED CAPSULES 100MG (ASPIRIN)' },
    })], 'aspirin')).toBe('confirmed-current')
  })

  it('reads clopidogrel as a P2Y12 inhibitor from its ATC code', () => {
    expect(stateOf([medication({
      medicationCodeableConcept: { text: '膜衣錠 75 毫克' },
      drugTerminology: drugMaster({ atcCode: 'B01AC04' }),
    })], 'p2y12-inhibitor')).toBe('confirmed-current')
  })

  it('reads clopidogrel as a P2Y12 inhibitor from a trade name the drug master resolved', () => {
    expect(stateOf([medication({
      medicationCodeableConcept: { text: '"生達" 適風妥膜衣錠75毫克' },
      drugTerminology: drugMaster({ ingredientText: 'CLOPIDOGREL 75 MG' }),
    })], 'p2y12-inhibitor')).toBe('confirmed-current')
  })

  it('keeps aspirin out of the P2Y12 class despite the shared ATC B01AC group', () => {
    // B01AC also holds aspirin, dipyridamole and cilostazol, none of which act
    // on P2Y12, so the class is listed code by code rather than by prefix.
    const aspirin = [medication({
      medicationCodeableConcept: { text: 'ASPIRIN 100 MG' },
      drugTerminology: drugMaster({ atcCode: 'B01AC06' }),
    })]
    expect(stateOf(aspirin, 'p2y12-inhibitor')).toBe('not-found')
    expect(stateOf(aspirin, 'aspirin')).toBe('confirmed-current')
  })

  it('keeps unfractionated heparin out of the low-molecular-weight class', () => {
    // B01AB01 is plain heparin; only the LMWH members of the group count.
    expect(stateOf([medication({
      medicationCodeableConcept: { text: 'HEPARIN SODIUM INJECTION' },
      drugTerminology: drugMaster({ atcCode: 'B01AB01' }),
    })], 'low-molecular-weight-heparin')).toBe('not-found')
    expect(stateOf([medication({
      medicationCodeableConcept: { text: 'CLEXANE INJECTION' },
      drugTerminology: drugMaster({ atcCode: 'B01AB05' }),
    })], 'low-molecular-weight-heparin')).toBe('confirmed-current')
  })

  it('reads a DOAC without pulling in the parenteral direct thrombin inhibitors', () => {
    expect(stateOf([medication({
      medicationCodeableConcept: { text: 'Xarelto film-coated tablets 20mg' },
      drugTerminology: drugMaster({ atcCode: 'B01AF01' }),
    })], 'direct-oral-anticoagulant')).toBe('confirmed-current')
    // B01AE03 argatroban shares the direct-thrombin-inhibitor group with oral
    // dabigatran (B01AE07) but is an infusion, not a DOAC.
    expect(stateOf([medication({
      medicationCodeableConcept: { text: 'ARGATROBAN INJECTION' },
      drugTerminology: drugMaster({ atcCode: 'B01AE03' }),
    })], 'direct-oral-anticoagulant')).toBe('not-found')
  })

  it('reads warfarin as a vitamin K antagonist', () => {
    expect(stateOf([medication({
      medicationCodeableConcept: { text: 'COUMADIN TABLETS 1MG' },
      drugTerminology: drugMaster({ atcCode: 'B01AA03' }),
    })], 'vitamin-k-antagonist')).toBe('confirmed-current')
  })
})

describe('heart-failure add-on medication classes', () => {
  it('reads ivabradine, vericiguat and digoxin from their ATC codes', () => {
    expect(stateOf([medication({
      medicationCodeableConcept: { text: '膜衣錠 5 毫克' },
      drugTerminology: drugMaster({ atcCode: 'C01EB17' }),
    })], 'ivabradine')).toBe('confirmed-current')
    expect(stateOf([medication({
      medicationCodeableConcept: { text: 'Verquvo 2.5mg' },
      drugTerminology: drugMaster({ atcCode: 'C01DX22' }),
    })], 'vericiguat')).toBe('confirmed-current')
    expect(stateOf([medication({
      medicationCodeableConcept: { text: 'LANOXIN DIGOXIN TABLETS 0.25MG' },
      drugTerminology: drugMaster({ atcCode: 'C01AA05' }),
    })], 'digoxin')).toBe('confirmed-current')
  })

  it('needs both halves before reading hydralazine／ISDN as prescribed', () => {
    // No fixed-dose product exists in Taiwan, so the regimen arrives as two
    // records. Either one alone is a different therapy: hydralazine is an
    // antihypertensive and a nitrate is anti-anginal.
    const hydralazine = medication({
      id: 'hydralazine-1',
      medicationCodeableConcept: { text: 'APRESOLINE S.C. TABLETS 25MG (HYDRALAZINE)' },
      drugTerminology: drugMaster({ atcCode: 'C02DB02' }),
    })
    const isdn = medication({
      id: 'isdn-1',
      medicationCodeableConcept: { text: 'ISOBIDE TABLETS 10MG' },
      drugTerminology: drugMaster({ atcCode: 'C01DA08' }),
    })

    expect(stateOf([hydralazine], 'hydralazine-isdn')).toBe('not-found')
    expect(stateOf([isdn], 'hydralazine-isdn')).toBe('not-found')

    const both = assessMedicationClass(
      classifyCurrentMedications([hydralazine, isdn], NOW),
      'hydralazine-isdn',
    )
    expect(both.state).toBe('confirmed-current')
    // Both records are kept so the card can cite what it read.
    expect(both.medications.map((item) => item.medication.id).sort()).toEqual([
      'hydralazine-1', 'isdn-1',
    ])
  })

  it('does not read a lapsed nitrate as half of a current hydralazine／ISDN regimen', () => {
    const hydralazine = medication({
      id: 'hydralazine-1',
      medicationCodeableConcept: { text: 'HYDRALAZINE HYDROCHLORIDE TABLETS 50MG' },
    })
    const lapsedIsdn = medication({
      id: 'isdn-old',
      status: 'completed',
      authoredOn: '2026-01-01',
      medicationCodeableConcept: { text: 'ISOSORBIDE DINITRATE 10MG' },
      dispenseRequest: { expectedSupplyDuration: { value: 30, code: 'd' } },
    } as Partial<MedicationEntity>)

    expect(stateOf([hydralazine, lapsedIsdn], 'hydralazine-isdn')).toBe('not-found')
  })
})
