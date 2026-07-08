import { cn } from '@/src/shared/utils/cn.utils'
import type { ObservationHistoryItem } from '../hooks/useObservationHistory'
import { formatNumberSmart } from '../utils/number-format.utils'

interface ObservationHistoryTableProps {
  data: ObservationHistoryItem[]
}

type DerivedStatus = 'high' | 'low' | 'normal' | null

/**
 * Derive a high/low/normal flag purely from value + referenceRange.
 * Used as a fallback when the FHIR Observation didn't include an
 * `interpretation` code (common with NHI 健保存摺 / bridge-imported data),
 * so the trend table still highlights out-of-range values in red instead
 * of leaving every row uncolored.
 *
 * Exported for unit-test access; not used outside this module.
 */
export function deriveStatusFromRange(
  value: number | string | undefined,
  referenceRange?: { low?: number; high?: number; text?: string }
): DerivedStatus {
  if (typeof value !== 'number' || !referenceRange) return null
  const { low, high } = referenceRange
  if (typeof high === 'number' && value > high) return 'high'
  if (typeof low === 'number' && value < low) return 'low'
  if (typeof low === 'number' || typeof high === 'number') return 'normal'
  return null
}

export function ObservationHistoryTable({ data }: ObservationHistoryTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        無歷史記錄
      </div>
    )
  }

  /**
   * Compute effective status: prefer the FHIR-supplied interpretation, fall
   * back to comparing the numeric value against the referenceRange. Keeps
   * the rest of the styling code unified — every callsite gets one of
   * 'high' | 'low' | 'abnormal' | 'normal' | null.
   */
  const getEffectiveStatus = (item: ObservationHistoryItem): 'high' | 'low' | 'abnormal' | 'normal' | null => {
    const interp = item.interpretation?.toLowerCase()
    if (interp) {
      // Source interpretation is authoritative — once it's present we NEVER fall
      // through to app-side range math (2026-07-08 policy; see
      // interpretation-helpers.ts). Match single-letter codes exactly so "high"
      // doesn't also trigger the "low" branch via its "h"-fragment.
      if (interp === 'h' || interp === 'hh' || interp.includes('high')) return 'high'
      if (interp === 'l' || interp === 'll' || interp.includes('low')) return 'low'
      if (interp === 'a' || interp === 'aa' || interp === 'abn' || interp.includes('abnormal')) return 'abnormal'
      // Everything else present (n / normal / neg / negative / nr / nonreactive
      // / unrecognised) → not flagged, rather than guessing from a range.
      return 'normal'
    }
    return deriveStatusFromRange(item.value, item.referenceRange)
  }

  // Styling mirrors the regular report list (ObservationBlock / ReportRow):
  // only out-of-range values are highlighted; "normal" is rendered with the
  // default foreground colour and no badge, so the trend dialog doesn't
  // introduce styling that's absent from the rest of the app.
  const getValueStyle = (status: ReturnType<typeof getEffectiveStatus>) => {
    if (status === 'high') return 'text-red-600 font-medium'
    if (status === 'low') return 'text-orange-600 font-medium'
    if (status === 'abnormal') return 'text-yellow-600 font-medium'
    return ''
  }

  const getStatusBadge = (status: ReturnType<typeof getEffectiveStatus>) => {
    if (status === 'high') {
      return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">偏高</span>
    }
    if (status === 'low') {
      return <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">偏低</span>
    }
    if (status === 'abnormal') {
      return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">異常</span>
    }
    return null
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
            {data.map((item, index) => {
              const status = getEffectiveStatus(item)
              return (
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
                  getValueStyle(status)
                )}
                title={typeof item.value === 'number' ? `原始值: ${item.value} ${item.unit || ''}` : undefined}
                >
                  {typeof item.value === 'number'
                    ? `${formatNumberSmart(item.value)} ${item.unit || ''}`
                    : item.value}
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(status)}
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
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
