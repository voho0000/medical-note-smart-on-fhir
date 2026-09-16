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

const PAD = { left: 46, right: 14, top: 10, bottom: 22 }
const DOSE_H = 54
const GAP = 26
const LDL_H = 86
const W = 820
const H = PAD.top + DOSE_H + GAP + LDL_H + PAD.bottom

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

function monthTicks(from: number, to: number): { at: number; label: string }[] {
  const ticks: { at: number; label: string }[] = []
  const cursor = new Date(from)
  cursor.setUTCDate(1)
  const span = (to - from) / 86400000
  const step = span > 900 ? 6 : span > 400 ? 3 : span > 150 ? 2 : 1
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
  const readings = useMemo(
    () => (therapy.response ?? []).filter((r) => Number.isFinite(r.value)),
    [therapy.response],
  )

  const scale = useMemo(() => {
    const stamps = [
      ...spans.flatMap((s) => [day(s.from), day(s.to)]),
      ...readings.map((r) => day(r.date)),
    ].filter(Number.isFinite)
    if (stamps.length === 0) return null
    const min = Math.min(...stamps)
    const max = Math.max(...stamps)
    // A single day would divide by zero; give it a month of room either side.
    const pad = max === min ? 15 * 86400000 : (max - min) * 0.04
    const from = min - pad
    const to = max + pad
    const x = (stamp: number) => PAD.left + ((stamp - from) / (to - from)) * (W - PAD.left - PAD.right)

    const doses = spans.map((s) => Number(s.dose?.replace(/[^0-9.]/g, '')) || 0)
    const doseMax = Math.max(...doses, 1)
    const values = readings.map((r) => r.value)
    const ldlMax = Math.max(...values, goal ?? 0) * 1.12
    const ldlMin = Math.min(...values, goal ?? Infinity) * 0.85
    const ldlTop = PAD.top + DOSE_H + GAP
    const y = (value: number) =>
      ldlTop + LDL_H - ((value - ldlMin) / Math.max(ldlMax - ldlMin, 1)) * LDL_H

    const ldlTicks = values.length > 0
      ? [...new Set([Math.round(Math.max(...values)), Math.round(Math.min(...values))])]
      : []
    return { from, to, x, y, doseMax, ldlTop, ldlTicks, ticks: monthTicks(from, to) }
  }, [spans, readings, goal])

  if (!scale || (spans.length === 0 && readings.length === 0)) return null

  const doseBaseline = PAD.top + DOSE_H
  const points = readings.map((r) => ({ ...r, cx: scale.x(day(r.date)), cy: scale.y(r.value) }))
  const path = points.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')

  return (
    <figure className="relative m-0 space-y-1">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
        <span className="font-medium">{isEnglish ? 'Statin dose and LDL-C response' : 'Statin 劑量與 LDL-C 反應'}</span>
        <span className="text-muted-foreground">
          {isEnglish ? 'Prescribing and laboratory records on one time axis' : '處方與檢驗紀錄，同一條時間軸'}
        </span>
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

        {scale.ticks.map((tick) => (
          <g key={tick.at}>
            <line
              x1={scale.x(tick.at)}
              x2={scale.x(tick.at)}
              y1={PAD.top}
              y2={PAD.top + DOSE_H + GAP + LDL_H}
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

        <text x={PAD.left - 8} y={PAD.top + 10} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
          mg
        </text>
        <line x1={PAD.left} x2={W - PAD.right} y1={doseBaseline} y2={doseBaseline} stroke="var(--border)" strokeWidth="1" />

        <g clipPath={`url(#${clipId})`}>
          {spans.map((span) => {
            const stated = Number(span.dose?.replace(/[^0-9.]/g, '')) || 0
            const x1 = scale.x(day(span.from))
            const x2 = Math.max(scale.x(day(span.to)), x1 + 6)
            const height = stated > 0 ? Math.max((stated / scale.doseMax) * (DOSE_H - 8), 6) : 10
            return (
              <g key={`${span.from}-${span.label}`}>
                <rect
                  x={x1}
                  y={doseBaseline - height}
                  width={Math.max(x2 - x1 - 2, 4)}
                  height={height}
                  rx="3"
                  fill={stated > 0 ? 'var(--primary)' : 'var(--muted-foreground)'}
                  fillOpacity={stated > 0 ? (span.changed ? 0.95 : 0.55) : 0.25}
                  stroke="var(--card)"
                  strokeWidth="2"
                />
                <rect
                  x={x1}
                  y={PAD.top}
                  width={Math.max(x2 - x1, 8)}
                  height={DOSE_H}
                  fill="transparent"
                  onMouseEnter={() => setHover({
                    x: (x1 + x2) / 2,
                    y: doseBaseline - height,
                    title: span.label,
                    lines: [
                      span.dose ?? (isEnglish ? 'No daily dose stated' : '處方未載每日劑量'),
                      `${span.from} – ${span.to}`,
                      isEnglish ? `${span.count} prescriptions` : `${span.count} 筆處方`,
                    ],
                  })}
                  onMouseLeave={() => setHover(null)}
                />
                <text
                  x={x1 + 3}
                  y={doseBaseline - height - 4}
                  className={span.changed ? 'fill-foreground' : 'fill-muted-foreground'}
                  style={{ fontSize: 10, fontWeight: span.changed ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}
                >
                  {span.changed ? '↗ ' : ''}
                  {span.dose ?? (isEnglish ? 'dose not stated' : '劑量未載')}
                </text>
              </g>
            )
          })}
        </g>

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
