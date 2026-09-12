import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { HYPERTENSION_GUIDELINE_PACK, type CdssPatientProfile, type CdssRecommendation, type CdssResult } from '@voho0000/personalized-care'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { buildHypertensionBoard } from '@/features/clinical-decision-support/renderers/hypertension-board'
import { buildClinicVitals, mergeClinicVitals, type ClinicVitals } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { applyClinicVitals } from '@/features/clinical-decision-support/utils/apply-clinic-vitals'
import { useEvidenceOverrides, useEvidenceOverridesStore } from '@/features/clinical-decision-support/stores/evidence-overrides.store'
import resistantFixture from '../../fixtures/htn/resistant-osa.profile.json'
import kidneyFixture from '../../fixtures/htn/ckd-albuminuria.profile.json'

const now = new Date('2026-09-04T00:00:00+08:00')
const resistant = resistantFixture as CdssPatientProfile
const kidney = kidneyFixture as CdssPatientProfile
const build = (profile = resistant) => HYPERTENSION_GUIDELINE_PACK.build({ profile, locale: 'zh-TW' })
const all = (result: CdssResult) => [...result.recommendations, ...(result.automatedChecks ?? []).flatMap((check) => check.recommendation ? [check.recommendation] : [])]

describe('hypertension board reads the real pack output', () => {
  it('uses the clinical scan order and distinguishes a missing UACR from a negative result', () => {
    const board = buildHypertensionBoard(build(), 'zh-TW', now, resistant.facts)!
    expect(board.metrics.map((item) => item.factKey)).toEqual(['bloodPressure', 'potassium', 'eGFR', 'serumCreatinine', 'sodium', 'urineAlbuminRatioQuantitative'])
    expect(board.metrics[0]).toMatchObject({ value: '154/96', date: '2026-06-12', kind: 'measure', stale: false })
    expect(board.metrics.at(-1)?.kind).toBe('lab')
    expect(board.metrics.at(-1)?.value).toBeUndefined()
    expect(board.headline?.title).toContain('暫定分類')
  })

  it('retains stale values, quantitative albuminuria and original collection dates', () => {
    const board = buildHypertensionBoard(build(kidney), 'zh-TW', now, kidney.facts)!
    expect(board.metrics[0]).toMatchObject({ stale: true, date: '2026-05-05' })
    expect(board.metrics[0].value).toBeDefined()
    expect(board.metrics.at(-1)?.value).toBeDefined()
    expect(board.metrics.at(-1)?.unit).toBe('mg/g')
  })

  it('keeps one group judgement for all therapy rows and restores completed checks', () => {
    const result = build(kidney)
    const board = buildHypertensionBoard(result, 'zh-TW', now, kidney.facts)!
    expect(board.therapies).toHaveLength(5)
    expect(board.therapies.every((item) => !('status' in item))).toBe(true)
    expect(board.byId.get('hypertension-regimen-audit')?.status).toBe('no-action')
    expect([...board.byId.keys()].sort()).toEqual(all(result).map((item) => item.id).sort())
    expect(Object.values(board.statusCounts).reduce((sum, count) => sum + count, 0)).toBe(all(result).length)
  })

  it('does not build a hypertension board for another pack', () => {
    expect(buildHypertensionBoard({ ...build(), packId: 'heart-failure-cdss' }, 'zh-TW', now)).toBeUndefined()
  })

  it('puts severe BP safety ahead of elective decisions', () => {
    const profile = applyClinicVitals(resistant, buildClinicVitals({ entries: { systolic: { value: 190 }, diastolic: { value: 124 } } }, now))
    const board = buildHypertensionBoard(build(profile), 'zh-TW', now, profile.facts)!
    expect(board.alerts.map((item) => item.id)).toContain('hypertension-severe-safety')
    expect(board.firstAction?.id).toBe('hypertension-severe-safety')
  })
})

describe('hypertension disclosures and recomputation', () => {
  beforeEach(() => useEvidenceOverridesStore.setState({ byPatientId: {} }))

  it.each([resistant, kidney])('keeps every module reachable for $id', (profile) => {
    const result = build(profile)
    const board = buildHypertensionBoard(result, 'zh-TW', now, profile.facts)!
    render(<ClinicalDecisionSupportView result={result} locale="zh-TW" patientId={profile.id} profileFacts={profile.facts} />)
    expect(screen.getByTestId('cdss-htn-board')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-clinical-summary')).not.toBeInTheDocument()
    for (const button of screen.queryAllByTestId('cdss-module-group-no-action')) {
      if (button.getAttribute('aria-expanded') === 'false') fireEvent.click(button)
    }
    for (const item of all(result)) {
      if (board.consumedIds.has(item.id)) {
        const row = screen.getByTestId(`cdss-htn-module-${item.id}`)
        fireEvent.click(within(row).getAllByRole('button')[0])
        expect(within(row).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'true')
        expect(row).toHaveTextContent(item.title)
      } else {
        // Completed group names must remain visible before expansion too.
        expect(screen.getAllByText(item.moduleName!, { exact: false }).length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the classic module view available', () => {
    render(<ClinicalDecisionSupportView result={build()} locale="zh-TW" layout="classic" />)
    expect(screen.queryByTestId('cdss-htn-board')).not.toBeInTheDocument()
    expect(screen.getByTestId('cdss-module-cell-hypertension-bp-category')).toBeInTheDocument()
  })

  it('rejects half a BP, recomputes the pack after entry, and clears only BP', () => {
    function Visit() {
      const [vitals, setVitals] = useState<ClinicVitals>(() => buildClinicVitals({ entries: { bodyWeight: { value: 77 } } }, now))
      const profile = applyClinicVitals(resistant, vitals)
      return <><output data-testid="weight">{vitals.entries.bodyWeight?.value}</output><ClinicalDecisionSupportView result={build(profile)} locale="zh-TW" patientId={resistant.id} profileFacts={profile.facts} clinicVitals={vitals} onSaveClinicVitals={(patch) => setVitals(mergeClinicVitals(vitals, patch, now))} /></>
    }
    render(<Visit />)
    fireEvent.click(screen.getByRole('button', { name: '輸入門診血壓' }))
    expect(screen.queryByTestId('cdss-htn-clinic-vitals-bodyWeight')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('cdss-htn-clinic-vitals-systolic'), { target: { value: '190' } })
    expect(screen.getByTestId('cdss-htn-clinic-vitals-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('cdss-htn-clinic-vitals-diastolic'), { target: { value: '124' } })
    fireEvent.click(screen.getByTestId('cdss-htn-clinic-vitals-save'))
    expect(screen.getByTestId('cdss-htn-metric-bloodPressure')).toHaveTextContent('190/124')
    expect(screen.getByTestId('cdss-htn-metric-bloodPressure')).toHaveAttribute('data-entered', 'true')
    expect(screen.getByTestId('cdss-htn-module-hypertension-severe-safety')).toBeInTheDocument()
    expect(screen.getByTestId('cdss-htn-module-hypertension-measurement')).toHaveTextContent('需以標準化居家平均確認')
    fireEvent.click(screen.getByRole('button', { name: '輸入門診血壓' }))
    fireEvent.click(screen.getByTestId('cdss-htn-clinic-vitals-clear'))
    expect(screen.getByTestId('cdss-htn-metric-bloodPressure')).toHaveTextContent('154/96')
    expect(screen.getByTestId('weight')).toHaveTextContent('77')
  })

  it('recomputes an included CKD risk row through the profile', () => {
    let latest: CdssRecommendation | undefined
    function Visit() {
      const overrides = useEvidenceOverrides(kidney.id)
      const result = build({ ...kidney, evidenceOverrides: overrides })
      latest = all(result).find((item) => item.id === 'hypertension-treatment-threshold')
      return <ClinicalDecisionSupportView result={result} locale="zh-TW" patientId={kidney.id} />
    }
    render(<Visit />)
    const before = latest!.title
    fireEvent.click(screen.getByTestId('cdss-recommendation-trigger-hypertension-treatment-threshold'))
    fireEvent.click(screen.getByTestId('cdss-evidence-switch-htn-threshold:ckd'))
    expect(latest!.title).not.toBe(before)
  })
})
