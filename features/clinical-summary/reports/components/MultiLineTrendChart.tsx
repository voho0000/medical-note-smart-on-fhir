import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { ComponentHistoryItem } from '../hooks/useObservationHistory'

interface MultiLineTrendChartProps {
  componentData: ComponentHistoryItem[]
  unit?: string
}

export function MultiLineTrendChart({ componentData, unit }: MultiLineTrendChartProps) {
  const chartData = useMemo(() => {
    if (componentData.length === 0) return []

    // Collect all unique dates
    const dateSet = new Set<string>()
    componentData.forEach(comp => {
      comp.data.forEach(item => {
        if (item.date) dateSet.add(item.date)
      })
    })

    // Sort dates chronologically
    const sortedDates = Array.from(dateSet).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    )

    // Build chart data with all components
    return sortedDates.map(date => {
      const dataPoint: Record<string, any> = {
        date: new Date(date).toLocaleDateString('zh-TW', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }),
        fullDate: date,
      }

      componentData.forEach(comp => {
        const item = comp.data.find(d => d.date === date)
        if (item && typeof item.value === 'number') {
          dataPoint[comp.componentName] = item.value
        }
      })

      return dataPoint
    })
  }, [componentData])

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100]
    
    const allValues: number[] = []
    componentData.forEach(comp => {
      comp.data.forEach(item => {
        if (typeof item.value === 'number') {
          allValues.push(item.value)
        }
      })
    })

    if (allValues.length === 0) return [0, 100]

    const minValue = Math.min(...allValues)
    const maxValue = Math.max(...allValues)
    const padding = (maxValue - minValue) * 0.1
    
    return [Math.max(0, minValue - padding), maxValue + padding]
  }, [chartData, componentData])

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
          tickFormatter={(value: number) => {
            if (value === 0) return '0'
            if (value % 1 === 0) return value.toString()
            const absValue = Math.abs(value)
            if (absValue >= 100) return value.toFixed(0)
            if (absValue >= 1) return value.toFixed(1)
            if (absValue >= 0.1) return value.toFixed(2)
            return value.toFixed(3)
          }}
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
          formatter={(value: number | undefined, name?: string) => [`${value ?? ''} ${unit || ''}`, name || '']}
        />
        <Legend />
        
        {componentData.map((comp) => (
          <Line
            key={comp.componentName}
            type="monotone"
            dataKey={comp.componentName}
            name={comp.componentName}
            stroke={comp.color}
            strokeWidth={2}
            dot={{
              r: 5,
              fill: comp.color,
              stroke: '#1e293b',
              strokeWidth: 1
            }}
            activeDot={{ 
              r: 7,
              fill: comp.color,
              stroke: '#1e293b',
              strokeWidth: 2
            }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
