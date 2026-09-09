"use client"

// 檢驗 — a compact analyte × collection-day pivot.
//
// The 報告 tab's LabPivotTable is transposed (rows = dates, columns = tests)
// and owns its own scrolling/virtualisation, neither of which fits a card that
// must not scroll. This section therefore renders its own grid from the SAME
// LabPivot model (buildLabPivots) and reuses the cell tones — no second pivot
// builder, and no app-side abnormal determiner: `cell.isAbnormal` comes from
// the source's own interpretation / reference range.
import { useMemo, useState, type Ref } from 'react'
import { FlaskConical } from 'lucide-react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import type { OverviewLabRow, OverviewLabsData } from '../hooks/useOverviewData'
import type { OverviewSectionFit } from '../overview.types'
import { OVERVIEW_SECTION_DOM_ID } from '../overview.types'
import { fitGroupedRows } from '../utils/overview-selectors'
import { OverviewSectionCard } from './OverviewSectionCard'
import {
  OverviewEmptyRow,
  OverviewOpenTabButton,
  OverviewTruncationNote,
  useOverviewNavigate,
} from './OverviewSectionParts'
import { overviewChipClass } from './overview-styles'

type LabMode = 'pinned' | 'all'

// Measured geometry of the compact pivot in a bounded card: a value row is
// 24px, a category divider 16px, and the two-line date header 30px plus the
// table's own 2px border.
const OVERVIEW_LAB_ROW_PX = 24
const OVERVIEW_LAB_GROUP_ROW_PX = 16
const OVERVIEW_LAB_HEADER_PX = 32
function shortDayLabel(day: string): string {
  return day.length >= 10 ? `${day.slice(5, 7)}/${day.slice(8, 10)}` : day
}

export function OverviewLabsSection({
  data,
  fit,
  flash = false,
  headingRef,
}: {
  data: OverviewLabsData
  fit: OverviewSectionFit
  flash?: boolean
  headingRef?: Ref<HTMLDivElement>
}) {
  const { t } = useLanguage()
  const strings = t.overview
  const navigateTo = useOverviewNavigate()
  const [mode, setMode] = useState<LabMode>('pinned')
  const [abnormalOnly, setAbnormalOnly] = useState(false)
  // 「常用」 only makes sense while the standard panels actually have rows in
  // range; otherwise the card would look empty for a filter the patient's data
  // cannot satisfy.
  const effectiveMode: LabMode = mode === 'pinned' && data.pinnedRowCount === 0 ? 'all' : mode

  const matched = useMemo(() => data.rows.filter((row) => {
    if (effectiveMode === 'pinned' && !row.isPinned) return false
    if (abnormalOnly && !row.hasAbnormal) return false
    return true
  }), [abnormalOnly, data.rows, effectiveMode])

  // Row budget. Category dividers are charged where they actually occur —
  // reserving one per category up-front would leave most of the card empty,
  // since a truncated list only reaches the first couple of categories.
  const shown = useMemo(() => {
    if (!fit.bounded || fit.availablePx === undefined) return matched
    const budget = fitGroupedRows(
      fit.availablePx,
      matched.map((row: OverviewLabRow) => row.categoryId),
      {
        rowPx: OVERVIEW_LAB_ROW_PX,
        groupPx: OVERVIEW_LAB_GROUP_ROW_PX,
        headerPx: OVERVIEW_LAB_HEADER_PX,
      },
    )
    return matched.slice(0, budget)
  }, [fit.availablePx, fit.bounded, matched])

  const hidden = matched.length - shown.length
  const columns = data.columns
  const gridTemplate = `minmax(88px, 118px) repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`

  const footer = [
    strings.labs.footer.replace('{results}', String(data.resultCount)),
    data.unpivotedCount > 0
      ? strings.labs.footerUnpivoted.replace('{count}', String(data.unpivotedCount))
      : '',
    data.hiddenDayCount > 0
      ? strings.labs.footerHiddenDays.replace('{count}', String(data.hiddenDayCount))
      : '',
  ].filter(Boolean).join(' ')

  // Group dividers and zebra striping are derived up-front so the JSX stays a
  // pure map (no mutation during render).
  const rendered = useMemo(
    () => shown.map((row, index) => ({
      row,
      startsGroup: index === 0 || shown[index - 1].categoryId !== row.categoryId,
      zebra: index % 2 === 0 ? 'bg-card' : 'bg-muted/20',
    })),
    [shown],
  )

  // 檢驗 always lands in the 累積報告 — the flat 全部 list is a per-report
  // index and cannot show an analyte over time, which is the whole reason the
  // reader clicked away from a truncated pivot. The panel is the one the first
  // visible row belongs to, so the destination matches what they were reading.
  const target = {
    resourceType: 'Observation',
    resourceId: data.navResourceId,
    tabLabel: t.tabs.reports,
    reportView: 'cumulative' as const,
    cumulativeCategoryId: shown[0]?.categoryId ?? data.rows[0]?.categoryId,
    seeAllLabel: strings.labs.seeAllCumulative,
  }

  return (
    <OverviewSectionCard
      id={OVERVIEW_SECTION_DOM_ID.labs}
      icon={FlaskConical}
      title={strings.sections.labs}
      count={strings.counts.labs
        .replace('{results}', String(data.resultCount))
        .replace('{days}', String(columns.length + data.hiddenDayCount))}
      bounded={fit.bounded}
      flash={flash}
      headingRef={headingRef}
      actions={(
        <>
          <button
            type="button"
            aria-pressed={abnormalOnly}
            className={overviewChipClass(abnormalOnly)}
            onClick={() => setAbnormalOnly((previous) => !previous)}
          >
            {strings.labs.abnormalOnly}
          </button>
          <button
            type="button"
            aria-pressed={effectiveMode === 'pinned'}
            className={overviewChipClass(effectiveMode === 'pinned')}
            onClick={() => setMode('pinned')}
          >
            {strings.labs.pinned}
          </button>
          <button
            type="button"
            aria-pressed={effectiveMode === 'all'}
            className={overviewChipClass(effectiveMode === 'all')}
            onClick={() => setMode('all')}
          >
            {strings.labs.all}
          </button>
          <OverviewOpenTabButton target={target} />
        </>
      )}
    >
      {shown.length === 0 || columns.length === 0 ? (
        <OverviewEmptyRow />
      ) : (
        <>
          <div className="min-w-0 shrink-0 overflow-hidden rounded-md border border-border">
            <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="flex items-center overflow-hidden border-b border-r border-border bg-muted px-2 py-[3px] text-[0.6875rem] font-semibold leading-3 tracking-wide text-foreground">
                {strings.labs.analyte}
              </div>
              {columns.map((column, index) => (
                <div
                  key={column.day}
                  className={cn(
                    'flex flex-col items-center justify-center overflow-hidden border-b border-border bg-muted px-1 py-[3px] text-center text-muted-foreground',
                    index > 0 && 'border-l',
                  )}
                >
                  <span className="block whitespace-nowrap text-[0.6875rem] font-bold leading-3 tabular-nums tracking-wide">
                    {shortDayLabel(column.day)}
                  </span>
                  {column.institution && (
                    <span
                      className="block max-w-full truncate text-[0.5625rem] font-medium leading-[11px]"
                      title={column.institution}
                    >
                      {column.institution}
                    </span>
                  )}
                </div>
              ))}
              {rendered.map(({ row, startsGroup, zebra }) => {
                const nodes = []
                if (startsGroup) {
                  nodes.push(
                    <div
                      key={`group-${row.categoryId}`}
                      className="col-span-full overflow-hidden bg-muted/70 px-2 py-0.5 text-[0.6875rem] font-bold leading-3 tracking-wide text-muted-foreground"
                    >
                      {row.categoryLabel}
                    </div>,
                  )
                }
                nodes.push(
                  <div
                    key={`${row.mapKey}-name`}
                    className={cn(
                      'flex items-baseline gap-1 overflow-hidden border-r border-border px-2 py-1 leading-[14px]',
                      zebra,
                    )}
                  >
                    <span className="truncate text-xs font-medium text-foreground" title={row.name}>
                      {row.name}
                    </span>
                    {row.unit && (
                      <span className="shrink-0 whitespace-nowrap text-[0.5625rem] text-muted-foreground">
                        {row.unit}
                      </span>
                    )}
                  </div>,
                )
                row.cells.forEach((cell, index) => {
                  const key = `${row.mapKey}-${columns[index]?.day ?? index}`
                  if (!cell) {
                    nodes.push(
                      <div
                        key={key}
                        aria-hidden="true"
                        className={cn(
                          'bg-muted/50 px-1 py-1 leading-[14px]',
                          index > 0 && 'border-l border-border',
                        )}
                        style={{ backgroundImage: 'var(--clinical-missing-data-pattern)' }}
                      />,
                    )
                    return
                  }
                  nodes.push(
                    <div
                      key={key}
                      className={cn(
                        'flex items-center justify-center overflow-hidden px-1 py-1 text-center text-xs leading-[14px] tabular-nums',
                        index > 0 && 'border-l border-border',
                        cell.isAbnormal
                          ? 'bg-clinical-abnormal/[0.06] font-bold text-clinical-abnormal'
                          : cn('text-foreground', zebra),
                      )}
                      title={cell.unit ? `${cell.value} ${cell.unit}` : cell.value}
                    >
                      <span className="truncate">
                        {cell.value}
                        {cell.isAbnormal && cell.interpretationCode?.startsWith('H') && ' ↑'}
                        {cell.isAbnormal && cell.interpretationCode?.startsWith('L') && ' ↓'}
                      </span>
                    </div>,
                  )
                })
                return nodes
              })}
            </div>
          </div>
          {fit.bounded ? (
            <OverviewTruncationNote hiddenCount={hidden} target={target} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5">
              <span className="text-[0.6875rem] text-muted-foreground">{footer}</span>
              {target.resourceId && (
                <button
                  type="button"
                  className="cursor-pointer text-[0.6875rem] text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  onClick={() => navigateTo(target)}
                >
                  {strings.labs.trendLink}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </OverviewSectionCard>
  )
}
