import { cn } from '@/src/shared/utils/cn.utils'
import type { VisitAnswers, VisitAsk } from '../../types'

/**
 * What an answer means for the visit: a change that asks for action today
 * (喘變差, 體重增加, 有症狀／出血), no change, a reassuring one (喘進步), and a
 * change that is neither (體重減少 — decongestion, or dehydration and wasting).
 * The label always says the same thing in words; colour never stands alone.
 */
export type AnswerTone = 'concern' | 'neutral' | 'reassuring' | 'change'

/**
 * The tone of each every-visit answer, typed against the pack's own answer
 * values: if the pack renames one, this stops compiling.
 */
const VISIT_ANSWER_TONES: { readonly [K in VisitAsk['id']]-?: Readonly<Record<NonNullable<VisitAnswers[K]>, AnswerTone>> } = {
  'dyspnoea-trend': { worse: 'concern', stable: 'neutral', better: 'reassuring' },
  'weight-trend': { up: 'concern', same: 'neutral', down: 'change' },
  'af-symptoms': { yes: 'concern', no: 'neutral' },
  bleeding: { yes: 'concern', no: 'neutral' },
}

export function visitAnswerTone(id: VisitAsk['id'], value: string): AnswerTone {
  return (VISIT_ANSWER_TONES[id] as Readonly<Record<string, AnswerTone>>)[value] ?? 'neutral'
}

/*
 * DESIGN.md: one interaction blue for selection; red, amber and green only
 * for clinical risk, warning and settled state; shared tokens, restrained
 * backgrounds. So a chosen answer wears the page's own selected tint — the
 * `bg-primary/10 text-primary` every segmented choice uses — and only an
 * answer that is a clinical warning wears the risk colour.
 */
const SELECTED = 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/10 dark:bg-primary/15'
const SELECTED_RISK = 'border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/10 dark:bg-destructive/20'
const OPEN = 'border-border bg-card text-foreground hover:bg-muted/40'

const IDLE: Readonly<Record<AnswerTone, string>> = { concern: OPEN, neutral: OPEN, reassuring: OPEN, change: OPEN }

const CHOSEN: Readonly<Record<AnswerTone, string>> = { concern: SELECTED_RISK, neutral: SELECTED, reassuring: SELECTED, change: SELECTED }

/**
 * A choice button's colours at the page's own size (1px border, no icon):
 * open, chosen, and — while it is the record's reading, not yet the
 * clinician's answer — chosen with a dashed border.
 */
export function answerToneClass(tone: AnswerTone, selected: boolean, prefilled = false): string {
  return cn(
    selected ? cn(CHOSEN[tone], 'font-semibold') : IDLE[tone],
    selected && prefilled && 'border-dashed',
  )
}
