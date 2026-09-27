"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CdssRecommendation } from '../../types'
import type {
  PhysicianDecisionInput,
  PhysicianDecisionMap,
} from '../../stores/physician-decisions.store'
import { useCdssDecisionTimingStore } from '../../stores/cdss-decision-timing.store'
import {
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
  // DP-03's fuller questions: open at a first assessment and whenever an ask
  // comes back worse. A clinician's own open/close holds until that reason
  // changes — a new 「變差」 reopens what was folded under 「穩定」.
  // The whole checklist belongs to a heart-failure first assessment — and only
  // once 懷疑 HF has been answered, since its questions stay locked until then.
  // The AF page's fuller questions are about treatment already under way, so
  // they open only when an ask comes back 有.
  const rows = useMemo(() => buildQueueRows(model, decisions, now), [decisions, model, now])
  const gatePending = rows.some((row) => row.current?.point.dp === 'DP-00')
  const firstAssessment = model.packId === 'heart-failure-cdss' && isFirstAssessment(model.stage) && !gatePending
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
      <TodayQueue
        rows={rows}
        isEnglish={isEnglish}
        sourceOfPage={sourceOfPage}
        onDecide={onRecordDecision ? (step, action) => record(step.key, step.point, action, 'queue') : undefined}
        onClear={onClearDecision ? (step) => clear(step.key) : undefined}
      />
      <DecisionMapColumns
        model={model}
        decisionOf={decisionOf}
        queuedDps={queuedDps}
        openKey={openPoint ? openKey : null}
        onOpen={(point) => {
          const key = visitDecisionKey(point)
          setOpenKey((current) => (current === key ? null : key))
        }}
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
        detail={openPoint ? (
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
              // Back to the cell that opened it.
              requestAnimationFrame(() => {
                const cells = document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-map"] button[data-dp]')
                ;[...cells].find((cell) => cell.dataset.dp === dp && cell.dataset.source === source)?.focus()
              })
            }}
          />
        ) : null}
      />
      <VisitSummary text={summaryText} isEnglish={isEnglish} />
      {footer}
    </div>
  )
}
