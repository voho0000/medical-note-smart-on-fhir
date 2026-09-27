"use client"

import { cn } from '@/src/shared/utils/cn.utils'
import { effectiveAnswer } from './visit-decisions'
import { answerToneClass, visitAnswerTone } from './answer-tones'
import type { VisitAnswers, VisitAsk } from '../../types'

/**
 * The questions asked at every visit. A value the record already holds is
 * shown selected and marked as the record's, with the pack's basis beside it;
 * it counts as answered, and one press replaces it. Pressing the chosen answer
 * again withdraws the clinician's answer, and the record's reading — if the
 * pack has one — stands again.
 */
export function VisitAsks({
  asks,
  answers,
  isEnglish,
  onAnswer,
}: {
  asks: readonly VisitAsk[]
  answers: VisitAnswers
  isEnglish: boolean
  onAnswer?: (id: VisitAsk['id'], value: string | null) => void
}) {
  if (asks.length === 0) return null
  return (
    <section
      className="space-y-2"
      aria-label={isEnglish ? 'Asked at every visit' : '每次必問'}
      data-testid="cdss-visit-asks"
    >
      {asks.map((ask) => {
        const { value, prefilled } = effectiveAnswer(ask, answers)
        const labelId = `cdss-visit-ask-${ask.id}`
        return (
          <div
            key={ask.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
            data-visit-ask-row={ask.id}
            data-answered={value ? 'true' : 'false'}
          >
            <span id={labelId} className="min-w-[4.5rem] text-sm font-semibold text-foreground">
              {ask.label}
            </span>
            <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
              {ask.options.map((option) => {
                const selected = option.value === value
                const fromRecord = selected && prefilled
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={!onAnswer}
                    onClick={() => {
                      if (!onAnswer) return
                      // Pressing the clinician's own answer again withdraws it;
                      // pressing the record's reading confirms it as an answer.
                      onAnswer(ask.id, selected && !prefilled ? null : option.value)
                    }}
                    className={cn(
                      'inline-flex h-11 min-w-16 items-center justify-center rounded-md border px-3.5 text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      'disabled:pointer-events-none disabled:opacity-60',
                      answerToneClass(visitAnswerTone(ask.id, option.value), selected, fromRecord),
                    )}
                    data-visit-ask={ask.id}
                    data-value={option.value}
                    data-prefilled={fromRecord ? 'true' : undefined}
                  >
                    {option.label}
                    {fromRecord ? (
                      <span className="sr-only">{isEnglish ? ' (from the record)' : '（紀錄預填）'}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            {prefilled && ask.prefill ? (
              <span className="text-xs text-muted-foreground" data-visit-prefill-basis={ask.id}>
                {isEnglish ? 'Prefilled · ' : '預填 · '}
                {ask.prefill.basis}
              </span>
            ) : null}
          </div>
        )
      })}
    </section>
  )
}
