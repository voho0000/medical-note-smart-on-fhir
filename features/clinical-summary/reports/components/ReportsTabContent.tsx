// Reports Tab Content Component
import { TabsContent } from "@/components/ui/tabs"
import type { Row } from '../types'
import { ReportRow } from './ReportRow'

interface ReportsTabContentProps {
  value: string
  rows: Row[]
}

export function ReportsTabContent({ value, rows }: ReportsTabContentProps) {
  const defaultOpen = rows.slice(0, 2).map((r) => r.id)

  return (
    <TabsContent value={value} className="mt-0">
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No reports available in this category.</div>
      ) : (
        <div className="w-full space-y-2">
          {rows.map((row) => (
            <ReportRow key={row.id} row={row} defaultOpen={defaultOpen} />
          ))}
        </div>
      )}
    </TabsContent>
  )
}
