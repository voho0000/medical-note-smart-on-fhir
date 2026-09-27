"use client"

import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/src/shared/utils/cn.utils'
import type { PointDecision } from './visit-decisions'
import { withinDaysLabel } from './visit-decisions'
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
              {isEnglish ? ', ' : '，'}
              {withinDaysLabel(check.withinDays, isEnglish)}
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

  const showOthers = others.length > 0 && surface === 'queue' && otherOpen
  return (
    <div ref={containerRef} className="min-w-0 space-y-2" data-testid="cdss-visit-controls">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={primaryRef}
          type="button"
          className="h-11 min-w-11 px-4 text-sm font-semibold shadow-none"
          disabled={readOnly}
          onClick={() => decide(primary)}
          data-visit-primary={point.dp}
          data-visit-action={primary.id}
        >
          {primary.label}
        </Button>
        {others.length > 0 && surface === 'queue' ? (
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
        {surface === 'map'
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
