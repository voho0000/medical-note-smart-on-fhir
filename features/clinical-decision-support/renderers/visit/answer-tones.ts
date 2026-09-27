import { cn } from '@/src/shared/utils/cn.utils'
import type { VisitAnswers, VisitAsk } from '../../types'

/**
 * What an answer means for the visit, shown as its colour so the three
 * choices read apart at a glance: a change that asks for action today
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

const IDLE: Readonly<Record<AnswerTone, string>> = {
  concern: 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/70',
  neutral: 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/70',
  reassuring: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/70',
  change: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/70',
}

const CHOSEN: Readonly<Record<AnswerTone, string>> = {
  concern: 'border-rose-700 bg-rose-700 text-white dark:border-rose-500 dark:bg-rose-600',
  neutral: 'border-slate-700 bg-slate-700 text-white dark:border-slate-400 dark:bg-slate-500',
  reassuring: 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500 dark:bg-emerald-600',
  change: 'border-sky-700 bg-sky-700 text-white dark:border-sky-500 dark:bg-sky-600',
}

/** The record's reading, not yet the clinician's answer: the same colour, outlined dashed. */
const PREFILLED_OUTLINE: Readonly<Record<AnswerTone, string>> = {
  concern: 'outline-rose-700 dark:outline-rose-400',
  neutral: 'outline-slate-700 dark:outline-slate-300',
  reassuring: 'outline-emerald-700 dark:outline-emerald-400',
  change: 'outline-sky-700 dark:outline-sky-400',
}

/** A choice button's colours: tinted while open, filled once chosen. */
export function answerToneClass(tone: AnswerTone, selected: boolean, prefilled = false): string {
  return cn(
    selected ? cn(CHOSEN[tone], 'font-semibold') : IDLE[tone],
    selected && prefilled && cn('outline-2 outline-dashed outline-offset-2', PREFILLED_OUTLINE[tone]),
  )
}
