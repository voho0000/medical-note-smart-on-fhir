import type { CdssRecommendation } from '@/features/clinical-decision-support/types'
import {
  applyHeartFailureMedicationSafety,
  heartFailureMedicationSafetyAssessment,
} from '@/features/clinical-decision-support/renderers/heart-failure-medication-safety'

function recommendation(
  id: string,
  facts: Readonly<Record<string, string>>,
  status: CdssRecommendation['status'] = 'no-action',
): CdssRecommendation {
  return {
    id,
    domain: 'medication',
    priority: 'routine',
    status,
    title: '已有處方',
    recommendation: '',
    rationale: '',
    patientEvidence: Object.entries(facts).map(([key, value]) => ({
      label: key,
      value,
      factKeys: [key],
    })),
    nextActions: ['持續治療。'],
    guidelineReferences: [],
    safetyBoundary: '',
  }
}

describe('HFrEF medication-specific safety gates', () => {
  it('moves an existing beta-blocker to clinical review when HR is below 50', () => {
    const result = applyHeartFailureMedicationSafety(recommendation('heart-failure-beta-blocker', {
      hfEvidenceBetaBlockerTherapy: 'Carvedilol 12.5 mg',
      bloodPressure: '86/54 mmHg',
      heartRate: '44 bpm',
    }))

    expect(result.status).toBe('review')
    expect(result.overviewEvidenceFactKeys).toEqual([
      'hfEvidenceBetaBlockerTherapy', 'heartRate', 'bloodPressure',
    ])
    expect(result.nextActions[0]).toContain('心率 44 bpm（<50）')
    expect(result.nextActions[0]).toContain('維持、減量或暫緩')
  })

  it.each([
    ['low systolic BP', { bloodPressure: '99/70 mmHg', eGFR: '45', potassium: '4.2' }],
    ['low eGFR', { bloodPressure: '120/70 mmHg', eGFR: '29', potassium: '4.2' }],
    ['high potassium', { bloodPressure: '120/70 mmHg', eGFR: '45', potassium: '5.0' }],
  ])('moves RAS inhibition to review for %s', (_label, facts) => {
    expect(applyHeartFailureMedicationSafety(recommendation(
      'heart-failure-ras-inhibition', facts,
    )).status).toBe('review')
  })

  it.each([
    ['potassium at 5.0', { eGFR: '45', potassium: '5.0' }],
    ['eGFR at 30', { eGFR: '30', potassium: '4.2' }],
  ])('moves MRA to review for %s', (_label, facts) => {
    expect(applyHeartFailureMedicationSafety(recommendation(
      'heart-failure-mra', facts,
    )).status).toBe('review')
  })

  it('moves SGLT2i to review below the pack initiation threshold', () => {
    expect(applyHeartFailureMedicationSafety(recommendation('heart-failure-sglt2', {
      eGFR: '19 mL/min/1.73m²',
    })).status).toBe('review')
  })

  it('requests missing inputs even when a prescription already exists', () => {
    const currentWithoutHeartRate = {
      ...recommendation(
      'heart-failure-beta-blocker',
      { hfEvidenceBetaBlockerTherapy: 'Carvedilol 12.5 mg', bloodPressure: '118/70 mmHg' },
      ),
      missingData: ['心率'],
    }
    const assessment = heartFailureMedicationSafetyAssessment(currentWithoutHeartRate)

    expect(assessment).toMatchObject({ status: 'needs-data' })
    expect(assessment?.headlineZh).toContain('缺少 心率')
  })

  it.each([
    ['heart-failure-ras-inhibition', { bloodPressure: '118/70 mmHg', eGFR: '45', potassium: '4.9' }],
    ['heart-failure-beta-blocker', { bloodPressure: '118/70 mmHg', heartRate: '50 bpm' }],
    ['heart-failure-mra', { eGFR: '31', potassium: '4.9' }],
    ['heart-failure-sglt2', { eGFR: '20' }],
  ])('keeps %s unchanged at a passing boundary', (id, facts) => {
    const original = recommendation(id, facts)
    expect(applyHeartFailureMedicationSafety(original)).toBe(original)
  })
})
