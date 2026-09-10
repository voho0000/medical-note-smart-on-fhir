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
import { TapTooltip } from '@/src/shared/components/TapTooltip'
import { cn } from '@/src/shared/utils/cn.utils'
import type { LabCell } from '@/src/shared/utils/lab-pivot.utils'
import type { OverviewLabRow, OverviewLabsData } from '../hooks/useOverviewData'
import type { OverviewSectionFit } from '../overview.types'
import { OVERVIEW_SECTION_DOM_ID } from '../overview.types'
import { OverviewSectionCard } from './OverviewSectionCard'
import {
  OverviewEmptyRow,
  OverviewExpandButton,
  OverviewFullListDialog,
  OverviewTruncationNote,
} from './OverviewSectionParts'
import { overviewChipClass } from './overview-styles'

type LabMode = 'pinned' | 'all'

function shortDayLabel(day: string): string {
  return day.length >= 10 ? `${day.slice(5, 7)}/${day.slice(8, 10)}` : day
}

/**
 * One value per cell, plus a marker when the day held more.
 *
 * `buildLabPivots` deliberately keeps every same-analyte/same-day record and
 * renders them as "37.87 / 37.63" — right for the 累積報告, which is the audit
 * view, but in a ~57px overview column that string is the only thing that
 * truncates, and it truncates into a number nobody can read.
 *
 * The FIRST record is the one shown. For eGFR — where these pairs mostly come
 * from — the second value is the NHI's own automatic calculation alongside the
 * reporting lab's, not a revision of it, so "latest wins" would quietly prefer
 * the derived number over the reported one. The superscript is the total count
 * for that day, and the cell's tooltip still carries every value.
 */
function summariseCellValue(cell: LabCell): { shown: string; total: number } {
  const all = cell.allValues
  if (!all || all.length < 2) return { shown: cell.value, total: 1 }
  return { shown: all[0], total: all.length }
}

// A cell narrow enough to clip its content is the one place the pivot hides
// something. `title` alone was not enough: it waits on the browser's own delay
// and never appears for touch or keyboard. TapTooltip is the component the
// clinical rows already use for exactly this — hover, tap and focus all reveal
// the full text. Applied only past this length so the ~70 short numeric cells
// of a full pivot do not each mount a tooltip they will never show.
const OVERVIEW_LAB_TOOLTIP_MIN_CHARS = 8

function CellText({ text, className }: { text: string; className?: string }) {
  if (text.length < OVERVIEW_LAB_TOOLTIP_MIN_CHARS) {
    return <span className={className}>{text}</span>
  }
  return (
    <TapTooltip
      content={text}
      aria-label={text}
      asChild
      contentClassName="max-w-[min(90vw,24rem)] whitespace-normal break-words text-xs leading-relaxed"
    >
      <span tabIndex={0} className={className}>{text}</span>
    </TapTooltip>
  )
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
  const [mode, setMode] = useState<LabMode>('pinned')
  const [abnormalOnly, setAbnormalOnly] = useState(false)
  const [listOpen, setListOpen] = useState(false)
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
  // Every matched analyte renders; the card scrolls. The pivot's own header
  // row stays put because it is inside the scrolling grid's first rows — see
  // the sticky treatment below.
  const shown = matched
  const hidden = 0
  const columns = data.columns
  const gridTemplate = `minmax(88px, 118px) repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`


  // Zebra striping is derived up-front so the JSX stays a pure map (no
  // mutation during render), and it restripes per list — the dialog shows more
  // rows than the card, so the banding has to be computed for what is actually
  // being drawn.
  const withZebra = (rows: OverviewLabRow[]) => rows.map((row, index) => ({
    row,
    zebra: index % 2 === 0 ? 'bg-card' : 'bg-muted/20',
    startsGroup: index === 0 || rows[index - 1].categoryId !== row.categoryId,
  }))

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

  // One renderer for the card and the full-length dialog (see
  // OverviewExpandButton): the card draws what fits, the dialog draws every
  // matched analyte, and neither can drift from the other.
  const showCategories = effectiveMode === 'all'

  const renderPivot = (rows: OverviewLabRow[]) => (
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
      {withZebra(rows).map(({ row, zebra, startsGroup }) => {
        // Category headings only in 「全部」. There they earn their row: the
        // list runs to every analyte the window holds and 血液／生化 is how a
        // reader finds their way down it. In 「常用」 the eight rows are the
        // whole list and a heading would just be one fewer result on screen.
        const nodes = []
        if (showCategories && startsGroup) {
          nodes.push(
            <div
              key={`group-${row.categoryId}`}
              className="col-span-full overflow-hidden bg-muted/70 px-2 py-px text-[0.6875rem] font-bold leading-3 tracking-wide text-muted-foreground"
            >
              {row.categoryLabel}
            </div>,
          )
        }
        nodes.push(
          <div
            key={`${row.mapKey}-name`}
            className={cn(
              'flex items-baseline gap-1 overflow-hidden border-r border-border px-2 py-0.5 leading-[14px]',
              zebra,
            )}
          >
            <CellText
              text={row.name}
              className="truncate text-xs font-medium text-foreground"
            />
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
          const { shown, total } = summariseCellValue(cell)
          nodes.push(
            <div
              key={key}
              className={cn(
                'flex items-center justify-center overflow-hidden px-1 py-0.5 text-center text-xs leading-[14px] tabular-nums',
                index > 0 && 'border-l border-border',
                cell.isAbnormal
                  ? 'bg-clinical-abnormal/[0.06] font-bold text-clinical-abnormal'
                  : cn('text-foreground', zebra),
              )}
              title={cell.unit ? `${cell.value} ${cell.unit}` : cell.value}
            >
              <span className="min-w-0 truncate">
                {shown}
                {cell.isAbnormal && cell.interpretationCode?.startsWith('H') && ' ↑'}
                {cell.isAbnormal && cell.interpretationCode?.startsWith('L') && ' ↓'}
              </span>
              {total > 1 && (
                // One character, so the value keeps the column. "+1"
                // cost twice this and pushed 37.87 into an ellipsis.
                <sup
                  aria-label={strings.labs.sameDayCount.replace('{count}', String(total))}
                  className="shrink-0 text-[0.5rem] font-normal leading-none text-muted-foreground"
                >
                  {total}
                </sup>
              )}
            </div>,
          )
        })
        return nodes
      })}
    </div>
  </div>
  )

  // One definition, two places: the card header and the expanded dialog, both
  // driving the same mode / abnormal-only state.
  const filterChips = (
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
    </>
  )

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
          {filterChips}
          <OverviewExpandButton
            label={t.overview.expandList}
            onClick={() => setListOpen(true)}
            disabled={matched.length === 0 || columns.length === 0}
          />
        </>
      )}
    >
      {shown.length === 0 || columns.length === 0 ? (
        <OverviewEmptyRow />
      ) : (
        <>
          <div className={cn('min-w-0', fit.bounded && 'min-h-0 flex-1 overflow-y-auto overscroll-contain')}>
            {renderPivot(shown)}
          </div>
          {/* The same footer the other three cards use. 「常用」 is a chosen
              short list rather than a fitting artefact, so the route to the
              full record is offered whether or not anything was cut. */}
          <OverviewTruncationNote hiddenCount={hidden} target={target} always />
          <OverviewFullListDialog
            open={listOpen}
            onOpenChange={setListOpen}
            title={strings.sections.labs}
            filters={filterChips}
            subtitle={strings.counts.labs
              .replace('{results}', String(data.resultCount))
              .replace('{days}', String(columns.length + data.hiddenDayCount))}
          >
            {renderPivot(matched)}
          </OverviewFullListDialog>
        </>
      )}
    </OverviewSectionCard>
  )
}
