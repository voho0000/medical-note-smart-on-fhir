"use client"

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { SegmentedControl } from './SegmentedControl'
import type { VisitItem, VisitItemTag } from '../types'

/** The short tag in front of one item: which side, or which rulebook. */
export function ItemTag({
  tag,
  isEnglish,
  testId,
}: {
  tag: VisitItemTag
  isEnglish: boolean
  testId: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold leading-none',
        tag.className,
      )}
      title={isEnglish ? tag.legendEn : tag.legendZh}
      data-testid={testId}
    >
      {isEnglish ? tag.tagEn : tag.tagZh}
    </span>
  )
}

export type ItemAnswerValue = 'present' | 'absent' | 'not-assessed'

/**
 * One question's rows: a tag, the item, and 有／無／未評估.
 *
 * The 常見 rows are open; the rest fold behind 「更多 n 項」, whose folded line
 * names them so the reader knows what is behind it rather than having to open
 * it to find out. Each row writes its own term with its own stamp — a visit
 * where only 腳腫 was asked about says exactly that.
 */
export function ItemRows({
  questionId,
  items,
  tags,
  valueOf,
  isEnglish,
  showLegend,
  onAnswer,
  testIdPrefix,
  notAssessedValue = 'not-assessed',
}: {
  questionId: string
  items: readonly VisitItem[]
  tags: readonly VisitItemTag[]
  valueOf: (term: string) => string | undefined
  isEnglish: boolean
  showLegend: boolean
  onAnswer: (term: string, value: ItemAnswerValue) => void
  testIdPrefix: string
  notAssessedValue?: string
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const common = items.filter((item) => item.common)
  const more = items.filter((item) => !item.common)
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))
  const row = (item: VisitItem) => {
    const visibleLabel = isEnglish ? item.en : item.zh
    const tag = tagById.get(item.side)
    return <div key={item.term} className="flex flex-wrap items-center gap-2">
      {tag ? <ItemTag tag={tag} isEnglish={isEnglish} testId={`${testIdPrefix}-side-tag-${tag.id}`} /> : null}
      <span className="min-w-0 flex-1 text-xs text-foreground">{visibleLabel}</span>
      <SegmentedControl<ItemAnswerValue>
        label={visibleLabel}
        options={[
          { id: 'present', text: isEnglish ? 'Yes' : '有' },
          { id: 'absent', text: isEnglish ? 'No' : '無' },
          { id: notAssessedValue as ItemAnswerValue, text: isEnglish ? 'Not assessed' : '未評估' },
        ]}
        value={(valueOf(item.term) ?? null) as ItemAnswerValue | null}
        onSelect={(next) => onAnswer(item.term, next)}
        testId={`${testIdPrefix}-flow-sign-${item.term}`}
      />
    </div>
  }
  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-sign-items-${questionId}`}>
      {showLegend ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
          {tags.map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-1">
              <ItemTag tag={tag} isEnglish={isEnglish} testId={`${testIdPrefix}-side-tag-${tag.id}`} />
              {isEnglish ? tag.legendEn : tag.legendZh}
            </span>
          ))}
        </p>
      ) : null}
      <div className="grid gap-x-6 gap-y-1.5 @min-[44rem]:grid-cols-2">
        {common.map(row)}
        {moreOpen ? more.map(row) : null}
      </div>
      {more.length > 0 ? (
        <button
          type="button"
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          data-testid={`${testIdPrefix}-sign-more-${questionId}`}
        >
          <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', moreOpen && 'rotate-180')} aria-hidden="true" />
          {isEnglish ? `${more.length} more` : `更多 ${more.length} 項`}
          {moreOpen ? null : (
            <span className="min-w-0 truncate font-normal text-muted-foreground">
              {more
                .map((item) => {
                  const tag = tagById.get(item.side)
                  const short = isEnglish ? item.shortEn : item.shortZh
                  if (!tag) return short
                  return `${short}（${isEnglish ? tag.tagEn : tag.tagZh}）`
                })
                .join(' · ')}
            </span>
          )}
        </button>
      ) : null}
    </div>
  )
}
