import { CARE_PACKS } from '@voho0000/personalized-care'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import { buildHeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import { buildDecisionMap } from '@/features/clinical-decision-support/renderers/heart-failure-decision-map'
import {
  AF_MERGED_MODULE_IDS,
  afSourceModuleName,
  mergeAfIntoHeartFailure,
} from '@/features/clinical-decision-support/utils/merge-af-into-hf'
import type {
  CdssPatientProfile,
  CdssRecommendation,
  CdssResult,
} from '@/features/clinical-decision-support/types'

const rec = (id: string, extra: Partial<CdssRecommendation> = {}): CdssRecommendation => ({
  id, moduleName: id, domain: 'medication', priority: 'routine', status: 'review', title: id,
  recommendation: '', rationale: '', patientEvidence: [], nextActions: [`${id} next`],
  guidelineReferences: [], safetyBoundary: '', ...extra,
})

const hf: CdssResult = {
  packId: 'heart-failure-cdss', packVersion: '2.0.0', title: 'HF', summary: '', notEvaluated: [], disclaimer: '',
  recommendations: [
    rec('heart-failure-mra', { status: 'actionable' }),
    rec('antithrombotic-coordination', { status: 'no-action', moduleName: 'HF 抗栓協調' }),
  ],
}

const afWith = (ids: readonly string[], extra: Partial<CdssResult> = {}): CdssResult => ({
  packId: 'atrial-fibrillation-cdss', packVersion: '0.1.0', title: 'AF', summary: '', notEvaluated: [], disclaimer: '',
  recommendations: ids.map((id) => rec(id, { moduleName: `${id} 名稱` })),
  ...extra,
})

const ESTABLISHED = [
  'af-diagnosis-and-pattern',
  'af-documented-cha2ds2-vasc',
  'af-anticoagulation-concordance',
  'af-anticoagulant-selection-safety',
  'af-doac-renal-dose-check',
  'af-bleeding-risk-data-gaps',
  'antithrombotic-coordination',
  'af-rate-control-and-lvef-safety',
  'af-rhythm-control-and-ablation',
]

describe('mergeAfIntoHeartFailure', () => {
  it('adds the AF anticoagulation and rate cards when the AF pack says AF is established', () => {
    const merged = mergeAfIntoHeartFailure(hf, () => afWith(ESTABLISHED))
    expect(merged.recommendations.map((item) => item.id)).toEqual([
      'heart-failure-mra',
      'antithrombotic-coordination',
      ...AF_MERGED_MODULE_IDS,
    ])
    // Screening, bleeding and rhythm cards stay on the AF page.
    expect(merged.recommendations.some((item) => item.id === 'af-rhythm-control-and-ablation')).toBe(false)
    expect(merged.recommendations.some((item) => item.id === 'af-diagnosis-and-pattern')).toBe(false)
  })

  it('keeps the HF antithrombotic-coordination card and never adds the AF copy', () => {
    const merged = mergeAfIntoHeartFailure(hf, () => afWith(ESTABLISHED))
    const coordination = merged.recommendations.filter((item) => item.id === 'antithrombotic-coordination')
    expect(coordination).toHaveLength(1)
    expect(coordination[0].moduleName).toBe('HF 抗栓協調')
  })

  it('tags the source on the module name and keeps every other word the AF pack wrote', () => {
    const af = afWith(ESTABLISHED)
    const merged = mergeAfIntoHeartFailure(hf, () => af)
    const card = merged.recommendations.find((item) => item.id === 'af-anticoagulation-concordance')!
    const original = af.recommendations.find((item) => item.id === 'af-anticoagulation-concordance')!
    expect(card.moduleName).toBe('AF af-anticoagulation-concordance 名稱')
    expect(card.title).toBe(original.title)
    expect(card.nextActions).toEqual(original.nextActions)
    expect(card.status).toBe(original.status)
    expect(afSourceModuleName('AF 抗凝', 'x')).toBe('AF 抗凝')
    expect(afSourceModuleName('抗凝適應症', 'x')).toBe('AF 抗凝適應症')
    expect(afSourceModuleName(undefined, 'af-x')).toBe('AF af-x')
  })

  it('adds nothing when the AF pack wrote only diagnosis and screening cards (no AF)', () => {
    const merged = mergeAfIntoHeartFailure(hf, () => afWith(['af-diagnosis-and-pattern', 'af-comprehensive-screening']))
    expect(merged).toBe(hf)
  })

  it('returns the HF result unchanged when the AF build throws or the pack is unavailable', () => {
    expect(mergeAfIntoHeartFailure(hf, () => { throw new Error('AF pack failed') })).toBe(hf)
    expect(mergeAfIntoHeartFailure(hf, () => undefined)).toBe(hf)
    expect(mergeAfIntoHeartFailure(hf, () => ({ ...afWith(ESTABLISHED), packId: 'other-pack' }))).toBe(hf)
  })

  it('skips an AF id the HF result already carries', () => {
    const withCard: CdssResult = { ...hf, recommendations: [...hf.recommendations, rec('af-rate-control-and-lvef-safety')] }
    const merged = mergeAfIntoHeartFailure(withCard, () => afWith(ESTABLISHED))
    expect(merged.recommendations.filter((item) => item.id === 'af-rate-control-and-lvef-safety')).toHaveLength(1)
  })
})

describe('the real AF pack', () => {
  const afPack = CARE_PACKS.find((pack) => pack.id === 'atrial-fibrillation-cdss')!
  const fact = (value: string | number) => ({
    value: String(value),
    ...(typeof value === 'number' ? { numericValue: value } : {}),
    date: '2026-09-01',
  })
  const profile = (facts: Record<string, ReturnType<typeof fact>>) => ({
    patientId: 'synthetic-af',
    demographics: { age: 72, sex: 'female' },
    facts,
  }) as unknown as CdssPatientProfile
  const base = { age: fact(72), LVEF: fact(30), heartFailureDiagnosis: fact('I50.9'), heartRate: fact(80) }

  it('writes the anticoagulation cards only for a patient with an AF diagnosis', () => {
    const withoutAf = mergeAfIntoHeartFailure(hf, () => afPack.build({ profile: profile(base), locale: 'zh-TW' }))
    expect(withoutAf).toBe(hf)
    const withAf = mergeAfIntoHeartFailure(hf, () => afPack.build({
      profile: profile({ ...base, atrialFibrillationDiagnosis: fact('I48.91') }),
      locale: 'zh-TW',
    }))
    const added = withAf.recommendations.slice(hf.recommendations.length)
    expect(added.map((item) => item.id)).toEqual(AF_MERGED_MODULE_IDS)
    expect(added.every((item) => item.moduleName?.startsWith('AF '))).toBe(true)
  })

  it('carries the merged cards through the real HF board, visit flow and decision map', () => {
    const hfPack = CARE_PACKS.find((pack) => pack.id === 'heart-failure-cdss')!
    const withAf = profile({ ...base, atrialFibrillationDiagnosis: fact('I48.91') })
    const hfResult = hfPack.build({ profile: withAf, locale: 'zh-TW' })
    const merged = mergeAfIntoHeartFailure(hfResult, () => afPack.build({ profile: withAf, locale: 'zh-TW' }))
    const now = new Date('2026-09-26T10:00:00+08:00')
    const board = buildHeartFailureBoard(merged, 'zh-TW', now)!
    const flow = buildHeartFailureVisitFlow({
      board, result: merged, isEnglish: false, now, decisions: {}, patientId: 'synthetic-af',
      phenotypeAnswer: { hfSuspicion: 'suspected', answeredOn: '2026-09-26' },
    })
    const row = flow.actionGroups.flatMap((group) => group.rows)
      .find((item) => item.recommendation.id === 'af-anticoagulation-concordance')!
    expect(row.moduleName).toBe('AF 抗凝適應症')
    expect(row.decisionKind).toBe('medication')
    const dp14 = buildDecisionMap(merged).groups.flatMap((group) => group.cells).find((cell) => cell.point.dp === 'DP-14')!
    expect(dp14.recommendations.map((item) => item.id)).toEqual([
      'af-documented-cha2ds2-vasc',
      'af-anticoagulation-concordance',
      'af-anticoagulant-selection-safety',
      'af-doac-renal-dose-check',
    ])
    const statuses = dp14.recommendations.map((item) => item.status)
    const expected = (['actionable', 'needs-data', 'review', 'no-action'] as const).find((status) => statuses.includes(status))
    expect(dp14.state).toBe(expected)
  })
})
