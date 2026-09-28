"use client"

import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import type { PointDecision } from './visit-decisions'
import { checkIntervalSuffix } from './visit-decisions'
import type { DecisionPointView, VisitAction } from '../../types'

export interface VisitDecisionControlsProps {
  point: DecisionPointView
  /** Today's decision on this point, from the one store both surfaces read. */
  decision?: PointDecision
  /**
   * Where the controls sit. The queue offers the primary action and folds the
   * others behind 「其他」; the opened map cell has room to show them all. The
   * decision they record is the same either way.
   */
  surface: 'queue' | 'map'
  isEnglish: boolean
  onDecide?: (action: VisitAction) => void
  onClear?: () => void
  primaryRef?: Ref<HTMLButtonElement>
}

/**
 * The one decision control. A queue row and the map cell it belongs to both
 * render this, over the same record: the primary button records `actions[0]`,
 * 「其他」 offers the rest, and a recorded decision collapses to 「✓ 決定 ·
 * 回應檢查：…」 with 「改」 to take it back. Every word on a button is the pack's.
 */
export function VisitDecisionControls({
  point,
  decision,
  surface,
  isEnglish,
  onDecide,
  onClear,
  primaryRef,
}: VisitDecisionControlsProps) {
  const otherId = useId()
  const [otherOpen, setOtherOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const decidedRef = useRef<HTMLParagraphElement>(null)
  const hadDecision = useRef(Boolean(decision))
  const [primary, ...others] = point.actions
  const readOnly = !onDecide

  // A decision taken on the opened card collapses the buttons it was taken
  // with, and focus would fall to the page; it follows to the line that now
  // states the decision instead. The queue moves focus itself, to the next row.
  useEffect(() => {
    const was = hadDecision.current
    hadDecision.current = Boolean(decision)
    if (surface !== 'map' || was || !decision) return
    const active = document.activeElement
    if (!active || active === document.body || containerRef.current?.contains(active)) {
      decidedRef.current?.focus()
    }
  }, [decision, surface])

  if (decision) {
    const check = decision.record.responseCheck
    return (
      <div ref={containerRef} className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1" data-testid="cdss-visit-decided">
        <p
          ref={decidedRef}
          tabIndex={-1}
          className="min-w-0 flex-1 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-visit-decided={decision.action.id}
        >
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300">
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">{isEnglish ? 'Decided: ' : '已決定：'}</span>
            {decision.record.actionLabel ?? decision.action.label}
          </span>
          {check ? (
            <span className="block text-xs text-muted-foreground" data-visit-response-check="">
              {isEnglish ? 'Response check: ' : '回應檢查：'}
              {check.text}
              {checkIntervalSuffix(check.withinDays, isEnglish)}
            </span>
          ) : null}
          {decision.record.reopenWhen ? (
            <span className="block text-xs text-muted-foreground">
              {isEnglish ? 'Reopen when: ' : '重新評估：'}
              {decision.record.reopenWhen}
            </span>
          ) : null}
        </p>
        {onClear ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 min-w-11 px-3 shadow-none"
            onClick={onClear}
            aria-label={isEnglish ? `Change the decision on ${point.dp}` : `改 ${point.dp} 的決定`}
            data-visit-change={point.dp}
          >
            {isEnglish ? 'Change' : '改'}
          </Button>
        ) : null}
      </div>
    )
  }

  if (!primary) return null

  const decide = (action: VisitAction) => onDecide?.(action)

  // A question (懷疑 HF？ 是／否) has answers, not a recommendation: every
  // answer is shown, all alike, with none of them made the obvious one.
  const question = point.actions.length > 1 && point.actions.every((action) => (
    action.physicianInput && action.physicianInput.request === primary.physicianInput?.request
  ))
  if (question) {
    return (
      <div ref={containerRef} className="flex flex-wrap items-center gap-2" data-testid="cdss-visit-controls" data-visit-question="">
        {point.actions.map((action, index) => (
          <Button
            key={action.id}
            ref={index === 0 ? primaryRef : undefined}
            type="button"
            variant="outline"
            className="h-11 min-w-16 px-4 text-sm shadow-none"
            disabled={readOnly}
            onClick={() => decide(action)}
            data-visit-primary={index === 0 ? point.dp : undefined}
            data-visit-action={action.id}
          >
            {action.label}
          </Button>
        ))}
      </div>
    )
  }

  // 「其他」 folds alternatives only when there are enough to crowd the row;
  // one or two sit beside the recommendation, never one press away behind it.
  const folded = surface === 'queue' && others.length >= 3
  // The recommendation in the map's own tint — the colour of its 「需處理」
  // (or, on a safety row, 「安全」) label — rather than a solid fill that
  // outweighs the card it sits in (clinician feedback 2026-09-28). Still the
  // one filled button beside outlined alternatives.
  const primaryTone = point.state === 'safety'
    ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/50 dark:bg-destructive/20 dark:text-destructive dark:hover:bg-destructive/30'
    : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:border-primary/50 dark:bg-primary/15 dark:text-primary dark:hover:bg-primary/25'
  const showOthers = folded && otherOpen
  return (
    <div ref={containerRef} className="min-w-0 space-y-2" data-testid="cdss-visit-controls">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={primaryRef}
          type="button"
          variant="outline"
          className={cn('h-11 min-w-11 px-4 text-sm font-semibold shadow-none', primaryTone)}
          disabled={readOnly}
          onClick={() => decide(primary)}
          data-visit-primary={point.dp}
          data-visit-action={primary.id}
        >
          {primary.label}
        </Button>
        {folded ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 min-w-11 gap-1 px-3 shadow-none"
            aria-expanded={otherOpen}
            aria-controls={otherId}
            onClick={() => setOtherOpen((open) => !open)}
            data-visit-other={point.dp}
          >
            {isEnglish ? 'Other' : '其他'}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', otherOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </Button>
        ) : null}
        {!folded
          ? others.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              className="h-11 min-w-11 px-3 shadow-none"
              disabled={readOnly}
              onClick={() => decide(action)}
              data-visit-action={action.id}
            >
              {action.label}
            </Button>
          ))
          : null}
      </div>
      {showOthers ? (
        <div
          id={otherId}
          role="group"
          aria-label={isEnglish ? `Other decisions for ${point.dp}` : `${point.dp} 的其他決定`}
          className="flex flex-wrap gap-2"
        >
          {others.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              className="h-11 min-w-11 px-3 shadow-none"
              disabled={readOnly}
              onClick={() => decide(action)}
              data-visit-action={action.id}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
