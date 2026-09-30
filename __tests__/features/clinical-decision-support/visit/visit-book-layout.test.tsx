/**
 * The pocket-handbook layout (`?visit=book`), drawn by the real pack for the
 * scenario bundles: the decision map beside the page, each point once, the
 * reasoning of a point to weigh under 看依據 — and the same decisions as the map.
 */
import { useMemo } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { usePhysicianDecisions, usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswerRecord, useVisitAnswersStore, visitAnswersOf } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { useAfAnswers, useAfAnswersStore } from '@/features/clinical-decision-support/stores/af-answers.store'
import { scenarioRun, type ScenarioId } from './scenario-models'

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

const PATIENT = 'book-patient'

function BookPage({ id, page }: { id: ScenarioId; page: 'hf' | 'af' }) {
  const decisions = usePhysicianDecisions(PATIENT)
  const record = useVisitAnswerRecord(PATIENT)
  const answers = useMemo(() => visitAnswersOf(record), [record])
  const afAnswers = useAfAnswers(PATIENT)
  const run = useMemo(() => scenarioRun(id, { page, answers, afAnswers }), [afAnswers, answers, id, page])
  return (
    <ClinicalDecisionSupportView
      result={run.result}
      locale="zh-TW"
      layout="map"
      patientId={PATIENT}
      visitModel={run.model}
      companionResults={run.companion ? [run.companion] : undefined}
      profileFacts={run.profile.facts}
      physicianDecisions={decisions}
      onRecordDecision={(key, input) => usePhysicianDecisionsStore.getState().recordDecision(PATIENT, key, input)}
      onClearDecision={(key) => usePhysicianDecisionsStore.getState().clearDecision(PATIENT, key)}
      visitAnswers={answers}
      onVisitAnswer={(ask, value) => useVisitAnswersStore.getState().answer(PATIENT, ask, value)}
      afAnswers={afAnswers}
      onAfAnswer={(questionId, value) => useAfAnswersStore.getState().answer(PATIENT, questionId, value)}
    />
  )
}

const entry = (dp: string) => document.querySelector<HTMLElement>(`[data-book-dp="${dp}"]`)!
const mapLine = (dp: string) => document.querySelector<HTMLElement>(`[data-book-map-dp="${dp}"]`)!

beforeAll(() => {
  window.history.pushState({}, '', '/?visit=book')
  Element.prototype.scrollIntoView = jest.fn()
})
afterAll(() => window.history.pushState({}, '', '/'))
beforeEach(() => {
  usePhysicianDecisionsStore.getState().clearDecisions(PATIENT)
  useAfAnswersStore.getState().clear(PATIENT)
})

describe('the pocket-handbook layout', () => {
  it('draws every point of the HF page once, in the map beside it, and DP-01 under 診斷與分型 (P9)', () => {
    render(<BookPage id="p9-hfpef-af-dose" page="hf" />)
    expect(screen.getByTestId('cdss-visit-screen')).toHaveAttribute('data-layout', 'book')
    const map = screen.getByTestId('cdss-book-map')
    // The map lists every point, the page's absent ones included.
    for (const dp of ['DP-00', 'DP-01', 'DP-07', 'DP-09', 'DP-14', 'DP-16']) expect(within(map).getByText(dp)).toBeInTheDocument()
    expect(mapLine('DP-09')).toHaveAttribute('data-book-mark', 'act')
    expect(mapLine('DP-07')).toHaveAttribute('data-book-mark', 'absent')
    expect(entry('DP-01')).toHaveTextContent('確診與分型')
    // Each point once: one entry per present point.
    expect(document.querySelectorAll('[data-book-dp="DP-09"]')).toHaveLength(1)
  })

  it('keeps the criteria in view and opens 看依據 without a second set of buttons (P9 DP-14)', () => {
    render(<BookPage id="p9-hfpef-af-dose" page="hf" />)
    const row = entry('DP-14')
    expect(row).toHaveTextContent('年齡 ≥80')
    expect(within(row).getAllByRole('button', { name: /改 2\.5 mg bid/ })).toHaveLength(1)
    fireEvent.click(within(row).getByRole('button', { name: /看依據/ }))
    const panel = within(row).getByTestId('cdss-book-reasoning')
    expect(within(panel).getByTestId('cdss-book-guideline-points')).toBeVisible()
    // What would change the answer, as the pack computes it from the dose rule.
    expect(within(panel).getByTestId('cdss-book-changes-if')).toHaveTextContent('體重 >60 kg → apixaban 5 mg bid（3 項中 1 項）')
    // Every DOAC side by side at this patient's dose, the prescribed one marked.
    const table = within(panel).getByTestId('cdss-book-option-table')
    expect(table).toHaveTextContent('各 DOAC 在這位病人（CrCl 32）')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      'apixaban ← 現用5 mg bid2.5 mg bid年齡 ≥80（80 歲）、體重 ≤60 kg（58 kg）',
      'rivaroxaban20 mg qd15 mg qdCrCl 15–49 mL/min（32 mL/min）',
      'edoxaban60 mg qd30 mg qdCrCl 15–50 mL/min（32 mL/min）、體重 ≤60 kg（58 kg）',
      'dabigatran150 mg bid110 mg bid年齡 ≥80（80 歲）',
    ])
    expect(within(row).getAllByRole('button', { name: /改 2\.5 mg bid/ })).toHaveLength(1)
    // 收起依據 in the panel closes it.
    fireEvent.click(within(panel).getByRole('button', { name: '收起依據' }))
    expect(within(row).queryByTestId('cdss-book-reasoning')).toBeNull()
    // DP-09's start: 起始劑量怎麼選, footnote f its own step, the values beside it.
    fireEvent.click(within(entry('DP-09')).getByRole('button', { name: /看依據/ }))
    const start = within(entry('DP-09')).getByTestId('cdss-book-start-doses')
    expect(start).toHaveTextContent('起始劑量怎麼選（ESC 2026 Table 11）')
    expect(start).toHaveTextContent('本病人：K 4.4、eGFR 40')
    expect(within(start).getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual([
      'spironolactone12.5 mg o.d.可選的較低起始：腎功能或高血鉀需謹慎時（Table 11 註 f）',
      '25 mg o.d.起始（Table 11：12.5–25 mg o.d.）',
      '50 mg o.d.目標（Table 11）；RALES 試驗劑量 25 mg；心衰竭惡化且 K 允許時可加到 50 mg',
      'eplerenone25 mg o.d.起始（Table 11）',
      '50 mg o.d.目標（Table 11）',
    ])
    // A reminder has no 看依據.
    expect(within(entry('DP-15')).queryByRole('button', { name: /看依據/ })).toBeNull()
  })

  it('records a chain on its row and marks it settled in the map (P3 DP-07)', () => {
    render(<BookPage id="p3-new-af" page="af" />)
    const primary = () => entry('DP-07').querySelector<HTMLButtonElement>('[data-visit-primary]')!
    expect(primary()).toHaveTextContent('開始抗凝')
    fireEvent.click(primary())
    expect(entry('DP-07')).toHaveTextContent('選 DOAC')
    fireEvent.click(primary())
    expect(mapLine('DP-07')).toHaveAttribute('data-book-mark', 'done')
    expect(screen.getByTestId('cdss-book-end')).toHaveTextContent('apixaban 5 mg bid')
  })
})
