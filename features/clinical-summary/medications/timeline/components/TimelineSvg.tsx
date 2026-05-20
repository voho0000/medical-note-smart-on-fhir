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

import { useState } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import type { CategoryGroup, RefillBar, TimelineDrug } from '../hooks/useMedicationTimeline'

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

const CHRONIC_FILL = '#a78bfa'      // violet-400
const CHRONIC_STROKE = '#7c3aed'    // violet-600
const ACUTE_FILL = '#cbd5e1'        // slate-300
const ACUTE_STROKE = '#475569'      // slate-600
const TODAY_LINE = '#ef4444'        // red-500

interface HoverState {
  bar: RefillBar
  drugName: string
  xPx: number
  yPx: number
}

function shortYmd(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Build year ticks for the X-axis. Returns an array of tick positions in
 * pixels with associated year labels.
 */
function buildYearTicks(domainStartMs: number, domainEndMs: number, chartWidth: number, xScale: (ms: number) => number) {
  const startYear = new Date(domainStartMs).getFullYear()
  const endYear = new Date(domainEndMs).getFullYear()
  const ticks: { x: number; label: string }[] = []
  for (let y = startYear; y <= endYear; y++) {
    const ms = new Date(`${y}-01-01T00:00:00`).getTime()
    if (ms < domainStartMs || ms > domainEndMs) continue
    ticks.push({ x: xScale(ms), label: String(y) })
  }
  return ticks
}

export function TimelineSvg({ categories, domainStartMs, domainEndMs, width }: TimelineSvgProps) {
  const { t } = useLanguage()
  const { audience } = useAudience()
  const [hover, setHover] = useState<HoverState | null>(null)
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

  const yearTicks = buildYearTicks(domainStartMs, domainEndMs, chartWidth, xScale)
  const todayX = xScale(Date.now())

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        width={width}
        height={totalHeight}
        className="block"
        onMouseLeave={() => setHover(null)}
      >
        {/* ── X-axis: year labels + grid lines ──────────────────────── */}
        {yearTicks.map((tk) => (
          <g key={`tick-${tk.label}`}>
            <line
              x1={LABEL_COLUMN_WIDTH + tk.x}
              x2={LABEL_COLUMN_WIDTH + tk.x}
              y1={AXIS_HEIGHT - 2}
              y2={totalHeight}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text
              x={LABEL_COLUMN_WIDTH + tk.x + 3}
              y={14}
              fontSize={11}
              fill="#6b7280"
            >
              {tk.label}
            </text>
          </g>
        ))}

        {/* ── Today line ────────────────────────────────────────────── */}
        {todayX >= 0 && todayX <= chartWidth && (
          <line
            x1={LABEL_COLUMN_WIDTH + todayX}
            x2={LABEL_COLUMN_WIDTH + todayX}
            y1={AXIS_HEIGHT - 2}
            y2={totalHeight}
            stroke={TODAY_LINE}
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        )}

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
                  fill="#f1f5f9"
                />
                <text
                  x={6}
                  y={row.y + 14}
                  fontSize={11}
                  fontWeight={600}
                  fill="#334155"
                >
                  {row.group.label}{' '}
                  <tspan fontWeight={400} fill="#64748b">
                    ({row.group.drugs.length})
                  </tspan>
                </text>
              </g>
            )
          }

          const drug = row.drug
          return (
            <g key={drug.drugKey}>
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
                  title={drug.drugName}
                  style={{
                    fontSize: 11,
                    lineHeight: `${ROW_HEIGHT}px`,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: drug.isChronic ? '#5b21b6' : '#1f2937',
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
                const w = Math.max(x2 - x1, 1)
                return (
                  <rect
                    key={bar.refillId}
                    x={LABEL_COLUMN_WIDTH + x1}
                    y={row.y + BAR_VERTICAL_OFFSET}
                    width={w}
                    height={BAR_HEIGHT}
                    fill={drug.isChronic ? CHRONIC_FILL : ACUTE_FILL}
                    stroke={drug.isChronic ? CHRONIC_STROKE : ACUTE_STROKE}
                    strokeWidth={0.5}
                    rx={2}
                    onMouseEnter={(e) => {
                      const rect = (e.target as SVGRectElement).getBoundingClientRect()
                      const containerRect = (e.target as SVGRectElement)
                        .closest('svg')
                        ?.getBoundingClientRect()
                      setHover({
                        bar,
                        drugName: drug.drugName,
                        xPx: rect.left - (containerRect?.left ?? 0) + rect.width / 2,
                        yPx: rect.top - (containerRect?.top ?? 0),
                      })
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {/* ── Hover tooltip ──────────────────────────────────────────── */}
      {hover && (
        <div
          className="absolute z-10 pointer-events-none rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(hover.xPx - 100, 4), width - 220),
            top: hover.yPx - 70,
            width: 220,
          }}
        >
          <div className="font-semibold truncate">{hover.drugName}</div>
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
