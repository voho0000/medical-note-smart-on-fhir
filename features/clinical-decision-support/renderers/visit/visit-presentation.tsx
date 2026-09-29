"use client"

import { cn } from '@/src/shared/utils/cn.utils'
import { statusStyle } from '../status-presentation'
import { stateLabel } from './visit-decisions'
import type { ChainStep, ChainStepId, DecisionPointState } from '../../types'

/**
 * The CDSS pages' filled button, in the tint of the map's 「需處理」 label
 * rather than a solid fill that outweighs the card around it (clinician
 * feedback 2026-09-28: the dark blue 「跟決策地圖 UI 風格不太符合」). Used with
 * the outline variant, beside outlined alternatives; the selected side of a
 * 診斷／追蹤 switch wears it too.
 */
export const TINTED_PRIMARY = 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:border-primary/50 dark:bg-primary/15 dark:text-primary dark:hover:bg-primary/25'
/** The same on a safety row, in the 「安全」 label's tint. */
export const TINTED_SAFETY = 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/50 dark:bg-destructive/20 dark:text-destructive dark:hover:bg-destructive/30'

/**
 * State pills reuse the module badges' tints where the meaning is the same —
 * a thing to do, data or an answer awaited, settled, a clinician's call — so a
 * clinician who learned the badge on one layout reads it on this one. The text
 * always names the state; the tint only repeats it.
 */
const PILL_STYLE: Record<DecisionPointState, string> = {
  safety: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  act: statusStyle.actionable,
  confirm: 'border border-dashed border-foreground/40 bg-background text-foreground',
  ask: statusStyle['needs-data'],
  waiting: 'bg-muted text-muted-foreground',
  done: statusStyle['no-action'],
  info: 'bg-muted text-muted-foreground',
  'not-applicable': 'border border-dashed border-border text-muted-foreground',
  'not-included': 'border border-dashed border-border text-muted-foreground',
}

export function StatePill({
  state,
  isEnglish,
  decided = false,
  inQueue = false,
  className,
}: {
  state: DecisionPointState
  isEnglish: boolean
  /** A point decided today reads 「已記錄」, whatever state the pack gave it. */
  decided?: boolean
  /**
   * A waiting step the queue has moved on to reads as today's, not as
   * waiting — as does a settled point a queued step decides anew (DP-08's
   * agent, once 「改用其他 DOAC」 opens the switch).
   */
  inQueue?: boolean
  className?: string
}) {
  const promoted = !decided && inQueue && (state === 'waiting' || state === 'done')
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-[11px] font-semibold',
        decided ? statusStyle['no-action'] : promoted ? PILL_STYLE.act : PILL_STYLE[state],
        className,
      )}
    >
      {decided
        ? (isEnglish ? 'Recorded' : '已記錄')
        : promoted
          ? (isEnglish ? 'Today' : '今天要決定')
          : stateLabel(state, isEnglish)}
    </span>
  )
}

const STEP_NAMES: Record<ChainStepId, { zh: string; en: string }> = {
  whether: { zh: '要不要', en: 'Whether' },
  which: { zh: '哪一種', en: 'Which' },
  dose: { zh: '劑量', en: 'Dose' },
}

const STEP_STATE_NAMES: Record<ChainStep['state'], { zh: string; en: string }> = {
  done: { zh: '完成', en: 'done' },
  current: { zh: '目前', en: 'current' },
  later: { zh: '之後', en: 'later' },
  blocked: { zh: '受阻', en: 'blocked' },
}

export function ChainStepName({ id, isEnglish }: { id: ChainStepId; isEnglish: boolean }) {
  return <>{isEnglish ? STEP_NAMES[id].en : STEP_NAMES[id].zh}</>
}

const DOT_STYLE: Record<ChainStep['state'], string> = {
  done: 'border-foreground bg-foreground',
  current: 'border-amber-700 bg-amber-400 dark:border-amber-300',
  later: 'border-muted-foreground/60 bg-background',
  blocked: 'border-destructive bg-background',
}

/** The chain as three dots — 要不要 · 哪一種 · 劑量 — with the words for readers who cannot see them. */
export function ChainDots({ chain, isEnglish }: { chain?: readonly ChainStep[]; isEnglish: boolean }) {
  if (!chain?.length) return null
  const spoken = chain
    .map((step) => `${isEnglish ? STEP_NAMES[step.id].en : STEP_NAMES[step.id].zh}${isEnglish ? ' ' : '：'}${isEnglish ? STEP_STATE_NAMES[step.state].en : STEP_STATE_NAMES[step.state].zh}`)
    .join(isEnglish ? ', ' : '；')
  return (
    <span className="inline-flex items-center gap-1" data-chain={chain.map((step) => step.state).join(',')}>
      {chain.map((step) => (
        <span
          key={step.id}
          aria-hidden="true"
          className={cn('inline-block h-2 w-2 rounded-full border', DOT_STYLE[step.state])}
        />
      ))}
      <span className="sr-only">{spoken}</span>
    </span>
  )
}
