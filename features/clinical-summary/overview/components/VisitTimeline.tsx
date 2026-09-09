"use client"

// A month-scaled strip of the visits in range. Outpatient / emergency visits
// are dots; an inpatient stay with a discharge date is a bar spanning its
// period. Clicking a marker selects the matching row below.
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import { formatDate } from '@/src/shared/utils/date.utils'
import type { OverviewVisitItem } from '../hooks/useOverviewData'
import {
  monthTicks,
  toDayKey,
  windowOffsetPercent,
  type OverviewWindow,
} from '../utils/overview-selectors'

const DOT_TONE: Record<string, string> = {
  emergency: 'bg-red-600 dark:bg-clinical-abnormal',
  inpatient: 'bg-blue-700 dark:bg-blue-400',
  default: 'bg-emerald-700 dark:bg-emerald-400',
}

export function VisitTimeline({
  items,
  window,
  selectedId,
  onSelect,
  compact = false,
}: {
  items: OverviewVisitItem[]
  window: OverviewWindow
  selectedId: string | null
  onSelect: (visitId: string | null) => void
  compact?: boolean
}) {
  const { t, locale } = useLanguage()
  const ticks = monthTicks(window)
  const lineTop = compact ? 18 : 24
  const badges = t.visitHistory.badges as Record<string, string>

  return (
    <div
      className="relative shrink-0"
      style={{ height: compact ? 32 : 44 }}
      role="group"
      aria-label={t.overview.visits.timelineLabel}
    >
      {ticks.map((tick) => {
        const left = windowOffsetPercent(tick.day, window)
        if (left === undefined) return null
        return (
          <span
            key={tick.day}
            aria-hidden="true"
            className={cn(
              'absolute -translate-x-1/2 whitespace-nowrap text-muted-foreground',
              compact ? 'text-[0.5625rem]' : 'text-[0.625rem]',
            )}
            style={{ left: `${left}%`, top: 0 }}
          >
            {locale === 'zh-TW' ? `${tick.month}月` : `${tick.month}`}
          </span>
        )
      })}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 h-px bg-border"
        style={{ top: lineTop }}
      />
      {items.map((item) => {
        const startDay = toDayKey(item.visit.date)
        const endDay = toDayKey(item.visit.endDate)
        const left = windowOffsetPercent(
          startDay && startDay >= window.startDay ? startDay : window.startDay,
          window,
        )
        if (left === undefined) return null
        const isStay = item.visit.type === 'inpatient'
          && !!endDay && !!startDay && endDay > startDay
        const right = isStay
          ? windowOffsetPercent(endDay! > window.endDay ? window.endDay : endDay!, window)
          : undefined
        const selected = selectedId === item.visit.id
        const label = t.overview.visits.timelineTitle
          .replace('{type}', badges[item.visit.type] ?? badges.other)
          .replace('{date}', formatDate(item.visit.date, locale))
        const tone = DOT_TONE[item.visit.type] ?? DOT_TONE.default

        if (isStay && right !== undefined) {
          return (
            <button
              key={item.visit.id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onSelect(selected ? null : item.visit.id)}
              className={cn(
                'absolute h-2 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                DOT_TONE.inpatient,
                selected && 'ring-2 ring-primary/60',
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(1.5, right - left)}%`,
                top: lineTop - 4,
              }}
            />
          )
        }

        return (
          <button
            key={item.visit.id}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : item.visit.id)}
            className={cn(
              'absolute h-2.5 w-2.5 -translate-x-1/2 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              tone,
              selected && 'ring-2 ring-primary/60',
            )}
            style={{ left: `${left}%`, top: lineTop - 5 }}
          />
        )
      })}
    </div>
  )
}
