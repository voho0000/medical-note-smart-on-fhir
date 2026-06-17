import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, LabelList } from 'recharts'
import type { ObservationHistoryItem } from '../hooks/useObservationHistory'
import { formatNumberSmart } from '../utils/number-format.utils'

interface ObservationTrendChartProps {
  data: ObservationHistoryItem[]
  unit?: string
}

// Round a value range to "nice" axis bounds + evenly-spaced round ticks
// (steps of 1 / 2 / 2.5 / 5 × 10ⁿ, e.g. 0.5) so the Y axis reads
// "3.5, 4, 4.5…" instead of the raw data-derived decimals recharts would
// emit from an arbitrary [min−pad, max+pad] domain (which also produced the
// floating-point artifacts at the axis foot).
export function niceAxis(
  lo: number,
  hi: number,
  targetTicks = 5,
): { domain: [number, number]; ticks: number[] } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return { domain: [0, 1], ticks: [0, 1] }
  if (hi === lo) {
    const pad = Math.abs(lo) > 1e-9 ? Math.abs(lo) * 0.1 : 1
    lo -= pad
    hi += pad
  }
  const rawStep = (hi - lo) / targetTicks
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const decimals = Math.max(0, -Math.floor(Math.log10(step))) + 2
  const round = (v: number) => Number(v.toFixed(decimals))
  // floor/ceil already place the data strictly inside [niceMin, niceMax] for
  // any value that isn't an exact multiple of step; the reference band is the
  // usual extreme and reads fine sitting on the top/bottom gridline.
  const niceMin = round(Math.floor(lo / step) * step)
  const niceMax = round(Math.ceil(hi / step) * step)
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step / 2; v = round(v + step)) ticks.push(v)
  return { domain: [niceMin, niceMax], ticks }
}

export function ObservationTrendChart({ data, unit }: ObservationTrendChartProps) {
  // recharts needs a concrete colour (not a CSS class); read the theme's card
  // background once via a lazy initializer so the dot "donut" ring matches the
  // light/dark background. Client-only (this chart lives in a click-mounted
  // dialog, never SSR'd), so reading the DOM here is safe.
  const [cardColor] = useState(() => {
    if (typeof document === 'undefined') return '#ffffff'
    try {
      const hsl = getComputedStyle(document.documentElement).getPropertyValue('--card').trim()
      return hsl ? `hsl(${hsl})` : '#ffffff'
    } catch {
      return '#ffffff'
    }
  })

  const chartData = useMemo(() => {
    return data
      .filter((item) => typeof item.value === 'number')
      .map((item) => ({
        date: new Date(item.date).toLocaleDateString('zh-TW', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }),
        value: item.value as number,
        fullDate: item.date,
        interpretation: item.interpretation,
      }))
      .reverse()
  }, [data])

  const referenceRange = useMemo(() => {
    const item = data.find((d) => d.referenceRange)
    return item?.referenceRange
  }, [data])

  const { domain: yDomain, ticks: yTicks } = useMemo(() => {
    if (chartData.length === 0) return { domain: [0, 1] as [number, number], ticks: [0, 1] }
    const values = chartData.map((d) => d.value)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    if (referenceRange?.low !== undefined) lo = Math.min(lo, referenceRange.low)
    if (referenceRange?.high !== undefined) hi = Math.max(hi, referenceRange.high)
    return niceAxis(lo, hi)
  }, [chartData, referenceRange])

  const isAbnormal = (v: number) =>
    (referenceRange?.low !== undefined && v < referenceRange.low) ||
    (referenceRange?.high !== undefined && v > referenceRange.high)

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        無數值資料可顯示圖表
      </div>
    )
  }

  const LINE = '#3b82f6'
  const ABNORMAL = '#ef4444'
  const BAND = '#22c55e'

  // Shorter on phones so the chart doesn't eat ~70% of the viewport above the
  // data table; full height from sm up. Pure CSS (SSR-safe, no hydration).
  return (
    <div className="h-[220px] sm:h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 20, right: 16, left: 8, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickLine={false}
          minTickGap={24}
          // Inset the first/last points so their value labels clear the axis
          // edges instead of overlapping the Y-axis ticks (worst with 2 points).
          padding={{ left: 30, right: 30 }}
          className="text-muted-foreground"
        />
        <YAxis
          domain={yDomain}
          ticks={yTicks}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={44}
          className="text-muted-foreground"
          tickFormatter={(value: number) => formatNumberSmart(value)}
          label={{ value: unit || '', angle: -90, position: 'insideLeft', style: { fontSize: 12, textAnchor: 'middle' } }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value) => {
            if (typeof value !== 'number') return ['', '數值']
            const flag = isAbnormal(value) ? ' ⚠' : ''
            return [`${formatNumberSmart(value)} ${unit || ''}${flag}`, '數值']
          }}
        />

        {/* Normal range — soft green band, bounds read off the axis ticks so no
            overlapping 低/高 labels are needed. */}
        {referenceRange?.low !== undefined && referenceRange?.high !== undefined && (
          <ReferenceArea
            y1={referenceRange.low}
            y2={referenceRange.high}
            fill={BAND}
            fillOpacity={0.1}
            stroke="none"
            label={{ value: '正常範圍', position: 'insideTopRight', fontSize: 10, fill: '#16a34a' }}
          />
        )}
        {referenceRange?.low !== undefined && (
          <ReferenceLine y={referenceRange.low} stroke={BAND} strokeOpacity={0.55} strokeDasharray="4 4" />
        )}
        {referenceRange?.high !== undefined && (
          <ReferenceLine y={referenceRange.high} stroke={BAND} strokeOpacity={0.55} strokeDasharray="4 4" />
        )}

        <Line
          type="monotone"
          dataKey="value"
          stroke={LINE}
          strokeWidth={2}
          dot={(props: any) => {
            const { cx, cy, payload, index } = props
            const key = payload?.fullDate ?? index
            if (cx == null || cy == null) return <g key={key} />
            const abnormal = isAbnormal(payload?.value)
            return (
              <circle
                key={key}
                cx={cx}
                cy={cy}
                r={4}
                fill={abnormal ? ABNORMAL : LINE}
                stroke={cardColor}
                strokeWidth={1.5}
              />
            )
          }}
          activeDot={{ r: 6, fill: LINE, stroke: cardColor, strokeWidth: 2 }}
        >
          {/* Always-on value labels above each point (not just on hover). */}
          <LabelList
            dataKey="value"
            content={(props: any) => {
              const { x, y, value, index } = props
              if (x == null || y == null || typeof value !== 'number') return null
              return (
                <text
                  key={index}
                  x={x}
                  y={y - 10}
                  textAnchor="middle"
                  style={{ fontSize: 11, fontWeight: 500, fill: isAbnormal(value) ? ABNORMAL : 'hsl(var(--foreground))' }}
                >
                  {formatNumberSmart(value)}
                </text>
              )
            }}
          />
        </Line>
      </LineChart>
    </ResponsiveContainer>
    </div>
  )
}
