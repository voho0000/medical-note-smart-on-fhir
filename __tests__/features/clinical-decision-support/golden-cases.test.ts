import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { getDefaultClinicalGuidelinePack } from '@/features/clinical-decision-support/guideline-packs/registry'
import type {
  AllergyEntity,
  ConditionEntity,
  MedicationEntity,
  ObservationEntity,
} from '@/src/core/entities/clinical-data.entity'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10-cm'

function condition(id: string, code: string, display: string): ConditionEntity {
  return {
    id,
    clinicalStatus: 'active',
    verificationStatus: 'confirmed',
    recordedDate: '2026-06-01',
    code: {
      coding: [{ system: ICD10_SYSTEM, code, display }],
    },
  }
}

function statinMedication(input: {
  sourceType: 'MedicationRequest' | 'MedicationStatement'
  status?: string
  useAtcCodeOnly?: boolean
}): MedicationEntity {
  return {
    id: `statin-${input.sourceType}-${input.status ?? 'active'}`,
    status: input.status ?? 'active',
    authoredOn: '2026-06-20',
    medicationCodeableConcept: input.useAtcCodeOnly
      ? {
          coding: [{
            system: 'https://www.whocc.no/atc',
            code: 'C10AA05',
          }],
        }
      : {
          text: 'Atorvastatin 40 mg',
          coding: [{ display: 'Atorvastatin 40 mg' }],
        },
    _sourceResourceType: input.sourceType,
  }
}

function buildScenario(input: {
  age: number
  medications?: MedicationEntity[]
  allergies?: AllergyEntity[]
}) {
  const patient: PatientEntity = {
    id: `golden-${input.age}`,
    resourceType: 'Patient',
    age: input.age,
  }
  const profile = createFhirCdssPatientProfile({
    patient,
    conditions: [
      condition('t2dm', 'E11.9', 'Type 2 diabetes mellitus'),
      condition('ascvd', 'I25.9', 'Chronic ischemic heart disease'),
    ],
    encounters: [],
    observations: [{
      id: 'hba1c',
      resourceType: 'Observation',
      status: 'final',
      effectiveDateTime: '2026-06-15',
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '4548-4',
          display: 'Hemoglobin A1c',
        }],
      },
      valueQuantity: {
        value: 6.6,
        unit: '%',
        code: '%',
      },
    } satisfies ObservationEntity],
    medications: input.medications ?? [],
    allergies: input.allergies ?? [],
    carePlans: [],
    procedures: [],
    now: new Date('2026-07-29T00:00:00Z'),
  })
  const result = getDefaultClinicalGuidelinePack().build({
    profile,
    locale: 'zh-TW',
  })
  return { profile, result }
}

describe('DM CDSS cross-patient golden cases', () => {
  it('does not apply older-adult rules to a younger adult', () => {
    const { result } = buildScenario({ age: 45 })
    const ids = result.recommendations.map((item) => item.id)

    expect(ids).not.toContain('glycemic-safety-older-adult')
    expect(ids).not.toContain('older-adult-safety')
    expect(result.recommendations.find(
      (item) => item.id === 'ascvd-lipid-strategy',
    )?.recommendation).not.toContain('高齡')
  })

  it('keeps older-adult safety modules for an older patient', () => {
    const { result } = buildScenario({ age: 72 })
    const ids = result.recommendations.map((item) => item.id)
    const automatedIds = result.automatedChecks?.map((item) => item.id)

    expect(ids).toContain('older-adult-safety')
    expect(ids).toContain('glycemic-safety-older-adult')
    expect(automatedIds ?? []).not.toContain('glycemic-safety-older-adult')
  })

  it('keeps statin initiation actionable when LDL-C is missing', () => {
    const { result } = buildScenario({ age: 45 })
    const lipid = result.recommendations.find(
      (item) => item.id === 'ascvd-lipid-strategy',
    )

    expect(lipid).toMatchObject({
      priority: 'high',
      status: 'actionable',
      title: 'ASCVD：現有資料未見 statin',
    })
    expect(lipid?.missingData).toContain('LDL-C 與採檢日期')
    expect(lipid?.recommendation).toContain('不阻擋本次開始評估')
  })

  it('uses one complication follow-up card and moves no-action checks out of the decision list', () => {
    const { result } = buildScenario({ age: 72 })
    const ids = result.recommendations.map((item) => item.id)

    expect(ids.filter((id) => id === 'complication-screening')).toHaveLength(1)
    expect(ids).not.toContain('care-gap-inventory')
    expect(ids).toContain('glycemic-safety-older-adult')
    expect(result.automatedChecks?.map((item) => item.id) ?? []).not.toContain(
      'glycemic-safety-older-adult',
    )
  })

  it.each([
    {
      label: 'active MedicationRequest',
      medication: statinMedication({ sourceType: 'MedicationRequest' }),
      expectedState: 'active-order-unconfirmed',
      expectedStatus: 'review',
      expectedTitle: '尚未確認實際使用',
    },
    {
      label: 'active MedicationStatement',
      medication: statinMedication({ sourceType: 'MedicationStatement' }),
      expectedState: 'confirmed-current',
      expectedStatus: 'needs-data',
      expectedTitle: '已確認使用 statin',
    },
    {
      label: 'on-hold MedicationRequest',
      medication: statinMedication({ sourceType: 'MedicationRequest', status: 'on-hold' }),
      expectedState: 'on-hold',
      expectedStatus: 'review',
      expectedTitle: 'statin 暫停中',
    },
    {
      label: 'historical MedicationRequest',
      medication: statinMedication({ sourceType: 'MedicationRequest', status: 'completed' }),
      expectedState: 'historical-record-current-status-unknown',
      expectedStatus: 'review',
      expectedTitle: '有 statin 歷史處方，近期是否持續未知',
    },
  ])('distinguishes $label from confirmed medication use', ({
    medication,
    expectedState,
    expectedStatus,
    expectedTitle,
  }) => {
    const { profile, result } = buildScenario({
      age: 45,
      medications: [medication],
    })
    const lipid = result.recommendations.find(
      (item) => item.id === 'ascvd-lipid-strategy',
    )

    expect(profile.medicationClassContexts?.statin?.state).toBe(expectedState)
    expect(lipid?.status).toBe(expectedStatus)
    expect(lipid?.title).toContain(expectedTitle)
  })

  it('uses governed ATC coding before falling back to medication text', () => {
    const { profile } = buildScenario({
      age: 45,
      medications: [statinMedication({
        sourceType: 'MedicationStatement',
        useAtcCodeOnly: true,
      })],
    })

    expect(profile.medicationClassContexts?.statin?.state).toBe('confirmed-current')
  })

  it('uses documented statin allergy or intolerance instead of asking whether it exists', () => {
    const allergy: AllergyEntity = {
      id: 'statin-intolerance',
      clinicalStatus: 'active',
      verificationStatus: 'confirmed',
      recordedDate: '2025-03-10',
      code: { text: 'Atorvastatin intolerance' },
      reaction: [{
        manifestation: [{ text: 'Severe myalgia' }],
        severity: 'severe',
      }],
    }
    const { profile, result } = buildScenario({
      age: 45,
      allergies: [allergy],
    })
    const lipid = result.recommendations.find(
      (item) => item.id === 'ascvd-lipid-strategy',
    )

    expect(profile.medicationClassContexts?.statin).toMatchObject({
      allergyState: 'documented',
      allergyNames: ['Atorvastatin intolerance'],
    })
    expect(profile.facts.statinAllergy.sources?.[0]).toMatchObject({
      resourceType: 'AllergyIntolerance',
      resourceId: 'statin-intolerance',
    })
    expect(lipid).toMatchObject({
      status: 'review',
      title: 'ASCVD：已記載 statin 過敏／不耐受',
    })
    expect(lipid?.missingData?.join(' ')).not.toContain('是否有')
    expect(lipid?.nextActions.join(' ')).toContain('反應與嚴重度')
  })

  it('ignores refuted allergy records', () => {
    const { profile, result } = buildScenario({
      age: 45,
      allergies: [{
        id: 'refuted-statin-allergy',
        clinicalStatus: 'active',
        verificationStatus: 'refuted',
        code: { text: 'Atorvastatin allergy' },
      }],
    })
    const lipid = result.recommendations.find(
      (item) => item.id === 'ascvd-lipid-strategy',
    )

    expect(profile.medicationClassContexts?.statin?.allergyState).toBe('not-found')
    expect(lipid?.status).toBe('actionable')
  })
})
