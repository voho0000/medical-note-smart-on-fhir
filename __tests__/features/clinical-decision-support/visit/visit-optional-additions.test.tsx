/**
 * The pack's optional additions beyond brief §2.1 — a point's own next step,
 * plan notes, block notes, the decided headline, group labels, a checklist,
 * outlook cards and actions that answer a card's question. Each is honoured
 * when present; the §2.1 tests cover the host without them.
 */
import { useMemo } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { VisitDecisionScreen } from '@/features/clinical-decision-support/renderers/visit/VisitDecisionScreen'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { phenotypeAnswerForInput } from '@/features/clinical-decision-support/renderers/visit/physician-input'
import type { VisitDecisionModel } from '@/features/clinical-decision-support/types'
import type { PhenotypeAnswer } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
import type { CdssRecommendation, CdssResult } from '@/features/clinical-decision-support/types'
import {
  getPhysicianDecisions,
  usePhysicianDecisions,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { action, p1Model, p2Model, p3Model, p5Model, point } from './visit-model.fixtures'

// The rhythm panel reads the ECG reports through the clinical-data hook.
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => ({ diagnosticReports: [] }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const webStreams = require('node:stream/web')
for (const name of ['TransformStream', 'ReadableStream', 'WritableStream'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[name] === 'undefined') {
    ;(globalThis as Record<string, unknown>)[name] = webStreams[name]
  }
}

const PATIENT = 'optional-patient'

function Harness({ model, onPhysicianInput }: { model: VisitDecisionModel; onPhysicianInput?: jest.Mock }) {
  const decisions = usePhysicianDecisions(PATIENT)
  const record = usePhysicianDecisionsStore((state) => state.recordDecision)
  const clear = usePhysicianDecisionsStore((state) => state.clearDecision)
  const now = useMemo(() => new Date(), [])
  return (
    <VisitDecisionScreen
      model={model}
      isEnglish={false}
      now={now}
      packVersion="test"
      screenKey={`${PATIENT}:${model.packId}`}
      decisions={decisions}
      onRecordDecision={(key, input) => record(PATIENT, key, input)}
      onClearDecision={(key) => clear(PATIENT, key)}
      answers={{}}
      modules={new Map()}
      unmappedModules={[]}
      renderDetail={() => null}
      onPhysicianInput={onPhysicianInput}
    />
  )
}

function row(dp: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-visit-queue-dp="${dp}"]`)!
}

function primaryOf(element: HTMLElement): HTMLButtonElement {
  return element.querySelector<HTMLButtonElement>('[data-visit-primary]')!
}

/** P3 as a pack that describes the dose step on DP-07 itself. */
function p3WithNext(): VisitDecisionModel {
  const model = p3Model()
  return {
    ...model,
    points: model.points.map((item) => (item.dp === 'DP-07'
      ? {
        ...item,
        groupLabel: 'A 抗凝',
        next: {
          afterActionId: 'start-oac',
          headline: 'apixaban 5 mg bid',
          why: '減量條件 0/3',
          actions: [action('apixaban-5', 'apixaban 5 mg bid', 'prescribed', { primary: true, responseCheck: { text: 'Hb、Cr', withinDays: 30 } })],
        },
      }
      : item.dp === 'DP-08' || item.dp === 'DP-09' ? { ...item, groupLabel: 'A 抗凝' } : item.dp === 'DP-18' ? { ...item, groupLabel: 'R 節律' } : item)),
  }
}

beforeEach(() => {
  localStorage.clear()
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
})

describe('optional additions', () => {
  it('follows the pack’s own next step in the same row, under its own key', () => {
    render(<Harness model={p3WithNext()} />)
    // DP-07 is a row, not a cell; its card opens under the row from
    // 「依據與細節」, which only an undecided row offers — so it is opened
    // first and stays open while both steps are decided on the row.
    expect(document.querySelector('button[data-dp="DP-07"]')).toBeNull()
    fireEvent.click(document.querySelector<HTMLElement>('[data-visit-row-detail="DP-07"]')!)
    expect(row('DP-07')).toContainElement(screen.getByTestId('cdss-visit-detail'))
    fireEvent.click(primaryOf(row('DP-07')))
    expect(row('DP-07')).toHaveAttribute('data-decided', 'false')
    expect(primaryOf(row('DP-07'))).toHaveTextContent('apixaban 5 mg bid')
    expect(row('DP-07')).toHaveTextContent('減量條件 0/3')
    fireEvent.click(primaryOf(row('DP-07')))
    expect(row('DP-07')).toHaveAttribute('data-decided', 'true')
    const decisions = getPhysicianDecisions(PATIENT)
    expect(Object.keys(decisions).sort()).toEqual(['visit:af:DP-07', 'visit:af:DP-07:next'])
    expect(decisions['visit:af:DP-07:next']).toMatchObject({ actionId: 'apixaban-5', dp: 'DP-07' })
    // The waiting points are the pack's to settle; the host did not walk into them.
    expect(decisions['visit:af:DP-09']).toBeUndefined()

    // The opened card shows both steps, from the same records.
    const detail = screen.getByTestId('cdss-visit-detail')
    expect(row('DP-07')).toContainElement(detail)
    expect(within(detail).getAllByTestId('cdss-visit-decided').map((element) => element.textContent)).toEqual([
      expect.stringContaining('開始抗凝'),
      expect.stringContaining('apixaban 5 mg bid'),
    ])
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('apixaban 5 mg bid：Hb、Cr，30 天內')
  })

  it('prints the pack’s group labels as subheadings', () => {
    render(<Harness model={p3WithNext()} />)
    const treatment = screen.getByTestId('cdss-visit-column-treatment')
    expect([...treatment.querySelectorAll('[data-map-group]')].map((element) => element.textContent)).toEqual(
      expect.arrayContaining(['A 抗凝', 'R 節律']),
    )
  })

  it('lists plan notes that stand without a decision, and counts them in the return', () => {
    const model: VisitDecisionModel = { ...p5Model(), flags: ['post-hfh'], planNotes: [{ text: 'HF 住院後 6 週內密集回診', withinDays: 7 }] }
    render(<Harness model={model} />)
    expect(screen.getByTestId('cdss-visit-status')).toHaveAttribute('data-flags', 'post-hfh')
    expect(screen.getByTestId('cdss-visit-plan-notes')).toHaveTextContent('HF 住院後 6 週內密集回診，7 天內')
    expect(screen.getByTestId('cdss-visit-plan-return')).toHaveTextContent('建議 7 天內回診')
  })

  it('shows the pack’s decided headline once the queue is done', () => {
    render(<Harness model={{ ...p5Model(), queue: ['DP-10'], headlineWhenDecided: '今天的決定都記下了（pack）' }} />)
    fireEvent.click(primaryOf(row('DP-10')))
    expect(screen.getByRole('heading', { level: 3, name: '今天的決定都記下了（pack）' })).toBeInTheDocument()
  })

  it('uses the pack’s block note in place of the host’s', () => {
    render(<Harness model={{ ...p1Model(), blockNotes: { treatment: '確診後開啟（pack）' } }} />)
    expect(screen.getByTestId('cdss-visit-column-treatment-closed')).toHaveTextContent('確診後開啟（pack）')
  })

  // Clinician feedback 2026-09-28: what the record holds, one row each; what
  // it lacks, together on one line.
  it('shows a baseline checklist in 01, the missing items together on one line', () => {
    const model = p2Model()
    model.points = model.points.map((item) => (item.dp === 'DP-02'
      ? { ...item, checklist: [
        { key: 'ntProBnp', label: 'NT-proBNP', present: true, value: '3400', date: '09-10' },
        { key: 'ferritin', label: 'ferritin', present: false },
        { key: 'tsat', label: 'TSAT', present: false },
      ] }
      : item))
    render(<Harness model={model} />)
    const status = screen.getByTestId('cdss-visit-column-status')
    const items = [...status.querySelectorAll<HTMLElement>('[data-checklist-item]')]
    expect(items.map((item) => [item.dataset.checklistItem, item.dataset.present])).toEqual([
      ['ntProBnp', 'true'], ['ferritin', 'false'], ['tsat', 'false'],
    ])
    const missing = within(status).getByTestId('cdss-visit-checklist-missing')
    expect(missing).toHaveTextContent('缺ferritin、TSAT')
    expect(within(missing).getAllByText(/ferritin|TSAT/)).toHaveLength(2)
  })

  it('hands an action’s structured answer back when it is recorded', () => {
    const model = p1Model()
    model.points = model.points.map((item) => (item.dp === 'DP-00'
      ? { ...item, actions: [action('suspect-hf', '是', 'reviewed', { primary: true, physicianInput: { request: 'hf-suspicion', optionId: 'suspected' } }), action('not-hf', '否', 'reviewed')] }
      : item))
    const onPhysicianInput = jest.fn()
    render(<Harness model={model} onPhysicianInput={onPhysicianInput} />)
    fireEvent.click(primaryOf(row('DP-00')))
    expect(onPhysicianInput).toHaveBeenCalledWith({ request: 'hf-suspicion', optionId: 'suspected' })
  })

  it('writes the structured answer the card’s own control would', () => {
    const now = new Date('2026-09-27T10:00:00+08:00')
    expect(phenotypeAnswerForInput({ request: 'hf-suspicion', optionId: 'suspected' }, undefined, now))
      .toEqual({ hfSuspicion: 'suspected', answeredOn: '2026-09-27' })
    // 「HFpEF」 on DP-00 and 「確認 HFpEF」 on DP-34 are one diagnosis, written alike.
    const hfpef = { answeredOn: '2026-09-27', hfSuspicion: 'suspected', diagnosis: 'hfpEF', choice: 'preserved', hfpEfConfirmed: true }
    expect(phenotypeAnswerForInput({ request: 'hfpef-diagnosis-confirmation' }, { answeredOn: '2026-09-20', hfSuspicion: 'suspected' }, now))
      .toEqual(hfpef)
    expect(phenotypeAnswerForInput({ request: 'hf-suspicion', optionId: 'hfpef' }, undefined, now)).toEqual(hfpef)
    // 「HFrEF」 is 「<50%」 plus a confirmed diagnosis, so the pack opens HFrEF over the record.
    expect(phenotypeAnswerForInput({ request: 'hf-suspicion', optionId: 'hfref' }, undefined, now)).toEqual({
      answeredOn: '2026-09-27', hfSuspicion: 'suspected', diagnosis: 'hfrEF', choice: 'reduced',
      diagnosisConfirmation: { method: 'current', confirmedAt: now.toISOString(), basis: 'HFrEF：醫師臨床判斷' },
    })
    // Changing the answer takes back what the earlier one wrote, and nothing else.
    const switched = phenotypeAnswerForInput({ request: 'hf-suspicion', optionId: 'hfref' }, { ...hfpef, lvef: 58 } as PhenotypeAnswer, now)
    expect(switched).toMatchObject({ diagnosis: 'hfrEF', choice: 'reduced', lvef: 58 })
    expect(switched).not.toHaveProperty('hfpEfConfirmed')
    expect(phenotypeAnswerForInput({ request: 'hf-suspicion', optionId: 'maybe' }, undefined, now)).toBeUndefined()
    expect(phenotypeAnswerForInput({ request: 'hf-symptoms' }, undefined, now)).toBeUndefined()
  })

  it('routes that answer through the phenotype store in the view, and draws outlook cards in 03', () => {
    const onAnswerPhenotype = jest.fn()
    const model = p1Model()
    model.points = model.points.map((item) => (item.dp === 'DP-00'
      ? { ...item, actions: [action('suspect-hf', '是', 'reviewed', { primary: true, physicianInput: { request: 'hf-suspicion', optionId: 'suspected' } })] }
      : item))
    model.outlookModuleIds = ['hf-prognosis-shell']
    model.points.push(point({ dp: 'DP-33', label: '照護目標', state: 'not-included', block: 'outlook', group: 'goals' }))
    const card = (id: string): CdssRecommendation => ({
      id, moduleName: `模組 ${id}`, domain: 'monitoring', priority: 'medium', status: 'review', title: id,
      recommendation: '', rationale: '', patientEvidence: [], nextActions: [], guidelineReferences: [], safetyBoundary: '',
    })
    const result: CdssResult = {
      title: 'HF', summary: '', packId: 'heart-failure-cdss', packVersion: 't',
      recommendations: [card('heart-failure-phenotype'), card('hf-prognosis-shell')],
      automatedChecks: [], notEvaluated: [], disclaimer: '',
    }
    render(
      <ClinicalDecisionSupportView
        result={result}
        locale="zh-TW"
        patientId={PATIENT}
        layout="map"
        visitModel={model}
        physicianDecisions={{}}
        onRecordDecision={jest.fn()}
        phenotypeAnswer={undefined}
        onAnswerPhenotype={onAnswerPhenotype}
      />,
    )
    // 懷疑 HF？ is question 1 of 01's diagnostic assessment on this page, so
    // DP-00 is not listed again as a row; the answer still routes to the
    // phenotype store.
    expect(document.querySelector('[data-visit-queue-dp="DP-00"]')).toBeNull()
    // This fixture carries every-visit asks, so 01 opens on 追蹤; the question is under 診斷.
    fireEvent.click(screen.getByTestId('cdss-visit-status-view-diagnosis'))
    fireEvent.click(screen.getByTestId('cdss-hf-suspicion-option-suspected'))
    expect(onAnswerPhenotype).toHaveBeenCalledWith(expect.objectContaining({ hfSuspicion: 'suspected' }))
    expect(within(screen.getByTestId('cdss-visit-column-outlook')).getByTestId('cdss-visit-outlook-module-hf-prognosis-shell')).toBeInTheDocument()
    expect(screen.queryByTestId('cdss-visit-other-modules')).not.toBeInTheDocument()
  })
})
