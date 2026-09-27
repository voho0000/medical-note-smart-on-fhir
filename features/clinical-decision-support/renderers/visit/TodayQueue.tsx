"use client"

import { useLayoutEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/src/shared/utils/cn.utils'
import type { QueueRow, QueueStep } from './visit-decisions'
import type { DecisionPointView, VisitAction } from '../../types'
import { VisitDecisionControls } from './VisitDecisionControls'

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
}: {
  rows: readonly QueueRow[]
  isEnglish: boolean
  /** The page's own pack; a row from the companion pack is labelled with its source. */
  sourceOfPage: DecisionPointView['source']
  onDecide?: (step: QueueStep, action: VisitAction) => void
  onClear?: (step: QueueStep) => void
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
  return (
    <section aria-labelledby="cdss-visit-queue-title" className="space-y-2" data-testid="cdss-visit-queue">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3
          id="cdss-visit-queue-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isEnglish ? 'To decide today' : '今天要決定'}
        </h3>
        {rows.length ? (
          <span className="text-xs tabular-nums text-muted-foreground" role="status" data-testid="cdss-visit-queue-progress">
            {isEnglish
              ? `${rows.length - pending}/${rows.length} decided`
              : `已決定 ${rows.length - pending}/${rows.length}`}
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-2.5 text-sm text-muted-foreground" data-testid="cdss-visit-queue-empty">
          {isEnglish ? 'Nothing to decide today.' : '今天沒有要決定的事。'}
        </p>
      ) : (
        <ol ref={listRef} className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {rows.map((row) => {
            const current = row.current
            const decidedSteps = row.steps.filter((step) => step.decision)
            const shown = current ?? row.steps[row.steps.length - 1]
            const point = shown.point
            return (
              <li
                key={row.key}
                className={cn(
                  'space-y-2 px-3 py-2.5',
                  row.safety && current && 'bg-destructive/5',
                )}
                data-visit-queue-row={row.key}
                data-visit-queue-dp={row.steps[0].point.dp}
                data-visit-current-dp={current?.point.dp}
                data-visit-queue-state={point.state}
                data-decided={current ? 'false' : 'true'}
              >
                {current ? (
                  <>
                    {decidedSteps.map((step) => (
                      <p key={step.key} className="flex items-center gap-1.5 text-xs text-muted-foreground" data-visit-chain-done={step.point.dp}>
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                        <span className="font-mono">{step.point.dp}</span>
                        <span>{step.decision?.record.actionLabel ?? step.decision?.action.label}</span>
                      </p>
                    ))}
                    <div className="flex min-w-0 gap-2.5">
                      <span className="mt-0.5 w-12 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                        {point.dp}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex flex-wrap items-center gap-1.5">
                          {row.safety ? (
                            <Badge variant="destructive" className="h-5 px-1.5 text-[11px]">
                              {isEnglish ? 'Safety' : '安全'}
                            </Badge>
                          ) : null}
                          {point.source !== sourceOfPage ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[11px]">{point.source.toUpperCase()}</Badge>
                          ) : null}
                          <span className="text-sm font-semibold leading-snug text-foreground" data-visit-headline="">
                            {point.headline ?? point.label}
                          </span>
                        </p>
                        {point.why ? (
                          <p className="text-xs leading-relaxed text-muted-foreground" data-visit-why="">{point.why}</p>
                        ) : null}
                        <VisitDecisionControls
                          point={point}
                          surface="queue"
                          isEnglish={isEnglish}
                          onDecide={onDecide && current ? (action) => {
                            focusFrom.current = row.key
                            onDecide(current, action)
                          } : undefined}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex min-w-0 gap-2.5">
                    <span className="mt-1 w-12 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                      {point.dp}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* What the decision was about, so 「✓ 改 2.5 mg bid」 is never a dose with no drug. */}
                      <p className="text-xs text-muted-foreground" data-visit-decided-about="">{point.label}</p>
                      {decidedSteps.slice(0, -1).map((step) => (
                        <p key={step.key} className="flex items-center gap-1.5 text-xs text-muted-foreground" data-visit-chain-done={step.point.dp}>
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                          <span className="font-mono">{step.point.dp}</span>
                          <span>{step.decision?.record.actionLabel ?? step.decision?.action.label}</span>
                        </p>
                      ))}
                      <VisitDecisionControls
                        point={point}
                        decision={shown.decision}
                        surface="queue"
                        isEnglish={isEnglish}
                        onClear={onClear ? () => {
                          focusFrom.current = row.key
                          onClear(shown)
                        } : undefined}
                      />
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
