/**
 * What a pack's `next` may add after personalized-care 2.8.1 (#47): the points
 * a chained step answers (`decides`) and that its actions are equals
 * (`unranked`). AF DP-07's 「開始抗凝」 opens the DOAC, all four at their
 * doses, none recommended; the one chosen is DP-08's agent and DP-09's dose.
 * Read defensively — an older pack sends neither, and nothing changes.
 */
import { useMemo } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { VisitDecisionScreen } from '@/features/clinical-decision-support/renderers/visit/VisitDecisionScreen'
import { buildVisitSummaryText } from '@/features/clinical-decision-support/renderers/visit/visit-decisions'
import type { DecisionPointView, VisitDecisionModel } from '@/features/clinical-decision-support/types'
import {
  usePhysicianDecisions,
  usePhysicianDecisionsStore,
} from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswersStore } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { action, point } from './visit-model.fixtures'

const PATIENT = 'next-extras-patient'
const hbCr = { text: 'Hb、Cr' }

function afModel(extras: { decides?: string[]; unranked?: boolean; criteria?: unknown }): VisitDecisionModel {
  const next = {
    afterActionId: 'af-dp07-start',
    headline: '選 DOAC（劑量已依腎功能、年齡、體重算好）',
    why: 'ESC 未指定優先 DOAC；CrCl 41',
    actions: [
      action('af-dp09-apixaban', 'apixaban 5 mg bid', 'prescribed', { responseCheck: hbCr }),
      action('af-dp09-rivaroxaban-low', 'rivaroxaban 15 mg qd', 'prescribed', { responseCheck: hbCr }),
      action('af-dp09-edoxaban-low', 'edoxaban 30 mg qd', 'prescribed', { responseCheck: hbCr }),
    ],
    ...extras,
  } as DecisionPointView['next']
  return {
    packId: 'atrial-fibrillation-cdss',
    stage: 'baseline',
    triggers: [],
    headline: 'AF 首次評估：CHA₂DS₂-VA 4',
    keyValues: [],
    asks: [],
    queue: ['DP-07'],
    points: [
      point({
        dp: 'DP-07', label: '需要抗凝嗎', state: 'act', source: 'af', group: 'anticoagulation',
        headline: 'CHA₂DS₂-VA 4：開始抗凝？',
        actions: [
          action('af-dp07-start', '開始抗凝', 'prescribed', { primary: true, responseCheck: hbCr }),
          action('af-dp07-defer', '暫緩', 'deferred'),
        ],
        next,
      }),
      point({ dp: 'DP-08', label: '抗凝選藥', state: 'waiting', source: 'af', group: 'anticoagulation', headline: '等上一步' }),
      point({ dp: 'DP-09', label: 'DOAC 劑量', state: 'waiting', source: 'af', group: 'anticoagulation', headline: '等上一步' }),
    ],
    coverage: { total: 3, included: 3 },
  }
}

function Harness({ model }: { model: VisitDecisionModel }) {
  const decisions = usePhysicianDecisions(PATIENT)
  const now = useMemo(() => new Date(), [])
  return (
    <VisitDecisionScreen
      model={model}
      isEnglish={false}
      now={now}
      packVersion="test-1"
      screenKey={`${PATIENT}:${model.packId}`}
      decisions={decisions}
      onRecordDecision={(key, input) => usePhysicianDecisionsStore.getState().recordDecision(PATIENT, key, input)}
      onClearDecision={(key) => usePhysicianDecisionsStore.getState().clearDecision(PATIENT, key)}
      answers={{}}
      modules={new Map()}
      unmappedModules={[]}
      renderDetail={() => null}
    />
  )
}

const tile = (dp: string) => screen.getByTestId('cdss-visit-overview').querySelector<HTMLButtonElement>(`button[data-dp="${dp}"]`)!
const row = () => within(screen.getByTestId('cdss-visit-column-treatment')).getAllByTestId('cdss-visit-controls')[0]
/** The page, with 02 — where DP-07's row is — shown. */
function renderAt02(model: VisitDecisionModel) {
  render(<Harness model={model} />)
  fireEvent.click(screen.getByTestId('cdss-visit-step-treatment'))
}

beforeEach(() => {
  localStorage.clear()
  usePhysicianDecisionsStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  useVisitAnswersStore.setState({ byPatientId: {}, hydratedPatientIds: {} })
  Element.prototype.scrollIntoView = jest.fn()
})

describe('a chained step the pack says decides other points, among equals', () => {
  it('draws the DOACs alike, none the recommendation', () => {
    renderAt02(afModel({ decides: ['DP-08', 'DP-09'], unranked: true }))
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    const choices = row()
    expect(choices).toHaveAttribute('data-visit-question')
    for (const label of ['apixaban 5 mg bid', 'rivaroxaban 15 mg qd', 'edoxaban 30 mg qd']) {
      expect(within(choices).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('shows the choice on DP-08 and DP-09, and names them in the summary', () => {
    const model = afModel({ decides: ['DP-08', 'DP-09'], unranked: true })
    renderAt02(model)
    expect(tile('DP-08')).not.toHaveAttribute('data-decided')
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    fireEvent.click(within(row()).getByRole('button', { name: 'rivaroxaban 15 mg qd' }))
    for (const dp of ['DP-08', 'DP-09']) {
      expect(tile(dp)).toHaveAttribute('data-decided', 'true')
      expect(tile(dp)).toHaveTextContent('rivaroxaban 15 mg qd')
    }
    const text = buildVisitSummaryText({
      model,
      answers: {},
      decisions: usePhysicianDecisionsStore.getState().byPatientId[PATIENT],
      now: new Date(),
      isEnglish: false,
    })
    expect(text).toContain('- DP-07 需要抗凝嗎：開始抗凝')
    expect(text).toContain('- DP-08／DP-09 抗凝選藥／DOAC 劑量：rivaroxaban 15 mg qd')
    // One choice is one decision on the summary's step, not three.
    expect(screen.getByTestId('cdss-visit-step-summary')).toHaveTextContent('已記錄 1')
  })

  // #196 review: the tiles showed the choice, but DP-09's card still said
  // 「等上一步」.
  it('opens a point the choice decided on the choice, with where it was decided', () => {
    renderAt02(afModel({ decides: ['DP-08', 'DP-09'], unranked: true }))
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    fireEvent.click(within(row()).getByRole('button', { name: 'rivaroxaban 15 mg qd' }))
    fireEvent.click(tile('DP-09'))
    const detail = screen.getByTestId('cdss-visit-detail')
    expect(detail).toHaveAttribute('data-dp', 'DP-09')
    expect(within(detail).getByRole('heading', { level: 4 })).toHaveTextContent('已記錄')
    expect(within(detail).getByTestId('cdss-visit-decided')).toHaveTextContent('rivaroxaban 15 mg qd')
    expect(within(detail).getByTestId('cdss-visit-detail-decided-with')).toHaveTextContent('與 DP-07 需要抗凝嗎 一起決定')
    expect(detail).not.toHaveTextContent('等上一步')
    expect(screen.getByTestId('cdss-visit-detail-slot')).not.toHaveTextContent('等上一步DOAC')
  })

  it('changes the choice from that card on the one record — DP-07’s — and DP-08／DP-09 are pending again until chosen', () => {
    renderAt02(afModel({ decides: ['DP-08', 'DP-09'], unranked: true }))
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    fireEvent.click(within(row()).getByRole('button', { name: 'rivaroxaban 15 mg qd' }))
    fireEvent.click(tile('DP-09'))
    const detail = () => screen.getByTestId('cdss-visit-detail')
    fireEvent.click(within(detail()).getByRole('button', { name: '改 DP-07 的決定' }))
    // The record DP-07's row keeps is the one cleared; none was ever written for DP-08 or DP-09.
    const keys = Object.keys(usePhysicianDecisionsStore.getState().byPatientId[PATIENT] ?? {})
    expect(keys.some((key) => key.endsWith(':next'))).toBe(false)
    expect(keys.some((key) => /DP-0[89]/.test(key))).toBe(false)
    for (const dp of ['DP-08', 'DP-09']) expect(tile(dp)).not.toHaveAttribute('data-decided')
    // Still on DP-09's card: its choices, to decide again here, and the line over it asks them.
    expect(within(detail()).getByRole('heading', { level: 4 })).toHaveTextContent('待決定')
    expect(screen.getByTestId('cdss-visit-detail-slot')).toHaveTextContent('選 DOAC（劑量已依腎功能、年齡、體重算好）')
    fireEvent.click(within(detail()).getByRole('button', { name: 'edoxaban 30 mg qd' }))
    for (const dp of ['DP-08', 'DP-09']) expect(tile(dp)).toHaveTextContent('edoxaban 30 mg qd')
  })

  // #196 review: from DP-08／DP-09 the same choice is made — with what it rests on.
  it('shows what the choice rests on when DP-09 is opened before a drug is chosen', () => {
    renderAt02(afModel({ decides: ['DP-08', 'DP-09'], unranked: true }))
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    fireEvent.click(tile('DP-09'))
    const detail = screen.getByTestId('cdss-visit-detail')
    expect(screen.getByTestId('cdss-visit-detail-slot')).toHaveTextContent('選 DOAC（劑量已依腎功能、年齡、體重算好）')
    expect(within(detail).getByTestId('cdss-visit-detail-decided-with-why')).toHaveTextContent('ESC 未指定優先 DOAC；CrCl 41')
    expect(within(detail).getByTestId('cdss-visit-detail-decided-with-why')).toBeVisible()
    expect(within(detail).getByRole('button', { name: 'rivaroxaban 15 mg qd' })).toBeInTheDocument()
  })

  it('keeps it in view after 改 on DP-09, and with the choice recorded', () => {
    renderAt02(afModel({ decides: ['DP-08', 'DP-09'], unranked: true }))
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    fireEvent.click(within(row()).getByRole('button', { name: 'rivaroxaban 15 mg qd' }))
    fireEvent.click(tile('DP-09'))
    const why = () => within(screen.getByTestId('cdss-visit-detail')).getByTestId('cdss-visit-detail-decided-with-why')
    expect(why()).toHaveTextContent('ESC 未指定優先 DOAC；CrCl 41')
    fireEvent.click(within(screen.getByTestId('cdss-visit-detail')).getByRole('button', { name: '改 DP-07 的決定' }))
    expect(why()).toHaveTextContent('ESC 未指定優先 DOAC；CrCl 41')
    expect(why()).toBeVisible()
  })

  // Once 「開始抗凝」 opens the choice, DP-08 and DP-09 wait on it, not on an
  // earlier step: they read as today's, as a chain row walked onto them would.
  it('reads DP-08 and DP-09 as today’s once the choice is open, not 「等上一步」', () => {
    renderAt02(afModel({ decides: ['DP-08', 'DP-09'], unranked: true }))
    for (const dp of ['DP-08', 'DP-09']) expect(tile(dp)).toHaveTextContent('等上一步')
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    for (const dp of ['DP-08', 'DP-09']) {
      expect(tile(dp)).toHaveTextContent('今天要決定')
      // The question the choice asks, not the point's own 「等 DP-07」.
      expect(tile(dp)).toHaveTextContent('選 DOAC（劑量已依腎功能、年齡、體重算好）')
      expect(tile(dp)).not.toHaveTextContent('等上一步')
    }
    fireEvent.click(tile('DP-09'))
    expect(screen.getByTestId('cdss-visit-detail-slot')).not.toHaveTextContent('等上一步')
  })

  // 「開始抗凝」 recorded is not DP-07 decided: the DOAC is still to choose,
  // and its tile says so rather than 「已記錄」.
  it('keeps DP-07 today’s while its DOAC is still to choose, and records it once chosen', () => {
    renderAt02(afModel({ decides: ['DP-08', 'DP-09'], unranked: true }))
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    expect(tile('DP-07')).not.toHaveAttribute('data-decided')
    expect(tile('DP-07')).not.toHaveTextContent('已記錄')
    expect(tile('DP-07')).toHaveTextContent('開始抗凝 → 選 DOAC（劑量已依腎功能、年齡、體重算好）')
    fireEvent.click(tile('DP-07'))
    expect(within(screen.getByTestId('cdss-visit-detail')).getByRole('heading', { level: 4 })).not.toHaveTextContent('已記錄')
    fireEvent.click(within(row()).getByRole('button', { name: 'rivaroxaban 15 mg qd' }))
    expect(tile('DP-07')).toHaveAttribute('data-decided', 'true')
    expect(tile('DP-07')).toHaveTextContent('rivaroxaban 15 mg qd')
    expect(within(screen.getByTestId('cdss-visit-detail')).getByRole('heading', { level: 4 })).toHaveTextContent('已記錄')
  })

  // P11: dabigatran under CrCl 30 → 「改用其他 DOAC」 opens the switch, which
  // chooses DP-08's agent anew — settled until then.
  it('reads a settled DP-08 as today’s while the switch that decides it is open', () => {
    const model: VisitDecisionModel = {
      ...afModel({}),
      queue: ['DP-09'],
      points: [
        point({ dp: 'DP-08', label: '抗凝選藥', state: 'done', source: 'af', group: 'anticoagulation', headline: 'DOAC：無機械瓣／MS 紀錄' }),
        point({
          dp: 'DP-09', label: 'DOAC 劑量', state: 'safety', source: 'af', group: 'anticoagulation',
          headline: 'dabigatran：CrCl <30 禁忌 → 換藥',
          actions: [action('af-dp09-switch', '改用其他 DOAC', 'dose-adjusted', { primary: true, responseCheck: hbCr })],
          next: {
            afterActionId: 'af-dp09-switch',
            headline: '換哪一種 DOAC：部分劑量需個別評估',
            why: 'CrCl 25',
            actions: [
              action('af-dp09-switch-rivaroxaban', 'rivaroxaban 15 mg qd', 'prescribed', { responseCheck: hbCr }),
              action('af-dp09-switch-edoxaban', 'edoxaban 30 mg qd', 'prescribed', { responseCheck: hbCr }),
            ],
            decides: ['DP-08'],
            unranked: true,
          } as DecisionPointView['next'],
        }),
      ],
    }
    renderAt02(model)
    expect(tile('DP-08')).toHaveTextContent('已定')
    fireEvent.click(within(row()).getByRole('button', { name: '改用其他 DOAC' }))
    expect(tile('DP-08')).toHaveTextContent('今天要決定')
    expect(tile('DP-08')).toHaveTextContent('換哪一種 DOAC：部分劑量需個別評估')
    expect(tile('DP-09')).not.toHaveAttribute('data-decided')
    expect(tile('DP-09')).toHaveTextContent('改用其他 DOAC → 換哪一種 DOAC：部分劑量需個別評估')
    fireEvent.click(within(row()).getByRole('button', { name: 'edoxaban 30 mg qd' }))
    for (const dp of ['DP-08', 'DP-09']) expect(tile(dp)).toHaveTextContent('edoxaban 30 mg qd')
  })

  // Owner feedback 2026-09-29: 「那你要寫出來對應的」 — each Table 11
  // criterion, marked, with the patient's value, under the open choice.
  it('writes out the choice’s criteria, marked, and a criterion the record cannot settle as ？', () => {
    const criteria = [
      {
        title: 'apixaban 5 → 2.5 mg bid：3 項中 2 項（符合 0）',
        items: [
          { label: '年齡 ≥80', value: '78 歲', met: false },
          { label: '體重 ≤60 kg', value: '68 kg', met: false },
        ],
      },
      {
        title: 'dabigatran 110 mg 個別考慮：任一項',
        items: [
          { label: 'CrCl 30–50 mL/min', value: '41 mL/min', met: true },
          { label: '胃炎／食道炎／GERD、其他出血風險' },
          { value: 'a criterion without a label is dropped' },
        ],
      },
    ]
    renderAt02(afModel({ decides: ['DP-08', 'DP-09'], unranked: true, criteria } as never))
    // Before 「開始抗凝」 the choice is not the row's, and neither are its criteria.
    expect(row().closest('[data-visit-queue-row]')!.querySelector('[data-visit-criteria]')).toBeNull()
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    const box = row().closest('[data-visit-queue-row]')!.querySelector<HTMLElement>('[data-visit-criteria]')!
    expect(box).toHaveTextContent('apixaban 5 → 2.5 mg bid：3 項中 2 項（符合 0）')
    const items = [...box.querySelectorAll('li')].map((item) => [item.getAttribute('data-met'), item.textContent])
    expect(items).toEqual([
      ['false', '✗不符合：年齡 ≥8078 歲'],
      ['false', '✗不符合：體重 ≤60 kg68 kg'],
      ['true', '✓符合：CrCl 30–50 mL/min41 mL/min'],
      ['unknown', '？未知：胃炎／食道炎／GERD、其他出血風險'],
    ])
    // Once chosen, the row is its record line again.
    fireEvent.click(within(row()).getByRole('button', { name: 'rivaroxaban 15 mg qd' }))
    expect(screen.getByTestId('cdss-visit-column-treatment').querySelector('[data-visit-criteria]')).toBeNull()
  })

  // HF DP-14 folds AF DP-07, `next` and all: the DP-08 and DP-09 its step
  // decides are AF's, not the HF page's own points of the same codes.
  it('leaves another pack’s points of the same codes alone', () => {
    const af = afModel({ decides: ['DP-08', 'DP-09'], unranked: true }).points[0]
    const model: VisitDecisionModel = {
      ...afModel({}),
      packId: 'hf-page-test',
      headline: 'HF 追蹤',
      queue: ['DP-14'],
      points: [
        point({
          dp: 'DP-08', label: 'MRA', state: 'confirm', source: 'hf', headline: 'K 4.1：加 MRA？',
          actions: [action('hf-dp08-add', '加 MRA', 'prescribed')],
        }),
        point({ dp: 'DP-09', label: 'SGLT2i', state: 'waiting', source: 'hf', headline: '等上一步' }),
        { ...af, dp: 'DP-14', label: 'AF 抗凝' },
      ],
    }
    renderAt02(model)
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    expect(within(row()).getByRole('button', { name: 'rivaroxaban 15 mg qd' })).toBeInTheDocument()
    expect(tile('DP-09')).toHaveTextContent('等上一步')
    expect(tile('DP-08')).not.toHaveTextContent('今天要決定')
    expect(screen.getByTestId('cdss-visit-column-treatment').querySelector('[data-still-open="DP-08"]')).not.toBeNull()
  })

  it('changes nothing for a pack that sends neither (2.8.x)', () => {
    renderAt02(afModel({}))
    fireEvent.click(within(row()).getByRole('button', { name: '開始抗凝' }))
    expect(row()).not.toHaveAttribute('data-visit-question')
    fireEvent.click(within(row()).getByRole('button', { name: 'apixaban 5 mg bid' }))
    expect(tile('DP-08')).not.toHaveAttribute('data-decided')
  })
})
