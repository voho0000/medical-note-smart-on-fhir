/**
 * The decision map built by the real pack for the eleven scenario bundles.
 *
 * Each bundle goes through the app's own import parser, the FHIR adapter, the
 * host's AF calculators and the pack's `applyVisitAnswers` /
 * `buildVisitDecisionModel` (see `scenario-models`), and the map is drawn by
 * the real view. The assertions are brief §7's, with the two deviations the
 * pack's author accepted:
 *
 * - P4 keeps a DP-09 「需你確認」 (spironolactone 25 → 50 mg) — but nothing in
 *   the queue;
 * - R2 reads the previous weight up to 120 days back, not 90 (P4's basis is a
 *   06-20 weight).
 *
 * Words are the pack's, so the assertions quote the pack; the host's own words
 * (「建議 N 天內回診」, 「今天的決定都記下了」 when the pack has none) are chrome.
 */
import { useMemo } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import type { VisitAnswers } from '@/features/clinical-decision-support/types'
import { usePhysicianDecisions, usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswerRecord, useVisitAnswersStore, visitAnswersOf } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { useClinicVitalsStore } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { usePhenotypeAnswerStore } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
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
function ScenarioMap({ id, page = 'hf' }: { id: ScenarioId; page?: 'hf' | 'af' }) {
  const decisions = usePhysicianDecisions(PATIENT)
  const record = useVisitAnswerRecord(PATIENT)
  const answers = useMemo(() => visitAnswersOf(record), [record])
  const run = useMemo(() => scenarioRun(id, { page, answers }), [answers, id, page])
  return (
    <ClinicalDecisionSupportView
      result={run.result}
      locale="zh-TW"
      layout="map"
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
      onAnswerPhenotype={(answer) => usePhenotypeAnswerStore.getState().setAnswer(PATIENT, answer)}
    />
  )
}

function queue(): { dp: string; primary: string | null }[] {
  return [...document.querySelectorAll<HTMLElement>('[data-visit-queue-row]')].map((row) => ({
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

function cell(dp: string, source = 'hf'): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-map"] button[data-dp]')]
    .find((element) => element.dataset.dp === dp && element.dataset.source === source)
  if (!found) throw new Error(`no map cell ${source}:${dp}`)
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
  it('has an empty queue, a prefilled weight and settled pillars (DP-09 confirm accepted)', () => {
    const { model } = scenarioRun('p4-stable-optimised')
    expect(model.stage).toBe('follow-up')
    expect(model.queue).toEqual([])
    expect(model.asks.find((ask) => ask.id === 'weight-trend')?.prefill?.value).toBe('same')
    expect(model.points.filter((item) => item.state === 'act' || item.state === 'safety')).toEqual([])
    for (const dp of ['DP-07', 'DP-08', 'DP-10']) expect(point('p4-stable-optimised', dp).state).toBe('done')
    expect(point('p4-stable-optimised', 'DP-09').state).toBe('confirm')

    render(<ScenarioMap id="p4-stable-optimised" />)
    expect(screen.getByTestId('cdss-visit-queue-empty')).toBeInTheDocument()
    expect(document.querySelector('[data-visit-ask="weight-trend"][data-value="same"]')).toHaveAttribute('data-prefilled', 'true')
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
    // The map opens section by section: all three start closed, and 02 says
    // what it holds before it is opened.
    for (const block of ['status', 'treatment', 'outlook']) {
      expect(screen.getByTestId(`cdss-visit-section-toggle-${block}`)).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveTextContent('需處理 3')
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-treatment'))
    expect(screen.getByTestId('cdss-visit-column-treatment')).toBeVisible()
    expect(cell('DP-08')).toHaveAttribute('data-state', 'confirm')
    expect(cell('DP-08')).toHaveTextContent('bisoprolol 2.5 mg／目標 10 mg')
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
    expect(screen.getByTestId('cdss-visit-progress')).toHaveTextContent('今天的決定都記下了')
    expect(screen.getByRole('heading', { level: 3, name: '今天的決定都記下了' })).toBeInTheDocument()
  })
})

describe('real pack · P6 hyperkalaemia', () => {
  it('puts the MRA hold first as a safety row and does not titrate RAS', () => {
    render(<ScenarioMap id="p6-hyperkalaemia" />)
    expect(queue()).toEqual([{ dp: 'DP-09', primary: '暫停 MRA' }])
    expect(row('DP-09')).toHaveAttribute('data-visit-queue-state', 'safety')
    expect(row('DP-09')).toHaveTextContent('K 5.7 → 暫停 MRA？')
    expect(cell('DP-07')).toHaveAttribute('data-state', 'info')
    fireEvent.click(primaryOf('DP-09'))
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('K、Cr，7 天內')
    expect(screen.getByTestId('cdss-visit-plan-return')).toHaveTextContent('建議 7 天內回診')
  })

  it('shows the pack’s own status on the card the cell opens, not the host re-grade', () => {
    render(<ScenarioMap id="p6-hyperkalaemia" />)
    // The flow layout's re-grade reads K ≥5.0 and would call both of these
    // 「需臨床確認」; on the map the card says what the pack said.
    fireEvent.click(cell('DP-09'))
    const mra = within(screen.getByTestId('cdss-visit-detail')).getByTestId('cdss-visit-detail-module-heart-failure-mra')
    expect(mra.querySelector('[data-module-status]')).toHaveAttribute('data-module-status', 'actionable')
    fireEvent.click(cell('DP-07'))
    const ras = within(screen.getByTestId('cdss-visit-detail')).getByTestId('cdss-visit-detail-module-heart-failure-ras-inhibition')
    expect(ras.querySelector('[data-module-status]')).toHaveAttribute('data-module-status', 'no-action')
  })
})

describe('real pack · P7 worsening congestion', () => {
  it('reassesses on the NT-proBNP rise, prefills the weight gain and queues the diuretic', () => {
    render(<ScenarioMap id="p7-worsening-congestion" />)
    expect(screen.getByTestId('cdss-visit-screen')).toHaveAttribute('data-stage', 'reassess')
    expect(screen.getByTestId('cdss-visit-triggers')).toHaveTextContent('NT-proBNP 1200→2600')
    expect(document.querySelector('[data-visit-ask="weight-trend"][data-value="up"]')).toHaveAttribute('data-prefilled', 'true')
    expect(document.querySelector('[data-visit-prefill-basis="weight-trend"]')).toHaveTextContent('65→68 kg')
    expect(queue()).toEqual([{ dp: 'DP-06', primary: '利尿劑加量' }])
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
    expect(queue()).toEqual([
      { dp: 'DP-09', primary: '重新開始 MRA' },
      { dp: 'DP-07', primary: '上調至 49/51' },
      { dp: 'DP-08', primary: '上調至 5 mg' },
    ])
    expect(row('DP-07')).toHaveTextContent('ARNI 24/26 → 49/51 mg bid')
    expect(row('DP-08')).toHaveTextContent('bisoprolol 2.5 mg → 5 mg')
    expect(screen.getByTestId('cdss-visit-plan-notes')).toHaveTextContent('6 週內密集回診')
  })

  it('settles or asks about the diuretic once breathlessness is better and weight unchanged', () => {
    const state = point('p8-post-discharge', 'DP-06', { answers: { 'dyspnoea-trend': 'better' } }).state
    expect(['done', 'confirm']).toContain(state)
  })
})

describe('real pack · P9 HFpEF with AF, apixaban due for reduction', () => {
  it('stays in follow-up and queues the apixaban reduction and the MRA start', () => {
    const { model } = scenarioRun('p9-hfpef-af-dose')
    expect(model.stage).toBe('follow-up')
    render(<ScenarioMap id="p9-hfpef-af-dose" />)
    expect(document.querySelector('[data-visit-ask="weight-trend"][data-value="down"]')).toHaveAttribute('data-prefilled', 'true')
    expect(queue()).toEqual([
      { dp: 'DP-14', primary: '改 2.5 mg bid' },
      { dp: 'DP-09', primary: '開始 MRA' },
    ])
    expect(row('DP-14')).toHaveTextContent('apixaban 5 → 2.5 mg bid？')
    expect(row('DP-14')).toHaveTextContent('2/3')
    expect(row('DP-14')).toHaveTextContent('AF')
    expect(cell('DP-06')).toHaveAttribute('data-state', 'confirm')
    expect(cell('DP-06')).toHaveTextContent('體重減少 3 kg')
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
  it('P1 suspected HFpEF: only 01 works, 02 opens once the diagnosis is confirmed', () => {
    const { model } = scenarioRun('p1-suspected-hfpef')
    expect(model.stage).toBe('suspected')
    expect(model.queue).toEqual(['DP-00'])
    render(<ScenarioMap id="p1-suspected-hfpef" />)
    expect(screen.getByTestId('cdss-visit-column-treatment-closed')).toHaveTextContent('確診後開啟')
    expect(screen.getByTestId('cdss-visit-asks-detail')).toHaveAttribute('open')
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
