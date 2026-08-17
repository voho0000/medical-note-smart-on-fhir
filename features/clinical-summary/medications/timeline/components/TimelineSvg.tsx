// SVG Gantt chart for medication refill history.
//
// Layout:
//   - One row per drug, grouped by category.
//   - Category headers sit between groups (text-only, no separate SVG).
//   - X-axis: time (date range), ticks at year boundaries.
//   - Y-axis: drug labels (left column, scrollable with the chart).
//
// The SVG is sized in pixels — the parent provides `width`. Height = number
// of rows × ROW_HEIGHT (+ category header rows). No virtualisation in MVP
// — for 50+ drugs we revisit.
"use client"

import { useState, type MouseEvent } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import type { CategoryGroup, RefillBar, TimelineDrug } from '../hooks/useMedicationTimeline'
import {
  medicationChronicFutureTimelineBarClass,
  medicationChronicTimelineBarClass,
  medicationNonChronicFutureTimelineBarClass,
  medicationNonChronicTimelineBarClass,
} from '../../components/medication-chip-styles'

interface TimelineSvgProps {
  categories: CategoryGroup[]
  domainStartMs: number
  domainEndMs: number
  width: number
}

const ROW_HEIGHT = 18
const CATEGORY_HEADER_HEIGHT = 22
const LABEL_COLUMN_WIDTH = 180
const AXIS_HEIGHT = 22
const BAR_HEIGHT = 10
const BAR_VERTICAL_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2
const CATEGORY_GAP = 4

interface HoverState {
  bar: RefillBar
  segment: 'elapsed' | 'future'
  drugName: string
  drugProductName?: string
  drugTerminology?: TimelineDrug['drugTerminology']
  xPx: number
  yPx: number
}

function shortYmd(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Build adaptive time ticks instead of showing only year boundaries. A
 * three-month view otherwise has a blank axis for most of the year, which
 * makes refill positions needlessly hard to interpret.
 */
function buildTimeTicks(
  domainStartMs: number,
  domainEndMs: number,
  chartWidth: number,
  xScale: (ms: number) => number,
  locale: string,
) {
  const spanDays = (domainEndMs - domainStartMs) / 86_400_000
  const stepMonths = spanDays <= 400 ? 1 : spanDays <= 1_600 ? 3 : 12
  const start = new Date(domainStartMs)
  const candidates = [domainStartMs]

  let cursor: Date
  if (stepMonths === 12) {
    cursor = new Date(start.getFullYear() + 1, 0, 1)
  } else if (stepMonths === 3) {
    const nextQuarterMonth = Math.floor(start.getMonth() / 3) * 3 + 3
    cursor = new Date(start.getFullYear(), nextQuarterMonth, 1)
  } else {
    cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  }

  while (cursor.getTime() < domainEndMs) {
    candidates.push(cursor.getTime())
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + stepMonths,
      1,
    )
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    year: spanDays > 400 ? 'numeric' : '2-digit',
    month: spanDays > 1_600 ? undefined : 'short',
    day: spanDays <= 100 ? 'numeric' : undefined,
  })

  let previousX = -Infinity
  return candidates.flatMap((ms) => {
    const x = xScale(ms)
    if (x - previousX < 48 || x > chartWidth - 28) return []
    previousX = x
    return [{ x, label: formatter.format(new Date(ms)) }]
  })
}

export function TimelineSvg({ categories, domainStartMs, domainEndMs, width }: TimelineSvgProps) {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const [hover, setHover] = useState<HoverState | null>(null)
  const [todayMs] = useState(() => Date.now())
  const mt = (t.medications as any)

  if (categories.length === 0 || width < 200) return null

  const chartWidth = Math.max(width - LABEL_COLUMN_WIDTH, 100)
  const range = Math.max(domainEndMs - domainStartMs, 1)
  const xScale = (ms: number) => ((ms - domainStartMs) / range) * chartWidth

  // ── Layout pass: assign Y position to each row ─────────────────────────
  type Row =
    | { kind: 'category'; y: number; group: CategoryGroup }
    | { kind: 'drug'; y: number; drug: TimelineDrug }

  const rows: Row[] = []
  let cursorY = AXIS_HEIGHT
  for (const group of categories) {
    rows.push({ kind: 'category', y: cursorY, group })
    cursorY += CATEGORY_HEADER_HEIGHT
    for (const drug of group.drugs) {
      rows.push({ kind: 'drug', y: cursorY, drug })
      cursorY += ROW_HEIGHT
    }
    cursorY += CATEGORY_GAP
  }
  const totalHeight = cursorY

  const timeTicks = buildTimeTicks(
    domainStartMs,
    domainEndMs,
    chartWidth,
    xScale,
    locale,
  )
  const todayX = xScale(todayMs)
  const tooltipWidth = Math.min(280, width - 8)

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        width={width}
        height={totalHeight}
        className="block"
        onMouseLeave={() => setHover(null)}
      >
        {/* ── X-axis: year labels + grid lines ──────────────────────── */}
        {timeTicks.map((tk) => (
          <g key={`tick-${tk.label}`}>
            <line
              x1={LABEL_COLUMN_WIDTH + tk.x}
              x2={LABEL_COLUMN_WIDTH + tk.x}
              y1={AXIS_HEIGHT - 2}
              y2={totalHeight}
              strokeWidth={1}
              className="stroke-border"
            />
            <text
              x={LABEL_COLUMN_WIDTH + tk.x + 3}
              y={14}
              fontSize={11}
              className="fill-muted-foreground"
            >
              {tk.label}
            </text>
          </g>
        ))}

        {/* ── Rows ──────────────────────────────────────────────────── */}
        {rows.map((row, idx) => {
          if (row.kind === 'category') {
            return (
              <g key={`cat-${idx}`}>
                <rect
                  x={0}
                  y={row.y}
                  width={width}
                  height={CATEGORY_HEADER_HEIGHT}
                  className="fill-muted/55"
                />
                <text
                  x={6}
                  y={row.y + 14}
                  fontSize={11}
                  fontWeight={600}
                  className="fill-foreground"
                >
                  {row.group.label}{' '}
                  <tspan fontWeight={400} className="fill-muted-foreground">
                    ({row.group.drugs.length})
                  </tspan>
                </text>
              </g>
            )
          }

          const drug = row.drug
          const isCurrent = drug.bars.some(
            (bar) => bar.startMs <= todayMs && bar.endMs >= todayMs,
          )
          return (
            <g
              key={drug.drugKey}
              data-timeline-drug-current={isCurrent ? 'true' : 'false'}
            >
              {isCurrent ? (
                <rect
                  data-timeline-current-row
                  aria-hidden="true"
                  x={0}
                  y={row.y}
                  width={width}
                  height={ROW_HEIGHT}
                  className="fill-primary/[0.06] dark:fill-primary/10"
                />
              ) : null}
              {/* drug name label (left column) */}
              <foreignObject
                x={4}
                y={row.y}
                width={LABEL_COLUMN_WIDTH - 8}
                height={ROW_HEIGHT}
              >
                <div
                  // @ts-expect-error xmlns is valid here
                  xmlns="http://www.w3.org/1999/xhtml"
                  title={[
                    drug.drugName,
                    drug.drugProductName,
                  ].filter(Boolean).join(' · ')}
                  style={{
                    fontSize: 11,
                    lineHeight: `${ROW_HEIGHT}px`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--foreground)',
                    fontWeight: drug.isChronic ? 600 : 500,
                  }}
                >
                  {drug.drugName}
                </div>
              </foreignObject>

              {/* refill bars */}
              {drug.bars.map((bar) => {
                const x1 = xScale(bar.startMs)
                const x2 = xScale(bar.endMs)
                const hasElapsedSegment = bar.startMs < todayMs
                const hasFutureSegment = bar.endMs > todayMs
                const elapsedEndX = xScale(Math.min(bar.endMs, todayMs))
                const futureStartX = xScale(Math.max(bar.startMs, todayMs))

                const showBarHover = (
                  e: MouseEvent<SVGRectElement>,
                  segment: HoverState['segment'],
                ) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect()
                  const containerRect = (e.target as SVGRectElement)
                    .closest('svg')
                    ?.getBoundingClientRect()
                  setHover({
                    bar,
                    segment,
                    drugName: drug.drugName,
                    drugProductName: drug.drugProductName,
                    drugTerminology: drug.drugTerminology,
                    xPx: rect.left - (containerRect?.left ?? 0) + rect.width / 2,
                    yPx: rect.top - (containerRect?.top ?? 0),
                  })
                }

                return (
                  <g key={bar.refillId}>
                    {hasElapsedSegment && (
                      <rect
                        data-timeline-segment="elapsed"
                        x={LABEL_COLUMN_WIDTH + x1}
                        y={row.y + BAR_VERTICAL_OFFSET}
                        width={Math.max(elapsedEndX - x1, 1)}
                        height={BAR_HEIGHT}
                        strokeWidth={0.5}
                        rx={1}
                        className={
                          drug.isChronic
                            ? medicationChronicTimelineBarClass
                            : medicationNonChronicTimelineBarClass
                        }
                        onMouseEnter={(e) => showBarHover(e, 'elapsed')}
                        style={{ cursor: 'pointer' }}
                      />
                    )}
                    {hasFutureSegment && (
                      <rect
                        data-timeline-segment="future"
                        x={LABEL_COLUMN_WIDTH + futureStartX}
                        y={row.y + BAR_VERTICAL_OFFSET}
                        width={Math.max(x2 - futureStartX, 1)}
                        height={BAR_HEIGHT}
                        strokeWidth={0.75}
                        strokeDasharray="2 1.5"
                        rx={1}
                        className={
                          drug.isChronic
                            ? medicationChronicFutureTimelineBarClass
                            : medicationNonChronicFutureTimelineBarClass
                        }
                        onMouseEnter={(e) => showBarHover(e, 'future')}
                        style={{ cursor: 'pointer' }}
                      />
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* Keep today above the medication segments so the transition
            boundary remains visible; pointer events stay with the bars. */}
        {todayX >= 0 && todayX <= chartWidth && (
          <line
            data-timeline-today
            x1={LABEL_COLUMN_WIDTH + todayX}
            x2={LABEL_COLUMN_WIDTH + todayX}
            y1={AXIS_HEIGHT - 2}
            y2={totalHeight}
            strokeWidth={1}
            strokeDasharray="2,2"
            pointerEvents="none"
            className="stroke-destructive"
          />
        )}
      </svg>

      {/* ── Hover tooltip ──────────────────────────────────────────── */}
      {hover && (
        <div
          className="absolute z-10 pointer-events-none rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(hover.xPx - tooltipWidth / 2, 4), width - tooltipWidth - 4),
            top: Math.max(4, hover.yPx - 150),
            width: tooltipWidth,
          }}
        >
          <div className="font-semibold truncate">{hover.drugName}</div>
          {hover.drugProductName && (
            <div className="truncate text-[0.6875rem] text-muted-foreground">
              {hover.drugProductName}
            </div>
          )}
          {hover.segment === 'future' && (
            <div className="mb-1 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground">
              <span className="inline-block h-1.5 w-3 rounded-[1px] border border-dashed border-muted-foreground/70 bg-muted/25" />
              {mt.timelineAfterToday ?? 'After today'}
            </div>
          )}
          {hover.drugTerminology && (
            <dl className="mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t pt-1 text-[0.6875rem]">
              {hover.drugTerminology.ingredientText && (
                <>
                  <dt className="text-muted-foreground">
                    {mt.terminologyIngredientLabel ?? 'Ingredient / strength'}
                  </dt>
                  <dd className="truncate">{hover.drugTerminology.ingredientText}</dd>
                </>
              )}
              {hover.drugTerminology.officialNameZh && (
                <>
                  <dt className="text-muted-foreground">
                    {mt.terminologyOfficialNameZhLabel ?? '中文品名'}
                  </dt>
                  <dd className="truncate">{hover.drugTerminology.officialNameZh}</dd>
                </>
              )}
              {hover.drugTerminology.officialNameEn && (
                <>
                  <dt className="text-muted-foreground">
                    {mt.terminologyOfficialNameEnLabel ?? 'English name'}
                  </dt>
                  <dd className="truncate">{hover.drugTerminology.officialNameEn}</dd>
                </>
              )}
              {hover.drugTerminology.doseForm && (
                <>
                  <dt className="text-muted-foreground">
                    {mt.terminologyDoseFormLabel ?? 'Dose form'}
                  </dt>
                  <dd className="truncate">{hover.drugTerminology.doseForm}</dd>
                </>
              )}
              {hover.drugTerminology.atcCode && (
                <>
                  <dt className="text-muted-foreground">
                    {mt.terminologyAtcLabel ?? 'ATC'}
                  </dt>
                  <dd className="truncate">
                    {hover.drugTerminology.atcCode}
                    {(hover.drugTerminology.atcNameEn || hover.drugTerminology.atcNameZh) && (
                      <> · {hover.drugTerminology.atcNameEn || hover.drugTerminology.atcNameZh}</>
                    )}
                  </dd>
                </>
              )}
              {hover.drugTerminology.atcLevel2Code && (
                <>
                  <dt className="text-muted-foreground">
                    {mt.terminologyAtcLevel2Label ?? 'ATC subgroup'}
                  </dt>
                  <dd className="truncate">
                    {hover.drugTerminology.atcLevel2Code}
                    {(hover.drugTerminology.atcLevel2NameEn
                      || hover.drugTerminology.atcLevel2NameZh) && (
                      <> · {
                        locale === 'en'
                          ? hover.drugTerminology.atcLevel2NameEn
                            || hover.drugTerminology.atcLevel2NameZh
                          : hover.drugTerminology.atcLevel2NameZh
                            || hover.drugTerminology.atcLevel2NameEn
                      }</>
                    )}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">
                {mt.terminologySnapshotLabel ?? 'Version'}
              </dt>
              <dd className="truncate">{hover.drugTerminology.snapshotId}</dd>
              <div className="col-span-2 mt-0.5 border-t pt-0.5 text-muted-foreground">
                {mt.terminologySource ?? 'NHI drug master'}
              </div>
            </dl>
          )}
          <div className="text-muted-foreground">
            {shortYmd(hover.bar.startMs)} → {shortYmd(hover.bar.endMs)}
            <span className="ml-1">({hover.bar.supplyDays}d)</span>
          </div>
          {hover.bar.pharmacy && (
            <div className="text-muted-foreground truncate">
              {mt.pharmacyLabel ?? 'Dispensed at'}: {hover.bar.pharmacy}
            </div>
          )}
          {audience === 'medical' && hover.bar.icdCode && (
            <div className="text-muted-foreground truncate">
              {mt.billingIcdLabel ?? 'Billing ICD'}:{' '}
              <span className="font-mono">{hover.bar.icdCode}</span>
              {hover.bar.icdText && <span className="ml-1">{hover.bar.icdText}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
