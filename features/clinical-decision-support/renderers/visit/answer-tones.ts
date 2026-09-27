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

/**
 * Chosen: the same family one step deeper, a 2px border in the tone and bold
 * ink — soft enough to sit beside the section colours, never a solid block of
 * saturated colour.
 */
const CHOSEN: Readonly<Record<AnswerTone, string>> = {
  concern: 'border-rose-500 bg-rose-100 text-rose-900 hover:bg-rose-100 dark:border-rose-400 dark:bg-rose-900/60 dark:text-rose-100',
  neutral: 'border-slate-500 bg-slate-200 text-slate-900 hover:bg-slate-200 dark:border-slate-300 dark:bg-slate-700 dark:text-slate-50',
  reassuring: 'border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-400 dark:bg-emerald-900/60 dark:text-emerald-100',
  change: 'border-sky-500 bg-sky-100 text-sky-900 hover:bg-sky-100 dark:border-sky-400 dark:bg-sky-900/60 dark:text-sky-100',
}

/**
 * A choice button's colours: tinted while open, one step deeper with a 2px
 * border once chosen, the border dashed while it is the record's reading and
 * not yet the clinician's answer.
 */
export function answerToneClass(tone: AnswerTone, selected: boolean, prefilled = false): string {
  return cn(
    selected ? cn(CHOSEN[tone], 'border-2 font-semibold') : IDLE[tone],
    selected && prefilled && 'border-dashed',
  )
}
