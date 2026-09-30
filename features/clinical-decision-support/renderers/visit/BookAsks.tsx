"use client"

import { useId } from 'react'
import { effectiveAnswer } from './visit-decisions'
import type { VisitAnswerProvenance } from './VisitAsks'
import type { VisitAnswers, VisitAsk } from '../../types'
import styles from './VisitBookLayout.module.css'

/**
 * The pocket-handbook page's every-visit questions (`?visit=book`): the pack's
 * asks and nothing else, drawn as the prototype draws them — one row each, its
 * answers one segmented control, in place of the map's asks card (owner request
 * 2026-09-30: 「原本的 UI 跟問題那些都廢棄了，包含 DP03」). The page's fuller
 * questions beside them (「其他症狀、徵象與 NYHA」) stay one fold below, drawn
 * by the screen: a layout change does not drop an input (#219 review).
 *
 * The answers mean what they mean everywhere else: the record's reading (the
 * pack's prefill) stands selected with its basis, and one press makes it the
 * clinician's; pressing the clinician's own answer again withdraws it; an
 * answer given today on another disease's page shows here with where it was
 * given.
 */
export function BookAsks({
  asks,
  answers,
  isEnglish,
  onAnswer,
  pagePackId,
  sources,
}: {
  asks: readonly VisitAsk[]
  answers: VisitAnswers
  isEnglish: boolean
  onAnswer?: (id: VisitAsk['id'], value: string | null) => void
  pagePackId?: string
  sources?: VisitAnswerProvenance
}) {
  const idBase = useId()
  if (asks.length === 0) return null
  return (
    <div className={styles.asks} data-testid="cdss-book-asks">
      {asks.map((ask) => {
        const { value, prefilled } = effectiveAnswer(ask, answers)
        const labelId = `${idBase}-${ask.id}`
        const source = !prefilled && value ? sources?.[ask.id] : undefined
        const elsewhere = source?.packId && pagePackId && source.packId !== pagePackId ? source : undefined
        return (
          <div key={ask.id} className={styles.askRow} data-book-ask={ask.id} data-answered={value ? 'true' : 'false'}>
            <span id={labelId} className={styles.askLabel}>{ask.label}</span>
            <div role="group" aria-labelledby={labelId} className={styles.askGroup}>
              {ask.options.map((option) => {
                const selected = option.value === value
                const fromRecord = selected && prefilled
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={!onAnswer}
                    onClick={() => onAnswer?.(ask.id, selected && !prefilled ? null : option.value)}
                    data-book-ask-option={option.value}
                    data-prefilled={fromRecord ? 'true' : undefined}
                  >
                    {option.label}
                    {fromRecord ? <span className="sr-only">{isEnglish ? ' (from the record)' : '（紀錄預填）'}</span> : null}
                  </button>
                )
              })}
            </div>
            {prefilled && ask.prefill ? (
              <span className={styles.askNote}>{isEnglish ? 'From the record · ' : '紀錄帶入 · '}{ask.prefill.basis}</span>
            ) : elsewhere ? (
              <span className={styles.askNote}>
                {isEnglish
                  ? `Answered on the ${elsewhere.pageLabel ?? elsewhere.packId} page`
                  : `已在「${elsewhere.pageLabel ?? elsewhere.packId}」頁回答`}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
