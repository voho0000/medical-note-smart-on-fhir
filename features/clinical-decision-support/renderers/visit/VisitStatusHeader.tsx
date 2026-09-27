"use client"

import { ArrowDown, ArrowRight, ArrowUp, PencilLine } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import type { QueueRow } from './visit-decisions'
import type { VisitDecisionModel } from '../../types'

const TREND = {
  up: { Icon: ArrowUp, zh: '上升', en: 'rising' },
  down: { Icon: ArrowDown, zh: '下降', en: 'falling' },
  flat: { Icon: ArrowRight, zh: '持平', en: 'flat' },
} as const

/**
 * The status line: the pack's one sentence for where this patient stands, the
 * values it rests on with their dates and direction, and — when the pack
 * reopened the assessment — why. The only host words are the progress of
 * today's queue.
 */
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

export function VisitStatusHeader({
  model,
  rows,
  isEnglish,
  now,
  onEditValues,
  onEditValue,
}: {
  model: VisitDecisionModel
  rows: readonly QueueRow[]
  isEnglish: boolean
  now: Date
  /** Opens the page's clinical-values editor. */
  onEditValues?: () => void
  /** Opens it at one value; offered on values that are stale or missing. */
  onEditValue?: (key: string) => void
}) {
  const pending = rows.filter((row) => row.current).length
  const allDecided = rows.length > 0 && pending === 0
  // Once everything queued is recorded the pack may say so in its own words;
  // otherwise its sentence stands. How many are left is said once, on the
  // queue itself (已決定 x/y), not repeated here.
  const headline = allDecided && model.headlineWhenDecided ? model.headlineWhenDecided : model.headline
  return (
    <section
      className="space-y-2 border-b border-border pb-3"
      aria-labelledby="cdss-visit-headline"
      data-testid="cdss-visit-status"
      data-stage={model.stage}
      data-flags={model.flags?.join(' ') || undefined}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <h3 id="cdss-visit-headline" className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground">
          {headline}
        </h3>
        {onEditValues ? (
          <button
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onEditValues}
            data-testid="cdss-visit-edit-values"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
            {isEnglish ? 'Add / correct measurements' : '補填／修改量測'}
          </button>
        ) : null}
      </div>
      {model.keyValues.length ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="cdss-visit-key-values">
          {model.keyValues.map((item) => {
            const trend = item.trend ? TREND[item.trend] : undefined
            const missing = isMissingValue(item.value)
            const editable = Boolean(onEditValue) && (item.stale || missing)
            const value = (
              <>
                {missing ? (isEnglish ? 'Not in record' : '紀錄無值') : item.value}
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
                className={cn('flex items-baseline gap-1.5', item.alert && 'rounded-md bg-destructive/10 px-1.5')}
                data-key={item.key}
                data-stale={item.stale ? 'true' : undefined}
                data-missing={missing ? 'true' : undefined}
                data-alert={item.alert ? 'true' : undefined}
              >
                <dt className={cn('text-xs', item.alert ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{item.label}</dt>
                <dd className={cn('inline-flex items-baseline gap-1 font-semibold tabular-nums', item.alert ? 'text-destructive' : 'text-foreground')}>
                  {editable ? (
                    <button
                      type="button"
                      className={cn(
                        'inline-flex min-h-11 items-center gap-1 rounded-md px-1 underline decoration-dotted underline-offset-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
              </div>
            )
          })}
        </dl>
      ) : null}
      {model.triggers.length ? (
        <div
          className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"
          data-testid="cdss-visit-triggers"
        >
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            {isEnglish ? 'Reassessment opened by' : '重新評估的原因'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {model.triggers.map((trigger) => (
              <li key={trigger.id} className="leading-relaxed text-foreground" data-trigger={trigger.id}>
                {trigger.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
