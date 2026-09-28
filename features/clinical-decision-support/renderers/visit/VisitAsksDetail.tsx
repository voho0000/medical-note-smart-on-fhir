"use client"

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { effectiveAnswer } from './visit-decisions'
import { StatePill } from './visit-presentation'
import rowStyles from './point-rows.module.css'
import type { DecisionPointState, VisitAnswers, VisitAsk, VisitStage } from '../../types'

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
 * folded at a follow-up visit. It opens by itself at a first assessment, and
 * whenever an ask comes back worse — and says which, in one line, so the change
 * on screen has a reason on screen.
 *
 * Drawn as the map draws a point (clinician feedback 2026-09-28: the plain
 * folded row was 「好不顯眼，UI 上也跟決策地圖不搭」), on one line in the map's
 * columns (「用一行式，設成預設」): its DP code and name, the state in the map's
 * pill with what is still open, and the fold mark every row ends with.
 */
export function VisitAsksDetail({
  id,
  dp = 'DP-03',
  label,
  content,
  openCount,
  pendingLabels,
  firstAssessment,
  asks,
  answers,
  isEnglish,
  open,
  onToggle,
}: {
  id: string
  /** The decision point these questions complete. */
  dp?: string
  label: string
  content: ReactNode
  /** Questions still unanswered inside, when the content knows. */
  openCount?: number
  /** Their short names (症狀、徵象、NYHA…), when the content knows them. */
  pendingLabels?: readonly string[]
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
  const sep = isEnglish ? ', ' : '、'
  const pending = typeof openCount === 'number' ? openCount : undefined
  const names = pendingLabels && pendingLabels.length > 0 ? pendingLabels.join(sep) : undefined
  // The state, in the map's own words. At a follow-up these questions are
  // optional and a pending count would read as unfinished work, so it is
  // 「供參考」 until the visit calls for them (a first assessment, an ask
  // come back worse); then what is open is named, 「等你回答」.
  const state: DecisionPointState = pending === 0 ? 'done' : reason ? 'ask' : 'info'
  const headline = pending === 0
    ? (isEnglish ? 'All answered' : '已填完')
    : reason
      ? names
        ? (isEnglish ? `To answer: ${names}` : `待補：${names}`)
        : pending !== undefined
          ? (isEnglish ? `${pending} to answer` : `${pending} 題待補`)
          : (isEnglish ? 'Open to answer' : '展開填寫')
      : names
        ? (isEnglish ? `Optional: ${names}` : `選填：${names}`)
        : (isEnglish ? 'Optional at a follow-up' : '追蹤時選填')
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
      className={cn(
        'scroll-mt-2 rounded-md border bg-background',
        state === 'ask' ? 'border-amber-400/70 dark:border-amber-400/50' : 'border-border',
      )}
      data-testid="cdss-visit-asks-detail"
      data-state={state}
    >
      {/* One line, in the same four columns as the map's rows. */}
      <summary
        className={cn(rowStyles.row, 'cursor-pointer list-none rounded-md hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden')}
        data-testid="cdss-visit-asks-detail-toggle"
      >
        <span className={rowStyles.lead}>
          <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{dp}</span>
          <span className="min-w-0 text-sm font-medium leading-snug text-foreground">{label}</span>
        </span>
        <span className={rowStyles.state}><StatePill state={state} isEnglish={isEnglish} /></span>
        <span className={cn(rowStyles.main, 'space-y-0.5')}>
          <span className={cn('block text-sm leading-snug text-foreground', state === 'ask' && 'font-semibold')} data-testid="cdss-visit-asks-detail-headline">{headline}</span>
          {reason ? (
            <span className="block text-xs leading-relaxed text-muted-foreground" data-testid="cdss-visit-asks-detail-reason">{reason}</span>
          ) : null}
        </span>
        {/* The fold mark alone, as every row of the map ends. */}
        <span className={cn(rowStyles.link, 'h-8 w-8 justify-center text-muted-foreground')}>
          <span className="sr-only">{open ? (isEnglish ? 'Fold' : '收合') : (isEnglish ? 'Open' : '展開')}</span>
          <ChevronDown
            className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="border-t border-border">
        {content}
      </div>
    </details>
  )
}
