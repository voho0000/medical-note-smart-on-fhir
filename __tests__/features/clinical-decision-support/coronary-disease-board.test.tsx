import { fireEvent, render, screen, within } from '@testing-library/react'
import { CORONARY_DISEASE_GUIDELINE_PACK } from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { buildCoronaryDiseaseBoard } from '@/features/clinical-decision-support/renderers/coronary-disease-board'
import { CoronaryPreview } from '@/features/clinical-decision-support/dev/CoronaryPreview'
import { coronaryPreviewProfile, type CoronaryPreviewScenario } from '@/features/clinical-decision-support/dev/coronary-preview-profile'
import { useClinicVitalsStore } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { useEvidenceOverridesStore } from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import type { CdssPatientProfile, CdssFact } from '@/features/clinical-decision-support/types'

const NOW = new Date('2026-09-12T02:00:00Z')
function resultFor(scenario: CoronaryPreviewScenario = 'stable', facts?: CdssPatientProfile['facts']) {
  const profile = coronaryPreviewProfile(scenario, NOW)
  return { profile, result: CORONARY_DISEASE_GUIDELINE_PACK.build({ profile: facts ? { ...profile, facts } : profile, locale: 'zh-TW' }) }
}
function show(scenario: CoronaryPreviewScenario = 'stable') {
  const { profile, result } = resultFor(scenario)
  return { profile, result, ...render(<ClinicalDecisionSupportView result={result} locale="zh-TW" profileFacts={profile.facts} />) }
}

describe('coronary disease presentation model', () => {
  it('builds only for the coronary pack and restores completed recommendations once', () => {
    const { result, profile } = resultFor()
    expect(buildCoronaryDiseaseBoard({ ...result, packId: 'heart-failure-cdss' }, 'zh-TW', NOW)).toBeUndefined()
    const board = buildCoronaryDiseaseBoard(result, 'zh-TW', NOW, profile.facts)!
    expect(board.metrics.map(item => item.factKey)).toEqual(['LDL', 'LVEF', 'bloodPressure', 'heartRate', 'eGFR', 'potassium', 'hemoglobin'])
    expect(board.metrics[0]).toMatchObject({ value: '88', date: '2026-08-03', ageDays: 40 })
    expect(new Set([...board.consumedIds, ...board.remaining.map(item => item.id)]).size).toBe(board.recommendations.length)
  })

  it('keeps a group verdict on the group, even when it recommends only one drug', () => {
    const { result, profile } = resultFor()
    const lipid = buildCoronaryDiseaseBoard(result, 'zh-TW', NOW, profile.facts)!.groups[1]
    expect(lipid.recommendation.title).toContain('ezetimibe')
    expect(lipid.drugs.map(item => item.taking)).toEqual([true, false, false])
    lipid.drugs.forEach(item => expect(item).not.toHaveProperty('status'))
  })

  it('reads the adapter current-OAC fact without requiring the class-fact prefix', () => {
    const { result, profile } = resultFor()
    const facts = { ...profile.facts, currentOralAnticoagulant: { zh: '目前 DOAC：apixaban', en: 'Current DOAC: apixaban' } }
    const oac = buildCoronaryDiseaseBoard(result, 'zh-TW', NOW, facts)!.groups[0].drugs[2]
    expect(oac.taking).toBe(true)
    expect(oac.text).toContain('apixaban')
  })

  it('keeps a missing prescription fact unknown without a complete profile', () => {
    const { result } = resultFor()
    const sparse = { ...result, recommendations: result.recommendations.map(item => ({ ...item, patientEvidence: [] })) }
    expect(buildCoronaryDiseaseBoard(sparse, 'zh-TW', NOW)!.groups[0].drugs[2].taking).toBeUndefined()
  })

  it('shows only the evidence assessment when no coronary pathway opens', () => {
    const { result, profile } = resultFor('empty')
    const board = buildCoronaryDiseaseBoard(result, 'zh-TW', NOW, profile.facts)!
    expect(board.headline?.id).toBe('coronary-disease-evidence')
    expect(board.groups).toEqual([])
    expect(board.recommendations).toHaveLength(1)
  })

  it('dates actual ACS events, without inventing a medication stop date', () => {
    const { result, profile } = resultFor('acs')
    const board = buildCoronaryDiseaseBoard(result, 'zh-TW', NOW, profile.facts)!
    expect(board.events[0]).toMatchObject({ factKey: 'acuteCoronarySyndromeAdmission', ageDays: 60 })
    expect(board.events[0]).not.toHaveProperty('horizonDate')
    const coded: Record<string, CdssFact> = { ...profile.facts, acuteCoronarySyndromeDiagnosis: profile.facts.acuteCoronarySyndromeAdmission }
    delete coded.acuteCoronarySyndromeAdmission
    const untimed = resultFor('stable', coded).result
    expect(buildCoronaryDiseaseBoard(untimed, 'zh-TW', NOW, coded)!.events).toEqual([])
  })

  it('does not display a future event as day zero', () => {
    const { result, profile } = resultFor('acs')
    const facts = { ...profile.facts, acuteCoronarySyndromeAdmission: { zh: 'ACS', en: 'ACS', date: '2027-01-01' } }
    expect(buildCoronaryDiseaseBoard(result, 'zh-TW', NOW, facts)!.events).toEqual([])
  })

  it('retains a stale value and marks the retest separately from missing data', () => {
    const { result, profile } = resultFor('missing')
    const board = buildCoronaryDiseaseBoard(result, 'zh-TW', NOW, profile.facts)!
    expect(board.metrics.find(item => item.factKey === 'LDL')?.value).toBeUndefined()
    expect(board.metrics.find(item => item.factKey === 'potassium')).toMatchObject({ value: '4.1', stale: true, ageDays: 200 })
  })
})

describe('coronary view and actions', () => {
  it('replaces the duplicate summary and leaves every module reachable', () => {
    const { result } = show()
    expect(screen.getByTestId('cdss-coronary-board')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-clinical-summary')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /目前無需處理 ·/ }))
    for (const item of result.recommendations) {
      expect(screen.getByTestId(`cdss-ccd-module-${item.id}`)).toHaveTextContent(item.title)
    }
  })

  it('opens the real evidence table and guideline detail from a treatment group', () => {
    show()
    fireEvent.click(screen.getByTestId('cdss-ccd-expand-coronary-lipid-lowering'))
    expect(screen.getByRole('region', { name: '降脂治療與 LDL-C 目標' })).toHaveTextContent('ASCVD 極高風險條件')
    expect(screen.getByRole('region', { name: '降脂治療與 LDL-C 目標' })).toHaveTextContent('AHA')
  })

  it('puts active medication safety before the treatment groups', () => {
    show('safety')
    const alert = screen.getByTestId('cdss-ccd-safety')
    expect(alert).toHaveTextContent('NSAID')
    expect(alert.compareDocumentPosition(screen.getByTestId('cdss-ccd-therapy')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the sole non-coronary evidence assessment visible', () => {
    show('empty')
    expect(screen.getByTestId('cdss-ccd-module-coronary-disease-evidence')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-ccd-therapy')).not.toBeInTheDocument()
  })

  it('preserves the classic table when that layout is requested', () => {
    const { result } = resultFor()
    render(<ClinicalDecisionSupportView result={result} locale="zh-TW" layout="classic" />)
    expect(screen.queryByTestId('cdss-coronary-board')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-module-cell-coronary-antiplatelet-strategy')).toBeInTheDocument()
  })

  it('records a clinician decision without changing the guideline status', () => {
    const { result, profile } = resultFor()
    const record = jest.fn()
    render(<ClinicalDecisionSupportView result={result} locale="zh-TW" patientId="synthetic" profileFacts={profile.facts} onRecordDecision={record} />)
    fireEvent.click(screen.getByTestId('cdss-ccd-decision-coronary-lipid-lowering-prescribed'))
    expect(record).toHaveBeenCalledWith('coronary-lipid-lowering', expect.objectContaining({ decision: 'prescribed', packVersion: result.packVersion }))
    expect(screen.getByTestId('cdss-ccd-module-coronary-lipid-lowering')).toHaveTextContent('需臨床確認')
  })

  it('recomputes the real coronary pack after clinic blood pressure is entered', () => {
    useClinicVitalsStore.setState({ byPatientId: {} })
    useEvidenceOverridesStore.setState({ byPatientId: {} })
    render(<CoronaryPreview scenario="missing" />)
    expect(screen.getByTestId('cdss-ccd-metric-bloodPressure')).toHaveAttribute('data-missing', 'true')
    fireEvent.click(screen.getByRole('button', { name: /補填／修改門診量測/ }))
    fireEvent.change(screen.getByTestId('cdss-hf-clinic-vitals-systolic'), { target: { value: '150' } })
    fireEvent.change(screen.getByTestId('cdss-hf-clinic-vitals-diastolic'), { target: { value: '90' } })
    fireEvent.click(screen.getByTestId('cdss-hf-clinic-vitals-save'))
    expect(screen.getByTestId('cdss-ccd-metric-bloodPressure')).toHaveTextContent('150/90')
    expect(screen.getByTestId('cdss-ccd-module-coronary-blood-pressure')).toHaveTextContent('150/90')
  })

  it('renders the pack wording and controls in English', () => {
    const profile = coronaryPreviewProfile('acs', NOW)
    const result = CORONARY_DISEASE_GUIDELINE_PACK.build({ profile, locale: 'en' })
    render(<ClinicalDecisionSupportView result={result} locale="en" profileFacts={profile.facts} />)
    expect(screen.getByTestId('cdss-coronary-board')).toHaveTextContent('Antithrombotic and lipid therapy')
    expect(within(screen.getByTestId('cdss-ccd-module-coronary-antiplatelet-strategy')).getByText(result.recommendations.find(item => item.id === 'coronary-antiplatelet-strategy')!.title)).toBeInTheDocument()
  })
})
