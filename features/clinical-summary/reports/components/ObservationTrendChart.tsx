import { useMemo, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import type { ObservationHistoryItem } from '../hooks/useObservationHistory'
import { formatNumberSmart } from '../utils/number-format.utils'

interface ObservationTrendChartProps {
  data: ObservationHistoryItem[]
  unit?: string
}

export function ObservationTrendChart({ data, unit }: ObservationTrendChartProps) {
  const [colors, setColors] = useState({
    primary: '#3b82f6',
    destructive: '#ef4444',
    card: '#ffffff'
  })

  useEffect(() => {
    const getComputedColor = (cssVar: string, fallback: string) => {
      try {
        const style = getComputedStyle(document.documentElement)
        const hslValue = style.getPropertyValue(cssVar).trim()
        if (hslValue) {
          return `hsl(${hslValue})`
        }
      } catch (e) {
        console.warn(`Failed to get color for ${cssVar}`, e)
      }
      return fallback
    }

    setColors({
      primary: getComputedColor('--primary', '#3b82f6'),
      destructive: getComputedColor('--destructive', '#ef4444'),
      card: getComputedColor('--card', '#ffffff')
    })
  }, [])
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

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100]
    
    const values = chartData.map((d) => d.value)
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    
    let yMin = minValue
    let yMax = maxValue
    
    if (referenceRange?.low !== undefined) {
      yMin = Math.min(yMin, referenceRange.low)
    }
    if (referenceRange?.high !== undefined) {
      yMax = Math.max(yMax, referenceRange.high)
    }
    
    const padding = (yMax - yMin) * 0.1
    return [Math.max(0, yMin - padding), yMax + padding]
  }, [chartData, referenceRange])

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        無數值資料可顯示圖表
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis
          domain={yDomain}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickFormatter={(value: number) => formatNumberSmart(value)}
          label={{ value: unit || '', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value: number | undefined) => {
            if (value === undefined) return ['', '數值']
            return [`${formatNumberSmart(value)} ${unit || ''}`, '數值']
          }}
        />
        
        {referenceRange && (
          <>
            {referenceRange.low !== undefined && referenceRange.high !== undefined && (
              <ReferenceArea
                y1={referenceRange.low}
                y2={referenceRange.high}
                fill="hsl(var(--muted))"
                fillOpacity={0.3}
                label={{ value: '正常範圍', position: 'insideTopRight', fontSize: 10 }}
              />
            )}
            {referenceRange.low !== undefined && (
              <ReferenceLine
                y={referenceRange.low}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{ value: `低: ${referenceRange.low}`, position: 'left', fontSize: 10 }}
              />
            )}
            {referenceRange.high !== undefined && (
              <ReferenceLine
                y={referenceRange.high}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                label={{ value: `高: ${referenceRange.high}`, position: 'left', fontSize: 10 }}
              />
            )}
          </>
        )}
        
        <Line
          type="monotone"
          dataKey="value"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={{
            r: 6,
            fill: '#60a5fa',
            stroke: '#1e293b',
            strokeWidth: 2
          }}
          activeDot={{ 
            r: 8,
            fill: '#60a5fa',
            stroke: '#1e293b',
            strokeWidth: 2
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
