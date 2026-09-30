"use client"

import { useId, useState } from 'react'
import styles from './VisitBookLayout.module.css'

/** One symptom or sign, by the term `signAnswers` stores it under. */
export interface BookSignItem {
  term: string
  label: string
  /** The short name 「更多」 lists it by. */
  short: string
  /** Asked at every visit; the rest wait under 「更多」. */
  common: boolean
}

export interface BookSignGroup {
  id: string
  title: string
  items: readonly BookSignItem[]
}

/** What a sign is answered: `present`／`absent`, or anything else (未評估, unanswered) as open. */
export type BookSignValue = string | undefined

/**
 * The HF symptoms and signs as the pocket-handbook page asks every yes／no
 * question (the prototype's DP-06 鬱血徵候 rows): one row each, 有／無 as one
 * segmented control, 全部皆無 beside the group's name, and the less typical
 * rows under 「更多」. The answers are the page's `signAnswers` — the same
 * ones 本次評估 writes — so a pressed answer pressed again withdraws it.
 */
export function BookSignQuestions({
  groups,
  answers,
  isEnglish,
  onAnswer,
}: {
  groups: readonly BookSignGroup[]
  answers: Readonly<Record<string, BookSignValue>>
  isEnglish: boolean
  /** A patch of terms, each `present`／`absent`, or null to withdraw. */
  onAnswer?: (patch: Record<string, 'present' | 'absent' | null>) => void
}) {
  const idBase = useId()
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  // What 全部皆無 overwrote, per group, so a second press puts it back.
  const [beforeNone, setBeforeNone] = useState<Record<string, Record<string, BookSignValue>>>({})
  const options = [
    { value: 'present' as const, label: isEnglish ? 'Yes' : '有' },
    { value: 'absent' as const, label: isEnglish ? 'No' : '無' },
  ]
  return (
    <div className={styles.signQuestions} data-testid="cdss-book-signs">
      {groups.map((group) => {
        // 全部皆無 covers every row not answered 有, the ones under 更多 too.
        const open = group.items.filter((item) => answers[item.term] !== 'present')
        const pressed = open.length > 0 && open.every((item) => answers[item.term] === 'absent') && Boolean(beforeNone[group.id])
        const anyYes = group.items.some((item) => answers[item.term] === 'present')
        const more = group.items.filter((item) => !item.common)
        const shown = opened[group.id] ? group.items : group.items.filter((item) => item.common || answers[item.term] === 'present' || answers[item.term] === 'absent')
        const hidden = more.filter((item) => !shown.includes(item))
        const toggleNone = () => {
          if (!onAnswer) return
          if (pressed) {
            const saved = beforeNone[group.id] ?? {}
            onAnswer(Object.fromEntries(open.map((item) => {
              const before = saved[item.term]
              return [item.term, before === 'present' || before === 'absent' ? before : null]
            })))
            setBeforeNone((current) => { const next = { ...current }; delete next[group.id]; return next })
            return
          }
          setBeforeNone((current) => ({ ...current, [group.id]: Object.fromEntries(open.map((item) => [item.term, answers[item.term]])) }))
          onAnswer(Object.fromEntries(open.map((item) => [item.term, 'absent' as const])))
        }
        return (
          <div key={group.id} className={styles.questions} data-book-sign-group={group.id}>
            <div className={styles.questionsHead}>
              <span className={styles.questionsTitle}>{group.title}</span>
              {onAnswer && open.length > 0 ? (
                <button type="button" className={styles.bulkNone} aria-pressed={pressed} onClick={toggleNone}>
                  {anyYes ? (isEnglish ? 'None of the rest' : '其餘皆無') : (isEnglish ? 'None of these' : '全部皆無')}
                  {pressed ? (isEnglish ? ' · press again to undo' : ' · 再按復原') : ''}
                </button>
              ) : null}
            </div>
            {shown.map((item) => {
              const value = answers[item.term]
              return (
                <div key={item.term} className={styles.questionRow} data-book-sign={item.term}>
                  <span id={`${idBase}-${item.term}`}>{item.label}</span>
                  <div role="group" aria-labelledby={`${idBase}-${item.term}`} className={styles.questionGroup}>
                    {options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={value === option.value}
                        disabled={!onAnswer}
                        onClick={() => onAnswer?.({ [item.term]: value === option.value ? null : option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {hidden.length > 0 ? (
              <button
                type="button"
                className={styles.moreRows}
                aria-expanded={false}
                onClick={() => setOpened((current) => ({ ...current, [group.id]: true }))}
              >
                {isEnglish ? `${hidden.length} more: ` : `更多 ${hidden.length} 項：`}{hidden.map((item) => item.short).join(isEnglish ? ', ' : '、')}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
