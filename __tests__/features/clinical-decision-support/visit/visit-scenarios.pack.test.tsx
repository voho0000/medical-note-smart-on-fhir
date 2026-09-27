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
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import type { VisitAnswers } from '@/features/clinical-decision-support/types'
import { usePhysicianDecisions, usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswerRecord, useVisitAnswersStore, visitAnswersOf } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { useClinicVitalsStore } from '@/features/clinical-decision-support/stores/clinic-vitals.store'
import { usePhenotypeAnswerStore } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
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
  const run = useMemo(() => scenarioRun(id, { page, answers }), [answers, id, page])
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
      onAnswerPhenotype={(answer) => usePhenotypeAnswerStore.getState().setAnswer(PATIENT, answer)}
      afAnswers={afAnswers}
      onAfAnswer={(questionId, value) => useAfAnswersStore.getState().answer(PATIENT, questionId, value)}
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
  it('has an empty queue, a prefilled weight and settled pillars (spironolactone 25 mg settled)', () => {
    const { model } = scenarioRun('p4-stable-optimised')
    expect(model.stage).toBe('follow-up')
    expect(model.queue).toEqual([])
    expect(model.asks.find((ask) => ask.id === 'weight-trend')?.prefill?.value).toBe('same')
    expect(model.points.filter((item) => item.state === 'act' || item.state === 'safety')).toEqual([])
    for (const dp of ['DP-07', 'DP-08', 'DP-09', 'DP-10']) expect(point('p4-stable-optimised', dp).state).toBe('done')
    expect(point('p4-stable-optimised', 'DP-09').headline).toBe('spironolactone 25 mg：足量')

    render(<ScenarioMap id="p4-stable-optimised" />)
    expect(screen.getByTestId('cdss-visit-queue-empty')).toBeInTheDocument()
    expect(document.querySelector('[data-visit-ask="weight-trend"][data-value="same"]')).toHaveAttribute('data-prefilled', 'true')
  })

  it('keeps each group’s cells under its own heading (RAS stays with the four pillars)', () => {
    render(<ScenarioMap id="p4-stable-optimised" />)
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-treatment'))
    const treatment = screen.getByTestId('cdss-visit-column-treatment')
    const pillars = within(treatment).getByText('四支柱').parentElement!
    for (const dp of ['DP-07', 'DP-08', 'DP-09', 'DP-10']) expect(pillars).toContainElement(cell(dp))
    const triage = within(treatment).getByText('分流與安全').parentElement!
    expect(triage).not.toContainElement(cell('DP-07'))
  })

  it('opens the settled DP-09 with the 50 mg target in its reason, no button, the guideline folded', () => {
    render(<ScenarioMap id="p4-stable-optimised" />)
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-treatment'))
    fireEvent.click(cell('DP-09'))
    const detail = screen.getByTestId('cdss-visit-detail')
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
    // The map opens section by section: all three start closed, and 02 says
    // what it holds before it is opened.
    for (const block of ['status', 'treatment', 'outlook']) {
      expect(screen.getByTestId(`cdss-visit-section-toggle-${block}`)).toHaveAttribute('aria-expanded', 'false')
    }
    // The three starts are counted in 今天要決定, once; 02 says what it adds.
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveTextContent('需你確認 1')
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).not.toHaveTextContent('需處理')
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
    expect(screen.getByTestId('cdss-visit-queue-progress')).toHaveTextContent('已決定 3/3')
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
    // The checklist's questions stay locked until 懷疑 HF is answered, so the
    // first-assessment checklist waits for that answer before it opens.
    expect(screen.getByTestId('cdss-visit-asks-detail')).not.toHaveAttribute('open')
    fireEvent.click(primaryOf('DP-00'))
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

describe('real pack · what a clinician reads without opening anything', () => {
  it('names the red flags in DP-24 itself, not above the page; marks K 5.7 and drops today’s dates (P6)', () => {
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
    fireEvent.click(cell('DP-09'))
    expect(screen.getByTestId('cdss-visit-detail')).toHaveAttribute('data-dp', 'DP-09')
    expect(screen.getByTestId('cdss-visit-detail-previous')).toHaveAttribute('data-dp', 'DP-08')
    fireEvent.click(screen.getByTestId('cdss-visit-detail-next'))
    expect(screen.getByTestId('cdss-visit-detail')).toHaveAttribute('data-dp', 'DP-10')
    // The card follows its cell: it sits in the slot right after DP-10.
    expect(screen.getByTestId('cdss-visit-detail-slot').previousElementSibling).toContainElement(cell('DP-10'))
    fireEvent.click(screen.getByTestId('cdss-visit-detail-previous'))
    expect(screen.getByTestId('cdss-visit-detail')).toHaveAttribute('data-dp', 'DP-09')

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

  it('colours each every-visit answer by what it means, the words unchanged (P7)', () => {
    render(<ScenarioMap id="p7-worsening-congestion" />)
    const worse = document.querySelector<HTMLElement>('[data-visit-ask="dyspnoea-trend"][data-value="worse"]')!
    const better = document.querySelector<HTMLElement>('[data-visit-ask="dyspnoea-trend"][data-value="better"]')!
    const down = document.querySelector<HTMLElement>('[data-visit-ask="weight-trend"][data-value="down"]')!
    expect(worse).toHaveTextContent('變差')
    expect(worse.className).toContain('bg-rose-50')
    expect(better.className).toContain('bg-emerald-50')
    expect(down.className).toContain('bg-sky-50')
    fireEvent.click(worse)
    const chosen = document.querySelector<HTMLElement>('[data-visit-ask="dyspnoea-trend"][data-value="worse"]')!
    expect(chosen.className).toContain('bg-rose-100')
    expect(chosen.className).toContain('border-rose-500')
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

