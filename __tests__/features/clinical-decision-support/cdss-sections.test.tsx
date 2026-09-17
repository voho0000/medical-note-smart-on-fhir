import { fireEvent, render, screen, within } from '@testing-library/react'
import { CdssModuleSections } from '@/features/clinical-decision-support/renderers/CdssModuleSections'
import { diagnosisContextOf, groupCdssSections, sectionOf } from '@/features/clinical-decision-support/renderers/cdss-sections'
import { focusVisitFlowTarget } from '@/features/clinical-decision-support/renderers/HeartFailureVisitFlow'
import type { CdssRecommendation } from '@/features/clinical-decision-support/types'

function item(id: string, fields: Partial<CdssRecommendation> = {}): CdssRecommendation {
  return { id, moduleName: id, domain: 'medication', priority: 'medium', status: 'review', title: id,
    recommendation: id, rationale: id, patientEvidence: [], nextActions: [`Act on ${id}`], guidelineReferences: [], safetyBoundary: '', ...fields }
}

describe('shared CDSS sections', () => {
  it('starts all sections closed, retains pending actions and expands each independently', () => {
    render(<CdssModuleSections recommendations={[item('urgent', { domain: 'safety', priority: 'high' })]} isEnglish renderDetail={() => null}
      sectionContent={{ diagnosis: <input aria-label="Visit note" defaultValue="Retained" />, prognosis: <p>Risk details</p> }} />)
    const diagnosis = screen.getByTestId('cdss-section-disclosure-diagnosis')
    const treatment = screen.getByTestId('cdss-section-disclosure-treatment')
    const prognosis = screen.getByTestId('cdss-section-disclosure-prognosis')
    for (const section of [diagnosis, treatment, prognosis]) expect(section).not.toHaveAttribute('open')
    expect(within(treatment.querySelector('summary')!).getByText('Priority safety review: Act on urgent')).toBeVisible()
    expect(screen.getByText('Risk details')).not.toBeVisible()
    fireEvent.click(diagnosis.querySelector('summary')!)
    fireEvent.change(screen.getByRole('textbox', { name: 'Visit note' }), { target: { value: 'Updated' } })
    fireEvent.click(prognosis.querySelector('summary')!)
    expect(diagnosis).toHaveAttribute('open')
    expect(prognosis).toHaveAttribute('open')
    expect(treatment).not.toHaveAttribute('open')
    fireEvent.click(diagnosis.querySelector('summary')!)
    fireEvent.click(diagnosis.querySelector('summary')!)
    expect(screen.getByRole('textbox', { name: 'Visit note' })).toHaveValue('Updated')
  })

  it('assigns every module once, preserves safety responsibility and respects pack metadata', () => {
    const modules = [item('diagnosis', { domain: 'diagnosis' }), item('safety', { domain: 'safety', moduleGroup: 'monitoring' }), item('risk', { kind: 'risk-stratification' }), item('future')]
    const groups = groupCdssSections([...modules, modules[0]])
    expect(groups.flatMap(group => group.modules).map(module => module.id).sort()).toEqual(modules.map(module => module.id).sort())
    expect(sectionOf(modules[1])).toBe('treatment')
    expect(sectionOf(modules[2])).toBe('prognosis')
    expect(sectionOf(Object.assign(item('custom'), { clinicalSection: 'diagnosis' }))).toBe('diagnosis')
  })

  it('leaves both module details open and keeps a deferred safety alert prominent', () => {
    const modules = [item('safety', { domain: 'safety', priority: 'high' }), item('medication')]
    render(<CdssModuleSections recommendations={modules} isEnglish renderDetail={module => <div>Reference {module.id}</div>} decisionLabel={() => 'Deferred'} />)
    const safety = screen.getByTestId('cdss-section-module-safety')
    const medication = screen.getByTestId('cdss-section-module-medication')
    fireEvent.click(screen.getByTestId('cdss-section-disclosure-treatment').querySelector('summary')!)
    fireEvent.click(safety.querySelector('summary')!)
    fireEvent.click(medication.querySelector('summary')!)
    expect(safety).toHaveAttribute('open')
    expect(medication).toHaveAttribute('open')
    expect(within(safety).getByText('Priority safety review')).toBeVisible()
    expect(within(safety).getByText('Recorded decision: Deferred')).toBeVisible()
    expect(within(safety).getByText('Reference safety')).toBeVisible()
  })

  it('retains completed modules and distinguishes an unimplemented prognosis from no risk', () => {
    render(<CdssModuleSections recommendations={[item('done', { status: 'no-action' }), item('heart-failure-hfref-gdmt')]} isEnglish renderDetail={() => 'Original evidence'} />)
    expect(screen.getByTestId('cdss-section-other-treatment')).toHaveTextContent('done')
    expect(screen.getByTestId('cdss-section-treatment')).toHaveTextContent('No pending module actions')
    expect(screen.getByTestId('cdss-section-prognosis')).toHaveTextContent('does not currently provide an outcome-risk estimate')
  })

  it('reads the pack mode rather than diagnosing from labels or numbers', () => {
    const phenotype = Object.assign(item('phenotype', { domain: 'diagnosis', title: 'EF 28%' }), { diagnosisContext: { mode: 'follow-up', basis: 'Confirmed source' } })
    expect(diagnosisContextOf(item('unknown', { title: 'Confirmed HF' }))).toBeUndefined()
    const view = render(<CdssModuleSections recommendations={[phenotype]} isEnglish renderDetail={() => null} />)
    expect(screen.getByRole('heading', { name: 'Condition follow-up' })).toBeVisible()
    view.rerender(<CdssModuleSections recommendations={[Object.assign({}, phenotype, { diagnosisContext: { mode: 'reassessment', basis: 'Objective conflict' } })]} isEnglish renderDetail={() => null} />)
    expect(screen.getByRole('heading', { name: 'Diagnostic reassessment' })).toBeVisible()
  })

  it('opens ancestor details before navigating to a shared question', () => {
    render(<details data-testid="assessment"><summary>Assessment</summary><div id="cdss-hf-question-nyha"><button>NYHA</button></div></details>)
    const target = document.getElementById('cdss-hf-question-nyha')!
    target.scrollIntoView = jest.fn()
    focusVisitFlowTarget({ kind: 'question', questionId: 'nyha' })
    expect(screen.getByTestId('assessment')).toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'NYHA' })).toHaveFocus()
  })
})
