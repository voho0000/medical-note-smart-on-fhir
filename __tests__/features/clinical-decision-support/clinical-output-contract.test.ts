import {
  CARE_PACKS,
  CARE_PACK_MODULE_ORDER,
} from '@voho0000/personalized-care'
import type {
  CdssPatientProfile,
  CdssRecommendation,
} from '@/features/clinical-decision-support/types'

const broadProfile: CdssPatientProfile = {
  id: 'clinical-output-contract',
  eligibleDiseasePackIds: [
    'dm-poc',
    'ckd-poc',
    'hypertension-poc',
    'hyperlipidemia-poc',
    'heart-failure-poc',
    'cirrhosis-poc',
  ],
  facts: {},
}

function allModuleRecommendations(
  result: ReturnType<(typeof CARE_PACKS)[number]['build']>,
): CdssRecommendation[] {
  return [
    ...result.recommendations,
    ...(result.automatedChecks ?? []).flatMap((check) => (
      check.recommendation ? [check.recommendation] : []
    )),
  ]
}

describe('shared personalized-guidance output contract', () => {
  it.each(CARE_PACKS.map((pack) => [pack.id, pack] as const))(
    '%s supplies fixed module metadata and physician-auditable semantics',
    (_packId, pack) => {
      const result = pack.build({ profile: broadProfile, locale: 'zh-TW' })
      const modules = allModuleRecommendations(result)
      const fixedOrder = CARE_PACK_MODULE_ORDER[result.packId]

      expect(fixedOrder).toBeDefined()
      expect(modules.length).toBeGreaterThan(0)
      modules.forEach((module) => {
        expect(fixedOrder).toContain(module.id)
        expect(module.moduleName).toEqual(expect.any(String))
        expect(module.moduleName?.trim()).not.toBe('')
        expect(module.moduleGroup).toMatch(/^(assessment|treatment|monitoring|care)$/)
        expect(module.presentationType).toMatch(
          /^(classification|medication|monitoring|recommendation)$/,
        )
        expect(module.moduleOrder).toBe(fixedOrder.indexOf(module.id))
        expect(module.semanticRule).toMatchObject({
          guidelineRecommendation: expect.any(String),
          eligibilityCriteria: expect.any(Array),
          patientData: expect.any(Array),
          decisionLogic: expect.any(String),
          clinicalConclusion: expect.any(String),
          limitations: expect.any(Array),
        })
      })
    },
  )

  it('never exposes clinician-only assessment as retrievable missing data', () => {
    const forbiddenMissingData = /實際(?:服用|使用)|依從性|耐受|不耐受|停藥原因|症狀|體液狀態|容量狀態|病人偏好|照護目標|衰弱|認知|ADL|IADL|實際攝取|飲食訪談/i

    CARE_PACKS.forEach((pack) => {
      const result = pack.build({ profile: broadProfile, locale: 'zh-TW' })
      allModuleRecommendations(result).forEach((module) => {
        expect(module.missingData ?? []).toEqual(
          (module.requirements ?? [])
            .filter((requirement) => requirement.kind === 'record-input')
            .map((requirement) => requirement.label),
        )
        expect(module.missingData?.join('、') ?? '').not.toMatch(forbiddenMissingData)
      })
    })
  })

  it('does not ask users to reconfirm actual use when an active prescription is shown', () => {
    const governed = CARE_PACKS[0].build({
      profile: {
        ...broadProfile,
        facts: {
          age: { zh: '70 歲', en: '70 years', numericValue: 70 },
          HbA1c: { zh: '7%', en: '7%', numericValue: 7 },
          forxiga: { zh: 'Forxiga 10 mg', en: 'Forxiga 10 mg' },
        },
        medicationContexts: {
          forxiga: {
            sourceResourceType: 'MedicationRequest',
            status: 'active',
            useState: 'active_order_unconfirmed',
          },
        },
      },
      locale: 'zh-TW',
    })
    const serialized = JSON.stringify(allModuleRecommendations(governed))

    expect(serialized).toContain('已有 SGLT2i處方')
    expect(serialized).not.toMatch(/尚未確認實際使用|確認是否實際使用|確認目前是否使用/)
  })
})
