/**
 * The decision map built by the real pack for the eleven scenario bundles.
 *
 * Each bundle goes through the app's own import parser, the FHIR adapter, the
 * host's AF calculators and the pack's `applyVisitAnswers` /
 * `buildVisitDecisionModel` (see `scenario-models`), and the map is drawn by
 * the real view. The assertions are brief §7's, with the deviation the
 * pack's author accepted:
 *
 * - R2 reads the previous weight up to 120 days back, not 90 (P4's basis is a
 *   06-20 weight).
 *
 * Words are the pack's, so the assertions quote the pack; the host's own words
 * (「建議 N 天內回診」, 「今天的決定都記下了」 when the pack has none) are chrome.
 */
import { useMemo } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import type { VisitAnswers } from '@/features/clinical-decision-support/types'
import { usePhysicianDecisions, usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswerRecord, useVisitAnswersStore, visitAnswersOf } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { useClinicVitalsStore } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { usePhenotypeAnswer, usePhenotypeAnswerStore } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
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

const PATIENT = 'scenario-patient'

/** The map for a scenario, rebuilt by the pack from every answer given on it. */
function ScenarioMap({ id, page = 'hf', layout = 'map' }: { id: ScenarioId; page?: 'hf' | 'af'; layout?: 'map' | 'sections' }) {
  const decisions = usePhysicianDecisions(PATIENT)
  const record = useVisitAnswerRecord(PATIENT)
  const answers = useMemo(() => visitAnswersOf(record), [record])
  const phenotype = usePhenotypeAnswer(PATIENT)
  const run = useMemo(() => scenarioRun(id, { page, answers, phenotype }), [answers, id, page, phenotype])
  const afAnswers = useAfAnswers(PATIENT)
  return (
    <ClinicalDecisionSupportView
      result={run.result}
      locale="zh-TW"
      layout={layout}
      patientId={PATIENT}
      visitModel={run.model}
      companionResult={run.companion}
      profileFacts={run.profile.facts}
      physicianDecisions={decisions}
      onRecordDecision={(key, input) => usePhysicianDecisionsStore.getState().recordDecision(PATIENT, key, input)}
      onClearDecision={(key) => usePhysicianDecisionsStore.getState().clearDecision(PATIENT, key)}
      visitAnswers={answers}
      onVisitAnswer={(ask, value) => useVisitAnswersStore.getState().answer(PATIENT, ask, value)}
      onSaveClinicVitals={(patch) => useClinicVitalsStore.getState().setVitals(PATIENT, patch)}
      phenotypeAnswer={phenotype}
      onAnswerPhenotype={(answer) => usePhenotypeAnswerStore.getState().setAnswer(PATIENT, answer)}
      afAnswers={afAnswers}
      onAfAnswer={(questionId, value) => useAfAnswersStore.getState().answer(PATIENT, questionId, value)}
    />
  )
}

/**
 * Every decision row on the page, in page order — 01's, 02's, then 03's, each
 * at the head of its section — or one section's.
 */
function queue(block?: 'status' | 'treatment' | 'outlook'): { dp: string; primary: string | null }[] {
  const scope = block ? document.querySelector(`[data-testid="cdss-visit-queue-${block}"]`) : document
  return [...(scope?.querySelectorAll<HTMLElement>('[data-visit-queue-row]') ?? [])].map((row) => ({
    dp: row.dataset.visitCurrentDp ?? row.dataset.visitQueueDp ?? '',
    primary: row.querySelector('[data-visit-primary]')?.textContent ?? null,
  }))
}

function row(dp: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[data-visit-queue-row]')].find((element) => element.dataset.visitQueueDp === dp)
  if (!found) throw new Error(`no queue row ${dp}`)
  return found
}

function primaryOf(dp: string): HTMLButtonElement {
  return row(dp).querySelector<HTMLButtonElement>('[data-visit-primary]')!
}

function queryCell(dp: string, source = 'hf'): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-map"] button[data-dp]')]
    .find((element) => element.dataset.dp === dp && element.dataset.source === source)
}

function cell(dp: string, source = 'hf'): HTMLElement {
  const found = queryCell(dp, source)
  if (!found) throw new Error(`no map cell ${source}:${dp}`)
  return found
}

/** A pillar's box in 02's 四支柱, whatever its state: a queued row, a box deciding in place, or a plain box. */
function pillar(dp: string): HTMLElement {
  const box = document.querySelector<HTMLElement>(`[data-testid="cdss-visit-pillars"] [data-visit-queue-dp="${dp}"], [data-testid="cdss-visit-pillars"] [data-visit-point-box="${dp}"]`)
  if (!box) throw new Error(`no pillar box ${dp}`)
  return box
}

/** A row's 「依據與細節」: a queued point has no cell; its card opens under the row. */
function rowDetail(dp: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-visit-row-detail="${dp}"]`)
  if (!found) throw new Error(`no 依據與細節 on row ${dp}`)
  return found
}

function point(id: ScenarioId, dp: string, options: { page?: 'hf' | 'af'; answers?: VisitAnswers; source?: 'hf' | 'af' } = {}) {
  const { model } = scenarioRun(id, options)
  const found = model.points.find((item) => item.dp === dp && (!options.source || item.source === options.source))
  if (!found) throw new Error(`${id}: no ${dp}`)
  return found
}

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn()
  localStorage.clear()
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useClinicVitalsStore.setState({ byPatientId: {} })
  usePhenotypeAnswerStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useAfAnswersStore.setState({ patientId: undefined, answers: {} })
})

describe('real pack · P3 new AF (AF page)', () => {
  it('asks symptoms and bleeding and walks the anticoagulation chain in one row', () => {
    render(<ScenarioMap id="p3-new-af" page="af" />)
    expect(document.querySelector('[data-visit-ask="af-symptoms"]')).not.toBeNull()
    expect(document.querySelector('[data-visit-ask="bleeding"]')).not.toBeNull()
    expect(queue()).toEqual([{ dp: 'DP-07', primary: '開始抗凝' }])
    fireEvent.click(primaryOf('DP-07'))
    expect(queue()).toHaveLength(1)
    expect(row('DP-07')).toHaveAttribute('data-decided', 'false')
    expect(primaryOf('DP-07')).toHaveTextContent('apixaban 5 mg bid')
    expect(row('DP-07')).toHaveTextContent('0/3')
    fireEvent.click(primaryOf('DP-07'))
    expect(row('DP-07')).toHaveAttribute('data-decided', 'true')
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('Hb、Cr')
    expect(screen.getByTestId('cdss-visit-plan-return')).toHaveTextContent('建議 30 天內回診')
  })

  it('queues rhythm control once symptoms are answered 「有」, and keeps screening out of the queue', () => {
    render(<ScenarioMap id="p3-new-af" page="af" />)
    fireEvent.click(document.querySelector('[data-visit-ask="af-symptoms"][data-value="yes"]')!)
    expect(queue().map((item) => item.dp)).toContain('DP-18')
    expect(primaryOf('DP-18')).toHaveTextContent('討論節律控制')
    expect(cell('DP-13', 'af')).toHaveAttribute('data-state', 'confirm')
    expect(cell('DP-13', 'af')).toHaveTextContent('138/84')
    for (const dp of ['DP-04', 'DP-05', 'DP-06']) expect(queue().map((item) => item.dp)).not.toContain(dp)
  })
})

describe('real pack · P4 stable and optimised', () => {
  it('has an empty queue, an unprefilled weight and settled pillars (spironolactone 25 mg settled)', () => {
    const { model } = scenarioRun('p4-stable-optimised')
    expect(model.stage).toBe('follow-up')
    expect(model.queue).toEqual([])
    // The cloud record's weights are health-check weights: never prefilled.
    expect(model.asks.find((ask) => ask.id === 'weight-trend')?.prefill).toBeUndefined()
    expect(model.points.filter((item) => item.state === 'act' || item.state === 'safety')).toEqual([])
    for (const dp of ['DP-07', 'DP-08', 'DP-09', 'DP-10']) expect(point('p4-stable-optimised', dp).state).toBe('done')
    expect(point('p4-stable-optimised', 'DP-09').headline).toBe('spironolactone 25 mg：足量')

    render(<ScenarioMap id="p4-stable-optimised" />)
    // An empty queue draws no decision list in any section (there is no
    // 「今天沒有要決定的事」 line any more). 02's one item is DP-12's iron
    // screen — the record has no ferritin — which is a confirm, not a row.
    expect(queue()).toEqual([])
    for (const block of ['status', 'treatment', 'outlook']) {
      expect(screen.queryByTestId(`cdss-visit-queue-${block}`)).toBeNull()
    }
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveTextContent('需你確認 1')
    expect(point('p4-stable-optimised', 'DP-12').state).toBe('confirm')
    expect(document.querySelector('[data-prefilled="true"]')).toBeNull()
  })

  // Clinician feedback 2026-09-28: 「治療隨時 HFrEF 的四大支柱呢…都要出現」.
  it('keeps the four pillars together at the head of 02, settled ones too, and not again as cells', () => {
    render(<ScenarioMap id="p4-stable-optimised" />)
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-treatment'))
    const treatment = screen.getByTestId('cdss-visit-column-treatment')
    const pillars = within(treatment).getByTestId('cdss-visit-pillars')
    expect(pillars).toHaveTextContent('四支柱')
    for (const dp of ['DP-07', 'DP-08', 'DP-09', 'DP-10']) {
      expect(pillars).toContainElement(pillar(dp))
      expect(pillar(dp)).toHaveTextContent('已定')
      expect(queryCell(dp)).toBeUndefined()
    }
    // DP-26 joins them only while a pillar is paused; there is none here.
    expect(queryCell('DP-26')).toBeUndefined()
    expect(within(pillars).queryByText('暫停與重啟')).toBeNull()
  })

  it('opens the settled DP-09 with the 50 mg target in its reason, no button, the guideline folded', () => {
    render(<ScenarioMap id="p4-stable-optimised" />)
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-treatment'))
    fireEvent.click(rowDetail('DP-09'))
    const detail = screen.getByTestId('cdss-visit-detail')
    // Right under the pair of pillar boxes it was opened from.
    expect(screen.getByTestId('cdss-visit-pillars')).toContainElement(detail)
    expect(detail).toHaveTextContent('Table 11 目標 50 mg o.d.；RALES 試驗劑量 25 mg')
    expect(within(detail).queryByRole('button', { name: '上調至 50 mg' })).toBeNull()
    const evidence = screen.getByTestId('cdss-visit-detail-module-heart-failure-mra')
    expect(evidence).not.toHaveAttribute('open')
    expect(evidence).toHaveTextContent('指引與依據')
    expect(screen.getByTestId('cdss-visit-detail-module-body-heart-failure-mra')).not.toBeVisible()
    fireEvent.click(evidence.querySelector('summary')!)
    expect(evidence).toHaveAttribute('open')
    expect(screen.getByTestId('cdss-visit-detail-module-body-heart-failure-mra')).toBeVisible()
  })
})

describe('real pack · P5 titrating with AF', () => {
  it('queues ARNI, MRA and SGLT2i; confirms the beta-blocker dose; settles AF anticoagulation', () => {
    render(<ScenarioMap id="p5-titrating-af" />)
    expect(queue()).toEqual([
      { dp: 'DP-07', primary: '換 ARNI' },
      { dp: 'DP-09', primary: '開始 MRA' },
      { dp: 'DP-10', primary: '開始 SGLT2i' },
    ])
    expect(row('DP-07')).toHaveTextContent('ramipril → 換 ARNI？')
    // All three decide in their pillar boxes at the head of 02 — not as a
    // separate list, and not repeated as cells.
    const pillars = screen.getByTestId('cdss-visit-pillars')
    for (const dp of ['DP-07', 'DP-09', 'DP-10']) {
      expect(pillars).toContainElement(row(dp))
      expect(queryCell(dp)).toBeUndefined()
    }
    expect(queue('treatment')).toEqual([])
    // The map opens section by section: with no safety row the visit starts
    // at 01, open; 02 and 03 are closed, and 02 says what it holds.
    expect(screen.getByTestId('cdss-visit-section-toggle-status')).toHaveAttribute('aria-expanded', 'true')
    for (const block of ['treatment', 'outlook']) {
      expect(screen.getByTestId(`cdss-visit-section-toggle-${block}`)).toHaveAttribute('aria-expanded', 'false')
    }
    // 02's toggle reads its rows first (the three starts, counted once), then
    // what its cells add: the β-blocker dose and DP-12's iron screen.
    const treatmentToggle = screen.getByTestId('cdss-visit-section-toggle-treatment')
    expect(treatmentToggle).toHaveTextContent('待決定 3 · 需你確認 2')
    expect(treatmentToggle).not.toHaveTextContent('需處理')
    fireEvent.click(treatmentToggle)
    expect(screen.getByTestId('cdss-visit-column-treatment')).toBeVisible()
    // The beta-blocker's dose to confirm is decided in its own pillar box.
    expect(pillar('DP-08')).toHaveAttribute('data-visit-queue-state', 'confirm')
    expect(pillar('DP-08')).toHaveTextContent('bisoprolol 2.5 mg／目標 10 mg')
    expect(within(pillar('DP-08')).getByRole('button', { name: '上調至 5 mg' })).toBeInTheDocument()
    expect(cell('DP-14', 'af')).toHaveAttribute('data-state', 'done')
    expect(cell('DP-14', 'af')).toHaveTextContent('apixaban 5 mg bid：劑量符合')
    fireEvent.click(cell('DP-14', 'af'))
    expect(screen.getByTestId('cdss-visit-detail')).toHaveTextContent('減量條件 0/3')
  })

  it('records the three primaries, plans their checks and says the day is decided', () => {
    render(<ScenarioMap id="p5-titrating-af" />)
    for (const dp of ['DP-07', 'DP-09', 'DP-10']) fireEvent.click(primaryOf(dp))
    const plan = screen.getByTestId('cdss-visit-plan')
    expect(plan).toHaveTextContent('K、Cr、血壓，14 天內')
    expect(screen.getByTestId('cdss-visit-plan-return')).toHaveTextContent('建議 14 天內回診')
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveTextContent('已決定 3')
    expect(screen.getByRole('heading', { level: 3, name: '今天的決定都記下了' })).toBeInTheDocument()
  })
})

describe('real pack · P6 hyperkalaemia', () => {
  it('puts the MRA hold first as a safety row and does not titrate RAS', () => {
    render(<ScenarioMap id="p6-hyperkalaemia" />)
    expect(queue()).toEqual([{ dp: 'DP-09', primary: '暫停 MRA' }])
    expect(row('DP-09')).toHaveAttribute('data-visit-queue-state', 'safety')
    expect(row('DP-09')).toHaveTextContent('K 5.7 → 暫停 MRA？')
    expect(pillar('DP-07')).toHaveAttribute('data-state', 'info')
    fireEvent.click(primaryOf('DP-09'))
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('K、Cr，7 天內')
    expect(screen.getByTestId('cdss-visit-plan-return')).toHaveTextContent('建議 7 天內回診')
  })

  it('shows the pack’s own status on the card a row or cell opens, not the host re-grade', () => {
    render(<ScenarioMap id="p6-hyperkalaemia" />)
    // The flow layout's re-grade reads K ≥5.0 and would call both of these
    // 「需臨床確認」; on the map the card says what the pack said. DP-09 is the
    // safety row (no cell), so its card opens under the row; DP-07 is a cell.
    expect(queryCell('DP-09')).toBeUndefined()
    fireEvent.click(rowDetail('DP-09'))
    // In 四支柱 the card opens right under the pair of boxes, full width.
    expect(screen.getByTestId('cdss-visit-pillars')).toContainElement(screen.getByTestId('cdss-visit-detail'))
    const mra = within(screen.getByTestId('cdss-visit-detail')).getByTestId('cdss-visit-detail-module-heart-failure-mra')
    expect(mra.querySelector('[data-module-status]')).toHaveAttribute('data-module-status', 'actionable')
    fireEvent.click(rowDetail('DP-07'))
    // K 5.7 on the ARNI: the pack's own card calls for a temporary reduction
    // (ESC §6.1.6) beside the MRA hold, not 「維持現劑量」.
    const ras = within(screen.getByTestId('cdss-visit-detail')).getByTestId('cdss-visit-detail-module-heart-failure-ras-inhibition')
    expect(ras.querySelector('[data-module-status]')).toHaveAttribute('data-module-status', 'review')
    expect(pillar('DP-07')).toHaveTextContent('先處理高血鉀')
  })
})

describe('real pack · P4 on 01’s 診斷 view', () => {
  // Clinician feedback 2026-09-28: 「補記診斷確認紀錄你覺得有需要留嗎？」 — a
  // diagnosis the record already carries is not confirmed a second time.
  it('offers no 補記診斷確認紀錄 for a diagnosis the record holds; DP-01 names it', () => {
    render(<ScenarioMap id="p4-stable-optimised" />)
    fireEvent.click(screen.getByTestId('cdss-visit-status-view-diagnosis'))
    const view = screen.getByTestId('cdss-visit-hf-diagnosis-view')
    expect(within(view).queryByTestId('cdss-diagnosis-confirmation')).toBeNull()
    expect(within(view).queryByText('補記診斷確認紀錄')).toBeNull()
    // DP-01 is the diagnosis question on every chart (clinician feedback:
    // 「診斷留著讓人修改的空間」), drawn as a map point, standing on the record.
    const dp01 = within(view).getByTestId('cdss-hf-question-hf-suspicion')
    expect(dp01).toHaveAttribute('data-dp', 'DP-01')
    expect(within(dp01).getByTestId('cdss-hf-question-answer-hf-suspicion')).toHaveTextContent('HFrEF（紀錄）')
    expect(dp01).toHaveTextContent('I50.22')
    expect(dp01).toHaveTextContent('已定')
    // The map's own card for DP-01 is not drawn a second time beside it.
    expect(queryCell('DP-01')).toBeUndefined()
    // 修改 opens the choices in place, the record's answer chosen; no HFpEF for an LVEF below 50%.
    fireEvent.click(within(dp01).getByTestId('cdss-hf-question-edit-hf-suspicion'))
    expect(within(dp01).getByTestId('cdss-hf-suspicion-option-hfref')).toBeChecked()
    expect(within(dp01).queryByTestId('cdss-hf-suspicion-option-hfpef')).toBeNull()
    expect(dp01).toHaveTextContent('依 ESC 不列 HFpEF')
    // 不修改 closes it again, the record's answer standing.
    fireEvent.click(within(dp01).getByTestId('cdss-hf-question-collapse-hf-suspicion'))
    expect(within(dp01).queryByTestId('cdss-hf-suspicion-option-hfref')).toBeNull()
    expect(within(dp01).getByTestId('cdss-hf-question-answer-hf-suspicion')).toHaveTextContent('HFrEF（紀錄）')
  })
})

describe('real pack · P7 worsening congestion', () => {
  // ESC 2026 p.73: an NT-proBNP rise reopens nothing; the worsening is the
  // clinician's 喘變差, which DP-04 reads as clinical deterioration.
  it('stays a follow-up on the NT-proBNP rise and queues the diuretic once 喘變差 is answered, the weight asked rather than prefilled', () => {
    render(<ScenarioMap id="p7-worsening-congestion" />)
    expect(screen.getByTestId('cdss-visit-screen')).toHaveAttribute('data-stage', 'follow-up')
    expect(document.querySelector('[data-prefilled="true"]')).toBeNull()
    expect(queue()).toEqual([])
    act(() => {
      useVisitAnswersStore.getState().answer(PATIENT, 'dyspnoea-trend', 'worse')
      useVisitAnswersStore.getState().answer(PATIENT, 'weight-trend', 'up')
    })
    expect(queue()).toEqual([{ dp: 'DP-06', primary: '利尿劑加量' }])
    // DP-04 (reassessment) is one of 01's diagnosis points: a diagnosis
    // stands, so 01 opens on 追蹤 and DP-04's cell is under 診斷.
    expect(screen.getByTestId('cdss-visit-status-view-follow-up')).toHaveAttribute('aria-pressed', 'true')
    expect(queryCell('DP-04')).toBeUndefined()
    fireEvent.click(screen.getByTestId('cdss-visit-status-view-diagnosis'))
    expect(cell('DP-04')).toHaveAttribute('data-state', 'confirm')
    fireEvent.click(primaryOf('DP-06'))
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('體重、K、Cr，7 天內')
  })
})

describe('real pack · P8 first visit after an HF admission', () => {
  it('reassesses in the post-HFH window and queues MRA restart, ARNI and beta-blocker steps', () => {
    const { model } = scenarioRun('p8-post-discharge')
    expect(model.stage).toBe('reassess')
    expect(model.flags).toContain('post-hfh')
    render(<ScenarioMap id="p8-post-discharge" />)
    expect(screen.getByTestId('cdss-visit-triggers')).toHaveTextContent('09-05～09-12 HF 住院')
    // The pillars in their own places (07, 08, 09), each deciding in its box.
    expect(queue()).toEqual([
      { dp: 'DP-07', primary: '上調至 49/51' },
      { dp: 'DP-08', primary: '上調至 5 mg' },
      { dp: 'DP-09', primary: '重新開始 MRA' },
    ])
    expect(row('DP-07')).toHaveTextContent('ARNI 24/26 → 49/51 mg bid')
    expect(row('DP-08')).toHaveTextContent('bisoprolol 2.5 mg → 5 mg')
    expect(screen.getByTestId('cdss-visit-plan-notes')).toHaveTextContent('6 週內密集回診')
  })

  it('settles or asks about the diuretic once breathlessness is better and weight unchanged', () => {
    expect(point('p8-post-discharge', 'DP-06', { answers: { 'dyspnoea-trend': 'better' } }).state).toBe('ask')
    const state = point('p8-post-discharge', 'DP-06', { answers: { 'dyspnoea-trend': 'better', 'weight-trend': 'same' } }).state
    expect(['done', 'confirm']).toContain(state)
  })
})

describe('real pack · P9 HFpEF with AF, apixaban due for reduction', () => {
  it('stays in follow-up and queues the apixaban reduction and the MRA start', () => {
    const { model } = scenarioRun('p9-hfpef-af-dose')
    expect(model.stage).toBe('follow-up')
    render(<ScenarioMap id="p9-hfpef-af-dose" />)
    expect(document.querySelector('[data-prefilled="true"]')).toBeNull()
    // The MRA start in its pillar box at the head of 02; the AF dose below.
    expect(queue()).toEqual([
      { dp: 'DP-09', primary: '開始 MRA' },
      { dp: 'DP-14', primary: '改 2.5 mg bid' },
    ])
    expect(row('DP-14')).toHaveTextContent('apixaban 5 → 2.5 mg bid？')
    expect(row('DP-14')).toHaveTextContent('2/3')
    expect(row('DP-14')).toHaveTextContent('AF')
    // Weight is the clinician's answer now; until it is given DP-06 waits,
    // and 「減少」 on a loop diuretic asks whether it can come down.
    expect(cell('DP-06')).toHaveAttribute('data-state', 'ask')
    fireEvent.click(document.querySelector<HTMLElement>('[data-visit-ask="dyspnoea-trend"][data-value="stable"]')!)
    fireEvent.click(document.querySelector<HTMLElement>('[data-visit-ask="weight-trend"][data-value="down"]')!)
    expect(cell('DP-06')).toHaveAttribute('data-state', 'confirm')
    expect(cell('DP-06')).toHaveTextContent('體重減少 → 利尿劑是否減量？')
  })
})

describe('real pack · P11 dabigatran with CrCl under 30 (AF page)', () => {
  it('puts the contraindication first as a safety row', () => {
    render(<ScenarioMap id="p11-af-dabigatran-renal" page="af" />)
    expect(document.querySelector('[data-visit-ask="af-symptoms"]')).not.toBeNull()
    expect(document.querySelector('[data-visit-ask="bleeding"]')).not.toBeNull()
    expect(queue()).toEqual([{ dp: 'DP-09', primary: '改用其他 DOAC' }])
    expect(row('DP-09')).toHaveAttribute('data-visit-queue-state', 'safety')
    expect(row('DP-09')).toHaveTextContent('dabigatran')
    expect(row('DP-09')).toHaveTextContent('CrCl <30')
  })
})

describe('real pack · the other scenarios', () => {
  it('P1 suspected HFpEF: diagnosis first — 「HFrEF 還是 HFpEF？」 is question 1 of 01’s 診斷 view, not a queue row', () => {
    const { model } = scenarioRun('p1-suspected-hfpef')
    expect(model.stage).toBe('suspected')
    expect(model.queue).toEqual(['DP-01'])
    expect(model.asks).toEqual([])
    render(<ScenarioMap id="p1-suspected-hfpef" />)
    expect(screen.getByTestId('cdss-visit-column-treatment-closed')).toHaveTextContent('確診後開啟')
    expect(screen.getByTestId('cdss-visit-next-status')).toBeDisabled()
    // No 「比上次」 before a diagnosis: 01 is open on 診斷, and 追蹤 waits for one.
    expect(document.querySelector('[data-visit-ask]')).toBeNull()
    expect(screen.getByTestId('cdss-visit-column-status')).toBeVisible()
    expect(screen.getByTestId('cdss-visit-status-view-diagnosis')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('cdss-visit-status-view-follow-up')).toBeDisabled()
    // The assessment is in view and asks the diagnosis itself, as its only
    // question until it is answered: HFrEF, HFpEF or 還不確定 — no 「否」.
    const assessment = screen.getByTestId('cdss-visit-hf-diagnosis-view')
    expect(assessment).toBeVisible()
    expect(assessment).toHaveTextContent('診斷評估')
    expect(within(assessment).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent))
      .toEqual(['HFrEF（LVEF <50%）', 'HFpEF（LVEF ≥50%）', '還不確定'])
    expect([...assessment.querySelectorAll('[data-testid^="cdss-hf-question-"]')].map((item) => item.getAttribute('data-testid')))
      .toEqual(['cdss-hf-question-hf-suspicion'])
    expect(within(assessment).getByTestId('cdss-hf-question-hf-suspicion')).toHaveTextContent(/紀錄：LVEF 62%/)
    expect(screen.queryByTestId('cdss-visit-quick-confirm')).toBeNull()
    // …so neither a row nor a cell asks it a second time: 01 has no decision
    // list today, and DP-00 is not drawn as a cell.
    expect(queue()).toEqual([])
    expect(screen.queryByTestId('cdss-visit-queue-status')).toBeNull()
    // Question 1 is DP-01 (DP-00 folded into it), and DP-34 only waits on it:
    // none of them is drawn again beside the card.
    expect(queryCell('DP-00')).toBeUndefined()
    expect(queryCell('DP-01')).toBeUndefined()
    expect(queryCell('DP-34')).toBeUndefined()
    // Question 1 is the only confirmation on the page.
    expect(within(assessment).queryByTestId('cdss-diagnosis-confirmation')).toBeNull()
    // It comes before the other diagnosis points' cells on the page.
    expect(assessment.compareDocumentPosition(cell('DP-02')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('P1 「還不確定」: question 1 stays open, the HFpEF criteria come up under it, then symptoms and signs — no NYHA, no separate confirmation', () => {
    render(<ScenarioMap id="p1-suspected-hfpef" />)
    fireEvent.click(screen.getByTestId('cdss-hf-suspicion-option-suspected'))
    const assessment = screen.getByTestId('cdss-visit-hf-diagnosis-view')
    expect([...assessment.querySelectorAll('[data-testid^="cdss-hf-question-"]:not([data-testid*="answer"]):not([data-testid*="edit"])')]
      .map((item) => [item.getAttribute('data-testid'), item.getAttribute('data-number')]))
      .toEqual([
        // The diagnosis is drawn as DP-01, unnumbered; the card numbers from 1.
        ['cdss-hf-question-hf-suspicion', null],
        ['cdss-hf-question-symptoms', '1'],
        ['cdss-hf-question-signs', '2'],
      ])
    expect(within(assessment).getByTestId('cdss-hf-question-hf-suspicion')).toHaveAttribute('data-dp', 'DP-01')
    const evidence = within(assessment).getByTestId('cdss-hf-hfpef-evidence')
    expect(evidence).toHaveTextContent('HFpEF 診斷條件')
    expect(evidence).toHaveTextContent('LVEF ≥50%')
    // Three quiet rows that name what supports each criterion (clinician
    // feedback: 「畫面太花」), with Table 10 itself one press away.
    expect(within(evidence).getByTestId('cdss-hf-hfpef-criteria-count')).toHaveTextContent('2/3 成立')
    expect(within(evidence).getByTestId('cdss-hf-hfpef-criterion-line-lvef')).toHaveTextContent('62%，2026-09-20')
    expect(within(evidence).getByTestId('cdss-hf-hfpef-criterion-line-symptoms-signs')).toHaveTextContent('在下方勾選')
    const objective = within(evidence).getByTestId('cdss-hf-hfpef-criterion-line-objective-abnormality')
    expect(objective).toHaveTextContent('E/e′ 15')
    expect(objective).toHaveTextContent('TR Vmax 2.9 m/s')
    expect(objective).toHaveTextContent('NT-proBNP 680 pg/mL')
    const table10 = within(evidence).getByTestId('cdss-hf-hfpef-criterion-objective-abnormality').querySelector('details')!
    expect(table10.open).toBe(false)
    fireEvent.click(within(table10).getByText('Table 10'))
    expect(table10.open).toBe(true)
    const rows = within(table10).getByTestId('cdss-hf-hfpef-criterion-evidence')
    expect(rows).toHaveTextContent('門檻 >2.8 m/s')
    expect(rows).toHaveTextContent('未取得：')
    expect(evidence.querySelector('.bg-emerald-50')).toBeNull()
    // The verdict stays on question 1, open with 「還不確定」 chosen.
    expect(within(assessment).getByTestId('cdss-hf-suspicion-option-suspected')).toBeChecked()
    expect(within(assessment).getByTestId('cdss-hf-suspicion-option-hfpef')).not.toBeChecked()
    // Under question 1, before the symptoms that supply criterion (i)…
    expect(evidence.compareDocumentPosition(within(assessment).getByTestId('cdss-hf-question-symptoms')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // No 「確認 HFpEF」 at the foot (clinician feedback: 「直接回填第一題就好了」).
    expect(within(assessment).queryByTestId('cdss-hf-hfpef-confirm')).toBeNull()
    // Ticking a symptom and answering question 1 is the diagnosis.
    fireEvent.click(within(assessment).getByTestId('cdss-hf-suspicion-option-hfpef'))
    expect(usePhenotypeAnswerStore.getState().byPatientId[PATIENT]).toMatchObject({ diagnosis: 'hfpEF', hfpEfConfirmed: true })
  })

  it('P1 one press on 「HFpEF」 is the diagnosis; the page stays put and 02 is the clinician’s to open', () => {
    render(<ScenarioMap id="p1-suspected-hfpef" />)
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByTestId('cdss-hf-suspicion-option-hfpef'))
    expect(usePhenotypeAnswerStore.getState().byPatientId[PATIENT]).toMatchObject({ diagnosis: 'hfpEF', hfpEfConfirmed: true })
    // The answer stays where it was given, on 診斷, and can be changed there.
    expect(screen.getByTestId('cdss-visit-status-view-diagnosis')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('cdss-hf-question-answer-hf-suspicion')).toHaveTextContent('HFpEF（醫師判斷）')
    // A new diagnosis is still asked 喘／體重比上次 (many a first CDSS visit is
    // a returning patient): they stay in 追蹤, one home per question, and 診斷
    // names them — at the switch and at 01's foot, which leads to 追蹤 before
    // 02. Nothing moves until the clinician presses.
    expect(screen.queryByTestId('cdss-visit-asks')).toBeNull()
    expect(screen.getByTestId('cdss-visit-status-view-other-pending')).toHaveTextContent('「追蹤」還有：喘比上次、體重比上次')
    const step = screen.getByTestId('cdss-visit-next-step-status')
    expect(step).toHaveTextContent('下一步：追蹤（喘比上次、體重比上次）')
    expect(screen.queryByTestId('cdss-visit-next-status')).toBeNull()
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(step)
    expect(screen.getByTestId('cdss-visit-status-view-follow-up')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(document.querySelector('[data-visit-ask="dyspnoea-trend"][data-value="stable"]')!)
    fireEvent.click(document.querySelector('[data-visit-ask="weight-trend"][data-value="same"]')!)
    // Then 下一區 leads on to 02, when the clinician presses it.
    const next = screen.getByTestId('cdss-visit-next-status')
    expect(next).toBeEnabled()
    fireEvent.click(next)
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveAttribute('aria-expanded', 'true')
  })

  it('P2 new HFrEF: baseline, four starts in the pack order, baseline labs named', () => {
    const { model } = scenarioRun('p2-new-hfref')
    expect(model.stage).toBe('baseline')
    expect(model.queue).toEqual(['DP-08', 'DP-07', 'DP-09', 'DP-10'])
    expect(point('p2-new-hfref', 'DP-08').headline).toContain('bisoprolol 1.25 mg')
    expect(point('p2-new-hfref', 'DP-02').headline).toMatch(/ferritin.*TSAT.*TSH.*HbA1c/)
  })

  it('P10 improved EF: continue FMT, nothing queued', () => {
    const { model } = scenarioRun('p10-improved-ef')
    expect(model.queue).toEqual([])
    expect(model.headline).toContain('LVEF 28→55%')
    expect(point('p10-improved-ef', 'DP-27').state).toBe('info')
  })

  it('every scenario builds on its page without throwing', () => {
    const ids: [ScenarioId, 'hf' | 'af'][] = [
      ['p1-suspected-hfpef', 'hf'], ['p2-new-hfref', 'hf'], ['p3-new-af', 'af'], ['p4-stable-optimised', 'hf'],
      ['p5-titrating-af', 'hf'], ['p6-hyperkalaemia', 'hf'], ['p7-worsening-congestion', 'hf'], ['p8-post-discharge', 'hf'],
      ['p9-hfpef-af-dose', 'hf'], ['p10-improved-ef', 'hf'], ['p11-af-dabigatran-renal', 'af'],
    ]
    for (const [id, page] of ids) expect(scenarioRun(id, { page }).model.points.length).toBeGreaterThan(0)
  })
})

describe('real pack · what a clinician reads without opening anything', () => {
  it('names the red flags in DP-24 itself, not above the page; marks K 5.7 and drops today’s dates (P6)', () => {
    // 「Today」 is the scenarios' visit date, whatever day the suite runs on;
    // only the clock is pinned.
    jest.useFakeTimers({ now: new Date('2026-09-27T10:00:00+08:00'), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'nextTick', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'] })
    render(<ScenarioMap id="p6-hyperkalaemia" />)
    expect(screen.queryByTestId('cdss-visit-triage')).toBeNull()
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-status'))
    expect(cell('DP-24')).toHaveTextContent('胸痛・暈厥・休息時喘・快速水腫')
    const values = screen.getByTestId('cdss-visit-key-values')
    const potassium = values.querySelector('[data-key="potassium"]')!
    expect(potassium).toHaveAttribute('data-alert', 'true')
    expect(values.querySelectorAll('[data-alert="true"]')).toHaveLength(1)
    // 09-27 is the visit date: today's heart rate carries no date; K (09-24) a short one.
    expect(values.querySelector('[data-key="heartRate"]')).not.toHaveTextContent('09-27')
    expect(potassium).toHaveTextContent('09-24')
    expect(potassium).not.toHaveTextContent('2026-09-24')
    jest.useRealTimers()
  })

  it('keeps the AF follow-up questions folded at a first AF visit until an ask says 有 (P3)', () => {
    render(<ScenarioMap id="p3-new-af" page="af" />)
    expect(screen.getByTestId('cdss-visit-asks-detail')).not.toHaveAttribute('open')
    expect(screen.getByTestId('cdss-visit-asks-detail-toggle')).not.toHaveTextContent('待')
    fireEvent.click(document.querySelector('[data-visit-ask="af-symptoms"][data-value="yes"]')!)
    expect(screen.getByTestId('cdss-visit-asks-detail')).toHaveAttribute('open')
  })

  it('puts cards no point names inside 02, and folds the summary preview under the copy button (P5)', () => {
    render(<ScenarioMap id="p5-titrating-af" />)
    const other = screen.queryByTestId('cdss-visit-other-modules')
    if (other) expect(screen.getByTestId('cdss-visit-column-treatment')).toContainElement(other)
    expect(screen.getByTestId('cdss-visit-summary-copy')).toBeVisible()
    expect(screen.getByTestId('cdss-visit-summary-preview')).not.toHaveAttribute('open')
    expect(screen.queryByTestId('cdss-visit-map-legend')).toBeNull()
  })
})

describe('real pack · AF 全部皆無', () => {
  it('answers a follow-up checklist 無 in one press, leaves 「有改善」 alone, and undoes on a second press (P11)', () => {
    render(<ScenarioMap id="p11-af-dabigatran-renal" page="af" />)
    // The safety row opens 02 at first paint; the asks and their fuller
    // questions are 01's, one press away.
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-status'))
    expect(screen.getByTestId('cdss-visit-column-status')).toBeVisible()
    fireEvent.click(document.querySelector('[data-visit-ask="af-symptoms"][data-value="yes"]')!)
    const group = document.querySelector('[data-af-question-group="followup"]') as HTMLDetailsElement
    fireEvent.click(group.querySelector('summary')!)
    const answer = (question: string, label: '有' | '無' | '依病歷／待確定') =>
      within(within(group).getByRole('group', { name: question })).getByRole('button', { name: label })
    const button = within(group).getByTestId('cdss-af-none-followup')
    expect(button).toHaveTextContent('全部皆無')
    fireEvent.click(button)
    for (const question of ['本次仍有心悸', '本次仍有呼吸困難', '新發暈厥／近乎暈厥']) {
      expect(answer(question, '無')).toHaveAttribute('aria-pressed', 'true')
    }
    // 「有改善」 is good news; a bulk 無 must not record 「沒有改善」.
    expect(answer('治療後症狀或活動耐受有改善', '無')).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).getByTestId('cdss-af-none-followup')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(group).getByTestId('cdss-af-none-followup'))
    expect(answer('本次仍有心悸', '無')).toHaveAttribute('aria-pressed', 'false')
  })

  it('offers no bulk 無 on groups read from the history', () => {
    render(<ScenarioMap id="p11-af-dabigatran-renal" page="af" />)
    for (const id of ['diagnosis', 'stroke', 'safety', 'bleedingRisk', 'comorbidity']) {
      expect(document.querySelector(`[data-testid="cdss-af-none-${id}"]`)).toBeNull()
    }
  })
})

describe('real pack · one answer, one decision, on every page', () => {
  it('records AF anticoagulation once: decided on the HF page, decided on the AF page (P9)', () => {
    const hfCell = point('p9-hfpef-af-dose', 'DP-14')
    const afOwner = scenarioRun('p9-hfpef-af-dose', { page: 'af' }).model.points.find((item) => item.decisionId === hfCell.decisionId)
    expect(afOwner?.dp).toBeDefined()
    const { unmount } = render(<ScenarioMap id="p9-hfpef-af-dose" />)
    fireEvent.click(primaryOf('DP-14'))
    unmount()

    render(<ScenarioMap id="p9-hfpef-af-dose" page="af" />)
    expect(row(afOwner!.dp)).toHaveAttribute('data-decided', 'true')
    expect(Object.keys(usePhysicianDecisionsStore.getState().byPatientId[PATIENT] ?? {})).toContain(`visit:${hfCell.decisionId}`)
  })

  it('shows the map’s 喘 and 體重 answers in the three sections, and writes back to them (P4)', () => {
    useVisitAnswersStore.getState().answer(PATIENT, 'weight-trend', 'up')
    render(<ScenarioMap id="p4-stable-optimised" layout="sections" />)
    const followUp = screen.getByTestId('cdss-followup-priorities')
    const weight = within(followUp).getByRole('group', { name: '體重變化' })
    expect(within(weight).getByRole('button', { name: '增加' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(weight).getByRole('button', { name: '減少' }))
    expect(visitAnswersOf(useVisitAnswersStore.getState().byPatientId[PATIENT])['weight-trend']).toBe('down')
    const breath = within(followUp).getByRole('group', { name: '喘 變化' })
    fireEvent.click(within(breath).getByRole('button', { name: '惡化' }))
    expect(visitAnswersOf(useVisitAnswersStore.getState().byPatientId[PATIENT])['dyspnoea-trend']).toBe('worse')
    expect(within(breath).getByRole('button', { name: '惡化' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('real pack · reading the map without scrolling back up', () => {
  it('steps from card to card in the pack order and on into the next section (P5)', () => {
    render(<ScenarioMap id="p5-titrating-af" />)
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-treatment'))
    // The stepper walks the cells in pack order. The four pillars are boxes
    // at the head of 02, not cells, so it walks what follows them: DP-11 →
    // DP-25 (medication reconciliation) → …
    fireEvent.click(cell('DP-11'))
    expect(screen.getByTestId('cdss-visit-detail')).toHaveAttribute('data-dp', 'DP-11')
    fireEvent.click(screen.getByTestId('cdss-visit-detail-next'))
    expect(screen.getByTestId('cdss-visit-detail')).toHaveAttribute('data-dp', 'DP-25')
    // The card follows its cell: it sits in the slot right after DP-25.
    expect(screen.getByTestId('cdss-visit-detail-slot').previousElementSibling).toContainElement(cell('DP-25'))
    fireEvent.click(screen.getByTestId('cdss-visit-detail-previous'))
    expect(screen.getByTestId('cdss-visit-detail')).toHaveAttribute('data-dp', 'DP-11')

    // The last card of 02 leads into 03, which opens in its place.
    const treatmentCells = [...screen.getByTestId('cdss-visit-column-treatment').querySelectorAll<HTMLElement>('button[data-dp]')]
    fireEvent.click(treatmentCells.at(-1)!)
    const next = screen.getByTestId('cdss-visit-detail-next')
    expect(next).toHaveTextContent('03 預後與計畫')
    fireEvent.click(next)
    expect(screen.getByTestId('cdss-visit-column-outlook')).toBeVisible()
    expect(screen.getByTestId('cdss-visit-column-treatment')).not.toBeVisible()
    expect(screen.getByTestId('cdss-visit-detail')).toHaveAttribute('data-dp', next.dataset.dp!)

    fireEvent.click(screen.getByTestId('cdss-visit-detail-collapse'))
    expect(screen.queryByTestId('cdss-visit-detail')).toBeNull()
  })

  it('marks a chosen answer with the page’s selected tint, a warning with the risk colour and an improvement with green (P7)', () => {
    render(<ScenarioMap id="p7-worsening-congestion" />)
    const worse = document.querySelector<HTMLElement>('[data-visit-ask="dyspnoea-trend"][data-value="worse"]')!
    const better = document.querySelector<HTMLElement>('[data-visit-ask="dyspnoea-trend"][data-value="better"]')!
    const down = document.querySelector<HTMLElement>('[data-visit-ask="weight-trend"][data-value="down"]')!
    expect(worse).toHaveTextContent('變差')
    // Open answers are neutral; a chosen one wears the page's selected tint,
    // a warning the risk colour, an improvement the success green.
    for (const open of [worse, better, down]) expect(open.className).toContain('bg-card')
    fireEvent.click(worse)
    expect(document.querySelector('[data-visit-ask="dyspnoea-trend"][data-value="worse"]')!.className).toContain('bg-destructive/10')
    fireEvent.click(document.querySelector<HTMLElement>('[data-visit-ask="dyspnoea-trend"][data-value="better"]')!)
    expect(document.querySelector('[data-visit-ask="dyspnoea-trend"][data-value="better"]')!.className).toContain('bg-emerald-50')
    fireEvent.click(down)
    expect(document.querySelector('[data-visit-ask="weight-trend"][data-value="down"]')!.className).toContain('bg-primary/10')
  })
})

describe('real pack · follow-up questions open once the pack says follow-up', () => {
  it('does not lock symptoms, signs and NYHA behind a hidden 「是否懷疑心衰竭」 (P9 HFpEF, P10 improved EF)', () => {
    for (const id of ['p9-hfpef-af-dose', 'p10-improved-ef'] as ScenarioId[]) {
      const { unmount } = render(<ScenarioMap id={id} />)
      fireEvent.click(document.querySelector<HTMLElement>('[data-visit-ask="dyspnoea-trend"][data-value="worse"]')!)
      expect(screen.queryByText('先回答「是否懷疑心衰竭」後開放')).toBeNull()
      unmount()
      useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
    }
  })
})

describe('real pack · one heading per group', () => {
  it('draws 用藥安全 once even though its points are apart in the pack order (P5, 顯示全部)', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    render(<ScenarioMap id="p5-titrating-af" />)
    fireEvent.click(screen.getByTestId('cdss-visit-map-show-all'))
    const treatment = screen.getByTestId('cdss-visit-column-treatment')
    expect(treatment.querySelectorAll('[data-map-group="medication-safety"]')).toHaveLength(1)
    expect(errors.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false)
    errors.mockRestore()
  })
})

