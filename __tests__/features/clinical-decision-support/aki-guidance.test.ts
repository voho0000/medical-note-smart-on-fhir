import { createFhirCdssPatientProfile } from '@/features/clinical-decision-support/adapters/fhir-cdss-profile'
import { AKI_GUIDELINE_PACK } from '@voho0000/personalized-care'
import type { ObservationEntity } from '@/src/core/entities/clinical-data.entity'

const LOINC_SYSTEM = 'http://loinc.org'
const UCUM_SYSTEM = 'http://unitsofmeasure.org'

function creatinine(
  id: string,
  observedAt: string,
  value: number,
  unit: 'mg/dL' | 'umol/L',
): ObservationEntity {
  return {
    id,
    resourceType: 'Observation',
    status: 'final',
    effectiveDateTime: observedAt,
    code: {
      coding: [{
        system: LOINC_SYSTEM,
        code: '2160-0',
        display: 'Creatinine [Mass/volume] in Serum or Plasma',
      }],
    },
    valueQuantity: {
      value,
      unit,
      system: UCUM_SYSTEM,
      code: unit,
    },
  }
}

function profile(observations: ObservationEntity[]) {
  return createFhirCdssPatientProfile({
    patient: {
      id: 'aki-test-patient',
      resourceType: 'Patient',
      age: 70,
    },
    conditions: [],
    encounters: [],
    observations,
    medications: [],
    allergies: [],
    carePlans: [],
    procedures: [],
    immunizations: [],
    now: new Date('2026-07-30T12:00:00+08:00'),
  })
}

describe('AKI alert and nephrology handoff pack', () => {
  it('normalizes creatinine units, stages the signal, and creates a closed-loop handoff', () => {
    const result = profile([
      creatinine('baseline', '2026-07-27T08:00:00+08:00', 1, 'mg/dL'),
      creatinine('current', '2026-07-30T08:00:00+08:00', 176.84, 'umol/L'),
    ])

    expect(result.akiAssessment).toMatchObject({
      state: 'detected',
      event: {
        stage: 2,
        recency: 'current-window',
        baseline: { valueMgDl: 1 },
        current: { valueMgDl: 2 },
      },
    })
    expect(result.facts.serumCreatinineTrend.sources).toEqual([
      expect.objectContaining({ resourceId: 'baseline', value: 1, unit: 'mg/dL' }),
      expect.objectContaining({ resourceId: 'current', value: 2, unit: 'mg/dL' }),
    ])
    expect(AKI_GUIDELINE_PACK.applies(result)).toBe(true)

    const guidance = AKI_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })
    expect(guidance.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'aki-creatinine-detection',
        priority: 'high',
        status: 'actionable',
        title: expect.stringContaining('第 2 期'),
      }),
      expect.objectContaining({
        id: 'aki-follow-up-closure',
        priority: 'high',
      }),
      expect.objectContaining({
        id: 'aki-medication-review',
        status: 'review',
      }),
    ]))
    expect(guidance.clinicalHandoff).toMatchObject({
      kind: 'nephrology-consult',
      copyLabel: '複製會診草稿',
      copyText: expect.stringContaining('Creatinine 訊號'),
      safetyNote: expect.stringContaining('不會自動送出'),
    })
  })

  it('keeps one creatinine result as insufficient data rather than a negative finding', () => {
    const result = profile([
      creatinine('only-result', '2026-07-30T08:00:00+08:00', 1.8, 'mg/dL'),
    ])
    const guidance = AKI_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })

    expect(result.akiAssessment?.state).toBe('insufficient-data')
    expect(guidance.recommendations[0]).toMatchObject({
      id: 'aki-creatinine-detection',
      status: 'needs-data',
    })
    expect(guidance.clinicalHandoff).toBeUndefined()
  })

  it('does not claim AKI is excluded when comparable results do not trigger', () => {
    const result = profile([
      creatinine('first', '2026-07-29T08:00:00+08:00', 1, 'mg/dL'),
      creatinine('second', '2026-07-30T08:00:00+08:00', 1.1, 'mg/dL'),
    ])
    const guidance = AKI_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })

    expect(result.akiAssessment?.state).toBe('not-detected')
    expect(guidance.recommendations[0]).toMatchObject({
      status: 'no-action',
      safetyBoundary: expect.stringContaining('不是 AKI 排除診斷'),
    })
  })

  it('separates early repeat testing from the KDIGO three-month post-AKI assessment', () => {
    const result = profile([
      creatinine('baseline', '2026-01-01T08:00:00+08:00', 1, 'mg/dL'),
      creatinine('event', '2026-01-02T08:00:00+08:00', 1.6, 'mg/dL'),
      creatinine('early-follow-up', '2026-01-05T08:00:00+08:00', 1.2, 'mg/dL'),
    ])
    const guidance = AKI_GUIDELINE_PACK.build({
      profile: result,
      locale: 'zh-TW',
    })
    expect(guidance.recommendations.find(
      (item) => item.id === 'aki-follow-up-closure',
    )).toMatchObject({
      priority: 'high',
      status: 'review',
      title: expect.stringContaining('約 3 個月'),
      missingData: expect.arrayContaining([
        expect.stringContaining('AKI 後約 3 個月'),
      ]),
      guidelineReferences: expect.arrayContaining([
        expect.objectContaining({ recommendationId: 'Recommendation 2.3.4' }),
      ]),
    })
  })
})
