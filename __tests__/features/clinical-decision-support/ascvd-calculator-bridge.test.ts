import { ASCVD_VHR_CALCULATOR as calculator, ASCVD_VHR_CRITERIA } from '@/features/medical-calculator/calculators/ascvd-vhr'
import { applyAscvdRiskReading, buildAscvdRiskReading } from '@/features/medical-calculator/ascvd-risk-profile'
import { CORONARY_DISEASE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { coronaryPreviewProfile } from '@/features/clinical-decision-support/dev/coronary-preview-profile'
import { mergeAscvdRiskInputs } from '@/features/medical-calculator/stores/ascvd-risk-inputs.store'

const none = Object.fromEntries(ASCVD_VHR_CRITERIA.map(([key]) => [key, 'no']))
const now = new Date('2026-09-12T00:00:00Z')
const lipid = (profile: ReturnType<typeof coronaryPreviewProfile>) => CORONARY_DISEASE_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' }).recommendations.find(item => item.id === 'coronary-lipid-lowering')!

describe('Medical Calculator owns ASCVD classification', () => {
  it('keeps absent and invalid inputs unknown', () => {
    expect(calculator.compute({}).assessment).toBe('indeterminate')
    expect(calculator.compute({ ...none, 'vhr:major:prior-mi': 'bogus' }).assessment).toBe('indeterminate')
    expect(calculator.compute(none).assessment).toBe('not-very-high')
  })
  it.each([
    [{ 'vhr:major:prior-mi': 'yes', 'vhr:high:age': 'yes' }, 'not-very-high'],
    [{ 'vhr:major:prior-mi': 'yes', 'vhr:high:age': 'yes', 'vhr:high:hypertension': 'yes' }, 'very-high'],
    [{ 'vhr:major:prior-mi': 'yes', 'vhr:major:ischemic-stroke': 'yes' }, 'very-high'],
    [{ 'vhr:major:prior-mi': '2' }, 'very-high'],
    [{ 'vhr:high:age': 'yes', 'vhr:high:hypertension': 'yes' }, 'not-very-high'],
  ])('classifies confirmed criteria at the Table 10 boundary: %j', (values, expected) => {
    expect(calculator.compute({ ...none, ...values }).assessment).toBe(expected)
  })
  it('can establish very-high risk with sufficient evidence despite other unknowns', () => {
    expect(calculator.compute({ 'vhr:major:recent-acs': 'yes', 'vhr:major:ischemic-stroke': 'yes' }).assessment).toBe('very-high')
  })
  it('does not mistake missing history for a negative', () => {
    const reading = buildAscvdRiskReading(coronaryPreviewProfile('empty', now))
    expect(reading.values['vhr:major:prior-mi']).toBe('unknown')
    expect(reading.values['vhr:high:diabetes']).toBe('unknown')
    expect(reading.excluded).not.toContain('vhr:high:smoking')
  })
  it('avoids counting an ACS admission again as MI or PCI history', () => {
    const profile = coronaryPreviewProfile('acs', now)
    profile.facts = { ...profile.facts, percutaneousCoronaryIntervention: { zh: 'PCI', en: 'PCI', date: profile.facts.acuteCoronarySyndromeAdmission.date }, priorMyocardialInfarction: { zh: 'I21', en: 'I21', date: profile.facts.acuteCoronarySyndromeAdmission.date, sources: [{ resourceType: 'Condition', coding: [{ code: 'I21' }] }] } }
    const reading = buildAscvdRiskReading(profile)
    expect(reading.values['vhr:major:prior-mi']).toBe('unknown')
    expect(reading.values['vhr:high:prior-revascularization']).toBe('unknown')
  })
  it('does not infer maximal statin tolerance from prescriptions and one LDL', () => {
    const profile = coronaryPreviewProfile('acs', now)
    profile.facts = { ...profile.facts, LDL: { zh: '130 mg/dL', en: '130 mg/dL', numericValue: 130 } }
    expect(buildAscvdRiskReading(profile).values['vhr:high:persistent-ldl']).toBe('unknown')
  })
  it('publishes the actual calculator result, propagates manual inputs, and respects exclusion', () => {
    const profile = coronaryPreviewProfile('stable', now)
    const overrides = mergeAscvdRiskInputs(undefined, { 'vhr:major:prior-mi': { value: '2' } }, now)
    const computed = applyAscvdRiskReading(profile, overrides)
    expect(computed.facts.ascvdVeryHighRisk.textEvidence?.matchedTerms).toContain('assessment:very-high')
    expect(lipid(computed).status).toBe('actionable')
    expect(lipid(computed).recommendation).toContain('醫療計算機')
    const excluded = applyAscvdRiskReading({ ...profile, evidenceOverrides: { 'vhr:major:prior-mi': false } }, overrides)
    expect(excluded.facts.ascvdVeryHighRisk.textEvidence?.matchedTerms).toContain('assessment:indeterminate')
    expect(lipid(excluded).status).toBe('review')
  })
  it('the pack cannot re-score an absent, unknown or unsupported calculator result', () => {
    const profile = coronaryPreviewProfile('stable', now)
    expect(lipid(profile).missingData?.join()).toContain('醫療計算機')
    const unknown = applyAscvdRiskReading(profile)
    expect(lipid(unknown).missingData?.join()).toContain('尚無法判定')
    const unsupported = { ...unknown, facts: { ...unknown.facts, ascvdVeryHighRisk: { zh: '極高風險', en: 'Very high risk', textEvidence: { direction: 'supports' as const, matchedTerms: ['calculator:unknown:v999', 'assessment:very-high'] } } } }
    expect(lipid(unsupported).status).toBe('review')
  })
})
