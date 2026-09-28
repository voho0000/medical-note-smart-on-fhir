"use client"

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { QueueRow, QueueStep } from './visit-decisions'
import type { DecisionPointView, VisitAction } from '../../types'
import { VisitDecisionControls } from './VisitDecisionControls'
import { StatePill } from './visit-presentation'
import rowStyles from './point-rows.module.css'

/**
 * 今天要決定: the only place on the screen with the day's treatment buttons in
 * view at first paint. One row per queued decision point, safety first, in the
 * pack's order. Each row reads DP · the pack's question · its one-line reason ·
 * the recommended action · 「其他」. A decided row collapses in place to the
 * decision and its response check; a chain row walks on to its next step
 * without adding a row.
 */
export function TodayQueue({
  rows,
  isEnglish,
  sourceOfPage,
  onDecide,
  onClear,
  title,
  testId = 'cdss-visit-queue',
  hideWhenEmpty = false,
  detailFor,
  onOpenDetail,
}: {
  rows: readonly QueueRow[]
  isEnglish: boolean
  /** The page's own pack; a row from the companion pack is labelled with its source. */
  sourceOfPage: DecisionPointView['source']
  onDecide?: (step: QueueStep, action: VisitAction) => void
  onClear?: (step: QueueStep) => void
  /** The heading: 「今天要決定」, or a section's own (「待決定」, 「診斷決定」). */
  title?: string
  testId?: string
  /** Inside a section, an empty list says nothing rather than 「今天沒有要決定的事」. */
  hideWhenEmpty?: boolean
  /** The opened point's card, drawn under its own row. */
  detailFor?: (point: DecisionPointView) => ReactNode
  /** Opens (or closes) a row's card — its reasons, chain and guideline. */
  onOpenDetail?: (point: DecisionPointView) => void
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The row a decision was just taken on, so focus can move on once the store
  // has re-rendered the queue: to the same row when its chain moved on or its
  // decision was withdrawn, else to the next row still waiting, else to the
  // queue's heading, which then reads that everything is decided.
  const focusFrom = useRef<string | null>(null)

  useLayoutEffect(() => {
    const from = focusFrom.current
    const list = listRef.current
    if (!from || !list) return
    focusFrom.current = null
    const rowElements = [...list.querySelectorAll<HTMLElement>('[data-visit-queue-row]')]
    const index = rowElements.findIndex((element) => element.dataset.visitQueueRow === from)
    const ordered = index < 0 ? rowElements : [...rowElements.slice(index), ...rowElements.slice(0, index)]
    for (const element of ordered) {
      const primary = element.querySelector<HTMLButtonElement>('[data-visit-primary]:not([disabled])')
      if (primary) {
        primary.focus()
        return
      }
    }
    headingRef.current?.focus()
  })

  const pending = rows.filter((row) => row.current).length
  const headingId = `${testId}-title`
  if (hideWhenEmpty && rows.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="space-y-1.5" data-testid={testId}>
      {/* A subheading as the map prints its groups (「分流與安全」), not a panel title. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-0.5">
        <h3
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-[11px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {title ?? (isEnglish ? 'To decide today' : '今天要決定')}
        </h3>
        {rows.length ? (
          <span className="text-[11px] tabular-nums text-muted-foreground" role="status" data-testid={`${testId}-progress`}>
            {isEnglish
              ? `${rows.length - pending}/${rows.length} decided`
              : `已決定 ${rows.length - pending}/${rows.length}`}
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-border px-2.5 py-2 text-sm text-muted-foreground" data-testid={`${testId}-empty`}>
          {isEnglish ? 'Nothing to decide today.' : '今天沒有要決定的事。'}
        </p>
      ) : (
        <ol ref={listRef} className={rowStyles.list}>
          {rows.map((row) => (
            <QueueRowBox
              key={row.key}
              row={row}
              isEnglish={isEnglish}
              sourceOfPage={sourceOfPage}
              {...(onDecide ? { onDecide: (step, action) => { focusFrom.current = row.key; onDecide(step, action) } } : {})}
              {...(onClear ? { onClear: (step) => { focusFrom.current = row.key; onClear(step) } } : {})}
              {...(detailFor ? { detailFor } : {})}
              {...(onOpenDetail ? { onOpenDetail } : {})}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

const DETAIL_LINK = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** A row's first column: DP code, name and source. */
function RowLead({ point, sourceOfPage }: { point: DecisionPointView; sourceOfPage: DecisionPointView['source'] }) {
  return (
    <span className={rowStyles.lead}>
      <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{point.dp}</span>
      <span className="min-w-0 text-sm font-medium leading-snug text-foreground">{point.label}</span>
      {point.source !== sourceOfPage ? (
        <Badge variant="outline" className="h-5 shrink-0 px-1 text-[10px]">{point.source.toUpperCase()}</Badge>
      ) : null}
    </span>
  )
}

/**
 * A row's last column: the fold mark that opens its card (reasons, chain,
 * guideline) — a chevron alone, as a map cell's is (clinician feedback
 * 2026-09-28: 「依據與細節這字完全沒必要，就一個下拉的符號就好」); its name
 * stays for a screen reader and a pointer's tooltip.
 */
function RowLink({ point, isEnglish, detailOpen, onOpenDetail }: {
  point: DecisionPointView
  isEnglish: boolean
  detailOpen: boolean
  onOpenDetail?: (point: DecisionPointView) => void
}) {
  return (
    <span className={rowStyles.link}>
      {onOpenDetail ? (
        <button
          type="button"
          className={DETAIL_LINK}
          aria-expanded={detailOpen}
          aria-label={isEnglish ? 'Reasons and guideline' : '依據與細節'}
          title={isEnglish ? 'Reasons and guideline' : '依據與細節'}
          onClick={() => onOpenDetail(point)}
          data-visit-row-detail={point.dp}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', detailOpen && 'rotate-180')} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}

function ChainDone({ steps }: { steps: readonly QueueStep[] }) {
  return (
    <>
      {steps.map((step) => (
        <p key={step.key} className="flex items-center gap-1.5 text-xs text-muted-foreground" data-visit-chain-done={step.point.dp}>
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          <span className="font-mono">{step.point.dp}</span>
          <span>{step.decision?.record.actionLabel ?? step.decision?.action.label}</span>
        </p>
      ))}
    </>
  )
}

/**
 * One decision to take today, on one line of the map (clinician decision
 * 2026-09-28: 「用一行式，設成預設」): the DP code and name, the state in the
 * map's pill, the pack's question with its one-line reason, the buttons, and
 * 依據與細節 — in columns that line up down the section (see
 * point-rows.module.css). A decided row collapses to the decision; a chain
 * walks on in the same row. Used in the lists and in 02's 四支柱.
 */
export function QueueRowBox({
  row,
  isEnglish,
  sourceOfPage,
  onDecide,
  onClear,
  detailFor,
  onOpenDetail,
  detailOpen,
  queued = true,
  as: Element = 'li',
}: {
  row: QueueRow
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  onDecide?: (step: QueueStep, action: VisitAction) => void
  onClear?: (step: QueueStep) => void
  detailFor?: (point: DecisionPointView) => ReactNode
  onOpenDetail?: (point: DecisionPointView) => void
  /** The box's card is open, drawn by the caller outside the box (02's 四支柱). */
  detailOpen?: boolean
  /**
   * False for a pillar that decides in its box without being on today's list
   * (a dose to confirm): the box is the same, but it is not one of the rows.
   */
  queued?: boolean
  as?: 'li' | 'div'
}) {
  const current = row.current
  const decidedSteps = row.steps.filter((step) => step.decision)
  const shown = current ?? row.steps[row.steps.length - 1]
  const point = shown.point
  const detail = detailFor?.(point)
  const open = detailOpen ?? Boolean(detail)
  return (
    <Element
      className="scroll-mt-2"
      data-visit-queue-row={queued ? row.key : undefined}
      data-visit-point-box={queued ? undefined : point.dp}
      data-visit-queue-dp={row.steps[0].point.dp}
      data-visit-current-dp={current?.point.dp}
      data-visit-queue-state={point.state}
      data-decided={current ? 'false' : 'true'}
    >
      <div className={cn(rowStyles.row, open && rowStyles.open, current && (row.safety ? rowStyles.safety : rowStyles.actionable))}>
        <RowLead point={point} sourceOfPage={sourceOfPage} />
        <span className={rowStyles.state}>
          <StatePill state={row.safety && current ? 'safety' : point.state} isEnglish={isEnglish} inQueue decided={!current} />
        </span>
        <div className={rowStyles.main}>
          {current ? (
            // Wide, the buttons keep the row's right edge and the words wrap
            // beside them; narrow, they drop under the words.
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 @min-[40rem]:flex-nowrap">
              <div className="min-w-0 flex-1 basis-56 space-y-0.5 @min-[40rem]:basis-auto">
                <ChainDone steps={decidedSteps} />
                <p className="text-sm font-semibold leading-snug text-foreground" data-visit-headline="">{point.headline ?? point.label}</p>
                {point.why ? <p className="text-xs leading-relaxed text-muted-foreground" data-visit-why="">{point.why}</p> : null}
              </div>
              <div className="shrink-0">
                <VisitDecisionControls
                  point={point}
                  surface="queue"
                  isEnglish={isEnglish}
                  onDecide={onDecide ? (action) => onDecide(current, action) : undefined}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <p className="sr-only" data-visit-decided-about="">{point.label}</p>
              <ChainDone steps={decidedSteps.slice(0, -1)} />
              <VisitDecisionControls
                point={point}
                decision={shown.decision}
                surface="queue"
                isEnglish={isEnglish}
                onClear={onClear ? () => onClear(shown) : undefined}
              />
            </div>
          )}
        </div>
        <RowLink point={point} isEnglish={isEnglish} detailOpen={open} {...(onOpenDetail ? { onOpenDetail } : {})} />
      </div>
      {detail ? <div className={rowStyles.detail}>{detail}</div> : null}
    </Element>
  )
}

/**
 * A point with nothing to decide today, on the same line as one that has — so
 * 02's 四支柱 are four rows whatever their state. Absent points (不適用) are
 * muted, as on the map.
 */
export function PointBox({
  point,
  isEnglish,
  sourceOfPage,
  detail,
  onOpenDetail,
  detailOpen,
}: {
  point: DecisionPointView
  isEnglish: boolean
  sourceOfPage: DecisionPointView['source']
  detail?: ReactNode
  onOpenDetail?: (point: DecisionPointView) => void
  /** The box's card is open, drawn by the caller outside the box. */
  detailOpen?: boolean
}) {
  const absent = point.state === 'not-applicable' || point.state === 'not-included'
  const open = detailOpen ?? Boolean(detail)
  return (
    <div data-visit-point-box={point.dp} data-state={point.state} className="scroll-mt-2">
      <div className={cn(rowStyles.row, absent && rowStyles.absent, open && rowStyles.open)}>
        <RowLead point={point} sourceOfPage={sourceOfPage} />
        <span className={rowStyles.state}><StatePill state={point.state} isEnglish={isEnglish} /></span>
        <div className={cn(rowStyles.main, 'space-y-0.5')}>
          <p className={cn('text-sm leading-snug', absent ? 'text-muted-foreground' : 'text-foreground')}>{point.headline ?? point.label}</p>
          {point.why && !absent ? <p className="text-xs leading-relaxed text-muted-foreground">{point.why}</p> : null}
        </div>
        <RowLink point={point} isEnglish={isEnglish} detailOpen={open} {...(onOpenDetail ? { onOpenDetail } : {})} />
      </div>
      {detail ? <div className={rowStyles.detail}>{detail}</div> : null}
    </div>
  )
}
