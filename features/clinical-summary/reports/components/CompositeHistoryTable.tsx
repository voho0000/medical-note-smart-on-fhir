import type { CompositeHistoryItem } from '../hooks/useObservationHistory'

interface CompositeHistoryTableProps {
  data: CompositeHistoryItem[]
  componentNames: string[]
}

export function CompositeHistoryTable({ data, componentNames }: CompositeHistoryTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        無歷史記錄
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-foreground">日期</th>
              <th className="px-4 py-3 text-left font-medium text-foreground">
                數值 ({componentNames.join('/')})
              </th>
              <th className="px-4 py-3 text-left font-medium text-foreground">狀態</th>
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
                <td className="px-4 py-3 font-medium">
                  {item.compositeValue} {item.unit || ''}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {item.status || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
