"use client"

// Title + date range + the 1／3／6 個月 range chips + 專注總覽.
import { PanelRightClose } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useWorkspacePanels } from '@/src/application/providers/workspace-panels.provider'
import { formatDate } from '@/src/shared/utils/date.utils'
import { overviewChipClass } from './overview-styles'
import {
  OVERVIEW_RANGE_MONTHS,
  type OverviewRangeMonths,
  type OverviewWindow,
} from '../utils/overview-selectors'

export function OverviewHeader({
  window,
  onRangeChange,
}: {
  window: OverviewWindow
  onRangeChange: (months: OverviewRangeMonths) => void
}) {
  const { t, locale } = useLanguage()
  const strings = t.overview
  const ranges = strings.ranges as Record<string, string>
  // Absent outside the workspace shell (and in unit tests) — then the control
  // simply is not offered. It is also pointless once either side is already
  // collapsed, and the split it acts on does not exist below md.
  const panels = useWorkspacePanels()
  const canFocus = !!panels && panels.collapsed === null

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-[0.9375rem] font-semibold text-foreground">
          {strings.title.replace('{months}', String(window.months))}
        </span>
        <span className="truncate text-xs tabular-nums text-muted-foreground">
          {strings.rangeLabel
            .replace('{start}', formatDate(window.startDay, locale))
            .replace('{end}', formatDate(window.endDay, locale))}
        </span>
      </div>
      <div
        className="flex items-center gap-1.5"
        role="group"
        aria-label={strings.rangeAriaLabel}
      >
        {OVERVIEW_RANGE_MONTHS.map((months) => (
          <button
            key={months}
            type="button"
            aria-pressed={window.months === months}
            className={overviewChipClass(window.months === months)}
            onClick={() => onRangeChange(months)}
          >
            {ranges[String(months)]}
          </button>
        ))}
        {canFocus && (
          <button
            type="button"
            title={t.header.focusOverviewHint}
            aria-label={t.header.focusOverviewHint}
            onClick={() => panels?.setCollapsed('right')}
            className={`${overviewChipClass(false)} hidden items-center gap-1 md:inline-flex`}
          >
            <PanelRightClose className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t.header.focusOverview}
          </button>
        )}
      </div>
    </div>
  )
}
