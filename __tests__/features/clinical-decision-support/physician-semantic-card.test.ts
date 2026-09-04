/**
 * Re-homed from `ckd-guidance.test.ts` when the CDSS adapters and rule suites
 * moved to `@voho0000/personalized-care-fhir` / `@voho0000/personalized-care`.
 *
 * The rules themselves are covered in the package repo. What stays here is the
 * app's own presentation seam: `buildPhysicianSemanticCard` turning a real
 * pack recommendation into the card shape the renderer draws. Without this the
 * util's `guidelineRules` handling has no coverage at all.
 */
import { createFhirCdssPatientProfile } from '@voho0000/personalized-care-fhir'
import { CKD_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { buildPhysicianSemanticCard } from '@/features/clinical-decision-support/utils/build-physician-semantic-card'
import type { PatientEntity } from '@/src/core/entities/patient.entity'
import type {
  CarePlanEntity,
  EncounterEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'
const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'

const patient: PatientEntity = {
  id: 'ckd-patient',
  resourceType: 'Patient',
  age: 72,
}

const encounter: EncounterEntity = {
  id: 'ckd-encounter',
  status: 'finished',
  period: { start: '2026-06-25T00:00:00+08:00' },
  reasonCode: [
    {
      coding: [{
        system: ICD10_SYSTEM,
        code: 'E11.9',
        display: 'Type 2 diabetes mellitus',
      }],
    },
    {
      coding: [{
        system: ICD10_SYSTEM,
        code: 'N18.32',
        display: 'Chronic kidney disease, stage 3b',
      }],
    },
  ],
}

function egfr(id: string, date: string, value: number): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: date,
    code: {
      coding: [{
        system: LOINC_SYSTEM,
        code: '77147-7',
        display: 'Glomerular filtration rate',
      }],
    },
    valueQuantity: {
      value,
      unit: 'mL/min/1.73m2',
      system: UCUM_SYSTEM,
      code: 'mL/min/1.73m2',
    },
  }
}

const semiquantitativeUacr: ObservationEntity = {
  id: 'semiquant-uacr',
  resourceType: 'Observation',
  status: 'final',
  effectiveDateTime: '2026-05-01',
  code: {
    text: '尿液白蛋白／肌酸酐比（半定量）',
    coding: [{ system: LOINC_SYSTEM, code: '14959-1' }],
  },
  valueString: '1+ (80)',
}

const ckdCarePlans: CarePlanEntity[] = [
  {
    id: 'early-ckd',
    status: 'active',
    title: '初期慢性腎臟病照護計畫',
    period: { start: '2025-01-01' },
  },
  {
    id: 'pre-esrd',
    status: 'active',
    title: '末期腎臟病前期（Pre-ESRD）照護計畫',
    period: { start: '2026-01-01' },
  },
]

describe('physician semantic card', () => {
  it('carries a guideline rule with its source reference for every CKD recommendation', () => {
    const profile = createFhirCdssPatientProfile({
      patient,
      conditions: [],
      encounters: [encounter],
      observations: [
        egfr('egfr-old', '2026-01-01', 35),
        egfr('egfr-latest', '2026-05-01', 34),
        semiquantitativeUacr,
      ],
      medications: [],
      allergies: [],
      carePlans: ckdCarePlans,
      procedures: [],
      immunizations: [],
      now: new Date('2026-07-29T00:00:00Z'),
    })
    const result = CKD_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })

    expect(result.recommendations.length).toBeGreaterThan(6)

    const semanticCards = result.recommendations.map((recommendation) => (
      buildPhysicianSemanticCard(recommendation, 'zh-TW')
    ))
    expect(semanticCards.every((card) => card.guidelineRules.length > 0)).toBe(true)
    expect(semanticCards.find(
      (card) => card.id === 'immunization-review',
    )?.guidelineRules[0].reference).toMatchObject({
      recommendationId: '關鍵聲明 5、12、15–16',
      page: 3,
    })
  })
})
