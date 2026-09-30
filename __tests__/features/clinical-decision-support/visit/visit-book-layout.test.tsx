/**
 * The pocket-handbook layout (`?visit=book`), drawn by the real pack for the
 * scenario bundles: the decision map beside the page, each point once, the
 * reasoning of a point to weigh under 看依據 — and the same decisions as the map.
 */
import { useMemo, useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ClinicalDecisionSupportView } from '@/features/clinical-decision-support/renderers/ClinicalDecisionSupportView'
import { usePhysicianDecisions, usePhysicianDecisionsStore } from '@/features/clinical-decision-support/stores/physician-decisions.store'
import { useVisitAnswerRecord, useVisitAnswersStore, visitAnswersOf } from '@/features/clinical-decision-support/stores/visit-answers.store'
import { useAfAnswers, useAfAnswersStore } from '@/features/clinical-decision-support/stores/af-answers.store'
import type { PhenotypeAnswer } from '@/features/clinical-decision-support/stores/phenotype-answer.store'
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
  const [phenotype, setPhenotype] = useState<PhenotypeAnswer>()
  const run = useMemo(() => scenarioRun(id, { page, answers, afAnswers, phenotype }), [afAnswers, answers, id, page, phenotype])
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
      phenotypeAnswer={phenotype}
      onAnswerPhenotype={setPhenotype}
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
  useVisitAnswersStore.getState().clearAnswers(PATIENT)
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
    // The pack's chapters, in reading order, with the settled diagnosis beside the first.
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '是哪一型？', '現在是乾是濕？', '藥物：HFpEF 該用什麼？', '共病：HFpEF 的另一半治療', '裝置與進階', '今天的計畫',
    ])
    expect(screen.getByText('HFpEF · 已確立')).toBeInTheDocument()
    // DP-01 draws the pack's phenotype table, HFpEF marked as this patient's.
    const phenotype = within(entry('DP-01')).getByTestId('cdss-book-classification')
    expect(within(phenotype).getByRole('columnheader', { name: 'HFpEF ← 本病人' })).toBeInTheDocument()
    expect(phenotype).toHaveTextContent('LVEF 60%（04-01） · NT-proBNP 1100（09-20） · I50.32')
    expect(phenotype).toHaveTextContent('ESC 2026 取消 HFmrEF')
    // Today's triage is the red-flag strip at the head of its chapter.
    expect(entry('DP-24').tagName).toBe('P')
  })

  it('folds the decision map to a rail and opens it again', () => {
    render(<BookPage id="p9-hfpef-af-dose" page="hf" />)
    fireEvent.click(screen.getByRole('button', { name: '收合決策地圖' }))
    expect(document.querySelector('[data-book-map-dp]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展開決策地圖' }))
    expect(mapLine('DP-09')).toHaveAttribute('data-book-mark', 'act')
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
    expect(table).toHaveTextContent('本病人的 DOAC 劑量（CrCl 32 · 80 歲 · 58 kg · Cr 1.3）')
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
    // A settled point carries 看依據 when the pack says what would reopen it:
    // P9's DP-10 empagliflozin is fixed-dose, with no line, so none.
    expect(within(entry('DP-10')).queryByRole('button', { name: /看依據/ })).toBeNull()
    // A reminder has no 看依據.
    expect(within(entry('DP-15')).queryByRole('button', { name: /看依據/ })).toBeNull()
  })

  it('records a chain in its box and marks it settled in the map (P3 DP-07)', () => {
    render(<BookPage id="p3-new-af" page="af" />)
    // DP-07 sits beside DP-08; its decision spans the page under the pair.
    const box = () => document.querySelector<HTMLElement>('[data-book-box="DP-07"]')!
    const primary = () => box().querySelector<HTMLButtonElement>('[data-visit-primary]')!
    expect(box()).toHaveTextContent('今天：CHA₂DS₂-VA 4：開始抗凝？')
    expect(primary()).toHaveTextContent('開始抗凝')
    fireEvent.click(primary())
    expect(box()).toHaveTextContent('選 DOAC')
    // Choosing the DOAC, every agent at this patient's dose above the buttons.
    expect(within(box()).getByTestId('cdss-book-dose-table')).toHaveTextContent('rivaroxaban20 mg qd')
    fireEvent.click(primary())
    expect(mapLine('DP-07')).toHaveAttribute('data-book-mark', 'done')
    expect(screen.getByTestId('cdss-book-end')).toHaveTextContent('apixaban 5 mg bid')
  })

  describe('DP-01 is answered in its phenotype table, once (owner request 2026-09-30)', () => {
    it('before a diagnosis: the table offers HFrEF, HFpEF and 還不確定; the old question is gone (P1)', () => {
      render(<BookPage id="p1-suspected-hfpef" page="hf" />)
      const dp01 = entry('DP-01')
      expect(dp01).toHaveTextContent('HFrEF 還是 HFpEF？')
      // No second DP-01: neither the old question nor the diagnosis view.
      expect(screen.queryByTestId('cdss-hf-question-hf-suspicion')).toBeNull()
      expect(screen.queryByTestId('cdss-visit-hf-diagnosis-view')).toBeNull()
      expect(document.querySelectorAll('[data-book-dp="DP-01"]')).toHaveLength(1)
      expect(mapLine('DP-01')).toHaveAttribute('data-book-mark', 'act')
      const table = within(dp01).getByTestId('cdss-book-classification')
      expect(within(table).getByRole('button', { name: '選 HFrEF' })).toHaveAttribute('aria-pressed', 'false')
      expect(within(table).getByRole('button', { name: '還不確定' })).toBeInTheDocument()
      // Choosing HFpEF is the diagnosis: the table marks it, and DP-01 settles.
      fireEvent.click(within(table).getByRole('button', { name: '選 HFpEF' }))
      const chosen = within(entry('DP-01')).getByTestId('cdss-book-class-hfpEF')
      expect(chosen).toHaveTextContent('✓ HFpEF')
      expect(chosen).toHaveAttribute('aria-pressed', 'true')
      expect(mapLine('DP-01')).toHaveAttribute('data-book-mark', 'done')
    })

    it('還不確定 is chosen in the table too; a phenotype after it settles the diagnosis (P1)', () => {
      render(<BookPage id="p1-suspected-hfpef" page="hf" />)
      fireEvent.click(within(entry('DP-01')).getByRole('button', { name: '還不確定' }))
      expect(within(entry('DP-01')).getByTestId('cdss-book-class-unsure')).toHaveAttribute('aria-pressed', 'true')
      expect(mapLine('DP-01')).not.toHaveAttribute('data-book-mark', 'done')
      fireEvent.click(within(entry('DP-01')).getByRole('button', { name: '選 HFrEF' }))
      expect(within(entry('DP-01')).getByTestId('cdss-book-class-hfrEF')).toHaveAttribute('aria-pressed', 'true')
      // With a diagnosis the pack's question no longer offers 還不確定; the
      // other phenotype stays, so a mistaken choice can be taken back.
      expect(within(entry('DP-01')).queryByTestId('cdss-book-class-unsure')).toBeNull()
      expect(within(entry('DP-01')).getByRole('button', { name: '選 HFpEF' })).toBeInTheDocument()
    })

    it('at a first visit with an LVEF of 28%: 確認 HFrEF, and HFpEF not on offer (P2)', () => {
      render(<BookPage id="p2-new-hfref" page="hf" />)
      const table = within(entry('DP-01')).getByTestId('cdss-book-classification')
      expect(within(table).getByRole('button', { name: '確認 HFrEF' })).toBeInTheDocument()
      expect(within(table).queryByTestId('cdss-book-class-hfpEF')).toBeNull()
      expect(within(table).getByText('不可選')).toBeInTheDocument()
    })
  })

  it('DP-03 asks the pack\'s every-visit questions and nothing of the old cards (P9)', () => {
    render(<BookPage id="p9-hfpef-af-dose" page="hf" />)
    const asks = within(entry('DP-03')).getByTestId('cdss-book-asks')
    expect(within(asks).getAllByRole('group').map((group) => group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent))
      .toEqual(['喘比上次', '體重比上次'])
    expect(screen.queryByTestId('cdss-visit-asks')).toBeNull()
    expect(screen.queryByText('其他症狀、徵象與 NYHA')).toBeNull()
    fireEvent.click(within(asks).getByRole('button', { name: '穩定' }))
    expect(within(asks).getByRole('button', { name: '穩定' })).toHaveAttribute('aria-pressed', 'true')
    expect(visitAnswersOf(useVisitAnswersStore.getState().byPatientId[PATIENT]!)['dyspnoea-trend']).toBe('stable')
  })

  describe('the AF anticoagulation chapter as the prototype draws it (P9)', () => {
    it('要不要: CHA₂DS₂-VA item by item beside 用哪個: the valves, and 多少: every DOAC at its dose', () => {
      render(<BookPage id="p9-hfpef-af-dose" page="af" />)
      const whether = entry('DP-07')
      expect(whether).toHaveTextContent('要不要：CHA₂DS₂-VA')
      const score = within(whether).getByTestId('cdss-book-score')
      expect(within(score).getAllByRole('row').map((row) => row.textContent)).toEqual([
        '✓符合C 心衰竭1I50.32',
        '✓符合H 高血壓1I10',
        '✓符合A₂ 年齡 ≥75280 歲',
        '✗紀錄無D 糖尿病1紀錄無',
        '✗紀錄無S₂ 中風／TIA／栓塞2紀錄無',
        '✗紀錄無V 血管疾病1紀錄無',
        '合計4≥2 建議抗凝 · 已在用',
      ])
      const which = entry('DP-08')
      expect(which).toHaveTextContent('用哪個：DOAC 前先排除')
      expect(which).toHaveTextContent('紀錄無 Z95.2、I05 代碼；未排除，請確認。')
      const howMuch = entry('DP-09')
      expect(howMuch).toHaveTextContent('多少：本病人的 DOAC 劑量（CrCl 32 · 80 歲 · 58 kg · Cr 1.3）')
      const dose = within(howMuch).getByTestId('cdss-book-dose-table')
      expect(within(dose).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['藥', '標準', '減量條件（本病人）', '本病人劑量'])
      expect(within(dose).getAllByRole('row')[1]).toHaveTextContent('apixaban ← 現用5 mg bid3 項中 ≥2：✓ 年齡 ≥80（80 歲） · ✓ 體重 ≤60 kg（58 kg） · ✗ Cr ≥1.5 mg/dL（1.3 mg/dL）2.5 mg bid')
      // Today's decision under it, 看依據 beside the buttons, without the table twice.
      expect(within(howMuch).getByText('今天：apixaban 5 → 2.5 mg bid？')).toBeInTheDocument()
      fireEvent.click(within(howMuch).getByRole('button', { name: /看依據/ }))
      expect(within(howMuch).getAllByTestId('cdss-book-dose-table')).toHaveLength(1)
      expect(within(howMuch).queryByTestId('cdss-book-option-table')).toBeNull()
    })

    it('a verdict still waiting (the bleed first) is marked so, not drawn as a conclusion', () => {
      const verdict = () => within(entry('DP-07')).getByTestId('cdss-book-score').querySelector<HTMLElement>('tr:last-child td:last-child')!
      const { unmount } = render(<BookPage id="p9-hfpef-af-dose" page="af" />)
      expect(verdict()).toHaveTextContent('≥2 建議抗凝 · 已在用')
      expect(verdict()).not.toHaveAttribute('data-pending')
      unmount()
      useAfAnswersStore.getState().answer(PATIENT, 'activeBleeding', true)
      render(<BookPage id="p9-hfpef-af-dose" page="af" />)
      expect(verdict()).toHaveTextContent('出血處理後再決定抗凝 · 已在用')
      expect(verdict()).toHaveAttribute('data-pending', 'true')
    })

    it('the valves are answered in place, 全部皆無 at once, and pressed again taken back', () => {
      render(<BookPage id="p9-hfpef-af-dose" page="af" />)
      const which = () => entry('DP-08')
      const answer = (id: string) => useAfAnswersStore.getState().answers[id]
      fireEvent.click(within(which()).getByRole('button', { name: '全部皆無' }))
      expect(answer('mechanicalValve')).toBe(false)
      expect(answer('significantMitralStenosis')).toBe(false)
      expect(within(which()).getByRole('button', { name: /全部皆無 · 再按復原/ })).toHaveAttribute('aria-pressed', 'true')
      // Answered, the record's note goes.
      expect(which()).not.toHaveTextContent('未排除')
      fireEvent.click(within(which()).getByRole('button', { name: /全部皆無 · 再按復原/ }))
      expect(answer('mechanicalValve')).toBeUndefined()
      // 有 on a mechanical valve: DP-08 turns to the valve decision.
      const valve = within(which()).getAllByRole('group')[0]!
      fireEvent.click(within(valve).getByRole('button', { name: '有' }))
      expect(answer('mechanicalValve')).toBe(true)
      expect(document.querySelector('[data-book-box="DP-08"]')).toHaveTextContent('改 warfarin')
    })
  })

  describe('laid out as the prototype (P9 HF)', () => {
    it('one table per chapter: settled and not-applicable pillars as muted rows in it', () => {
      render(<BookPage id="p9-hfpef-af-dose" page="hf" />)
      const drugs = document.querySelector<HTMLElement>('[data-book-section="drugs"]')!
      const tables = drugs.querySelectorAll('[role="group"]')
      expect(tables).toHaveLength(1)
      const rows = [...tables[0]!.querySelectorAll<HTMLElement>('[data-book-dp]')]
      expect(rows.map((row) => row.dataset.bookDp)).toEqual(['DP-10', 'DP-09', 'DP-07', 'DP-08'])
      expect(rows.filter((row) => row.hasAttribute('data-quiet')).map((row) => row.dataset.bookDp)).toEqual(['DP-10', 'DP-07', 'DP-08'])
      // Not applicable here, they are rows of the table, not the 不適用 line.
      expect(drugs.querySelector('[data-book-absent="drugs"][data-state="not-applicable"]')).not.toHaveTextContent('DP-07')
      const comorbidity = document.querySelector<HTMLElement>('[data-book-section="comorbidity"]')!
      expect(comorbidity.querySelectorAll('[role="group"]')).toHaveLength(1)
    })

    it('the red-flag strip is 紅旗; a point waiting on the every-visit answers links to them', () => {
      render(<BookPage id="p9-hfpef-af-dose" page="hf" />)
      expect(entry('DP-24')).toHaveTextContent(/^DP-24\s紅旗\s今日分流：胸痛/)
      const link = within(entry('DP-06')).getByRole('button', { name: '等本次喘／體重的回答' })
      fireEvent.click(link)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('says why a point does not apply, where it fits in a few words', () => {
      render(<BookPage id="p9-hfpef-af-dose" page="af" />)
      const line = document.querySelector<HTMLElement>('[data-book-absent="oac"][data-state="not-applicable"]')!
      expect(line).toHaveTextContent('DP-12 VKA 與 TTR（未用 warfarin）')
      expect(document.querySelector('[data-book-absent="oac"][data-state="not-included"]')).toHaveTextContent('尚未納入')
    })
  })

  it('AF chapters 4–6 ask the pack\'s questions in place, not the old folds (P9)', () => {
    render(<BookPage id="p9-hfpef-af-dose" page="af" />)
    const dp13 = entry('DP-13')
    expect(within(dp13).getByText('其他可修正因子')).toBeInTheDocument()
    expect(within(dp13).getByText('併用 NSAID、抗血小板')).toBeInTheDocument()
    expect(dp13).not.toHaveTextContent('HAS-BLED 因子')
    fireEvent.click(within(dp13).getByRole('button', { name: '全部皆無' }))
    expect(useAfAnswersStore.getState().answers.bleedingDrugs).toBe(false)
    // DP-17: the agents by LVEF, and whether the rate was at rest; no strategy radios.
    const dp17 = entry('DP-17')
    expect(within(dp17).getByRole('columnheader', { name: 'LVEF >40% ← 本病人' })).toBeInTheDocument()
    expect(within(dp17).getByRole('rowheader', { name: '可用' })).toBeInTheDocument()
    fireEvent.click(within(dp17).getByRole('button', { name: '靜息量測' }))
    expect(useAfAnswersStore.getState().answers.restingRate).toBe(true)
    expect(screen.queryByTestId('cdss-visit-af-strategy')).toBeNull()
    expect(within(entry('DP-21')).getByText('門診確認')).toBeInTheDocument()
  })
})
