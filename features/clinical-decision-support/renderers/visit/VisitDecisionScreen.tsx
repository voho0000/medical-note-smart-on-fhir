"use client"

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/src/shared/utils/cn.utils'
import type { CdssRecommendation } from '../../types'
import type {
  PhysicianDecisionInput,
  PhysicianDecisionMap,
} from '../../stores/physician-decisions.store'
import { useCdssDecisionTimingStore } from '../../stores/cdss-decision-timing.store'
import {
  BLOCK_ORDER,
  DECISION_STATES,
  buildQueueRows,
  buildVisitPlan,
  buildVisitSummaryText,
  checkIntervalSuffix,
  decidedOnAnotherRow,
  decidingStep,
  decisionInputFor,
  dependentDecisionKeys,
  effectiveAnswer,
  latestDecisionFor,
  pointSteps,
  queuedPointDps,
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
import { DecisionPointDetail } from './DecisionPointDetail'
import { PointBox, QueueRowBox, TodayQueue } from './TodayQueue'
import { VisitAsks, type VisitAnswerProvenance } from './VisitAsks'
import { VisitAsksDetail, isFirstAssessment, openingAnswers } from './VisitAsksDetail'
import type { VisitMapSurfaces } from './visit-surfaces'
import { pageSourceOf } from './visit-model.source'
import { focusBackTo, focusInto, revealTop } from './reveal'
import { MapFold } from './MapFold'
import { VisitPlan } from './VisitPlan'
import { VisitStatusHeader } from './VisitStatusHeader'
import { VisitSummary } from './VisitSummary'
import rowStyles from './point-rows.module.css'

const ASKS_DETAIL_ID = 'cdss-visit-asks-detail'

type StatusView = 'diagnosis' | 'follow-up'

/**
 * 01's 診斷／追蹤 switch, in the page's segmented-choice grammar. 追蹤 waits
 * for a diagnosis: before one there is nothing to follow.
 */
function StatusViewSwitch({
  view,
  followUpAvailable,
  otherPending,
  otherAsks = [],
  isEnglish,
  onChange,
}: {
  view: StatusView
  followUpAvailable: boolean
  /** Points in the other view that need the clinician, named so they are not missed. */
  otherPending: readonly DecisionPointView[]
  /** Every-visit asks the other view still waits for (喘／體重比上次 while 01 shows 診斷). */
  otherAsks?: readonly string[]
  isEnglish: boolean
  onChange: (view: StatusView) => void
}) {
  const other: StatusView = view === 'diagnosis' ? 'follow-up' : 'diagnosis'
  const otherLabel = other === 'diagnosis' ? (isEnglish ? 'Diagnosis' : '診斷') : (isEnglish ? 'Follow-up' : '追蹤')
  const options: { id: StatusView; label: string; disabled?: boolean }[] = [
    { id: 'diagnosis', label: isEnglish ? 'Diagnosis' : '診斷' },
    { id: 'follow-up', label: isEnglish ? 'Follow-up' : '追蹤', disabled: !followUpAvailable },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="group" aria-label={isEnglish ? 'Diagnosis or follow-up' : '診斷或追蹤'} className="inline-flex overflow-hidden rounded-md border border-border bg-card" data-testid="cdss-visit-status-view">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={view === option.id}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              'min-h-11 min-w-16 border-r border-border px-4 text-sm transition-colors last:border-r-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              view === option.id ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted/40',
            )}
            data-testid={`cdss-visit-status-view-${option.id}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {!followUpAvailable ? (
        <span className="text-xs text-muted-foreground">{isEnglish ? 'Follow-up opens once diagnosed' : '「追蹤」確診後可用'}</span>
      ) : null}
      {otherPending.length || otherAsks.length ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange(other)}
          data-testid="cdss-visit-status-view-other-pending"
        >
          {isEnglish
            ? `${otherLabel} also needs you: ${[...otherAsks, ...otherPending.map((point) => `${point.dp} ${point.label}`)].join(', ')} →`
            : `「${otherLabel}」還有：${[...otherAsks, ...otherPending.map((point) => `${point.dp} ${point.label}`)].join('、')} →`}
        </button>
      ) : null}
    </div>
  )
}

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
/** States a step counts as still needing the clinician. */
const ATTENTION_STATES: ReadonlySet<DecisionPointView['state']> = new Set(['safety', 'act', 'confirm'])

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
  surfaces,
}: VisitDecisionScreenProps) {
  const sourceOfPage = pageSourceOf(model)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [statusViewOverride, setStatusViewOverride] = useState<{ reason: StatusView; view: StatusView } | null>(null)
  // A press that moves the visit on (quick confirmation → treatment) asks the map to open a section.
  // The standing the page last drew: undiagnosed (no every-visit asks) or not.
  const [drawnUndiagnosed, setDrawnUndiagnosed] = useState(model.asks.length === 0)
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
  const decisionOf = useCallback(
    (point: DecisionPointView) => latestDecisionFor(point, decisions, now)
      ?? decidedOnAnotherRow(point, model.points, decisions, now),
    [decisions, model.points, now],
  )
  // What the summary holds so far, for its step's name.
  // Counted on the rows they were recorded on: one DOAC chosen on DP-07's row
  // is one decision, not three for the points it also answers.
  const recordedToday = model.points.filter((point) => latestDecisionFor(point, decisions, now)).length

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
            // The fuller questions live under 01's 追蹤; a first visit opens 01
            // on 診斷, where they are not drawn (#179 review).
            if (diagnosisView && !undiagnosed && statusView !== 'follow-up') {
              setStatusViewOverride({ reason: defaultStatusView, view: 'follow-up' })
            }
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
  // A point another row decides (DP-08／DP-09 by DP-07's DOAC choice) opens
  // on that step — its record, or its choices once 改 has cleared it — and
  // not on its own 「等上一步」, which the step has overtaken (#196 review).
  const decidedElsewhere = (point: DecisionPointView) => (
    latestDecisionFor(point, decisions, now) ? undefined : decidingStep(point, model.points, decisions, now)
  )
  const openDeciding = openPoint ? decidedElsewhere(openPoint) : undefined
  const detailNode = openPoint ? (
    <DecisionPointDetail
      key={visitDecisionKey(openPoint)}
      extras={detailExtras}
      point={openPoint}
      shownAbove={openDeciding ? { headline: true, why: true } : shownAbove(openPoint)}
      steps={openDeciding ? [openDeciding.step] : pointSteps(openPoint, decisions, now)}
      {...(openDeciding ? { decidedWith: openDeciding.owner } : {})}
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
  const decideRow = onRecordDecision ? (step: QueueStep, action: VisitAction) => record(step.key, step.point, action, 'queue') : undefined
  const clearRow = onClearDecision ? (step: QueueStep) => clear(step.key) : undefined
  // A pillar box decides in place: today's row where the pack queued it, else
  // the point's own steps where it asks for a decision (a dose to confirm),
  // else it just says where the pillar stands.
  const pillarBox = (point: DecisionPointView) => {
    const queued = rowOfPoint(point)
    const steps = queued ? undefined : pointSteps(point, decisions, now)
    const row: QueueRow | undefined = queued ?? (point.actions.length > 0 && DECISION_STATES.has(point.state) && steps
      ? { key: visitDecisionKey(point), steps, ...(steps.find((step) => !step.decision) ? { current: steps.find((step) => !step.decision)! } : {}), safety: point.state === 'safety' }
      : undefined)
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
    />
  )
  const undiagnosed = model.asks.length === 0
  // The diagnosis came to stand on this page (question 1, 目前 <50%, the
  // HFpEF confirmation). Nothing moves: the answer stays where it was given,
  // 01 stays on 診斷, and 「下一區：02 治療」 is now the clinician's to press
  // (clinician feedback 2026-09-27: 「應該要 user 自己點」).
  if (drawnUndiagnosed !== undiagnosed) {
    setDrawnUndiagnosed(undiagnosed)
    if (drawnUndiagnosed && !undiagnosed) setStatusViewOverride({ reason: 'follow-up', view: 'diagnosis' })
  }
  const diagnosisView = surfaces?.diagnosis
  // 01 opens on 診斷 before a diagnosis, and at the system's first visit with
  // the patient, where the clinician answers the diagnosis (clinician decision
  // 2026-09-28: 「沒資料的都還是需要點診斷」); on 追蹤 once a stored visit
  // brings the diagnosis in. The clinician's own choice holds until that
  // standing changes.
  const firstVisit = model.stage === 'baseline' && Boolean(diagnosisView)
  const defaultStatusView: StatusView = undiagnosed || firstVisit ? 'diagnosis' : 'follow-up'
  const statusView: StatusView = undiagnosed
    ? 'diagnosis'
    : statusViewOverride && statusViewOverride.reason === defaultStatusView ? statusViewOverride.view : defaultStatusView
  // What the other 01 view holds that needs the clinician (P7's 重新評估
  // under 診斷 while 01 shows 追蹤), so it is named rather than missed.
  const inDiagnosisView = (point: DecisionPointView) => Boolean(diagnosisView && point.source === sourceOfPage && diagnosisView.dps.includes(point.dp))
  const otherViewPending = diagnosisView ? model.points.filter((point) => (
    point.block === 'status'
    && !rowDps.has(point.dp)
    && DECISION_STATES.has(point.state)
    && !decisionOf(point)
    && inDiagnosisView(point) !== (statusView === 'diagnosis')
  )) : []
  // 喘／體重比上次 live in 追蹤 only — one home per question, and the same 診斷
  // view for every patient — but a diagnosis made on 診斷 (often a returning
  // patient's first CDSS visit: clinician feedback 2026-09-28) must not skip
  // them: the switch names them, and 01's foot offers 追蹤 before 02.
  const unansweredAsks = model.asks.filter((ask) => !effectiveAnswer(ask, answers).value)
  const goToFollowUp = () => {
    setStatusViewOverride({ reason: defaultStatusView, view: 'follow-up' })
    document.querySelector('[data-testid="cdss-visit-status-view"]')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    // The button pressed goes with the 診斷 view: focus goes to 追蹤, where
    // the clinician now is.
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-testid="cdss-visit-status-view-follow-up"]')?.focus({ preventScroll: true })
    })
  }
  const followUpLead = (
    <>
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
    </>
  )
  const leads: Partial<Record<VisitBlock, ReactNode>> = {
    status: (
      <>
        {diagnosisView ? (
          <StatusViewSwitch
            view={statusView}
            followUpAvailable={!undiagnosed}
            otherPending={otherViewPending}
            otherAsks={statusView === 'diagnosis' ? unansweredAsks.map((ask) => ask.label) : []}
            isEnglish={isEnglish}
            onChange={(view) => setStatusViewOverride({ reason: defaultStatusView, view })}
          />
        ) : null}
        {diagnosisView && statusView === 'diagnosis' ? diagnosisView.content : followUpLead}
        {decisionList('status', statusView === 'diagnosis' ? (isEnglish ? 'Diagnosis decisions' : '診斷決定') : (isEnglish ? 'To decide' : '待決定'))}
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
    if (toDiagnosis) {
      if (!undiagnosed) setStatusViewOverride({ reason: defaultStatusView, view: 'diagnosis' })
    } else {
      if (diagnosisView && !undiagnosed) setStatusViewOverride({ reason: defaultStatusView, view: 'follow-up' })
      setAsksDetailOpen(true)
    }
    // Where it is asked comes into view, and focus goes into it: the press
    // was on a tile the narrow list folds away (#194 review). On 診斷 that is
    // the question itself — DP-01's, which answers DP-00 and DP-34 too.
    requestAnimationFrame(() => {
      const lead = document.querySelector<HTMLElement>('[data-testid="cdss-visit-lead-status"]')
      const target = toDiagnosis
        ? lead?.querySelector<HTMLElement>(`[data-dp="${point.dp}"]`) ?? lead?.querySelector<HTMLElement>('[data-dp]') ?? lead
        : document.getElementById(ASKS_DETAIL_ID)
      // A point kept in a fold there (DP-34's criteria under an answered
      // HFpEF) opens with the press that asked for it.
      if (target instanceof HTMLDetailsElement) target.open = true
      revealTop(target)
      focusInto(target)
    })
  }
  const openFromMap = (point: DecisionPointView) => (askedHere(point) ? goToWhereAsked(point) : toggleOpen(point))
  // What the steps count as 需你確認／需處理 beyond the queue, for the header
  // once the queue is recorded.
  const stillToConfirm = model.points.filter((point) => (
    ATTENTION_STATES.has(point.state) && !decisionOf(point) && !queuedDps.has(point.dp)
  )).length

  return (
    <div
      className="space-y-3"
      data-testid="cdss-visit-screen"
      data-pack={model.packId}
      data-stage={model.stage}
    >
      <VisitStatusHeader
        model={model}
        rows={rows}
        stillToConfirm={stillToConfirm}
        isEnglish={isEnglish}
        now={now}
        onEditValues={surfaces?.editValues}
        onEditValue={surfaces?.editValue}
        {...(surfaces?.statusLine?.valueAddons ? { valueAddons: surfaces.statusLine.valueAddons } : {})}
        {...(surfaces?.statusLine?.extras ? { extras: surfaces.statusLine.extras } : {})}
      />
      {surfaces?.statusPanel}
      <DecisionMapColumns
        model={model}
        decisionOf={decisionOf}
        queuedDps={queuedDps}
        openKey={openPoint ? openKey : null}
        onOpen={openFromMap}
        opensCard={(point) => !askedHere(point)}
        leads={leads}
        leadSummaries={leadSummaries}
        rowDps={rowDps}
        leadCardKeys={leadCardKeys}
        pendingLine={(point) => decidedElsewhere(point)?.step.point.headline}
        initialOpen={initialOpen}
        {...(diagnosisView && statusView === 'diagnosis' && !undiagnosed && unansweredAsks.length > 0
          ? { stepsBeforeNext: { status: { label: isEnglish ? `Next: Follow-up (${unansweredAsks.map((ask) => ask.label).join(', ')})` : `下一步：追蹤（${unansweredAsks.map((ask) => ask.label).join('、')}）`, onGo: goToFollowUp } } }
          : {})}
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
          content: <VisitSummary text={summaryText} isEnglish={isEnglish} />,
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
