import { Building2 } from 'lucide-react'
import type { ReportHistoryItem } from '../hooks/useObservationHistory'
import { FormattedReportText } from './FormattedReportText'

interface ReportHistoryListProps {
  data: ReportHistoryItem[]
}

function formatDate(d: string): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    return d
  }
}

export function ReportHistoryList({ data }: ReportHistoryListProps) {
  if (data.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        無歷史記錄
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <div key={item.id || i} className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">{formatDate(item.date)}</span>
            {item.institution && (
              <span className="inline-flex items-center gap-1 text-blue-600/80 dark:text-blue-400/80">
                <Building2 className="h-3 w-3" />
                {item.institution}
              </span>
            )}
          </div>
          {item.conclusion && (
            <FormattedReportText
              text={item.conclusion}
              className="text-sm leading-relaxed text-foreground/90"
            />
          )}
          {item.notes.length > 0 && (
            <FormattedReportText
              text={item.notes.join('\n\n')}
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
            />
          )}
        </div>
      ))}
    </div>
  )
}
