import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { CKD_ANEMIA_GUIDELINE_PACK } from '@voho0000/personalized-care'
import type {
  ConditionEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'

const ICD10 = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC = 'http://loinc.org'
const UCUM = 'http://unitsofmeasure.org'

function lab(
  id: string,
  code: string,
  value: number,
  unit: string,
  date = '2026-07-01',
): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    code: { coding: [{ system: LOINC, code }] },
    valueQuantity: { value, unit, code: unit, system: UCUM },
  }
}

const ckd: ConditionEntity = {
  id: 'ckd',
  clinicalStatus: 'active',
  verificationStatus: 'confirmed',
  code: { coding: [{ system: ICD10, code: 'N18.4', display: 'CKD stage 4' }] },
}

describe('CKD anemia differential pathway', () => {
  it('extracts governed anemia labs and routes microcytic iron deficiency without auto-ordering treatment', () => {
    const profile = createFhirCdssPatientProfile({
      patient: {
        id: 'anemia-patient',
        resourceType: 'Patient',
        age: 73,
        gender: 'male',
      },
      conditions: [ckd],
      encounters: [],
      observations: [
        lab('egfr', '77147-7', 24, 'mL/min/1.73m2'),
        lab('hb-old', '718-7', 10.1, 'g/dL', '2026-05-01'),
        lab('hb-current', '718-7', 9.2, 'g/dL'),
        lab('mcv', '787-2', 75, 'fL'),
        lab('ferritin', '2276-4', 30, 'ng/mL'),
        lab('tsat', '2502-3', 15, '%'),
      ],
      medications: [],
      allergies: [],
      carePlans: [],
      procedures: [],
      immunizations: [],
      now: new Date('2026-07-31T00:00:00+08:00'),
    })

    expect(CKD_ANEMIA_GUIDELINE_PACK.applies(profile)).toBe(true)
    expect(profile.facts.hemoglobinTrend.sources).toHaveLength(2)
    expect(profile.facts.meanCorpuscularVolume.numericValue).toBe(75)
    expect(profile.facts.ferritin.numericValue).toBe(30)
    expect(profile.facts.transferrinSaturation.numericValue).toBe(15)

    const result = CKD_ANEMIA_GUIDELINE_PACK.build({
      profile,
      locale: 'zh-TW',
    })
    expect(result.knowledgePacks?.map((item) => item.id)).toEqual([
      'kdigo-anemia-2026',
    ])
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-anemia-detection-monitoring',
    )).toMatchObject({
      status: 'review',
      title: expect.stringContaining('符合 CKD 貧血定義'),
    })
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-anemia-initial-evaluation',
    )).toMatchObject({
      status: 'needs-data',
      missingData: expect.arrayContaining(['Reticulocyte（網狀紅血球，貧血鑑別用）']),
    })
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-anemia-iron-pathway',
    )).toMatchObject({
      priority: 'high',
      status: 'review',
      title: expect.stringContaining('評估失血來源'),
      safetyBoundary: expect.stringContaining('不自動產生鐵劑建議'),
    })
    expect(result.recommendations.find(
      (item) => item.id === 'ckd-anemia-expanded-evaluation-esa-safety',
    )).toMatchObject({
      priority: 'high',
      title: expect.stringContaining('ESA／輸血風險效益評估'),
      safetyBoundary: expect.stringContaining('不開立 ESA'),
    })
  })
})
