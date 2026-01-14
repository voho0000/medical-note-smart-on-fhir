import { cn } from '@/src/shared/utils/cn.utils'
import type { ObservationHistoryItem } from '../hooks/useObservationHistory'
import { formatNumberSmart } from '../utils/number-format.utils'

interface ObservationHistoryTableProps {
  data: ObservationHistoryItem[]
}

export function ObservationHistoryTable({ data }: ObservationHistoryTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        無歷史記錄
      </div>
    )
  }

  const getInterpretationStyle = (interpretation?: string) => {
    if (!interpretation) return ''
    
    const lower = interpretation.toLowerCase()
    if (lower.includes('high') || lower.includes('h')) {
      return 'text-red-600 font-medium'
    }
    if (lower.includes('low') || lower.includes('l')) {
      return 'text-orange-600 font-medium'
    }
    if (lower.includes('abnormal')) {
      return 'text-yellow-600 font-medium'
    }
    return 'text-green-600'
  }

  const getStatusBadge = (interpretation?: string) => {
    if (!interpretation) return null
    
    const lower = interpretation.toLowerCase()
    if (lower.includes('high') || lower.includes('h')) {
      return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">偏高</span>
    }
    if (lower.includes('low') || lower.includes('l')) {
      return <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">偏低</span>
    }
    if (lower.includes('abnormal')) {
      return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">異常</span>
    }
    return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">正常</span>
  }

  return (
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-foreground">日期</th>
              <th className="px-4 py-3 text-left font-medium text-foreground">數值</th>
              <th className="px-4 py-3 text-left font-medium text-foreground">狀態</th>
              <th className="px-4 py-3 text-left font-medium text-foreground">參考範圍</th>
              <th className="px-4 py-3 text-left font-medium text-foreground">來源報告</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((item, index) => (
              <tr 
                key={item.id || index}
                className="hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(item.date).toLocaleDateString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </td>
                <td className={cn(
                  "px-4 py-3 font-medium cursor-help",
                  getInterpretationStyle(item.interpretation)
                )}
                title={typeof item.value === 'number' ? `原始值: ${item.value} ${item.unit || ''}` : undefined}
                >
                  {typeof item.value === 'number' 
                    ? `${formatNumberSmart(item.value)} ${item.unit || ''}` 
                    : item.value}
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(item.interpretation)}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {item.referenceRange ? (
                    <>
                      {item.referenceRange.low !== undefined && item.referenceRange.high !== undefined ? (
                        `${item.referenceRange.low} - ${item.referenceRange.high}`
                      ) : item.referenceRange.text ? (
                        item.referenceRange.text
                      ) : (
                        '—'
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {item.reportName || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
