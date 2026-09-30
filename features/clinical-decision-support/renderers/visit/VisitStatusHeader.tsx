"use client"

import type { ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, PencilLine } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { useVisitValuesStore } from '../../stores/visit-values.store'
import type { QueueRow } from './visit-decisions'
import type { VisitDecisionModel } from '../../types'

const TREND = {
  up: { Icon: ArrowUp, zh: '上升', en: 'rising' },
  down: { Icon: ArrowDown, zh: '下降', en: 'falling' },
  flat: { Icon: ArrowRight, zh: '持平', en: 'flat' },
} as const

/**
 * A value's date as a clinician reads it beside the number: nothing for
 * today's, month-day within this year, the full date otherwise.
 */
export function displayDate(date: string | undefined, now: Date): string | undefined {
  if (!date) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return date
  const [, year, month, day] = match
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (`${year}-${month}-${day}` === today) return undefined
  return Number(year) === now.getFullYear() ? `${month}-${day}` : `${year}-${month}-${day}`
}

/** A value the record lacks: the pack printed nothing, or a dash. */
function isMissingValue(value: string): boolean {
  return !value.trim() || /^[—–-]+$/.test(value.trim())
}

/**
 * The pack's sentence for where this patient stands — or, once everything
 * queued is recorded, its own words for that (`headlineWhenDecided`), with
 * what still needs the clinician outside the queue.
 */
export function visitStatusSentence(model: VisitDecisionModel, rows: readonly QueueRow[], stillToConfirm: number, isEnglish: boolean): { text: string; decided: boolean } {
  const allDecided = rows.length > 0 && rows.every((row) => !row.current)
  return allDecided && model.headlineWhenDecided
    ? { text: `${model.headlineWhenDecided}${stillToConfirm ? (isEnglish ? ` · ${stillToConfirm} still to confirm` : ` · 還有 ${stillToConfirm} 項需你確認`) : ''}`, decided: true }
    : { text: model.headline, decided: false }
}

/**
 * That sentence for a screen reader and the page's structure only. On screen
 * each decision says it for itself, the decided sentence heads the summary,
 * and the sentence opens the copied note (owner feedback 2026-09-30: the line
 * 「HFrEF（LVEF 57.2%，05-05）：首次評估」 need not take a row).
 */
export function VisitStatusLine({ model, sentence }: { model: VisitDecisionModel; sentence: string }) {
  return (
    <section
      className="sr-only"
      aria-labelledby="cdss-visit-headline"
      data-testid="cdss-visit-status"
      data-stage={model.stage}
      data-flags={model.flags?.join(' ') || undefined}
    >
      <h3 id="cdss-visit-headline">{sentence}</h3>
    </section>
  )
}

/**
 * The values the decisions read, with their dates and direction, and the way
 * to add or correct one — at the head of the map's column, folded to LVEF and
 * what stands out (a value behind today's safety item, or one the laboratory
 * itself flagged). Not pinned over the work: each decision prints the values
 * it read, and clinicians read the labs before they open the CDSS (owner
 * feedback 2026-09-30: 「臨床數值不用固定在上面」).
 */
export function VisitValues({
  model,
  isEnglish,
  now,
  onEditValues,
  onEditValue,
  valueAddons,
  extras,
}: {
  model: VisitDecisionModel
  isEnglish: boolean
  now: Date
  /** Opens the page's clinical-values editor. */
  onEditValues?: () => void
  /** Opens it at one value; offered on values that are stale or missing. */
  onEditValue?: (key: string) => void
  /** Drawn after a value, by its key (LVEF's 報告). */
  valueAddons?: Partial<Record<string, ReactNode>>
  /**
   * The page's other values, in the same grammar and inside the same list —
   * the rhythm, Na, Hb, SpO₂, BMI and what the record lacks — so everything
   * the decisions read sits in one compact place (clinician feedback 2026-09-28).
   */
  extras?: ReactNode
}) {
  const valuesOpen = useVisitValuesStore((state) => state.open)
  const setValuesOpen = useVisitValuesStore((state) => state.setOpen)
  const hasValues = model.keyValues.length > 0 || Boolean(extras)
  if (!hasValues && !onEditValues) return null
  const summaryValues = model.keyValues.filter((item) => item.key === 'LVEF' || item.alert || item.abnormal)
  const renderValue = (item: VisitDecisionModel['keyValues'][number]) => {
    const trend = item.trend ? TREND[item.trend] : undefined
    const missing = isMissingValue(item.value)
    const editable = Boolean(onEditValue) && (item.stale || missing)
    const flagged = !item.alert && item.abnormal
    const value = (
      <>
        {missing ? (isEnglish ? 'Not in record' : '紀錄無值') : item.value}
        {flagged ? (
          <span className="text-[10px] font-semibold" data-abnormal={item.abnormal}>
            {item.abnormal === 'high' ? (isEnglish ? 'H' : '高') : (isEnglish ? 'L' : '低')}
          </span>
        ) : null}
        {trend ? (
          <>
            <trend.Icon className="h-3.5 w-3.5 self-center" aria-hidden="true" />
            <span className="sr-only">{isEnglish ? trend.en : trend.zh}</span>
          </>
        ) : null}
      </>
    )
    return (
      <div
        key={item.key}
        className={cn('flex flex-wrap items-baseline gap-x-1.5', item.alert && 'rounded-md bg-destructive/10 px-1.5')}
        data-key={item.key}
        data-stale={item.stale ? 'true' : undefined}
        data-missing={missing ? 'true' : undefined}
        data-alert={item.alert ? 'true' : undefined}
        data-abnormal={item.abnormal}
      >
        <dt className={cn('text-xs', item.alert ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{item.label}</dt>
        <dd className={cn('inline-flex items-baseline gap-1 font-semibold tabular-nums', item.alert ? 'text-destructive' : flagged ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>
          {editable ? (
            <button
              type="button"
              className={cn(
                'inline-flex min-h-8 items-center gap-1 rounded-md px-1 underline decoration-dotted underline-offset-4 hover:bg-muted pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                item.stale ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground',
              )}
              onClick={() => onEditValue?.(item.key)}
              aria-label={`${isEnglish ? 'Correct' : '修改'} ${item.label}${item.stale ? (isEnglish ? ' (past window)' : '（已超過窗期）') : missing ? (isEnglish ? ' (not in record)' : '（紀錄無值）') : ''}`}
              data-visit-edit-value={item.key}
            >
              {value}
            </button>
          ) : value}
        </dd>
        {displayDate(item.date, now) || item.stale ? (
          <dd
            className={cn(
              'text-xs tabular-nums',
              item.stale ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
            )}
          >
            {displayDate(item.date, now)}
            {item.stale ? `${displayDate(item.date, now) ? ' · ' : ''}${isEnglish ? 'Past window' : '已超過窗期'}` : ''}
          </dd>
        ) : null}
        {valueAddons?.[item.key] ? <dd>{valueAddons[item.key]}</dd> : null}
      </div>
    )
  }
  return (
    // The whole first line opens and folds the values (clinician feedback
    // 2026-09-28: 「一整個 row 都是可點擊 toggle」); a button or link on it
    // (補填, 報告) does its own thing. The toggle is what a keyboard reaches.
    <section className="rounded-md border border-border bg-background" aria-labelledby="cdss-visit-values-toggle" data-testid="cdss-visit-values-row">
      <div
        className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1 text-sm hover:bg-muted/30"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a')) return
          setValuesOpen(!valuesOpen)
        }}
        data-testid="cdss-visit-values-header"
      >
        {hasValues ? (
          <button
            type="button"
            id="cdss-visit-values-toggle"
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded text-xs font-semibold text-primary pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={valuesOpen}
            aria-controls="cdss-visit-values"
            onClick={() => setValuesOpen(!valuesOpen)}
            data-testid="cdss-visit-values-toggle"
          >
            {isEnglish ? 'Clinical values' : '臨床數值'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', valuesOpen && 'rotate-180')} aria-hidden="true" />
          </button>
        ) : (
          <span id="cdss-visit-values-toggle" className="text-xs font-semibold text-muted-foreground">{isEnglish ? 'Clinical values' : '臨床數值'}</span>
        )}
        {onEditValues ? (
          <button
            type="button"
            className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onEditValues}
            data-testid="cdss-visit-edit-values"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            {isEnglish ? 'Add / correct' : '補填／修改'}
          </button>
        ) : null}
        {!valuesOpen && summaryValues.length ? (
          <dl className="flex basis-full flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-0.5" data-testid="cdss-visit-key-values-summary">{summaryValues.map(renderValue)}</dl>
        ) : null}
      </div>
      {hasValues ? (
        <div hidden={!valuesOpen} className="border-t border-border px-2 py-1.5">
          {/* One value a line down the column; across the width where the map stacks. */}
          <dl id="cdss-visit-values" className="grid gap-y-1 text-sm @max-[36rem]:flex @max-[36rem]:flex-wrap @max-[36rem]:items-baseline @max-[36rem]:gap-x-4" data-testid="cdss-visit-key-values">
            {model.keyValues.map(renderValue)}
            {extras}
          </dl>
        </div>
      ) : null}
    </section>
  )
}

/**
 * Why the pack reopened the assessment (「09-10 HF 急診」), in one line at the
 * head of 01, where the reassessment is decided.
 */
export function VisitTriggers({ model, isEnglish }: { model: VisitDecisionModel; isEnglish: boolean }) {
  if (!model.triggers.length) return null
  return (
    <p
      className="rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-1.5 text-sm leading-relaxed text-foreground dark:border-amber-500/30 dark:bg-amber-500/10"
      data-testid="cdss-visit-triggers"
    >
      <span className="mr-1 text-xs font-semibold text-amber-900 dark:text-amber-200">
        {isEnglish ? 'Reassessment opened by:' : '重新評估的原因：'}
      </span>
      {model.triggers.map((trigger, index) => (
        <span key={trigger.id} data-trigger={trigger.id}>
          {index > 0 ? (isEnglish ? '; ' : '；') : ''}
          {trigger.text}
        </span>
      ))}
    </p>
  )
}
