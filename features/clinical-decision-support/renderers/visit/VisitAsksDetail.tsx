"use client"

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { effectiveAnswer } from './visit-decisions'
import type { VisitAnswers, VisitAsk, VisitStage } from '../../types'

/**
 * The ask values that open the fuller questions: breathlessness worse, weight
 * up, AF symptoms or bleeding present. These are the answer ids the brief fixes
 * for the every-visit asks (`applyVisitAnswers` writes them as facts), matched
 * as wire values, never as wording.
 */
const OPENING_ANSWERS: Readonly<Partial<Record<VisitAsk['id'], string>>> = {
  'dyspnoea-trend': 'worse',
  'weight-trend': 'up',
  'af-symptoms': 'yes',
  bleeding: 'yes',
}

/** The asks whose answer opens the fuller questions, with the option the pack worded. */
export function openingAnswers(asks: readonly VisitAsk[], answers: VisitAnswers): { ask: VisitAsk; label: string }[] {
  return asks.flatMap((ask) => {
    const { value } = effectiveAnswer(ask, answers)
    if (!value || OPENING_ANSWERS[ask.id] !== value) return []
    const option = ask.options.find((candidate) => candidate.value === value)
    return option ? [{ ask, label: option.label }] : []
  })
}

/** A first assessment asks the whole checklist; later visits fold it. */
export function isFirstAssessment(stage: VisitStage): boolean {
  return stage === 'suspected' || stage === 'baseline'
}

/**
 * DP-03's fuller half, under the two asks: the symptom, sign and NYHA
 * questions (AF: symptoms, bleeding and adverse effects) the page already has,
 * folded to one line at a follow-up visit. It opens by itself at a first
 * assessment, and whenever an ask comes back worse — and says which, in one
 * line, so the change on screen has a reason on screen.
 */
export function VisitAsksDetail({
  id,
  label,
  content,
  openCount,
  firstAssessment,
  asks,
  answers,
  isEnglish,
  open,
  onToggle,
}: {
  id: string
  label: string
  content: ReactNode
  /** Questions still unanswered inside, when the content knows. */
  openCount?: number
  /** Whether this visit asks the whole checklist (the screen decides: stage, page, gate). */
  firstAssessment: boolean
  asks: readonly VisitAsk[]
  answers: VisitAnswers
  isEnglish: boolean
  open: boolean
  onToggle: (open: boolean) => void
}) {
  const opening = openingAnswers(asks, answers)
  const reason = opening.length
    ? `${opening.map((item) => `${item.ask.label}${isEnglish ? ' ' : ''}${item.label}`).join(isEnglish ? ', ' : '、')}${isEnglish ? ': opened for the fuller assessment' : '，已展開完整評估'}`
    : firstAssessment
      ? (isEnglish ? 'First assessment: opened in full' : '初次評估，已完整展開')
      : undefined
  // At a follow-up these questions are optional; a pending count would read as
  // unfinished work. It shows only when the visit calls for them.
  const showCount = Boolean(reason) && typeof openCount === 'number' && openCount > 0
  // A <details> rather than a button-and-region: the questions inside are the
  // same ones other cards jump to (「前往第 2 題」, 「記錄喘的細節」), and that
  // jump opens every folded <details> on its way. The open state is still the
  // screen's, kept in step through `onToggle`.
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open !== open) onToggle(event.currentTarget.open)
      }}
      className="rounded-md border border-border"
      data-testid="cdss-visit-asks-detail"
    >
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        data-testid="cdss-visit-asks-detail-toggle"
      >
        <span className="min-w-0 flex-1">
          {label}
          {showCount ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {isEnglish ? `${openCount} pending` : `${openCount} 題待補`}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
          aria-hidden="true"
        />
      </summary>
      {reason ? (
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground" data-testid="cdss-visit-asks-detail-reason">
          {reason}
        </p>
      ) : null}
      <div className="border-t border-border">
        {content}
      </div>
    </details>
  )
}
