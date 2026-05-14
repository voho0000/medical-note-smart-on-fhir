// Reports Tab Content Component
import { TabsContent } from "@/components/ui/tabs"
import type { Row } from '../types'
import { ReportRow } from './ReportRow'

interface ReportsTabContentProps {
  value: string
  rows: Row[]
  /** When true, take remaining vertical space and scroll internally
   *  (used in fullscreen mode where the parent has overflow-hidden). */
  fullHeight?: boolean
}

export function ReportsTabContent({ value, rows, fullHeight = false }: ReportsTabContentProps) {
  const defaultOpen: string[] = []

  return (
    <TabsContent
      value={value}
      className={fullHeight ? 'mt-0 flex-1 min-h-0 overflow-y-auto pr-1' : 'mt-0'}
    >
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
