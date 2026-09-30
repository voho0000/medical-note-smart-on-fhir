"use client"

import { Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { CdssRecommendation } from '../../types'
import type {
  PhysicianDecisionInput,
  PhysicianDecisionMap,
} from '../../stores/physician-decisions.store'
import { useCdssDecisionTimingStore } from '../../stores/cdss-decision-timing.store'
import {
  ABSENT_STATES,
  BLOCK_ORDER,
  DECISION_STATES,
  buildQueueRows,
  buildVisitPlan,
  buildVisitSummaryText,
  checkIntervalSuffix,
  decisionBasis,
  decisionInputFor,
  dependentDecisionKeys,
  effectiveAnswer,
  pointSteps,
  queuedPointDps,
  settleDecisions,
  settledPointOf,
  visitDecisionKey,
  type QueueRow,
  type QueueStep,
} from './visit-decisions'
import type {
  DecisionPointView,
  VisitAction,
  VisitAnswers,
  VisitAsk,
  VisitBlock,
  VisitDecisionModel,
} from '../../types'
import { DecisionMapColumns } from './DecisionMapColumns'
import { BookAsks } from './BookAsks'
import { VisitBookLayout, bookChaptersOf, type BookEntry, type BookMark } from './VisitBookLayout'
import { DecisionPointDetail } from './DecisionPointDetail'
import { PointBox, QueueRowBox, TodayQueue } from './TodayQueue'
import { VisitAsks, type VisitAnswerProvenance } from './VisitAsks'
import { VisitAsksDetail, isFirstAssessment, openingAnswers } from './VisitAsksDetail'
import type { VisitMapSurfaces } from './visit-surfaces'
import { pageSourceOf } from './visit-model.source'
import { focusBackTo, focusInto, revealTop } from './reveal'
import { MapFold } from './MapFold'
import { VisitPlan } from './VisitPlan'
import { displayDate, visitStatusSentence, VisitStatusLine, VisitTriggers, VisitValues } from './VisitStatusHeader'
import { VisitSummary } from './VisitSummary'
import { VisitBookChromeContext, isVisitBookMode } from './visit-book-chrome'
import rowStyles from './point-rows.module.css'

const ASKS_DETAIL_ID = 'cdss-visit-asks-detail'

export interface VisitDecisionScreenProps {
  model: VisitDecisionModel
  isEnglish: boolean
  /** One clock per mount; 「今天」 is read against it. */
  now: Date
  packVersion: string
  /** `<patientId>:<packId>`, for the in-memory decision timing. */
  screenKey: string
  decisions?: PhysicianDecisionMap
  onRecordDecision?: (key: string, input: PhysicianDecisionInput) => void
  onClearDecision?: (key: string) => void
  answers: VisitAnswers
  /** Where each of today's answers was given, so an answer from another page says so. */
  answerSources?: VisitAnswerProvenance
  onAnswer?: (id: VisitAsk['id'], value: string | null) => void
  /** Every card a point can open, by module id — this pack's and the companion's. */
  modules: ReadonlyMap<string, CdssRecommendation>
  /**
   * This pack's cards that no decision point names. No longer drawn on the map
   * (「沒用處了」, 2026-09-28); kept so callers need not change.
   */
  unmappedModules?: readonly CdssRecommendation[]
  renderDetail: (recommendation: CdssRecommendation) => ReactNode
  /** Extra outlook content — the prognosis models — at the foot of 03. */
  outlookContent?: ReactNode
  /** Anything else the page must keep reachable, drawn after the summary. */
  footer?: ReactNode
  /**
   * An action that also answers a structured question on its card (the pack's
   * optional `physicianInput`), handed back so the pack recomputes from it.
   */
  onPhysicianInput?: (input: NonNullable<VisitAction['physicianInput']>) => void
  /**
   * Writes an answer to a point's own questions (AF DP-08's valves) into the
   * answer set the pack names (`af-clinical`); `undefined` withdraws it.
   */
  onPointAnswer?: (answers: string, id: string, value: boolean | undefined) => void
  /** The page's own input surfaces, placed on the map (see `visit-surfaces`). */
  surfaces?: VisitMapSurfaces
}

/**
 * The visit screen the heart-failure and atrial-fibrillation pages share:
 * status line → every-visit questions → 今天要決定 → 決策地圖 (whose third
 * column carries the plan) → 本次摘要. The pack decides what each point says
 * and which points are today's; this component decides where they sit and
 * records what the clinician chose. One decision per point, one control, one
 * store key: the queue row and the opened cell are the same decision.
 */

export function VisitDecisionScreen({
  model,
  isEnglish,
  now,
  packVersion,
  screenKey,
  decisions,
  onRecordDecision,
  onClearDecision,
  answers,
  answerSources,
  onAnswer,
  modules,
  renderDetail,
  outlookContent,
  footer,
  onPhysicianInput,
  onPointAnswer,
  surfaces,
}: VisitDecisionScreenProps) {
  const sourceOfPage = pageSourceOf(model)
  const [openKey, setOpenKey] = useState<string | null>(null)
  // The pocket-handbook layout (owner request 2026-09-30): 決策地圖 v2 in the
  // layout switch, which lends the page its chrome, or `?visit=book`.
  const bookChrome = useContext(VisitBookChromeContext)
  const [urlBook] = useState(isVisitBookMode)
  const book = urlBook || bookChrome !== null
  // Whether the page drew the patient undiagnosed, and whether the diagnosis
  // then came to stand on it: the diagnosis keeps its place at the head of 01
  // rather than moving under the clinician (clinician feedback 2026-09-27:
  // 「應該要 user 自己點」).
  const [drawnUndiagnosed, setDrawnUndiagnosed] = useState(model.asks.length === 0)
  const [diagnosedHere, setDiagnosedHere] = useState(false)
  // The settled diagnosis folded at a follow-up's foot: open by the
  // clinician's hand, or by a press that asked for something in it.
  const [diagnosisFoldOpen, setDiagnosisFoldOpen] = useState<boolean | null>(null)
  // DP-03's fuller questions: open at a first assessment and whenever an ask
  // comes back worse. A clinician's own open/close holds until that reason
  // changes — a new 「變差」 reopens what was folded under 「穩定」.
  // The whole checklist belongs to a heart-failure first assessment (the HF
  // surfaces say so) — and only once 懷疑 HF has been answered, since its
  // questions stay locked until then. The AF page's fuller questions are about
  // treatment already under way, so they open only when an ask comes back 有.
  const allRows = useMemo(() => buildQueueRows(model, decisions, now), [decisions, model, now])
  // A question the assessment block asks itself (懷疑 HF？ as its question 1
  // before a diagnosis) is answered there, once, in reasoning order — not
  // again as a row of 今天要決定.
  const blockRequests = surfaces?.asksDetail?.requests
  // A point whose recommended action answers one of the page's own questions
  // (HFrEF 還是 HFpEF？, 確認 HFpEF) is asked there, once. So is every point
  // the diagnosis question stands for while the page asks it (HF: DP-00,
  // DP-01, DP-34) — waiting on it, or done by it — unless the point carries
  // an action of its own that the question does not (安排心超, 重新評估).
  const answeredBy = surfaces?.diagnosis?.answeredBy
  const askedHere = useCallback((point: DecisionPointView) => {
    const request = point.actions[0]?.physicianInput?.request
    if (request && blockRequests?.includes(request)) return true
    return Boolean(answeredBy
      && blockRequests?.includes(answeredBy.request)
      && answeredBy.dps.includes(point.dp)
      && point.actions.every((action) => action.physicianInput && blockRequests.includes(action.physicianInput.request)))
  }, [answeredBy, blockRequests])
  const rows = useMemo(() => allRows.filter((row) => !askedHere((row.current ?? row.steps[0]).point)), [allRows, askedHere])
  const gatePending = allRows.some((row) => row.current?.point.actions[0]?.physicianInput?.request === answeredBy?.request)
  // Before a diagnosis there are no every-visit asks: the block is the
  // assessment itself, 懷疑 HF？ first, and it is open from the start.
  const firstAssessment = Boolean(surfaces?.asksDetail?.opensAtFirstAssessment)
    && (model.asks.length === 0 || (isFirstAssessment(model.stage) && !gatePending))
  const asksOpenReason = `${firstAssessment ? 'first' : ''}|${openingAnswers(model.asks, answers).map((item) => item.ask.id).join(',')}`
  const asksAutoOpen = asksOpenReason !== '|'
  const [asksOverride, setAsksOverride] = useState<{ reason: string; open: boolean } | null>(null)
  const asksDetailOpen = asksOverride && asksOverride.reason === asksOpenReason ? asksOverride.open : asksAutoOpen
  const setAsksDetailOpen = (open: boolean) => setAsksOverride({ reason: asksOpenReason, open })
  const screenShown = useCdssDecisionTimingStore((state) => state.screenShown)
  const decisionRecorded = useCdssDecisionTimingStore((state) => state.decisionRecorded)

  useEffect(() => {
    screenShown(screenKey)
  }, [screenKey, screenShown])

  const queuedDps = useMemo(() => queuedPointDps(rows), [rows])
  const plan = useMemo(() => buildVisitPlan(model, decisions, now), [decisions, model, now])
  const summaryText = useMemo(
    () => buildVisitSummaryText({ model, answers, decisions, now, isEnglish }),
    [answers, decisions, isEnglish, model, now],
  )
  // What today's decisions settle, point by point, as the pack reads them.
  const settlement = useMemo(() => settleDecisions(model, decisions, now), [decisions, model, now])
  // A chain with a step still open — 「開始抗凝」 recorded, the DOAC not yet
  // chosen; 「改用其他 DOAC」, not yet which — is today's decision, not
  // 「已記錄」: its tile says what was recorded and what is left.
  const openStepOf = useCallback((point: DecisionPointView) => settledPointOf(settlement, point)?.open, [settlement])
  // What a point stands settled by: its own row's furthest step, else the
  // step on another row that decides it (DP-07's DOAC for DP-08／DP-09).
  const decisionOf = useCallback((point: DecisionPointView) => settledPointOf(settlement, point)?.settled, [settlement])
  // What the summary holds so far, for its step's name.
  // Counted on the rows they were recorded on: one DOAC chosen on DP-07's row
  // is one decision, not three for the points it also answers.
  const recordedToday = settlement.recordedToday

  // A step decided anew, or taken back, leaves the steps that followed from it
  // without the decision they answered: they go too (#166 review), so the
  // chain is walked again from here rather than restored as it was.
  const clearDependents = (key: string) => {
    for (const dependent of dependentDecisionKeys(key, allRows, decisions)) onClearDecision?.(dependent)
  }
  const record = (key: string, point: DecisionPointView, action: VisitAction, surface: 'queue' | 'map') => {
    if (!onRecordDecision) return
    clearDependents(key)
    onRecordDecision(key, decisionInputFor(point, action, packVersion))
    decisionRecorded(screenKey, key, surface)
    if (action.physicianInput) onPhysicianInput?.(action.physicianInput)
  }
  const clear = (key: string) => {
    clearDependents(key)
    onClearDecision?.(key)
  }

  // Cards the pack shows in 03 that are not decision points (CHA₂DS₂-VA,
  // HAS-BLED), each opening the existing detail in place.
  const outlookModules = (model.outlookModuleIds ?? []).flatMap((id) => {
    const recommendation = modules.get(id)
    return recommendation ? [recommendation] : []
  })

  const openPoint = openKey
    ? model.points.find((point) => visitDecisionKey(point) === openKey)
    : undefined

  // What the opened point's card carries besides the pack's own content: the
  // page's inputs for it, and — on DP-03 — the way to its fuller questions.
  const openPointExtras = openPoint ? surfaces?.pointExtras?.(openPoint) : undefined
  const asksDetailLabel = surfaces?.asksDetail?.label
  const detailExtras = openPoint && (openPointExtras || (openPoint.dp === 'DP-03' && asksDetailLabel)) ? (
    <>
      {openPoint.dp === 'DP-03' && asksDetailLabel ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setAsksDetailOpen(true)
            // An open card stands for its section: closing it shows the
            // section, and the questions in it.
            setOpenKey(null)
            requestAnimationFrame(() => {
              const target = document.getElementById(ASKS_DETAIL_ID)
              target?.scrollIntoView?.({ block: 'start' })
              target?.querySelector<HTMLElement>('summary')?.focus()
            })
          }}
          data-testid="cdss-visit-go-to-asks-detail"
        >
          {isEnglish ? `Go to: ${asksDetailLabel}` : `前往「${asksDetailLabel}」`}
        </button>
      ) : null}
      {openPointExtras}
    </>
  ) : undefined

  // Cards no decision point names (HF: 「HFpEF 治療」) are not drawn on the map:
  // every decision it asks is a point's, and the leftover fold at 02's foot
  // was of no use (clinician feedback 2026-09-28: 「這個決策模組感覺可以拿掉，
  // 沒用處了」). The three-section layout still lists every module.

  const answersLine = model.asks
    .flatMap((ask) => {
      const { value } = effectiveAnswer(ask, answers)
      const option = ask.options.find((candidate) => candidate.value === value)
      return option ? [`${ask.label} ${option.label}`] : []
    })
    .join(' · ')

  const toggleOpen = (point: DecisionPointView) => {
    const key = visitDecisionKey(point)
    setOpenKey((current) => (current === key ? null : key))
  }

  // The three sections are the page's spine. Each opens with what it asks and
  // what it decides today, then its other points: 01 the asks (追蹤) or the
  // diagnostic step (診斷), 02 and 03 their rows. There is no queue above
  // them, so nothing is on the screen twice.
  const rowsIn = (block: VisitBlock) => rows.filter((row) => row.steps[0].point.block === block)
  // HFrEF's four pillars are always in view at the head of 02, in their own
  // order and in one place, whatever their state today (clinician feedback
  // 2026-09-28: 「治療隨時 HFrEF 的四大支柱呢…都要出現」): a pillar with a
  // decision takes it in its own box, the others say where they stand. They
  // are neither rows of 待決定 nor cells of 02 其餘.
  const pillarDps = useMemo(() => [...(surfaces?.pillars?.dps ?? []), ...(surfaces?.pillars?.whenActive ?? []), ...(surfaces?.pillars?.followedBy?.dps ?? [])], [surfaces?.pillars])
  const isPillar = useCallback((point: DecisionPointView) => point.source === sourceOfPage && pillarDps.includes(point.dp), [pillarDps, sourceOfPage])
  const rowOfPoint = (point: DecisionPointView) => rows.find((candidate) => candidate.steps[0].point.dp === point.dp && candidate.steps[0].point.source === point.source)
  // The row a pillar's box decides with: today's row where the pack queued
  // it, else the point's own steps where it asks for a decision (a dose to
  // confirm), else none.
  const pillarRowOf = (point: DecisionPointView): QueueRow | undefined => {
    const queued = rowOfPoint(point)
    if (queued) return queued
    if (point.actions.length === 0 || !DECISION_STATES.has(point.state)) return undefined
    const steps = pointSteps(point, decisions, now)
    const current = steps.find((step) => !step.decision)
    return { key: visitDecisionKey(point), steps, ...(current ? { current } : {}), safety: point.state === 'safety' }
  }
  const followDps = surfaces?.pillars?.followedBy?.dps ?? []
  const followPoints = followDps
    .map((dp) => model.points.find((point) => point.dp === dp && point.source === sourceOfPage))
    .filter((point): point is DecisionPointView => Boolean(point) && point!.state !== 'not-applicable')
  const pillarPoints = pillarDps
    .filter((dp) => !followDps.includes(dp))
    .map((dp) => model.points.find((point) => point.dp === dp && point.source === sourceOfPage))
    .filter((point): point is DecisionPointView => Boolean(point))
    // DP-26 and its like only while they ask for something.
    .filter((point) => surfaces?.pillars?.dps.includes(point.dp) || Boolean(rowOfPoint(point)) || DECISION_STATES.has(point.state))
    // A pillar the phenotype does not have (HFpEF's RAS and β-blocker) is not
    // shown as 「不適用」 beside the ones it does (clinician feedback
    // 2026-09-28: 「HFpEF 不用出現不適用的」); in HFrEF none is.
    .filter((point) => point.state !== 'not-applicable')
  const listRowsIn = (block: VisitBlock) => rowsIn(block).filter((row) => !isPillar(row.steps[0].point))
  // Every point a row stands for — and a question the lead asks itself — is
  // not repeated as a cell. (The pillars leave 02's cells through its cell
  // filter, so one still waiting on the clinician counts in 02's summary.)
  const rowDps = useMemo(() => new Set([
    ...queuedPointDps(allRows),
    ...model.points.filter(askedHere).map((point) => point.dp),
  ]), [allRows, askedHere, model.points])
  // The points whose card a section's lead draws under its own row or box:
  // the pillars, and the point each decision row shows now (a chain row shows
  // its current step). Any other point's card opens at the head of its section.
  const leadCardKeys = new Set([
    ...pillarPoints,
    ...followPoints,
    ...BLOCK_ORDER.flatMap((block) => listRowsIn(block).map((row) => (row.current ?? row.steps[row.steps.length - 1]).point)),
  ].map(visitDecisionKey))
  // What the line the card opens under already says, so the card does not say
  // it again (clinician decision 2026-09-28: 「卡片開頭精簡成只剩關閉鈕」): a
  // pillar's or a decision's row prints the question and its reason; the line
  // over a card at a section's head prints the question (else the reason), or
  // nothing once today's decision is taken.
  const shownAbove = (point: DecisionPointView): { headline: boolean; why: boolean } => {
    if (leadCardKeys.has(visitDecisionKey(point))) return { headline: true, why: true }
    if (decisionOf(point)) return { headline: false, why: false }
    return point.headline ? { headline: true, why: false } : { headline: false, why: true }
  }
  // The step whose buttons — or recorded decision — the line a card opens
  // under already draws: that row's current step, else its last. The card
  // leaves it out (clinician feedback 2026-09-30: 「光開始MRA按鈕就出現兩次」).
  const stepAboveCard = (point: DecisionPointView): string | undefined => {
    const key = visitDecisionKey(point)
    if (!leadCardKeys.has(key)) return undefined
    const row = isPillar(point)
      ? pillarRowOf(point)
      : rows.find((candidate) => visitDecisionKey((candidate.current ?? candidate.steps[candidate.steps.length - 1]).point) === key)
    return row ? (row.current ?? row.steps[row.steps.length - 1]).key : undefined
  }
  // A point another row decides (DP-08／DP-09 by DP-07's DOAC choice) opens
  // on that step — its record, or its choices once 改 has cleared it — and
  // not on its own 「等上一步」, which the step has overtaken (#196 review).
  const decidedElsewhere = (point: DecisionPointView) => {
    const settled = settledPointOf(settlement, point)
    return settled?.latest ? undefined : settled?.decidedBy
  }
  const openDeciding = openPoint ? decidedElsewhere(openPoint) : undefined
  const detailNode = openPoint ? (
    <DecisionPointDetail
      key={visitDecisionKey(openPoint)}
      extras={detailExtras}
      point={openPoint}
      shownAbove={openDeciding ? { headline: true, why: true } : shownAbove(openPoint)}
      steps={openDeciding ? [openDeciding.step] : pointSteps(openPoint, decisions, now)}
      {...(openDeciding ? { decidedWith: openDeciding.owner } : { controlsAbove: stepAboveCard(openPoint) })}
      isEnglish={isEnglish}
      sourceOfPage={sourceOfPage}
      modules={modules}
      renderDetail={renderDetail}
      onDecide={onRecordDecision ? (step, action) => record(step.key, step.point, action, 'map') : undefined}
      onClear={onClearDecision ? (step) => clear(step.key) : undefined}
      onClose={() => {
        const { dp, source } = openPoint
        const underRow = leadCardKeys.has(visitDecisionKey(openPoint))
        setOpenKey(null)
        // Back to what opened it: the row's 依據與細節 for a card drawn under
        // its row, else the point's tile — or, with the list folded away on a
        // narrow panel, somewhere still on the page.
        requestAnimationFrame(() => {
          focusBackTo({ dp, source }, underRow ? document.querySelector<HTMLElement>(`[data-visit-row-detail="${dp}"]`) : undefined)
        })
      }}
    />
  ) : null
  const detailFor = (point: DecisionPointView) => (openPoint && openPoint.dp === point.dp && openPoint.source === point.source ? detailNode : undefined)
  // What an open decision reads from the record, under its row. LVEF heads the
  // page's values line, so it is not repeated on every pillar.
  const headedKeys = useMemo(() => new Set(model.keyValues.filter((item) => item.key === 'LVEF').map((item) => item.key)), [model.keyValues])
  const basisOf = (point: DecisionPointView) => decisionBasis(point, modules, headedKeys, (date) => displayDate(date, now))
  const decideRow = onRecordDecision ? (step: QueueStep, action: VisitAction) => record(step.key, step.point, action, 'queue') : undefined
  const clearRow = onClearDecision ? (step: QueueStep) => clear(step.key) : undefined
  // A pillar box decides in place (see `pillarRowOf`), else it just says
  // where the pillar stands.
  const pillarBox = (point: DecisionPointView) => {
    const queued = rowOfPoint(point)
    const row = pillarRowOf(point)
    return row ? (
      <QueueRowBox
        key={point.dp}
        as="div"
        row={row}
        isEnglish={isEnglish}
        sourceOfPage={sourceOfPage}
        {...(onRecordDecision ? { onDecide: (step: QueueStep, action: VisitAction) => record(step.key, step.point, action, queued ? 'queue' : 'map') } : {})}
        {...(clearRow ? { onClear: clearRow } : {})}
        onOpenDetail={toggleOpen}
        detailOpen={Boolean(detailFor(point))}
        queued={Boolean(queued)}
        basis={basisOf}
      />
    ) : (
      <PointBox key={point.dp} point={point} isEnglish={isEnglish} sourceOfPage={sourceOfPage} onOpenDetail={toggleOpen} detailOpen={Boolean(detailFor(point))} />
    )
  }
  // One frame, a row per pillar, its card under it (clinician decision
  // 2026-09-28: 「用一行式，設成預設」).
  const pillarList = (points: readonly DecisionPointView[]) => (
    <div className={rowStyles.list}>
      {points.map((point) => (
        <Fragment key={point.dp}>
          {pillarBox(point)}
          {detailFor(point) ? <div className={rowStyles.detail}>{detailFor(point)}</div> : null}
        </Fragment>
      ))}
    </div>
  )
  const pillarGroup = (pillarPoints.length > 0 || followPoints.length > 0) && surfaces?.pillars ? (
    <div className="space-y-3">
      {pillarPoints.length > 0 ? (
        <section className="space-y-1.5" aria-labelledby="cdss-visit-pillars-title" data-testid="cdss-visit-pillars">
          <h3 id="cdss-visit-pillars-title" className="px-0.5 text-[11px] font-semibold text-muted-foreground" data-map-heading="">{surfaces.pillars.title}</h3>
          {pillarList(pillarPoints)}
        </section>
      ) : null}
      {followPoints.length > 0 && surfaces.pillars.followedBy ? (
        <section className="space-y-1.5" aria-labelledby="cdss-visit-pillars-follow-title" data-testid="cdss-visit-pillars-follow">
          <h3 id="cdss-visit-pillars-follow-title" className="px-0.5 text-[11px] font-semibold text-muted-foreground" data-map-heading="">{surfaces.pillars.followedBy.title}</h3>
          {pillarList(followPoints)}
        </section>
      ) : null}
    </div>
  ) : null
  const decisionList = (block: VisitBlock, title: string) => (
    <TodayQueue
      rows={listRowsIn(block)}
      isEnglish={isEnglish}
      sourceOfPage={sourceOfPage}
      title={title}
      testId={`cdss-visit-queue-${block}`}
      hideWhenEmpty
      onDecide={decideRow}
      onClear={clearRow}
      onOpenDetail={toggleOpen}
      detailFor={detailFor}
      basis={basisOf}
    />
  )
  const undiagnosed = model.asks.length === 0
  if (drawnUndiagnosed !== undiagnosed) {
    setDrawnUndiagnosed(undiagnosed)
    if (drawnUndiagnosed && !undiagnosed) setDiagnosedHere(true)
  }
  const diagnosisView = surfaces?.diagnosis
  // 01 is one flow, in the order the visit needs it (owner feedback
  // 2026-09-30: the 診斷／追蹤 switch was one press too many). Before a
  // diagnosis, and at the system's first visit with the patient, the
  // diagnosis leads — the clinician answers it (clinician decision
  // 2026-09-28: 「沒資料的都還是需要點診斷」) — and the every-visit questions
  // follow. Once a stored visit brings the diagnosis in, the questions lead
  // and the settled diagnostic assessment folds at 01's foot, opening by
  // itself while anything in it still needs the clinician.
  const firstVisit = model.stage === 'baseline' && Boolean(diagnosisView)
  const diagnosisFirst = undiagnosed || firstVisit || diagnosedHere || model.stage === 'suspected'
  const inDiagnosisView = (point: DecisionPointView) => Boolean(diagnosisView && point.source === sourceOfPage && diagnosisView.dps.includes(point.dp))
  // What the diagnostic assessment itself asks (HF: DP-00, DP-01, DP-34);
  // the view's other points (baseline, aetiology) are drawn outside it.
  const askedInDiagnosis = diagnosisView?.answeredBy?.dps ?? diagnosisView?.dps ?? []
  const diagnosisPending = model.points.some((point) => (
    point.source === sourceOfPage
    && askedInDiagnosis.includes(point.dp)
    && DECISION_STATES.has(point.state)
    && !decisionOf(point)
  ))
  const followUpLead = (
    <section className="space-y-2" aria-labelledby="cdss-visit-asks-title" data-testid="cdss-visit-follow-up">
      <h4 id="cdss-visit-asks-title" className="px-0.5 text-[11px] font-semibold text-muted-foreground" data-map-heading="">
        {isEnglish ? 'Asked at every visit' : '每次必問'}
      </h4>
      <VisitAsks
        asks={model.asks}
        answers={answers}
        isEnglish={isEnglish}
        onAnswer={onAnswer}
        pagePackId={model.packId}
        {...(answerSources ? { sources: answerSources } : {})}
      />
      {surfaces?.asksDetail ? (
        <VisitAsksDetail
          id={ASKS_DETAIL_ID}
          label={surfaces.asksDetail.label}
          content={surfaces.asksDetail.content}
          openCount={surfaces.asksDetail.openCount}
          {...(surfaces.asksDetail.pendingLabels ? { pendingLabels: surfaces.asksDetail.pendingLabels } : {})}
          firstAssessment={firstAssessment}
          asks={model.asks}
          answers={answers}
          isEnglish={isEnglish}
          open={asksDetailOpen}
          onToggle={setAsksDetailOpen}
        />
      ) : null}
    </section>
  )
  const statusList = decisionList('status', isEnglish ? 'To decide' : '待決定')
  const diagnosisContent = diagnosisView?.content ?? null
  const leads: Partial<Record<VisitBlock, ReactNode>> = {
    status: (
      <>
        <VisitTriggers model={model} isEnglish={isEnglish} />
        {undiagnosed ? (
          // Before a diagnosis the assessment is the whole of 01: its
          // questions (懷疑 HF？ first) are the diagnosis content's own.
          <>
            {diagnosisContent ?? followUpLead}
            {statusList}
          </>
        ) : diagnosisFirst ? (
          <>
            {diagnosisContent}
            {statusList}
            {followUpLead}
          </>
        ) : (
          <>
            {followUpLead}
            {statusList}
            {diagnosisContent ? (
              <details
                open={diagnosisFoldOpen ?? diagnosisPending}
                onToggle={(event) => {
                  const open = event.currentTarget.open
                  if (open !== (diagnosisFoldOpen ?? diagnosisPending)) setDiagnosisFoldOpen(open)
                }}
                className="group/fold rounded-md border border-border bg-background"
                data-testid="cdss-visit-diagnosis-fold"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 text-sm font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">{isEnglish ? 'Diagnosis and phenotype' : '診斷與分型'}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/fold:rotate-180" aria-hidden="true" />
                </summary>
                <div className="border-t border-border p-2">{diagnosisContent}</div>
              </details>
            ) : null}
          </>
        )}
      </>
    ),
    treatment: (
      <>
        {pillarGroup}
        {decisionList('treatment', isEnglish ? (pillarGroup ? 'Other decisions' : 'To decide') : (pillarGroup ? '其他待決定' : '待決定'))}
      </>
    ),
    outlook: decisionList('outlook', isEnglish ? 'To decide' : '待決定'),
  }
  const unanswered = model.asks.filter((ask) => !effectiveAnswer(ask, answers).value).length
  const pendingIn = (block: VisitBlock) => rowsIn(block).filter((row) => row.current).length
  const decidedIn = (block: VisitBlock) => rowsIn(block).filter((row) => !row.current).length
  // The fuller questions an answer (喘變差) or a first assessment opened in
  // 01, still to fill in.
  const fillInOpened = !undiagnosed && asksDetailOpen && asksAutoOpen ? surfaces?.asksDetail?.openCount ?? 0 : 0
  const leadSummary = (block: VisitBlock): { text: string; attention: boolean } | undefined => {
    const parts: string[] = []
    const toAnswer = block === 'status' ? (undiagnosed ? surfaces?.asksDetail?.openCount ?? 0 : unanswered) : 0
    if (toAnswer) parts.push(isEnglish ? `${toAnswer} to answer` : `待答 ${toAnswer}`)
    // An answer that opened the fuller questions (喘變差) left them to fill
    // in 01, wherever it was given.
    const toFillIn = block === 'status' ? fillInOpened : 0
    if (toFillIn) parts.push(isEnglish ? `${toFillIn} to fill in` : `待補 ${toFillIn}`)
    if (pendingIn(block)) parts.push(isEnglish ? `${pendingIn(block)} to decide` : `待決定 ${pendingIn(block)}`)
    else if (decidedIn(block)) parts.push(isEnglish ? `${decidedIn(block)} decided` : `已決定 ${decidedIn(block)}`)
    return parts.length ? { text: parts.join(' · '), attention: toAnswer > 0 || toFillIn > 0 || pendingIn(block) > 0 } : undefined
  }
  const leadSummaries: Partial<Record<VisitBlock, { text: string; attention: boolean }>> = {}
  for (const block of BLOCK_ORDER) {
    const summary = leadSummary(block)
    if (summary) leadSummaries[block] = summary
  }
  // A safety row opens its own section; otherwise the visit starts at 01.
  const initialOpen: VisitBlock = rows.find((row) => row.safety && row.current)?.steps[0].point.block ?? 'status'
  // A point the page asks in 01 itself (懷疑 HF？ stands for DP-00, DP-01 and
  // DP-34) has a tile on the overview like every other, but pressing it goes
  // to where it is asked — 01's 診斷 view, or the fuller questions under the
  // asks — rather than opening a card that asks it a second time.
  const goToWhereAsked = (point: DecisionPointView) => {
    setOpenKey(null)
    const toDiagnosis = Boolean(diagnosisView) && (undiagnosed || inDiagnosisView(point))
    if (!toDiagnosis) setAsksDetailOpen(true)
    else if (!diagnosisFirst) setDiagnosisFoldOpen(true)
    // Where it is asked comes into view, and focus goes into it: the press
    // was on a tile the narrow list folds away (#194 review). On 診斷 that is
    // the question itself — DP-01's, which answers DP-00 and DP-34 too.
    requestAnimationFrame(() => {
      const lead = document.querySelector<HTMLElement>('[data-testid="cdss-visit-lead-status"]')
      const target = toDiagnosis
        ? lead?.querySelector<HTMLElement>(`[data-dp="${point.dp}"]`) ?? lead?.querySelector<HTMLElement>('[data-dp]') ?? lead
        : document.getElementById(ASKS_DETAIL_ID)
      // A point kept in a fold there (DP-34's criteria under an answered
      // HFpEF, a settled diagnosis at a follow-up's foot) opens with the
      // press that asked for it.
      for (let fold = target?.closest('details'); fold; fold = fold.parentElement?.closest('details') ?? null) fold.open = true
      revealTop(target)
      focusInto(target)
    })
  }
  const openFromMap = (point: DecisionPointView) => (askedHere(point) ? goToWhereAsked(point) : toggleOpen(point))
  const unansweredAsks = model.asks.filter((ask) => !effectiveAnswer(ask, answers).value)
  // What still needs the clinician beyond the queue, for the pack's decided sentence.
  const stillToConfirm = model.points.filter((point) => (
    DECISION_STATES.has(point.state) && !decisionOf(point) && !queuedDps.has(point.dp)
  )).length
  const status = visitStatusSentence(model, rows, stillToConfirm, isEnglish)

  if (book) {
    // The pocket-handbook page draws the pack's model in place of the page's
    // older question cards (owner request 2026-09-30: 「原本的 UI 跟問題那些都
    // 廢棄了，包含 DP03」): DP-01's phenotype table asks the diagnosis, DP-03
    // the pack's every-visit asks, and every other point — DP-34's HFpEF
    // confirmation among them — decides on its own row. What those do not ask
    // stays reachable under the same point, folded (#219 review; the list is
    // in docs/LAUNCH-ROUTE-GATES.md). So no point is left out as asked
    // elsewhere: the rows are all of them.
    const samePoint = (a: DecisionPointView, b: DecisionPointView) => a.dp === b.dp && a.source === b.source
    const headRowOf = (point: DecisionPointView) => allRows.find((row) => samePoint(row.steps[0].point, point))
    // A row that walks on to other points (an older pack's DP-07 → DP-08)
    // stands for them too.
    const coveringRowOf = (point: DecisionPointView) => allRows.find((row) => row.steps.some((step, index) => (
      index > 0 && samePoint(step.point, point) && !samePoint(step.point, row.steps[0].point)
    )))
    // The fuller questions beside the asks (HF: symptoms, signs, NYHA,
    // compensation; AF: other symptoms, bleeding, adverse effects) stay one
    // fold away, as on the map (#219 review: a layout change is not leave to
    // drop an input a decision reads). Before a diagnosis there are no asks,
    // and those questions are the diagnosis's, asked in DP-01's table and
    // under DP-34.
    const asksDetail = surfaces?.asksDetail
    const bookAsks = (
      <>
        <BookAsks
          asks={model.asks}
          answers={answers}
          isEnglish={isEnglish}
          onAnswer={onAnswer}
          pagePackId={model.packId}
          {...(answerSources ? { sources: answerSources } : {})}
        />
        {asksDetail && model.asks.length > 0 ? (
          <MapFold
            label={asksDetail.label}
            {...(asksDetail.pendingLabels?.length ? { hint: asksDetail.pendingLabels.join(isEnglish ? ', ' : '、') } : {})}
            bodyClassName="@container p-2"
            testId="cdss-book-asks-detail"
          >
            {asksDetail.content}
          </MapFold>
        ) : null}
      </>
    )
    const entryOf = (point: DecisionPointView): BookEntry => {
      if (point.dp === 'DP-03' && point.source === sourceOfPage) return { kind: 'slot', point, content: bookAsks }
      // A point answered in its classification table (HF DP-01's phenotype); a table
      // only to read (AF DP-17's agents by LVEF) sits on the point's own line.
      const classes = (point as { classification?: { classes?: { physicianInput?: unknown }[] } }).classification?.classes
      if (classes?.some((item) => item.physicianInput)) return { kind: 'slot', point, content: null }
      const head = headRowOf(point)
      if (head) return { kind: 'row', point, row: head, queued: true }
      const covering = coveringRowOf(point)
      if (covering) return { kind: 'covered', point, by: covering.steps[0].point }
      const decidedBy = decidedElsewhere(point)
      if (decidedBy) return { kind: 'covered', point, by: decidedBy.owner }
      // A point with buttons the pack did not queue (a dose to confirm, 用藥
      // 核對's 已核對) decides on its own row.
      if (point.actions.length > 0) {
        const steps = pointSteps(point, decisions, now)
        const current = steps.find((step) => !step.decision)
        return { kind: 'row', point, row: { key: visitDecisionKey(point), steps, ...(current ? { current } : {}), safety: point.state === 'safety' }, queued: false }
      }
      return { kind: 'line', point }
    }
    const markOf = (point: DecisionPointView): BookMark => {
      if (ABSENT_STATES.has(point.state)) return 'absent'
      if (openStepOf(point)) return 'act'
      if (decisionOf(point)) return 'done'
      const entry = entryOf(point)
      if (entry.kind === 'row') {
        if (!entry.row.current) return 'done'
        if (entry.row.safety) return 'safety'
        if (entry.queued || DECISION_STATES.has(point.state)) return 'act'
        return point.state === 'done' ? 'done' : 'info'
      }
      if (entry.kind === 'slot' && point.dp === 'DP-03') return unansweredAsks.length ? 'ask' : 'done'
      // The diagnosis still to answer in its table.
      if (entry.kind === 'slot' && DECISION_STATES.has(point.state)) return 'act'
      if (point.state === 'safety') return 'safety'
      if (point.state === 'ask') return 'ask'
      if (point.state === 'done') return 'done'
      return 'info'
    }
    // Worth opening: what the decision turns on (criteria), a chain of steps,
    // or several options to weigh — or, on any point, what would change its
    // answer (the pack's `changesIf`). A reminder without them is read where
    // it stands.
    const isComplex = (point: DecisionPointView) => {
      const changes = (point as { changesIf?: unknown }).changesIf
      if (!ABSENT_STATES.has(point.state) && Array.isArray(changes) && changes.length > 0) return true
      return (DECISION_STATES.has(point.state) || Boolean(openStepOf(point))) && Boolean(
        point.criteria?.length || point.next || (point.chain?.length ?? 0) > 1 || point.actions.length >= 3,
      )
    }
    // Today's decisions for 今天的計畫, once each: the point, what was chosen,
    // and what to recheck when.
    const bookDecided = model.points.flatMap((point) => {
      const decision = decisionOf(point)
      if (!decision) return []
      const check = decision.record.responseCheck
      return [{
        key: decision.key,
        dp: point.dp,
        source: point.source,
        label: decision.record.actionLabel ?? decision.action.label,
        ...(check ? { check: `${check.text}${checkIntervalSuffix(check, isEnglish)}` } : {}),
      }]
    }).filter((item, index, all) => all.findIndex((other) => other.key === item.key) === index)
    // The cards behind a point, at the foot of its 看依據.
    const moduleCardsOf = (point: DecisionPointView) => point.moduleIds.flatMap((id) => {
      const recommendation = modules.get(id)
      if (!recommendation) return []
      return [(
        <section key={id} className="space-y-1.5 pt-2" aria-label={recommendation.moduleName ?? recommendation.title} data-testid={`cdss-visit-detail-module-${id}`}>
          <p className="text-xs font-semibold text-foreground">{recommendation.moduleName ?? recommendation.title}</p>
          <div className="-mx-2" data-testid={`cdss-visit-detail-module-body-${id}`}>{renderDetail(recommendation)}</div>
        </section>
      )]
    })
    return (
      <div className="space-y-3" data-testid="cdss-visit-screen" data-pack={model.packId} data-stage={model.stage} data-layout="book">
        <VisitBookLayout
          points={model.points}
          isEnglish={isEnglish}
          sourceOfPage={sourceOfPage}
          entryOf={entryOf}
          markOf={markOf}
          isComplex={isComplex}
          openKeyOf={visitDecisionKey}
          openKey={openPoint ? openKey : null}
          onToggle={toggleOpen}
          moduleCardsOf={moduleCardsOf}
          {...(onRecordDecision ? { onDecide: (step: QueueStep, action: VisitAction, queued: boolean) => record(step.key, step.point, action, queued ? 'queue' : 'map') } : {})}
          {...(onClearDecision ? { onClear: (step: QueueStep) => clear(step.key) } : {})}
          basisOf={basisOf}
          extrasOf={(point) => surfaces?.pointExtras?.(point, { once: true }) ?? null}
          headline={status.text}
          keyValues={model.keyValues}
          triggers={model.triggers}
          now={now}
          {...(surfaces?.editValues ? { onEditValues: surfaces.editValues } : {})}
          top={(
            <>
              <VisitStatusLine model={model} sentence={status.text} />
              {surfaces?.statusPanel ?? null}
            </>
          )}
          blockFooters={{
            ...surfaces?.columnFooters,
            outlook: (
              <>
                {surfaces?.columnFooters?.outlook}
                {outlookModules.map((item) => (
                  <MapFold key={item.id} label={item.moduleName ?? item.title} size="sm" bodyClassName="px-2.5 pb-2.5 pt-2" testId={`cdss-visit-outlook-module-${item.id}`}>
                    {renderDetail(item)}
                  </MapFold>
                ))}
                {outlookContent}
              </>
            ),
          }}
          plan={plan}
          {...(status.decided ? { decidedLine: status.text } : {})}
          {...(bookChaptersOf(model) ? { chapters: bookChaptersOf(model)! } : {})}
          decided={bookDecided}
          summaryText={summaryText}
          // A class chosen in DP-01's table is the answer the diagnosis
          // question's own control wrote, handed back the same way.
          {...(onPhysicianInput ? { onChooseClass: (_point: DecisionPointView, input: NonNullable<VisitAction['physicianInput']>) => onPhysicianInput(input) } : {})}
          {...(onPointAnswer ? { onAnswerQuestion: (_point: DecisionPointView, answers: string, id: string, value: boolean | undefined) => onPointAnswer(answers, id, value) } : {})}
        />
        {footer}
      </div>
    )
  }

  return (
    <div
      className="space-y-3"
      data-testid="cdss-visit-screen"
      data-pack={model.packId}
      data-stage={model.stage}
    >
      <VisitStatusLine model={model} sentence={status.text} />
      <DecisionMapColumns
        model={model}
        overviewTop={(
          <VisitValues
            model={model}
            isEnglish={isEnglish}
            now={now}
            {...(surfaces?.editValues ? { onEditValues: surfaces.editValues } : {})}
            {...(surfaces?.editValue ? { onEditValue: surfaces.editValue } : {})}
            {...(surfaces?.statusLine?.valueAddons ? { valueAddons: surfaces.statusLine.valueAddons } : {})}
            {...(surfaces?.statusLine?.extras ? { extras: surfaces.statusLine.extras } : {})}
          />
        )}
        {...(surfaces?.statusPanel ? { workingTop: surfaces.statusPanel } : {})}
        decisionOf={decisionOf}
        queuedDps={queuedDps}
        openKey={openPoint ? openKey : null}
        onOpen={openFromMap}
        opensCard={(point) => !askedHere(point)}
        leads={leads}
        leadSummaries={leadSummaries}
        rowDps={rowDps}
        leadCardKeys={leadCardKeys}
        pendingLine={(point) => {
          const open = openStepOf(point)
          if (open) {
            const recorded = open.recorded.record.actionLabel ?? open.recorded.action.label
            return open.step.point.headline ? `${recorded} → ${open.step.point.headline}` : recorded
          }
          return decidedElsewhere(point)?.step.point.headline
        }}
        chainOf={(point) => openStepOf(point)?.step.point.chain ?? point.chain}
        initialOpen={initialOpen}
        isEnglish={isEnglish}
        sourceOfPage={sourceOfPage}
        answersLine={answersLine || undefined}
        outlookSummary={plan.notes[0]?.text ?? (plan.items[0] ? `${plan.items[0].actionLabel}${isEnglish ? ': ' : '：'}${plan.items[0].check.text}${checkIntervalSuffix(plan.items[0].check, isEnglish)}` : undefined)}
        outlookSlot={(
          <>
            {outlookModules.map((item) => (
              <MapFold key={item.id} label={item.moduleName ?? item.title} size="sm" bodyClassName="px-2.5 pb-2.5 pt-2" testId={`cdss-visit-outlook-module-${item.id}`}>
                {renderDetail(item)}
              </MapFold>
            ))}
            <VisitPlan plan={plan} isEnglish={isEnglish} />
            {outlookContent}
          </>
        )}
        {...(surfaces?.columnFooters ? { columnFooters: surfaces.columnFooters } : {})}
        detail={detailNode}
        summary={{
          content: (
            <>
              {/* Where the visit ends, the pack says the day is decided. */}
              {status.decided ? (
                <p className="px-0.5 text-sm font-medium text-foreground" data-testid="cdss-visit-decided-line">{status.text}</p>
              ) : null}
              <VisitSummary text={summaryText} isEnglish={isEnglish} />
            </>
          ),
          status: recordedToday
            ? (isEnglish ? `${recordedToday} recorded` : `已記錄 ${recordedToday}`)
            : (isEnglish ? 'Nothing recorded yet' : '尚未記錄'),
        }}
        {...(model.asks.length > 0 ? {
          asks: {
            pending: unansweredAsks.length > 0,
            opensMore: fillInOpened > 0,
            content: (
              <VisitAsks
                asks={model.asks}
                answers={answers}
                isEnglish={isEnglish}
                onAnswer={onAnswer}
                pagePackId={model.packId}
                testId="cdss-visit-asks-carried"
                {...(answerSources ? { sources: answerSources } : {})}
              />
            ),
          },
        } : {})}
      />
      {footer}
    </div>
  )
}
