import { applyAfCalculatorResults } from '@/features/clinical-decision-support/utils/af-calculators'
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  ATRIAL_FIBRILLATION_GUIDELINE_PACK as PACK,
  type CdssPatientProfile,
} from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import {
  AF_BOARD_CONFIG,
  buildDiseaseBoard,
} from '@/features/clinical-decision-support/renderers/disease-board'
import { useAfAnswersStore } from '@/features/clinical-decision-support/stores/af-answers.store'
const profile: CdssPatientProfile = {
  id: 'synthetic-af-ui',
  evaluatedAt: '2026-09-12T00:00:00+08:00',
  demographics: { sex: 'male' },
  facts: {
    age: { numericValue: 78, zh: '78 歲', en: '78 years' },
    atrialFibrillationDiagnosis: { zh: 'I48.0', en: 'I48.0' },
    heartRate: { numericValue: 88, zh: '88 bpm', en: '88 bpm', date: '2026-09-10' },
  },
}
const result = () => PACK.build({ profile: applyAfCalculatorResults(profile), locale: 'zh-TW' })
function Harness() {
  const [answers, setAnswers] = useState<Record<string, boolean | undefined>>({})
  const p = applyAfCalculatorResults({ ...profile, afClinicalAnswers: answers })
  return (
    <ClinicalDecisionSupportView
      result={PACK.build({ profile: p, locale: 'zh-TW' })}
      locale="zh-TW"
      layout="flow"
      patientId={profile.id}
      afAnswers={answers}
      onAfAnswer={(id, value) => setAnswers((old) => ({ ...old, [id]: value }))}
      profileFacts={p.facts}
    />
  )
}
describe('AF five-section visit flow', () => {
  it('maps all module output without losing no-action rows or adding clinical thresholds', () => {
    const r = result(),
      board = buildDiseaseBoard(r, AF_BOARD_CONFIG, 'zh-TW', profile.facts)!
    expect(board.consumedIds.size).toBe(r.recommendations.length)
    expect([...board.alerts, ...board.groups.flatMap((g) => g.items)]).toHaveLength(13)
    expect(board.headline?.title).toBe(
      r.recommendations.find((r) => r.id === 'af-documented-cha2ds2-vasc')?.title,
    )
    expect(board.metrics.find((m) => m.key === 'heartRate')).toMatchObject({
      value: '88 bpm',
      date: '2026-09-10',
    })
    expect(
      buildDiseaseBoard({ ...r, packId: 'heart-failure-cdss' }, AF_BOARD_CONFIG, 'zh-TW'),
    ).toBeUndefined()
  })
  it('renders five sections, full module details, and folded completed modules', () => {
    render(<Harness />)
    for (const id of ['progress', 'inputs', 'assessment', 'actions', 'follow-up'])
      expect(screen.getByTestId(`cdss-af-${id}`)).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-hf-visit-flow')).not.toBeInTheDocument()
    const row = screen.getByTestId('cdss-af-action-af-anticoagulation-concordance')
    fireEvent.click(within(row).getByRole('button'))
    expect(within(row).getByText('抗凝與抗栓依據')).toBeInTheDocument()
    expect(within(row).getAllByText(/aspirin／clopidogrel/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/目前無需處理.*4|DOAC 劑量與腎功能 ·/)[0]).toBeInTheDocument()
  })
  it('recomputes both risk scores when a physician confirms or withdraws stroke history', () => {
    render(<Harness />)
    const assessment = screen.getByTestId('cdss-af-assessment')
    expect(within(assessment).getByText('CHA₂DS₂-VA 最低 2 分；CHA₂DS₂-VASc 最低 2 分')).toBeInTheDocument()
    const stroke = screen.getByRole('group', { name: '中風／TIA／動脈栓塞病史' })
    fireEvent.click(within(stroke).getByRole('button', { name: /^有$/ }))
    expect(within(assessment).getByText('CHA₂DS₂-VA 最低 4 分；CHA₂DS₂-VASc 最低 4 分')).toBeInTheDocument()
    fireEvent.click(within(stroke).getByRole('button', { name: '未評估' }))
    expect(within(assessment).getByText('CHA₂DS₂-VA 最低 2 分；CHA₂DS₂-VASc 最低 2 分')).toBeInTheDocument()
  })
  it('clears memory-only answers when changing patients', () => {
    const s = useAfAnswersStore.getState()
    s.setPatient('a')
    s.answer('a', 'stroke', true)
    expect(useAfAnswersStore.getState().answers.stroke).toBe(true)
    s.setPatient('b')
    expect(useAfAnswersStore.getState().answers).toEqual({})
    s.setPatient('a')
    expect(useAfAnswersStore.getState().answers).toEqual({})
  })
  it('does not replace the classic module renderer', () => {
    render(<ClinicalDecisionSupportView result={result()} locale="zh-TW" layout="classic" />)
    expect(screen.queryByTestId('cdss-af-visit-flow')).not.toBeInTheDocument()
  })
})
