"use client"

// 我的固定檢驗 — one row per pinned analyte, in the clinician's own order:
// latest value (source flag only), its own date and age, and the previous
// result with ITS date. A pin with no result keeps its row and says so; it is
// never read as "normal" or "never tested".
//
// Two densities off the card's OWN width (container query), same DOM:
//  * narrow (phone, quarter-width card): value over its date, unit under the
//    name — nothing is squeezed out.
//  * wide enough (≥ 22rem of card): one line per analyte in four aligned
//    columns — name + unit | value | date · age | previous — so ten pins fit
//    the bounded overview card without scrolling; the point of pinning is
//    reading them at a glance. The long name moves to the row's tooltip.
// The latest-value wrapper turns into `display: contents` in the wide layout,
// so its value and date become grid cells of their own.

import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import type { PinnedLabPoint } from '@/src/shared/utils/pinned-labs'
import type { PinnedLabRow } from '../hooks/usePinnedLabs'

const GRID = cn(
  'grid items-center gap-x-3',
  'grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)_minmax(3.5rem,auto)]',
  '@min-[22rem]:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)_auto] @min-[22rem]:gap-x-2.5',
)
const ROW_PAD = 'px-2 py-1.5 @min-[22rem]:py-[3px]'

function dayLabel(iso: string, now: Date): string {
  const year = iso.slice(0, 4)
  const md = `${iso.slice(5, 7)}/${iso.slice(8, 10)}`
  return year === String(now.getFullYear()) ? md : `${year}/${md}`
}

export function relativeAge(iso: string, now: Date, strings: {
  today: string
  daysAgo: string
  monthsAgo: string
  yearsAgo: string
}): string {
  const then = new Date(`${iso.slice(0, 10)}T00:00:00`)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000)
  if (!Number.isFinite(days) || days <= 0) return strings.today
  if (days < 31) return strings.daysAgo.replace('{n}', String(days))
  if (days < 365) return strings.monthsAgo.replace('{n}', String(Math.floor(days / 30.44)))
  return strings.yearsAgo.replace('{n}', String(Math.floor(days / 365.25)))
}

function flagSuffix(point: PinnedLabPoint): string {
  if (!point.cell.isAbnormal) return ''
  const code = point.cell.interpretationCode ?? ''
  if (code.startsWith('H')) return ' ↑'
  if (code.startsWith('L')) return ' ↓'
  return code && code !== 'N' ? ` ${code}` : ' A'
}

export function PinnedLabsList({
  rows,
  onOpenLab,
  onOpenReports,
  now = new Date(),
}: {
  rows: PinnedLabRow[]
  onOpenLab?: (row: PinnedLabRow) => void
  onOpenReports?: () => void
  now?: Date
}) {
  const { t } = useLanguage()
  const s = t.overview.myLabs

  const withValue = rows.filter((row) => row.kind === 'lab' && row.resolved?.latest).length
  const none = rows.filter((row) => row.kind === 'lab' && !row.resolved?.latest).length
  const reminders = rows.filter((row) => row.kind !== 'lab').length

  return (
    <div className="@container min-w-0">
      <div className="min-w-0 overflow-hidden rounded-md border border-border">
        <div aria-hidden="true" className={cn(GRID, 'border-b border-border bg-muted px-2 py-[3px] text-[0.6875rem] font-semibold text-muted-foreground')}>
          <span>{s.colItem}</span>
          <span>{s.colLatest}</span>
          <span className="hidden @min-[22rem]:inline">{s.colDate}</span>
          <span>{s.colPrevious}</span>
        </div>
        {rows.map((row) => {
          if (row.kind !== 'lab') {
            return (
              <div key={row.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border/60 last:border-b-0 @min-[22rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,3fr)]', ROW_PAD)}>
                <span className="flex min-w-0 flex-col @min-[22rem]:flex-row @min-[22rem]:items-baseline @min-[22rem]:gap-1.5">
                  <span className="truncate text-xs font-semibold text-foreground">{row.label}</span>
                  <span className="text-[0.6875rem] text-muted-foreground @min-[22rem]:hidden">{s.reminderRow}</span>
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="rounded-full bg-amber-50 px-2 py-px text-[0.6875rem] font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                    {s.reminderBadge}
                  </span>
                  {onOpenReports && (
                    <button
                      type="button"
                      onClick={onOpenReports}
                      className="text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      {s.reminderOpen}
                    </button>
                  )}
                </span>
              </div>
            )
          }
          const latest = row.resolved?.latest
          const previous = row.resolved?.previous
          const unit = latest?.cell.unit
          const longName = row.subLabel && row.subLabel !== row.label ? row.subLabel : null
          const narrowSub = [longName, unit].filter(Boolean).join(' · ')
          const content = (
            <>
              <span className="flex min-w-0 flex-col text-left @min-[22rem]:flex-row @min-[22rem]:items-baseline @min-[22rem]:gap-1">
                <span className="shrink-0 truncate text-xs font-semibold text-foreground">{row.label}</span>
                {narrowSub && (
                  <span className="truncate text-[0.6875rem] text-muted-foreground @min-[22rem]:hidden">{narrowSub}</span>
                )}
                {unit && (
                  <span className="hidden truncate text-[0.625rem] text-muted-foreground @min-[22rem]:inline">{unit}</span>
                )}
              </span>
              {latest ? (
                <>
                  <span className="flex min-w-0 flex-col text-left tabular-nums @min-[22rem]:contents">
                    <span className="flex items-baseline gap-0.5 whitespace-nowrap">
                      <span className={cn(
                        'text-sm @min-[22rem]:text-xs',
                        latest.cell.isAbnormal ? 'font-bold text-clinical-abnormal' : 'font-semibold text-foreground',
                      )}
                      >
                        {latest.value}{flagSuffix(latest)}
                      </span>
                      {latest.sameDayCount > 1 && (
                        <sup
                          aria-label={s.sameDayMany.replace('{count}', String(latest.sameDayCount))}
                          title={s.sameDayMany.replace('{count}', String(latest.sameDayCount))}
                          className="text-[0.5625rem] text-muted-foreground"
                        >
                          {latest.sameDayCount}
                        </sup>
                      )}
                    </span>
                    <span className="min-w-0 truncate whitespace-nowrap text-[0.6875rem] text-muted-foreground">
                      {dayLabel(latest.date, now)} · {relativeAge(latest.date, now, s)}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col text-left tabular-nums @min-[22rem]:flex-row @min-[22rem]:items-baseline @min-[22rem]:gap-1">
                    {previous ? (
                      <>
                        <span className={cn('whitespace-nowrap text-xs', previous.cell.isAbnormal ? 'font-semibold text-clinical-abnormal' : 'text-foreground')}>
                          {previous.value}{flagSuffix(previous)}
                        </span>
                        <span className="whitespace-nowrap text-[0.6875rem] text-muted-foreground">{dayLabel(previous.date, now)}</span>
                      </>
                    ) : (
                      <span aria-hidden="true" className="text-xs text-muted-foreground">—</span>
                    )}
                  </span>
                </>
              ) : (
                <span className="col-span-2 text-[0.6875rem] text-muted-foreground @min-[22rem]:col-span-3">{s.noResult}</span>
              )}
            </>
          )
          const tooltip = [row.label, longName, unit].filter(Boolean).join(' · ')
          // The visible cells are split across grid columns; a screen reader
          // gets the whole reading in one sentence instead of the tooltip.
          const spoken = latest
            ? [
                row.label, longName,
                `${latest.value}${flagSuffix(latest)}`, unit,
                dayLabel(latest.date, now), relativeAge(latest.date, now, s),
                previous ? `${s.colPrevious} ${previous.value}${flagSuffix(previous)} ${dayLabel(previous.date, now)}` : null,
              ].filter(Boolean).join(' ')
            : undefined
          return onOpenLab && latest ? (
            <button
              type="button"
              key={row.id}
              title={tooltip}
              aria-label={spoken}
              onClick={() => onOpenLab(row)}
              className={cn(GRID, ROW_PAD, 'w-full border-b border-border/60 text-left transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50')}
            >
              {content}
            </button>
          ) : (
            <div key={row.id} title={tooltip} className={cn(GRID, ROW_PAD, 'border-b border-border/60 last:border-b-0')}>
              {content}
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
        {[
          s.footer.replace('{withValue}', String(withValue)),
          none > 0 ? s.footerNone.replace('{count}', String(none)) : null,
          reminders > 0 ? s.footerReminders.replace('{count}', String(reminders)) : null,
        ].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}
