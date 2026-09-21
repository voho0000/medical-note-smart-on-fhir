"use client"

import { useId, useMemo, useState } from 'react'
import type { CdssCoverageSummary } from '../types'

/**
 * What the statin did, and what the LDL-C did after it.
 *
 * 表一's ladder is read off a change and the response to it — 「經起始治療 6~8
 * 週後，檢測血脂指標，…如血脂值未達標」 — which is two measures of different
 * scale over one period. They share the time axis and nothing else: a dose in
 * mg and a concentration in mg/dL on one pair of y-axes would put their
 * crossings where the scaling happened to place them, so each gets its own
 * panel and the eye compares along x.
 *
 * Both series are prescribing and laboratory records, not a record of what was
 * taken: a span ends at its last prescription rather than at a stop, and the
 * left edge is where the data window begins, not where treatment did.
 */

type Therapy = NonNullable<CdssCoverageSummary['therapy']>

const PAD = { left: 62, right: 14, top: 10, bottom: 22 }
/** One lane per lipid class the record holds; the statin's is taller because
 *  its height carries a dose, while an adjunct's carries only presence. */
const STATIN_LANE = 52
const ADJUNCT_LANE = 22
const GAP = 24
const LDL_H = 86
const W = 820
const DAY_MS = 86400000
const LONG_GAP_DAYS = 540
const DISPLAY_GAP_DAYS = 90
const MIN_TICK_DISTANCE = 54

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

function monthTicks(from: number, to: number, displaySpanDays = (to - from) / DAY_MS): { at: number; label: string }[] {
  const ticks: { at: number; label: string }[] = []
  const cursor = new Date(from)
  cursor.setUTCDate(1)
  const step = displaySpanDays > 900 ? 6 : displaySpanDays > 400 ? 3 : displaySpanDays > 150 ? 2 : 1
  while (cursor.getTime() <= to) {
    const at = cursor.getTime()
    if (at >= from) {
      ticks.push({
        at,
        label: `${cursor.getUTCFullYear().toString().slice(2)}/${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      })
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + step)
  }
  return ticks
}

type TimelineGap = {
  from: number
  to: number
  actualDays: number
}

const displayedIntervalDays = (actualDays: number) =>
  actualDays > LONG_GAP_DAYS ? DISPLAY_GAP_DAYS : actualDays

function buildTimeline(stamps: number[]) {
  const anchors = [...new Set(stamps)].sort((a, b) => a - b)
  const min = anchors[0]
  const max = anchors.at(-1)!
  const gaps: TimelineGap[] = []
  let displaySpanDays = 0

  for (let index = 1; index < anchors.length; index += 1) {
    const actualDays = (anchors[index] - anchors[index - 1]) / DAY_MS
    if (actualDays > LONG_GAP_DAYS) {
      gaps.push({ from: anchors[index - 1], to: anchors[index], actualDays })
    }
    displaySpanDays += displayedIntervalDays(actualDays)
  }

  // Place every known event on a continuous display-time axis, but give a
  // multi-year interval with no records only three months of visual width.
  // This preserves the order and local spacing of recent events without
  // implying that the missing years contain observations.
  const displayDay = (stamp: number) => {
    if (stamp <= min) return (stamp - min) / DAY_MS
    let elapsed = 0
    for (let index = 1; index < anchors.length; index += 1) {
      const left = anchors[index - 1]
      const right = anchors[index]
      const actualDays = (right - left) / DAY_MS
      const shownDays = displayedIntervalDays(actualDays)
      if (stamp <= right) {
        return elapsed + ((stamp - left) / (right - left)) * shownDays
      }
      elapsed += shownDays
    }
    return elapsed + (stamp - max) / DAY_MS
  }

  return { min, max, gaps, displayDay, displaySpanDays }
}

export function TherapyResponseChart({
  therapy,
  goal,
  locale,
}: {
  therapy: Therapy
  /** The selected tier's 血脂目標值, drawn as the line the readings are read against. */
  goal?: number
  locale: string
}) {
  const isEnglish = locale === 'en'
  const clipId = useId()
  const [hover, setHover] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null)

  const spans = useMemo(() => (therapy.timeline ?? []).filter((s) => s.from && s.to), [therapy.timeline])
  const lanes = useMemo(() => {
    const order: string[] = []
    for (const span of spans) if (!order.includes(span.classId)) order.push(span.classId)
    let top = PAD.top
    return order.map((classId) => {
      const height = classId === 'statin' ? STATIN_LANE : ADJUNCT_LANE
      const lane = {
        classId,
        label: spans.find((span) => span.classId === classId)!.classLabel,
        top,
        height,
      }
      top += height + 6
      return lane
    })
  }, [spans])
  const lanesHeight = lanes.reduce((total, lane) => total + lane.height + 6, 0)
  const H = PAD.top + lanesHeight + GAP + LDL_H + PAD.bottom
  const readings = useMemo(
    () => [...(therapy.response ?? [])]
      .filter((r) => Number.isFinite(r.value))
      .sort((a, b) => day(a.date) - day(b.date)),
    [therapy.response],
  )

  const scale = useMemo(() => {
    const stamps = [
      ...spans.flatMap((s) => [day(s.from), day(s.to)]),
      ...readings.map((r) => day(r.date)),
    ].filter(Number.isFinite)
    if (stamps.length === 0) return null
    const timeline = buildTimeline(stamps)
    // A single day would divide by zero; give it a month of room either side.
    const padDays = timeline.max === timeline.min ? 15 : Math.max(timeline.displaySpanDays * 0.04, 3)
    const displaySpan = Math.max(timeline.displaySpanDays, 1) + padDays * 2
    const x = (stamp: number) => PAD.left
      + ((timeline.displayDay(stamp) + padDays) / displaySpan) * (W - PAD.left - PAD.right)

    const doses = spans.map((s) => Number(s.dose?.replace(/[^0-9.]/g, '')) || 0)
    const doseMax = Math.max(...doses, 1)
    const values = readings.map((r) => r.value)
    const ldlMax = Math.max(...values, goal ?? 0) * 1.12
    const ldlMin = Math.min(...values, goal ?? Infinity) * 0.85
    const ldlTop = PAD.top + lanesHeight + GAP
    const y = (value: number) =>
      ldlTop + LDL_H - ((value - ldlMin) / Math.max(ldlMax - ldlMin, 1)) * LDL_H

    const ldlTicks = values.length > 0
      ? [...new Set([Math.round(Math.max(...values)), Math.round(Math.min(...values))])]
      : []
    const ticks = monthTicks(timeline.min, timeline.max, timeline.displaySpanDays)
      .filter((tick) => !timeline.gaps.some((gap) => tick.at > gap.from && tick.at < gap.to))
      .reduce<{ at: number; label: string }[]>((kept, tick) => {
        const previous = kept.at(-1)
        if (!previous || x(tick.at) - x(previous.at) >= MIN_TICK_DISTANCE) kept.push(tick)
        return kept
      }, [])

    return { x, y, doseMax, ldlTop, ldlTicks, ticks, gaps: timeline.gaps }
  }, [spans, readings, goal, lanesHeight])

  if (!scale || (spans.length === 0 && readings.length === 0)) return null


  const points = readings.map((r) => ({ ...r, cx: scale.x(day(r.date)), cy: scale.y(r.value) }))
  const path = points.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')

  return (
    <figure className="relative m-0 space-y-1">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
        <span className="font-medium">{isEnglish ? 'Statin dose and LDL-C response' : 'Statin 劑量與 LDL-C 反應'}</span>
        <span className="text-muted-foreground">
          {isEnglish
            ? 'Prescribing and laboratory records on one time axis; the banded columns are 表一\u2019s 6–8 week recheck after each change'
            : '處方與檢驗紀錄，同一條時間軸；帶狀區間是表一在每次變動後的 6–8 週複驗窗'}
        </span>
        {scale.gaps.length > 0 ? (
          <span className="text-muted-foreground">
            {isEnglish ? '// marks a long interval without records' : '// 表示長期無資料區間已折疊'}
          </span>
        ) : null}
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 'auto' }}
        role="img"
        aria-label={isEnglish ? 'Statin daily dose over time above LDL-C readings over the same period' : 'Statin 每日劑量與同期 LDL-C 檢驗值'}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={0} width={W - PAD.left - PAD.right} height={H} />
          </clipPath>
        </defs>

        {spans.filter((span) => span.recheck).map((span) => {
          const window = span.recheck!
          const x1 = scale.x(day(window.from))
          const x2 = Math.max(scale.x(day(window.to)), x1 + 3)
          const bottom = PAD.top + lanesHeight + GAP + LDL_H
          return (
            <g key={`recheck-${span.classId}-${span.from}`} clipPath={`url(#${clipId})`}>
              <rect
                x={x1}
                y={PAD.top}
                width={x2 - x1}
                height={bottom - PAD.top}
                fill="var(--primary)"
                fillOpacity="0.07"
              />
              <line x1={x1} x2={x1} y1={PAD.top} y2={bottom} stroke="var(--primary)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={x2} x2={x2} y1={PAD.top} y2={bottom} stroke="var(--primary)" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />
              {window.met === false ? (
                <text
                  x={(x1 + x2) / 2}
                  y={bottom - 3}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: 9 }}
                >
                  {isEnglish ? 'no recheck' : '未見複驗'}
                </text>
              ) : null}
              <rect
                x={x1}
                y={PAD.top}
                width={x2 - x1}
                height={bottom - PAD.top}
                fill="transparent"
                onMouseEnter={() => setHover({
                  x: (x1 + x2) / 2,
                  y: PAD.top,
                  title: window.label,
                  lines: [
                    `${window.from} – ${window.to}`,
                    `${span.classLabel} · ${span.label}`,
                    window.met === true
                      ? (isEnglish ? 'A reading landed in the window' : '窗內有複驗紀錄')
                      : window.met === false
                        ? (isEnglish ? 'The window closed with no reading' : '窗已過，未見複驗')
                        : (isEnglish ? 'The window has not closed yet' : '窗尚未結束'),
                  ],
                })}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          )
        })}

        {scale.ticks.map((tick) => (
          <g key={tick.at}>
            <line
              x1={scale.x(tick.at)}
              x2={scale.x(tick.at)}
              y1={PAD.top}
              y2={PAD.top + lanesHeight + GAP + LDL_H}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={scale.x(tick.at)}
              y={H - 7}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
            >
              {tick.label}
            </text>
          </g>
        ))}

        {scale.gaps.map((gap) => {
          const x = scale.x((gap.from + gap.to) / 2)
          const bottom = PAD.top + lanesHeight + GAP + LDL_H
          const years = Math.round((gap.actualDays / 365.25) * 10) / 10
          return (
            <g key={`gap-${gap.from}-${gap.to}`} aria-label={isEnglish ? `${years} years without records` : `${years} 年無資料`}>
              <rect x={x - 8} y={PAD.top} width="16" height={bottom - PAD.top} fill="var(--card)" fillOpacity="0.9" />
              <line x1={x - 5} x2={x - 1} y1={bottom - 7} y2={bottom + 1} stroke="var(--muted-foreground)" strokeWidth="1.5" />
              <line x1={x + 1} x2={x + 5} y1={bottom - 7} y2={bottom + 1} stroke="var(--muted-foreground)" strokeWidth="1.5" />
              <title>{isEnglish ? `${years} years without records; timeline compressed` : `${years} 年無資料，時間軸已折疊`}</title>
            </g>
          )
        })}

        {lanes.map((lane) => {
          const baseline = lane.top + lane.height
          return (
            <g key={lane.classId}>
              <text
                x={PAD.left - 8}
                y={baseline - 2}
                textAnchor="end"
                className="fill-muted-foreground"
                style={{ fontSize: 10 }}
              >
                {lane.label}
              </text>
              <line x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} stroke="var(--border)" strokeWidth="1" />
              <g clipPath={`url(#${clipId})`}>
                {spans.filter((span) => span.classId === lane.classId).map((span) => {
                  const stated = Number(span.dose?.replace(/[^0-9.]/g, '')) || 0
                  const x1 = scale.x(day(span.from))
                  const x2 = Math.max(scale.x(day(span.to)), x1 + 6)
                  const height = lane.classId !== 'statin'
                    ? lane.height - 8
                    : stated > 0
                      ? Math.max((stated / scale.doseMax) * (lane.height - 8), 6)
                      : 10
                  return (
                    <g key={`${span.from}-${span.label}`}>
                      <rect
                        x={x1}
                        y={baseline - height}
                        width={Math.max(x2 - x1 - 2, 4)}
                        height={height}
                        rx="3"
                        fill={stated > 0 || lane.classId !== 'statin' ? 'var(--primary)' : 'var(--muted-foreground)'}
                        fillOpacity={lane.classId !== 'statin' ? 0.5 : stated > 0 ? (span.changed ? 0.95 : 0.55) : 0.25}
                        stroke="var(--card)"
                        strokeWidth="2"
                      />
                      <rect
                        x={x1}
                        y={lane.top}
                        width={Math.max(x2 - x1, 8)}
                        height={lane.height}
                        fill="transparent"
                        onMouseEnter={() => setHover({
                          x: (x1 + x2) / 2,
                          y: baseline - height,
                          title: span.label,
                          lines: [
                            [span.intensityLabel, span.dose ?? (isEnglish ? 'No daily dose stated' : '處方未載每日劑量')].filter(Boolean).join(' · '),
                            `${span.from} – ${span.to}`,
                            isEnglish ? `${span.count} prescriptions` : `${span.count} 筆處方`,
                          ],
                        })}
                        onMouseLeave={() => setHover(null)}
                      />
                      {lane.classId === 'statin' ? (
                        <text
                          x={x1 + 3}
                          y={baseline - height - 4}
                          className={span.changed ? 'fill-foreground' : 'fill-muted-foreground'}
                          style={{ fontSize: 10, fontWeight: span.changed ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {span.changed ? '↗ ' : ''}
                          {span.intensityLabel ? `${span.intensityLabel} · ` : ''}
                          {span.dose ?? (isEnglish ? 'dose not stated' : '劑量未載')}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
              </g>
            </g>
          )
        })}

        {goal !== undefined ? (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={scale.y(goal)}
              y2={scale.y(goal)}
              stroke="var(--primary)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <text
              x={PAD.left + 4}
              y={scale.y(goal) - 5}
              className="fill-muted-foreground"
              style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
            >
              {isEnglish ? `goal <${goal}` : `目標 <${goal}`}
            </text>
          </g>
        ) : null}

        <text x={PAD.left - 8} y={scale.ldlTop + 10} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
          LDL-C
        </text>
        {scale.ldlTicks.map((tick) => (
          <text
            key={tick}
            x={PAD.left - 8}
            y={scale.y(tick) + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
          >
            {tick}
          </text>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {points.length > 1 ? (
            <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          {points.map((point, index) => (
            <g key={point.date}>
              <circle
                cx={point.cx}
                cy={point.cy}
                r="5"
                fill="var(--primary)"
                stroke="var(--card)"
                strokeWidth="2"
              />
              <circle
                cx={point.cx}
                cy={point.cy}
                r="14"
                fill="transparent"
                onMouseEnter={() => setHover({
                  x: point.cx,
                  y: point.cy,
                  title: `LDL-C ${point.display}`,
                  lines: [point.date, goal !== undefined ? (point.value < goal ? (isEnglish ? 'below goal' : '低於目標') : (isEnglish ? 'at or above goal' : '未達目標')) : ''].filter(Boolean),
                })}
                onMouseLeave={() => setHover(null)}
              />
              {index === points.length - 1 ? (
                <text
                  x={point.cx - 8}
                  y={point.cy - 12}
                  textAnchor="end"
                  className="fill-foreground"
                  style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                >
                  {point.value}
                </text>
              ) : null}
            </g>
          ))}
        </g>
      </svg>

      {hover ? (
        <div
          className="pointer-events-none absolute z-20 w-max max-w-56 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: 'translate(-50%, -115%)' }}
          role="status"
        >
          <p className="font-medium tabular-nums">{hover.title}</p>
          {hover.lines.map((line) => (
            <p key={line} className="tabular-nums text-muted-foreground">{line}</p>
          ))}
        </div>
      ) : null}

      {therapy.intensityReference ? (
        <details className="text-xs">
          <summary className="min-h-11 cursor-pointer py-2 text-muted-foreground">
            {therapy.intensityReference.title}
          </summary>
          <p className="pb-2 leading-relaxed text-muted-foreground">{therapy.intensityReference.note}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  {therapy.intensityReference.columns.map((column) => (
                    <th key={column} className="py-1 pr-3 font-medium">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {therapy.intensityReference.rows.map((row) => (
                  <tr
                    key={row.ingredient}
                    className={row.current ? 'border-b border-border/60 bg-primary/10 font-medium' : 'border-b border-border/60 last:border-0'}
                  >
                    <td className="py-1 pr-3">
                      {row.current ? <span aria-hidden="true" className="mr-1 text-primary">●</span> : null}
                      {row.ingredient}
                    </td>
                    <td className="py-1 pr-3">{row.high}</td>
                    <td className="py-1">{row.moderate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <details className="text-xs">
        <summary className="min-h-11 cursor-pointer py-2 text-muted-foreground">
          {isEnglish ? 'The same data as a table' : '以表格檢視同一組資料'}
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1 pr-3 font-medium">{isEnglish ? 'Date' : '日期'}</th>
                <th className="py-1 pr-3 font-medium">{isEnglish ? 'Statin' : 'Statin 處方'}</th>
                <th className="py-1 font-medium">LDL-C</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {spans.map((span) => (
                <tr key={`span-${span.from}`} className="border-b border-border/60">
                  <td className="py-1 pr-3">{span.from} – {span.to}</td>
                  <td className="py-1 pr-3">{span.label}{span.dose ? ` · ${span.dose}` : ''}</td>
                  <td className="py-1 text-muted-foreground">—</td>
                </tr>
              ))}
              {readings.map((reading) => (
                <tr key={`ldl-${reading.date}`} className="border-b border-border/60 last:border-0">
                  <td className="py-1 pr-3">{reading.date}</td>
                  <td className="py-1 pr-3 text-muted-foreground">—</td>
                  <td className="py-1">{reading.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
