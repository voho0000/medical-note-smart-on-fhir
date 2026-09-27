"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  decisionInputFor,
  effectiveAnswer,
  latestDecisionFor,
  pointSteps,
  queuedPointDps,
  returnVisitLabel,
  visitDecisionKey,
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
import { TodayQueue } from './TodayQueue'
import { VisitAsks } from './VisitAsks'
import { VisitAsksDetail, isFirstAssessment, openingAnswers } from './VisitAsksDetail'
import type { VisitMapSurfaces } from './visit-surfaces'
import { VisitPlan } from './VisitPlan'
import { VisitStatusHeader } from './VisitStatusHeader'
import { VisitSummary } from './VisitSummary'

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
  isEnglish,
  onChange,
}: {
  view: StatusView
  followUpAvailable: boolean
  /** Points in the other view that need the clinician, named so they are not missed. */
  otherPending: readonly DecisionPointView[]
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
      {otherPending.length ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange(other)}
          data-testid="cdss-visit-status-view-other-pending"
        >
          {isEnglish
            ? `${otherLabel} also needs you: ${otherPending.map((point) => `${point.dp} ${point.label}`).join(', ')} →`
            : `「${otherLabel}」還有：${otherPending.map((point) => `${point.dp} ${point.label}`).join('、')} →`}
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
  onAnswer?: (id: VisitAsk['id'], value: string | null) => void
  /** Every card a point can open, by module id — this pack's and the companion's. */
  modules: ReadonlyMap<string, CdssRecommendation>
  /** This pack's cards that no decision point names, kept reachable at the foot. */
  unmappedModules: readonly CdssRecommendation[]
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
  onAnswer,
  modules,
  unmappedModules,
  renderDetail,
  outlookContent,
  footer,
  onPhysicianInput,
  surfaces,
}: VisitDecisionScreenProps) {
  const sourceOfPage: DecisionPointView['source'] = model.packId === 'atrial-fibrillation-cdss' ? 'af' : 'hf'
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [statusViewOverride, setStatusViewOverride] = useState<{ reason: StatusView; view: StatusView } | null>(null)
  // DP-03's fuller questions: open at a first assessment and whenever an ask
  // comes back worse. A clinician's own open/close holds until that reason
  // changes — a new 「變差」 reopens what was folded under 「穩定」.
  // The whole checklist belongs to a heart-failure first assessment — and only
  // once 懷疑 HF has been answered, since its questions stay locked until then.
  // The AF page's fuller questions are about treatment already under way, so
  // they open only when an ask comes back 有.
  const allRows = useMemo(() => buildQueueRows(model, decisions, now), [decisions, model, now])
  // A question the assessment block asks itself (懷疑 HF？ as its question 1
  // before a diagnosis) is answered there, once, in reasoning order — not
  // again as a row of 今天要決定.
  const blockRequests = surfaces?.asksDetail?.requests
  // A point whose recommended action answers one of the page's own questions
  // (懷疑 HF？, 確認 HFpEF) is asked there, once.
  const askedHere = useCallback((point: DecisionPointView) => {
    const request = point.actions[0]?.physicianInput?.request
    return Boolean(request && blockRequests?.includes(request))
  }, [blockRequests])
  const rows = useMemo(() => allRows.filter((row) => !askedHere((row.current ?? row.steps[0]).point)), [allRows, askedHere])
  const gatePending = allRows.some((row) => row.current?.point.dp === 'DP-00')
  // Before a diagnosis there are no every-visit asks: the block is the
  // assessment itself, 懷疑 HF？ first, and it is open from the start.
  const firstAssessment = model.packId === 'heart-failure-cdss'
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
    (point: DecisionPointView) => latestDecisionFor(point, decisions, now),
    [decisions, now],
  )

  const record = (key: string, point: DecisionPointView, action: VisitAction, surface: 'queue' | 'map') => {
    if (!onRecordDecision) return
    onRecordDecision(key, decisionInputFor(point, action, packVersion))
    decisionRecorded(screenKey, key, surface)
    if (action.physicianInput) onPhysicianInput?.(action.physicianInput)
  }
  const clear = (key: string) => onClearDecision?.(key)

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

  // Cards no decision point names sit at the foot of 02, inside the map, rather
  // than as a stray line between the map and the summary.
  const otherModules = unmappedModules.length ? (
        <details className="rounded-lg border border-border" data-testid="cdss-visit-other-modules">
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {isEnglish ? 'Other modules: ' : '其他模組：'}
            {unmappedModules.map((item) => item.moduleName ?? item.title).join(isEnglish ? ', ' : '、')}
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {unmappedModules.map((item) => (
              <details key={item.id} className="group/module" data-testid={`cdss-visit-other-module-${item.id}`}>
                <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  {item.moduleName ?? item.title}
                </summary>
                <div className="px-3 pb-3">{renderDetail(item)}</div>
              </details>
            ))}
          </div>
        </details>
      ) : null

  const answersLine = model.asks
    .flatMap((ask) => {
      const { value } = effectiveAnswer(ask, answers)
      const option = ask.options.find((candidate) => candidate.value === value)
      return option ? [`${ask.label} ${option.label}`] : []
    })
    .join(' · ')

  const detailNode = openPoint ? (
    <DecisionPointDetail
      key={visitDecisionKey(openPoint)}
      extras={detailExtras}
      point={openPoint}
      steps={pointSteps(openPoint, decisions, now)}
      isEnglish={isEnglish}
      sourceOfPage={sourceOfPage}
      modules={modules}
      renderDetail={renderDetail}
      onDecide={onRecordDecision ? (step, action) => record(step.key, step.point, action, 'map') : undefined}
      onClear={onClearDecision ? (step) => clear(step.key) : undefined}
      onClose={() => {
        const { dp, source } = openPoint
        setOpenKey(null)
        // Back to the cell (or row) that opened it.
        requestAnimationFrame(() => {
          const targets = document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-map"] button[data-dp], [data-visit-row-detail]')
          ;[...targets].find((target) => (target.dataset.dp === dp && target.dataset.source === source) || target.dataset.visitRowDetail === dp)?.focus()
        })
      }}
    />
  ) : null
  const toggleOpen = (point: DecisionPointView) => {
    const key = visitDecisionKey(point)
    setOpenKey((current) => (current === key ? null : key))
  }

  // The three sections are the page's spine. Each opens with what it asks and
  // what it decides today, then its other points: 01 the asks (追蹤) or the
  // diagnostic step (診斷), 02 and 03 their rows. There is no queue above
  // them, so nothing is on the screen twice.
  const rowsIn = (block: VisitBlock) => rows.filter((row) => row.steps[0].point.block === block)
  // Every point a row stands for — and a question the lead asks itself — is
  // not repeated as a cell.
  const rowDps = useMemo(() => new Set([
    ...queuedPointDps(allRows),
    ...model.points.filter(askedHere).map((point) => point.dp),
  ]), [allRows, askedHere, model.points])
  const decisionList = (block: VisitBlock, title: string) => (
    <TodayQueue
      rows={rowsIn(block)}
      isEnglish={isEnglish}
      sourceOfPage={sourceOfPage}
      title={title}
      testId={`cdss-visit-queue-${block}`}
      hideWhenEmpty
      onDecide={onRecordDecision ? (step, action) => record(step.key, step.point, action, 'queue') : undefined}
      onClear={onClearDecision ? (step) => clear(step.key) : undefined}
      onOpenDetail={toggleOpen}
      detailFor={(point) => (openPoint && openPoint.dp === point.dp && openPoint.source === point.source ? detailNode : undefined)}
    />
  )
  const undiagnosed = model.asks.length === 0
  const diagnosisView = surfaces?.diagnosis
  // 01 opens on 診斷 before a diagnosis and on 追蹤 after it; the clinician's
  // own choice holds until that standing changes.
  const defaultStatusView: StatusView = undiagnosed ? 'diagnosis' : 'follow-up'
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
  const followUpLead = (
    <>
      <VisitAsks asks={model.asks} answers={answers} isEnglish={isEnglish} onAnswer={onAnswer} />
      {surfaces?.asksDetail ? (
        <VisitAsksDetail
          id={ASKS_DETAIL_ID}
          label={surfaces.asksDetail.label}
          content={surfaces.asksDetail.content}
          openCount={surfaces.asksDetail.openCount}
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
            isEnglish={isEnglish}
            onChange={(view) => setStatusViewOverride({ reason: defaultStatusView, view })}
          />
        ) : null}
        {diagnosisView && statusView === 'diagnosis' ? diagnosisView.content : followUpLead}
        {decisionList('status', statusView === 'diagnosis' ? (isEnglish ? 'Diagnosis decisions' : '診斷決定') : (isEnglish ? 'To decide' : '待決定'))}
      </>
    ),
    treatment: decisionList('treatment', isEnglish ? 'To decide' : '待決定'),
    outlook: decisionList('outlook', isEnglish ? 'To decide' : '待決定'),
  }
  const unanswered = model.asks.filter((ask) => !effectiveAnswer(ask, answers).value).length
  const pendingIn = (block: VisitBlock) => rowsIn(block).filter((row) => row.current).length
  const decidedIn = (block: VisitBlock) => rowsIn(block).filter((row) => !row.current).length
  const leadSummary = (block: VisitBlock): { text: string; attention: boolean } | undefined => {
    const parts: string[] = []
    const toAnswer = block === 'status' ? (undiagnosed ? surfaces?.asksDetail?.openCount ?? 0 : unanswered) : 0
    if (toAnswer) parts.push(isEnglish ? `${toAnswer} to answer` : `待答 ${toAnswer}`)
    if (pendingIn(block)) parts.push(isEnglish ? `${pendingIn(block)} to decide` : `待決定 ${pendingIn(block)}`)
    else if (decidedIn(block)) parts.push(isEnglish ? `${decidedIn(block)} decided` : `已決定 ${decidedIn(block)}`)
    return parts.length ? { text: parts.join(' · '), attention: toAnswer > 0 || pendingIn(block) > 0 } : undefined
  }
  const leadSummaries: Partial<Record<VisitBlock, { text: string; attention: boolean }>> = {}
  for (const block of BLOCK_ORDER) {
    const summary = leadSummary(block)
    if (summary) leadSummaries[block] = summary
  }
  // A safety row opens its own section; otherwise the visit starts at 01.
  const initialOpen: VisitBlock = rows.find((row) => row.safety && row.current)?.steps[0].point.block ?? 'status'
  // 01's cells: the view's own, and never the every-visit point whose
  // questions (喘／體重, AF 症狀／出血) are the asks right above.
  const cellFilters: Partial<Record<VisitBlock, (point: DecisionPointView) => boolean>> = {
    status: (point) => {
      if (model.asks.length && point.semanticId.endsWith('-visit-response')) return false
      if (!diagnosisView) return true
      return (statusView === 'diagnosis') === (point.source === sourceOfPage && diagnosisView.dps.includes(point.dp))
    },
  }

  return (
    <div
      className="space-y-4"
      data-testid="cdss-visit-screen"
      data-pack={model.packId}
      data-stage={model.stage}
    >
      <VisitStatusHeader
        model={model}
        rows={rows}
        isEnglish={isEnglish}
        now={now}
        onEditValues={surfaces?.editValues}
        onEditValue={surfaces?.editValue}
      />
      {surfaces?.statusPanel}
      <DecisionMapColumns
        model={model}
        decisionOf={decisionOf}
        queuedDps={queuedDps}
        openKey={openPoint ? openKey : null}
        onOpen={toggleOpen}
        leads={leads}
        leadSummaries={leadSummaries}
        rowDps={rowDps}
        cellFilters={cellFilters}
        initialOpen={initialOpen}
        isEnglish={isEnglish}
        sourceOfPage={sourceOfPage}
        answersLine={answersLine || undefined}
        outlookSummary={plan.withinDays !== undefined ? returnVisitLabel(plan.withinDays, isEnglish) : plan.notes[0]?.text}
        outlookSlot={(
          <>
            {outlookModules.map((item) => (
              <details key={item.id} className="rounded-md border border-border bg-background" data-testid={`cdss-visit-outlook-module-${item.id}`}>
                <summary className="flex min-h-11 cursor-pointer items-center px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  {item.moduleName ?? item.title}
                </summary>
                <div className="border-t border-border px-2.5 pb-2.5 pt-2">{renderDetail(item)}</div>
              </details>
            ))}
            <VisitPlan plan={plan} isEnglish={isEnglish} />
            {outlookContent}
          </>
        )}
        columnFooters={{
          ...surfaces?.columnFooters,
          treatment: (
            <>
              {surfaces?.columnFooters?.treatment}
              {otherModules}
            </>
          ),
        }}
        detail={detailNode}
      />
      <VisitSummary text={summaryText} isEnglish={isEnglish} />
      {footer}
    </div>
  )
}
