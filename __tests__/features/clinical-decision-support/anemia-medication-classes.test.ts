import type { MedicationEntity } from '@/src/core/entities/clinical-data.entity'
import {
  assessMedicationClass,
  classifyCurrentMedications,
} from '@/features/clinical-decision-support/adapters/medication-classifier'

/**
 * Iron, ESAs, and HIF-PHIs, which the CKD anemia treatment card branches on.
 *
 * Two things are easy to get wrong here and are pinned deliberately:
 * ESAs and HIF-PHIs share the ATC B03XA group, so a prefix match would merge
 * the two agent classes the guideline asks to be told apart; and the NHI drug
 * master resolves the ingredient behind a trade-name-only prescription, so
 * classification has to read it.
 */

function medication(overrides: Partial<MedicationEntity>): MedicationEntity {
  return {
    id: overrides.id ?? 'med-1',
    status: 'active',
    ...overrides,
  } as MedicationEntity
}

function classesOf(entity: MedicationEntity): string[] {
  const { classified } = classifyCurrentMedications([entity])
  return classified.map((item) => item.classId).sort()
}

describe('anemia medication classes', () => {
  it('reads iron from an ATC code with no ingredient name in the prescription', () => {
    expect(classesOf(medication({
      medicationCodeableConcept: { text: '注射劑' },
      drugTerminology: { source: 'nhi-official-drug-master', snapshotId: 's1', atcCode: 'B03AC' },
    }))).toEqual(['iron-therapy'])
  })

  it('reads the ingredient the drug master resolved behind a trade name', () => {
    expect(classesOf(medication({
      medicationCodeableConcept: { text: 'MIRCERA 50MCG/0.3ML' },
      drugTerminology: {
        source: 'nhi-official-drug-master',
        snapshotId: 's1',
        ingredientText: 'Methoxy polyethylene glycol-epoetin beta',
      },
    }))).toEqual(['erythropoiesis-stimulating-agent'])
  })

  it('separates ESAs from HIF-PHIs inside the shared ATC B03XA group', () => {
    const esa = medication({
      medicationCodeableConcept: { text: '注射劑' },
      drugTerminology: { source: 'nhi-official-drug-master', snapshotId: 's1', atcCode: 'B03XA02' },
    })
    const hifPhi = medication({
      medicationCodeableConcept: { text: '口服' },
      drugTerminology: { source: 'nhi-official-drug-master', snapshotId: 's1', atcCode: 'B03XA05' },
    })
    expect(classesOf(esa)).toEqual(['erythropoiesis-stimulating-agent'])
    expect(classesOf(hifPhi)).toEqual(['hif-phi'])
  })

  it('counts ferric citrate as a phosphate binder and not as iron therapy', () => {
    // It is dispensed to bind phosphate. Reading it as iron therapy would make
    // an untreated iron deficiency look as though it were already treated.
    expect(classesOf(medication({
      medicationCodeableConcept: { text: 'NEPHOXIL 500MG (Ferric citrate)' },
    }))).toEqual(['non-calcium-phosphate-binder'])
  })

  it('separates phosphate binders from the potassium binders sharing ATC V03AE', () => {
    const calciumBinder = medication({
      medicationCodeableConcept: { text: '口服' },
      drugTerminology: { source: 'nhi-official-drug-master', snapshotId: 's1', atcCode: 'V03AE07' },
    })
    const potassiumBinder = medication({
      medicationCodeableConcept: { text: 'Kalimate powder' },
      drugTerminology: { source: 'nhi-official-drug-master', snapshotId: 's1', atcCode: 'V03AE01' },
    })
    expect(classesOf(calciumBinder)).toEqual(['calcium-based-phosphate-binder'])
    expect(classesOf(potassiumBinder)).toEqual([])
  })

  it('reports the prescription state the anemia card branches on', () => {
    const result = classifyCurrentMedications([
      medication({
        id: 'iron-1',
        status: 'active',
        _sourceResourceType: 'MedicationStatement',
        medicationCodeableConcept: { text: 'Ferrous sulfate 300mg' },
      }),
    ])
    expect(assessMedicationClass(result, 'iron-therapy').state).toBe('confirmed-current')
    expect(assessMedicationClass(result, 'erythropoiesis-stimulating-agent').state)
      .toBe('not-found')
  })
})
