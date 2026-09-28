/**
 * The visit decision map, driven by hand-written models shaped like brief §7.
 *
 * What is under test is placement and recording, never clinical judgement:
 * each section (01 / 02 / 03) opens with its own decision rows, in the pack's
 * order with the pack's words, and a point drawn as a row is not repeated as a
 * cell; pressing a primary button records `actions[0]` once, under one key,
 * whether it was pressed on the row or in the point's card opened under it; a
 * decided row collapses in place and focus moves on; the plan lists what was
 * decided with the pack's response checks; the stage decides the shape.
 */
import { useMemo } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { VisitDecisionScreen } from '@/features/clinical-decision-support/renderers/visit/VisitDecisionScreen'
import type { VisitBlock, VisitDecisionModel } from '@/features/clinical-decision-support/types'
import type { CdssRecommendation } from '@/features/clinical-decision-support/types'
import {
  getPhysicianDecisions,
  usePhysicianDecisions,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import {
  useVisitAnswerRecord,
  useVisitAnswersStore,
  visitAnswersOf,
} from '@/features/clinical-decision-support/stores/visit-answers.store'
import {
  getCdssDecisionTimings,
  useCdssDecisionTimingStore,
} from '@/features/clinical-decision-support/stores/cdss-decision-timing.store'
import { p1Model, p2Model, p3Model, p4Model, p5Model, p6Model, p7Model, p9Model } from './visit-model.fixtures'

const PATIENT = 'visit-patient'

function askButton(ask: string, value: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`[data-visit-ask="${ask}"][data-value="${value}"]`)
  if (!found) throw new Error(`no ask button ${ask}=${value}`)
  return found
}

function card(id: string): CdssRecommendation {
  return {
    id, moduleName: `模組 ${id}`, domain: 'medication', priority: 'medium', status: 'review',
    title: `卡片 ${id}`, recommendation: '', rationale: '', patientEvidence: [], nextActions: [],
    guidelineReferences: [], safetyBoundary: '',
  }
}

function Harness({
  model,
  modules = [],
  unmapped = [],
}: {
  model: VisitDecisionModel
  modules?: CdssRecommendation[]
  unmapped?: CdssRecommendation[]
}) {
  const decisions = usePhysicianDecisions(PATIENT)
  const record = usePhysicianDecisionsStore((state) => state.recordDecision)
  const clear = usePhysicianDecisionsStore((state) => state.clearDecision)
  const answerRecord = useVisitAnswerRecord(PATIENT)
  const answers = useMemo(() => visitAnswersOf(answerRecord), [answerRecord])
  const now = useMemo(() => new Date(), [])
  return (
    <VisitDecisionScreen
      model={model}
      isEnglish={false}
      now={now}
      packVersion="test-1"
      screenKey={`${PATIENT}:${model.packId}`}
      decisions={decisions}
      onRecordDecision={(key, input) => record(PATIENT, key, input)}
      onClearDecision={(key) => clear(PATIENT, key)}
      answers={answers}
      onAnswer={(id, value) => useVisitAnswersStore.getState().answer(PATIENT, id, value)}
      modules={new Map(modules.map((item) => [item.id, item]))}
      unmappedModules={unmapped}
      renderDetail={(recommendation) => <p data-testid={`detail-body-${recommendation.id}`}>證據表 {recommendation.id}</p>}
    />
  )
}

/**
 * Decision rows, in page order: 01's, then 02's, then 03's — or one section's.
 * A section's rows sit in its lead (closed sections stay in the DOM, hidden).
 */
function queueRows(block?: VisitBlock): HTMLElement[] {
  const scope = block ? screen.queryByTestId(`cdss-visit-queue-${block}`) : screen.getByTestId('cdss-visit-map')
  return scope ? [...scope.querySelectorAll<HTMLElement>('[data-visit-queue-row]')] : []
}

function row(dp: string): HTMLElement {
  const found = queueRows().find((element) => element.dataset.visitQueueDp === dp)
  if (!found) throw new Error(`no queue row ${dp}`)
  return found
}

/** A row's 「依據與細節」: the point's card, opened under the row. */
function rowDetail(dp: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`[data-visit-row-detail="${dp}"]`)
  if (!found) throw new Error(`no 依據與細節 on row ${dp}`)
  return found
}

function queryCell(dp: string, source = 'hf'): HTMLElement | undefined {
  return [...screen.getByTestId('cdss-visit-map').querySelectorAll<HTMLElement>('button[data-dp]')]
    .find((element) => element.dataset.dp === dp && element.dataset.source === source)
}

function cell(dp: string, source = 'hf'): HTMLElement {
  const found = queryCell(dp, source)
  if (!found) throw new Error(`no map cell ${dp}`)
  return found
}

/** Opens a section the way a clinician does, by its toggle; an open one stays open. */
function openSection(block: VisitBlock) {
  const toggle = screen.getByTestId(`cdss-visit-section-toggle-${block}`)
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
}

function primaryOf(element: HTMLElement): HTMLButtonElement {
  const button = element.querySelector<HTMLButtonElement>('[data-visit-primary]')
  if (!button) throw new Error('no primary button')
  return button
}

beforeEach(() => {
  localStorage.clear()
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useCdssDecisionTimingStore.getState().reset()
})

describe('visit decision screen · P4 stable and optimised', () => {
  it('has nothing to decide, prefills the weight answer and settles every pillar', () => {
    render(<Harness model={p4Model()} />)

    expect(screen.getByTestId('cdss-visit-status')).toHaveTextContent('四支柱都在目標劑量，今天沒有要改的藥')
    // With nothing to decide no section draws a decision list — there is no
    // 「今天沒有要決定的事」 line any more — and 02 and 03 say so on their toggles.
    expect(queueRows()).toHaveLength(0)
    for (const block of ['status', 'treatment', 'outlook'] as const) {
      expect(screen.queryByTestId(`cdss-visit-queue-${block}`)).toBeNull()
    }
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveTextContent('沒有待辦')
    expect(screen.getByTestId('cdss-visit-section-toggle-outlook')).toHaveTextContent('沒有待辦')

    const same = askButton('weight-trend', 'same')
    expect(same).toHaveTextContent('不變')
    expect(same).toHaveAttribute('data-prefilled', 'true')
    expect(same).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('[data-visit-prefill-basis="weight-trend"]')).toHaveTextContent('紀錄：74→74 kg')

    const map = screen.getByTestId('cdss-visit-map')
    for (const state of ['act', 'confirm', 'safety']) {
      expect(map.querySelector(`[data-state="${state}"]`)).toBeNull()
    }
    const treatment = screen.getByTestId('cdss-visit-column-treatment')
    const treatmentStates = [...treatment.querySelectorAll<HTMLElement>('button[data-dp]')].map((element) => element.dataset.state)
    expect(treatmentStates.length).toBeGreaterThan(0)
    expect(new Set(treatmentStates)).toEqual(new Set(['done']))
    expect(screen.getByTestId('cdss-visit-plan-empty')).toBeInTheDocument()
  })

  it('opens 01 at first paint, one section at a time, and keeps folded points reachable', () => {
    render(<Harness model={p4Model()} />)
    const toggle = (block: string) => screen.getByTestId(`cdss-visit-section-toggle-${block}`)
    const section = (block: string) => screen.getByTestId(`cdss-visit-column-${block}`)
    // The sections are the page's spine: with no safety row waiting, the visit
    // starts at 01, open; 02 and 03 are closed until asked for.
    expect(toggle('status')).toHaveAttribute('aria-expanded', 'true')
    expect(section('status')).toBeVisible()
    expect(cell('DP-01')).toBeVisible()
    for (const block of ['treatment', 'outlook']) {
      expect(toggle(block)).toHaveAttribute('aria-expanded', 'false')
      expect(section(block)).not.toBeVisible()
    }
    // A section's toggle says what it holds, open or closed.
    expect(toggle('status')).toHaveTextContent('體重 不變')
    expect(toggle('treatment')).toHaveTextContent(/沒有待辦|需你確認/)

    // Opening another closes the first; a second press closes it.
    fireEvent.click(toggle('treatment'))
    expect(toggle('status')).toHaveAttribute('aria-expanded', 'false')
    expect(section('status')).not.toBeVisible()
    expect(section('treatment')).toBeVisible()
    fireEvent.click(toggle('treatment'))
    expect(section('treatment')).not.toBeVisible()

    fireEvent.click(toggle('status'))
    expect(section('status')).toBeVisible()
    // Not-applicable and not-included points sit at the section foot until 顯示全部.
    expect(within(section('status')).queryByText('病因')).toBeNull()
    expect(screen.getByTestId('cdss-visit-column-status-foot')).toHaveTextContent('另 4 點收起')
    fireEvent.click(screen.getByTestId('cdss-visit-map-show-all'))
    expect(screen.getByTestId('cdss-visit-map-show-all')).toHaveAttribute('aria-expanded', 'true')
    expect(cell('DP-29')).toHaveAttribute('data-state', 'not-included')
    expect(cell('DP-34')).toHaveAttribute('data-state', 'not-applicable')
  })

  it('opens a point’s section when the point is opened from its cell', () => {
    render(<Harness model={p4Model()} />)
    // 01 is open at first paint; close it so the cell has a section to open.
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-status'))
    expect(screen.getByTestId('cdss-visit-section-toggle-status')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(cell('DP-01'))
    expect(screen.getByTestId('cdss-visit-section-toggle-status')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('cdss-visit-detail')).toBeVisible()
  })

  it('opens the card directly under the cell that was pressed, not at the section foot', () => {
    render(<Harness model={p4Model()} />)
    fireEvent.click(screen.getByTestId('cdss-visit-section-toggle-treatment'))
    const pressed = cell('DP-07')
    fireEvent.click(pressed)
    const slot = screen.getByTestId('cdss-visit-detail-slot')
    // The very next item after the pressed cell is its card.
    expect(pressed.closest('li')?.nextElementSibling).toBe(slot)
    expect(slot).toContainElement(screen.getByTestId('cdss-visit-detail'))
  })
})

describe('visit decision screen · P5 titrating with AF', () => {
  it('queues three rows in the pack order with the pack primary buttons', () => {
    render(<Harness model={p5Model()} />)
    // All three are 02's: they open 02's lead, under its 「待決定」.
    expect(queueRows('treatment').map((element) => element.dataset.visitQueueDp)).toEqual(['DP-07', 'DP-09', 'DP-10'])
    expect(queueRows()).toHaveLength(3)
    expect(screen.getByTestId('cdss-visit-lead-treatment')).toContainElement(screen.getByTestId('cdss-visit-queue-treatment'))
    expect(screen.getByTestId('cdss-visit-queue-treatment')).toHaveTextContent('待決定')
    expect(queueRows('treatment').map((element) => primaryOf(element).textContent)).toEqual(['換 ARNI', '開始 MRA', '開始 SGLT2i'])
    expect(row('DP-07')).toHaveTextContent('ramipril → 換 ARNI？')
    expect(row('DP-07')).toHaveTextContent('LVEF 30%、ACEi 中；SBP 112、K 4.6、eGFR 48')
    // A point drawn as a row is not drawn again as a cell.
    for (const dp of ['DP-07', 'DP-09', 'DP-10']) expect(queryCell(dp)).toBeUndefined()
    expect(cell('DP-08')).toHaveAttribute('data-state', 'confirm')
    expect(cell('DP-08')).toHaveTextContent('需你確認')
    expect(cell('DP-14', 'af')).toHaveAttribute('data-state', 'done')
    expect(cell('DP-14', 'af')).toHaveTextContent('AF')
    expect(cell('DP-14', 'af')).toHaveTextContent('apixaban 5 mg bid · 減量條件 0/3')
  })

  it('collapses each decided row in place, moves focus on, and lists the checks in the plan', () => {
    render(<Harness model={p5Model()} />)
    openSection('treatment')
    const treatmentToggle = screen.getByTestId('cdss-visit-section-toggle-treatment')
    expect(treatmentToggle).toHaveTextContent('待決定 3')
    fireEvent.click(primaryOf(row('DP-07')))

    expect(row('DP-07')).toHaveAttribute('data-decided', 'true')
    expect(row('DP-07').querySelector('[data-visit-primary]')).toBeNull()
    expect(row('DP-07')).toHaveTextContent('換 ARNI')
    expect(row('DP-07')).toHaveTextContent('回應檢查：K、Cr、血壓，1–2 週內')
    expect(within(row('DP-07')).getByRole('button', { name: '改 DP-07 的決定' })).toBeInTheDocument()
    expect(primaryOf(row('DP-09'))).toHaveFocus()
    // The row is the point's only place on the map (no cell repeats it); the
    // section's toggle counts what is left to decide in it.
    expect(queryCell('DP-07')).toBeUndefined()
    expect(treatmentToggle).toHaveTextContent('待決定 2')

    const plan = screen.getByTestId('cdss-visit-plan')
    // A recheck, not a return visit (「只說複驗，沒有說要回診」): no return date.
    expect(within(plan).queryByTestId('cdss-visit-plan-return')).toBeNull()
    expect(plan).toHaveTextContent('換 ARNI：K、Cr、血壓，1–2 週內')

    fireEvent.click(primaryOf(row('DP-09')))
    expect(primaryOf(row('DP-10'))).toHaveFocus()
    fireEvent.click(primaryOf(row('DP-10')))
    const queue = screen.getByTestId('cdss-visit-queue-treatment')
    expect(within(queue).getByRole('heading', { name: '待決定' })).toHaveFocus()
    // Progress is said once, on the section's list.
    expect(screen.queryByTestId('cdss-visit-progress')).toBeNull()
    expect(screen.getByTestId('cdss-visit-queue-treatment-progress')).toHaveTextContent('已決定 3/3')
    expect(treatmentToggle).toHaveTextContent('已決定 3')
    expect(treatmentToggle).not.toHaveTextContent('待決定')
    // SGLT2i asked for no check; the plan lists only what did.
    expect(within(plan).getAllByText(/K、Cr、血壓/)).toHaveLength(2)
    expect(screen.getByTestId('cdss-visit-summary-text')).toHaveTextContent('DP-10 SGLT2i：開始 SGLT2i')
  })

  it('records one decision per point: the row and the card opened under it share it', () => {
    render(<Harness model={p5Model()} modules={[card('heart-failure-ras')]} />)
    openSection('treatment')
    // A queued point has no cell; its card opens under its own row, from
    // 「依據與細節」. (A decided row offers no 「依據與細節」, so the card is
    // opened first and stays open through the decision.)
    expect(queryCell('DP-07')).toBeUndefined()
    fireEvent.click(rowDetail('DP-07'))
    expect(rowDetail('DP-07')).toHaveAttribute('aria-expanded', 'true')
    const detail = screen.getByTestId('cdss-visit-detail')
    expect(row('DP-07')).toContainElement(detail)
    expect(detail).toHaveAttribute('data-dp', 'DP-07')
    expect(within(detail).getByRole('heading', { level: 4 })).toHaveFocus()
    expect(within(detail).getByTestId('detail-body-heart-failure-ras')).toHaveTextContent('證據表 heart-failure-ras')
    expect(within(detail).getAllByText(/要不要|哪一種|劑量/).length).toBeGreaterThanOrEqual(3)

    fireEvent.click(primaryOf(row('DP-07')))
    const decisions = getPhysicianDecisions(PATIENT)
    expect(Object.keys(decisions)).toEqual(['visit:hf:DP-07'])
    expect(decisions['visit:hf:DP-07']).toMatchObject({
      decision: 'prescribed',
      dp: 'DP-07',
      actionId: 'switch-arni',
      actionLabel: '換 ARNI',
      responseCheck: { text: 'K、Cr、血壓', interval: '1–2 週' },
      packVersion: 'test-1',
    })
    // The card reads the decision the row recorded.
    expect(screen.getByTestId('cdss-visit-detail')).toBe(detail)
    expect(within(detail).getByTestId('cdss-visit-decided')).toHaveTextContent('換 ARNI')

    // Taking it back on the card takes it back on the row.
    fireEvent.click(within(detail).getByRole('button', { name: '改 DP-07 的決定' }))
    expect(getPhysicianDecisions(PATIENT)['visit:hf:DP-07']).toBeUndefined()
    expect(row('DP-07')).toHaveAttribute('data-decided', 'false')

    // Deciding an alternative on the card collapses the row to it. (A
    // browser focuses the button it clicks; jsdom has to be told.)
    const keep = within(detail).getByRole('button', { name: '維持 ACEi' })
    keep.focus()
    fireEvent.click(keep)
    expect(row('DP-07')).toHaveAttribute('data-decided', 'true')
    expect(row('DP-07')).toHaveTextContent('維持 ACEi')
    expect(Object.keys(getPhysicianDecisions(PATIENT))).toEqual(['visit:hf:DP-07'])
    expect(within(detail).getByTestId('cdss-visit-decided').querySelector('[tabindex="-1"]')).toHaveFocus()
  })

  it('offers the other decisions behind one 其他 disclosure and records the one chosen', () => {
    render(<Harness model={p5Model()} />)
    openSection('treatment')
    const other = within(row('DP-09')).getByRole('button', { name: /其他/ })
    expect(other).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(other)
    expect(other).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(within(row('DP-09')).getByRole('button', { name: '暫緩' }))
    expect(getPhysicianDecisions(PATIENT)['visit:hf:DP-09']).toMatchObject({ decision: 'deferred', actionId: 'defer' })
    expect(row('DP-09')).toHaveTextContent('暫緩')
    // A deferral carries no check, so the plan has nothing from it.
    expect(screen.getByTestId('cdss-visit-plan-empty')).toBeInTheDocument()
  })

  it('times each decision from the screen appearing, in memory only', () => {
    render(<Harness model={p5Model()} />)
    openSection('treatment')
    fireEvent.click(primaryOf(row('DP-07')))
    const timings = getCdssDecisionTimings()
    expect(timings).toHaveLength(1)
    expect(timings[0]).toMatchObject({ screen: `${PATIENT}:heart-failure-cdss`, decision: 'visit:hf:DP-07', surface: 'queue' })
    expect(timings[0].elapsedMs).toBeGreaterThanOrEqual(0)
    expect(Object.keys(localStorage).some((key) => key.includes('timing'))).toBe(false)
  })
})

describe('visit decision screen · P6 hyperkalaemia', () => {
  it('puts the safety row first with the pack hold action, and plans the 7-day check', () => {
    render(<Harness model={p6Model()} />)
    // An undecided safety row opens its own section at first paint, not 01.
    expect(screen.getByTestId('cdss-visit-section-toggle-treatment')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('cdss-visit-section-toggle-status')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('cdss-visit-column-treatment')).toBeVisible()
    const first = queueRows()[0]
    expect(queueRows('treatment')[0]).toBe(first)
    expect(first).toHaveAttribute('data-visit-queue-dp', 'DP-09')
    expect(first).toHaveAttribute('data-visit-queue-state', 'safety')
    expect(within(first).getByText('安全')).toBeInTheDocument()
    expect(first).toHaveTextContent('K 5.7 → 暫停 MRA？')
    expect(primaryOf(first)).toHaveTextContent('暫停 MRA')
    expect(cell('DP-07')).toHaveAttribute('data-state', 'info')
    expect(cell('DP-07')).toHaveTextContent('K ≥5.0：不上調')

    fireEvent.click(primaryOf(first))
    expect(getPhysicianDecisions(PATIENT)['visit:hf:DP-09']).toMatchObject({
      decision: 'held',
      reopenWhen: 'K 回到 <5.0 時重新開始',
    })
    // S8: 「monitor blood chemistry closely」 — what, with no interval and no return date.
    expect(screen.queryByTestId('cdss-visit-plan-return')).toBeNull()
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('K、Cr')
    expect(screen.getByTestId('cdss-visit-plan')).not.toHaveTextContent('天內')
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('重新評估：K 回到 <5.0 時重新開始')
  })
})

describe('visit decision screen · P7 worsening congestion', () => {
  it('lists the reassessment trigger, prefills a weight gain and queues the diuretic', () => {
    render(<Harness model={p7Model()} />)
    expect(screen.getByTestId('cdss-visit-screen')).toHaveAttribute('data-stage', 'reassess')
    expect(screen.getByTestId('cdss-visit-triggers')).toHaveTextContent('NT-proBNP 1200→2600')
    expect(askButton('weight-trend', 'up')).toHaveAttribute('data-prefilled', 'true')
    expect(document.querySelector('[data-visit-prefill-basis="weight-trend"]')).toHaveTextContent('紀錄：65→68 kg')
    expect(queueRows('treatment').map((element) => element.dataset.visitQueueDp)).toEqual(['DP-06'])
    expect(queueRows()).toHaveLength(1)
    expect(primaryOf(row('DP-06'))).toHaveTextContent('利尿劑加量')
    expect(cell('DP-04')).toHaveAttribute('data-state', 'confirm')
    // Reassessment starts at 01, open, rather than folded.
    expect(screen.getByTestId('cdss-visit-column-status')).not.toHaveAttribute('data-folded')
    expect(screen.getByTestId('cdss-visit-column-status')).toBeVisible()
    expect(cell('DP-04')).toBeVisible()

    fireEvent.click(primaryOf(row('DP-06')))
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('體重、K、Cr，1–2 週內')
  })

  it('stores the clinician answer over the prefill, and withdraws it on a second press', () => {
    render(<Harness model={p7Model()} />)
    fireEvent.click(askButton('dyspnoea-trend', 'worse'))
    expect(useVisitAnswersStore.getState().byPatientId[PATIENT]?.['dyspnoea-trend']?.value).toBe('worse')
    expect(askButton('dyspnoea-trend', 'worse')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(askButton('weight-trend', 'same'))
    expect(askButton('weight-trend', 'same')).toHaveAttribute('aria-pressed', 'true')
    expect(askButton('weight-trend', 'same')).not.toHaveAttribute('data-prefilled')
    expect(askButton('weight-trend', 'up')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(askButton('weight-trend', 'same'))
    // Withdrawn: the record's reading stands again.
    expect(askButton('weight-trend', 'up')).toHaveAttribute('data-prefilled', 'true')
  })
})

describe('visit decision screen · P9 HFpEF with AF', () => {
  it('queues the AF dose change from the companion pack and the MRA start', () => {
    render(<Harness model={p9Model()} />)
    expect(askButton('weight-trend', 'down')).toHaveAttribute('data-prefilled', 'true')
    expect(queueRows('treatment').map((element) => element.dataset.visitQueueDp)).toEqual(['DP-14', 'DP-09'])
    expect(queueRows()).toHaveLength(2)
    // The companion's point is a row here, so it is not also a cell.
    expect(queryCell('DP-14', 'af')).toBeUndefined()
    expect(row('DP-14')).toHaveTextContent('AF')
    expect(row('DP-14')).toHaveTextContent('apixaban 5 → 2.5 mg bid？')
    expect(row('DP-14')).toHaveTextContent('年齡 80、體重 58：減量條件 2/3')
    expect(cell('DP-06')).toHaveAttribute('data-state', 'confirm')
    fireEvent.click(primaryOf(row('DP-14')))
    expect(getPhysicianDecisions(PATIENT)['visit:af:DP-14']).toMatchObject({ decision: 'dose-adjusted' })
    expect(screen.queryByTestId('cdss-visit-plan-return')).toBeNull()
  })
})

describe('visit decision screen · P3 new AF (AF page)', () => {
  it('walks the anticoagulation chain in one row', () => {
    render(<Harness model={p3Model()} />)
    expect(askButton('af-symptoms', 'yes')).toHaveTextContent('有')
    expect(askButton('bleeding', 'no')).toHaveTextContent('無')
    openSection('treatment')
    expect(queueRows('treatment')).toHaveLength(1)
    expect(queueRows()).toHaveLength(1)
    expect(primaryOf(row('DP-07'))).toHaveTextContent('開始抗凝')
    // The dose step waits as a cell until the chain reaches it.
    expect(cell('DP-09', 'af')).toHaveAttribute('data-state', 'waiting')

    fireEvent.click(primaryOf(row('DP-07')))
    expect(queueRows()).toHaveLength(1)
    const chain = row('DP-07')
    expect(chain).toHaveAttribute('data-decided', 'false')
    expect(chain).toHaveAttribute('data-visit-current-dp', 'DP-09')
    expect(chain.querySelector('[data-visit-chain-done="DP-07"]')).toHaveTextContent('開始抗凝')
    expect(primaryOf(chain)).toHaveTextContent('apixaban 5 mg bid')
    expect(primaryOf(chain)).toHaveFocus()
    expect(chain).toHaveTextContent('減量條件 0/3')
    // Now the row carries the dose step, so the map no longer repeats it as a cell.
    expect(queryCell('DP-09', 'af')).toBeUndefined()

    fireEvent.click(primaryOf(chain))
    expect(row('DP-07')).toHaveAttribute('data-decided', 'true')
    expect(getPhysicianDecisions(PATIENT)['visit:af:DP-09']).toMatchObject({ actionId: 'apixaban-5' })
  })

  it('does not advance the chain on a deferral', () => {
    render(<Harness model={p3Model()} />)
    openSection('treatment')
    // One or two alternatives sit beside the recommendation; only three or
    // more fold behind 「其他」.
    const other = within(row('DP-07')).queryByRole('button', { name: /其他/ })
    if (other) fireEvent.click(other)
    fireEvent.click(within(row('DP-07')).getByRole('button', { name: '暫緩' }))
    expect(row('DP-07')).toHaveAttribute('data-decided', 'true')
    expect(row('DP-07').querySelector('[data-visit-primary]')).toBeNull()
  })

  it('shows the rhythm row the pack adds once symptoms are answered', () => {
    const view = render(<Harness model={p3Model()} />)
    fireEvent.click(askButton('af-symptoms', 'yes'))
    expect(useVisitAnswersStore.getState().byPatientId[PATIENT]?.['af-symptoms']?.value).toBe('yes')
    // The pack recomputes from the answer; the host draws what it returns.
    view.rerender(<Harness model={p3Model({ symptoms: 'yes' })} />)
    expect(queueRows('treatment').map((element) => element.dataset.visitQueueDp)).toEqual(['DP-07', 'DP-18'])
    expect(queueRows()).toHaveLength(2)
    expect(queryCell('DP-18', 'af')).toBeUndefined()
    expect(primaryOf(row('DP-18'))).toHaveTextContent('討論節律控制')
    expect(cell('DP-13', 'af')).toHaveAttribute('data-state', 'confirm')
    expect(screen.getByTestId('cdss-visit-map')).not.toHaveTextContent('篩檢待辦')
  })
})

describe('visit decision screen · stage shapes', () => {
  it('suspected: only 01 works; 02 opens once the diagnosis is confirmed', () => {
    render(<Harness model={p1Model()} />)
    expect(screen.getByTestId('cdss-visit-column-treatment-closed')).toHaveTextContent('確診後開啟')
    expect(screen.getByTestId('cdss-visit-column-treatment').querySelector('button[data-dp]')).toBeNull()
    // 01's way on to 02 says why it is shut rather than opening an empty section.
    const next = screen.getByTestId('cdss-visit-next-status')
    expect(next).toBeDisabled()
    expect(next).toHaveTextContent('確診後開啟')
    // 懷疑 HF？ is 01's own decision, in 01's lead, and not also a cell.
    expect(queueRows('status').map((element) => element.dataset.visitQueueDp)).toEqual(['DP-00'])
    expect(screen.getByTestId('cdss-visit-column-status')).toBeVisible()
    expect(primaryOf(row('DP-00'))).toHaveTextContent('是')
    expect(queryCell('DP-00')).toBeUndefined()
    expect(cell('DP-34')).toHaveAttribute('data-state', 'waiting')
    fireEvent.click(screen.getByTestId('cdss-visit-map-show-all'))
    expect(cell('DP-10')).toHaveAttribute('data-state', 'not-applicable')
  })

  it('baseline: up to five rows and the baseline checklist open in 01', () => {
    render(<Harness model={p2Model()} />)
    expect(queueRows('treatment').map((element) => primaryOf(element).textContent)).toEqual(['開始 β 阻斷劑', '開始 ARNI', '開始 MRA', '開始 SGLT2i'])
    expect(queueRows()).toHaveLength(4)
    expect(screen.getByTestId('cdss-visit-column-status')).not.toHaveAttribute('data-folded')
    expect(screen.getByTestId('cdss-visit-column-status')).toBeVisible()
    expect(cell('DP-02')).toHaveTextContent('紀錄缺 ferritin、TSAT、TSH、HbA1c')
    expect(screen.getByTestId('cdss-visit-column-status-foot')).toHaveTextContent('尚未納入')
    fireEvent.click(primaryOf(row('DP-07')))
    expect(screen.getByTestId('cdss-visit-plan')).toHaveTextContent('K、Cr、血壓，1–2 週內')
  })
})

describe('visit decision screen · reachability and copy', () => {
  it('keeps cards no point names reachable at the foot', () => {
    render(<Harness model={p4Model()} unmapped={[card('heart-failure-monitoring')]} />)
    const other = screen.getByTestId('cdss-visit-other-modules')
    expect(other).toHaveTextContent('其他模組：模組 heart-failure-monitoring')
    expect(within(other).getByTestId('detail-body-heart-failure-monitoring')).toBeInTheDocument()
  })

  it('copies a summary built from the pack wording and today’s decisions', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<Harness model={p5Model()} />)
    fireEvent.click(primaryOf(row('DP-07')))
    await act(async () => {
      fireEvent.click(screen.getByTestId('cdss-visit-summary-copy'))
    })
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain('HFrEF（LVEF 30%，2026-06-01）· 追蹤期 · 併 AF')
    expect(text).toContain('體重：不變（紀錄：70→70 kg（08-20→09-27））')
    expect(text).toContain('- DP-07 RAS 抑制：換 ARNI（回應檢查：K、Cr、血壓，1–2 週內）')
    expect(text).not.toContain('天內回診')
    expect(screen.getByTestId('cdss-visit-summary-copy')).toHaveTextContent('已複製')
  })

  it('ignores a decision recorded on another day', () => {
    usePhysicianDecisionsStore.getState().recordDecision(PATIENT, 'visit:hf:DP-07', {
      decision: 'prescribed', packVersion: 'test-1', dp: 'DP-07', actionId: 'switch-arni', actionLabel: '換 ARNI',
    }, new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))
    render(<Harness model={p5Model()} />)
    expect(row('DP-07')).toHaveAttribute('data-decided', 'false')
  })
})
