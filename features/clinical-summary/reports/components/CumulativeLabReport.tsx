"use client"

// Cumulative lab report view (VGH 累積報告 style).
// Pivot: rows = tests, columns = dates (newest first).
// Categories tabs: CBC, 生化, 血糖, 癌症指數, 尿液.
// Expand/fullscreen is handled at the parent level (ReportsCard) so the
// whole Reports section can be enlarged, not just this view.
import { useMemo, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useLabPivot, type LabPivot } from "../hooks/useLabPivot"
import { LAB_CATEGORIES } from "@/src/shared/utils/lab-categories"

interface CumulativeLabReportProps {
  observations: any[]
  /** When true, allow table to take more vertical space (e.g., parent fullscreen mode) */
  fullHeight?: boolean
}

function formatDateLabel(d: string): string {
  return d.length >= 10 ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : d
}

function LabPivotTable({ pivot, fullHeight = false }: { pivot: LabPivot; fullHeight?: boolean }) {
  const { t } = useLanguage()
  if (pivot.rows.length === 0 || pivot.dates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        {t.reports.noData}
      </div>
    )
  }

  const heightClass = fullHeight ? 'max-h-[calc(100vh-220px)]' : 'max-h-[60vh]'
  return (
    <div
      className={`w-full max-w-full overflow-x-auto overflow-y-auto ${heightClass} rounded-md border [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/30`}
      style={{ scrollbarWidth: 'thin' }}
    >
      <table className="text-xs border-collapse w-max min-w-full">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
          <tr>
            <th className="sticky left-0 z-20 bg-muted/95 border-b border-r p-2 text-left font-semibold whitespace-nowrap min-w-[110px]">
              {pivot.category.labelEn} / {pivot.category.labelZh.split(' ')[0]}
            </th>
            {pivot.dates.map((d) => (
              <th key={d} className="border-b p-2 text-center font-medium whitespace-nowrap min-w-[68px]">
                {formatDateLabel(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderRowsWithSubgroups(pivot)}
        </tbody>
      </table>
    </div>
  )
}

function renderRowsWithSubgroups(pivot: LabPivot) {
  const subgroups = pivot.category.subgroups || []
  const elements: React.ReactElement[] = []
  let lastSubgroupId: string | undefined | null = null
  let rowIdx = 0
  for (const row of pivot.rows) {
    const sgId = row.subgroupId
    if (subgroups.length > 0 && sgId !== lastSubgroupId) {
      const sg = subgroups.find((s) => s.id === sgId)
      const label = sg ? `${sg.labelZh} · ${sg.labelEn}` : 'Other'
      elements.push(
        <tr key={`sg-${sgId || 'other'}-${rowIdx}`} className="bg-muted/60">
          <td
            colSpan={pivot.dates.length + 1}
            className="sticky left-0 z-10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground border-y"
          >
            {label}
          </td>
        </tr>
      )
      lastSubgroupId = sgId
    }
    const idx = rowIdx++
    elements.push(
      <tr key={row.testKey} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
        <td className="sticky left-0 z-10 bg-inherit border-r p-2 font-medium whitespace-nowrap">
          <div>{row.displayName}</div>
          {row.unit && <div className="text-[10px] text-muted-foreground">{row.unit}</div>}
        </td>
        {pivot.dates.map((d) => {
          const cell = row.values.get(d)
          if (!cell) {
            return <td key={d} className="border-l p-1.5 text-center text-muted-foreground">—</td>
          }
          const cls = cell.isAbnormal ? "text-red-600 font-medium" : "text-foreground"
          return (
            <td
              key={d}
              className={`border-l p-1.5 text-center ${cls}`}
              title={cell.interpretationCode ? `Interpretation: ${cell.interpretationCode}` : undefined}
            >
              {cell.value}
            </td>
          )
        })}
      </tr>
    )
  }
  return elements
}

export function CumulativeLabReport({ observations, fullHeight = false }: CumulativeLabReportProps) {
  const pivots = useLabPivot(observations)
  const { locale } = useLanguage()

  const nonEmpty = useMemo(() => {
    return LAB_CATEGORIES
      .map((cat) => pivots[cat.id])
      .filter((p) => p && p.rows.length > 0)
  }, [pivots])

  const [activeId, setActiveId] = useState<string>(() => nonEmpty[0]?.category.id || 'cbc')

  if (nonEmpty.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        No cumulative lab data available.
      </div>
    )
  }

  return (
    <div className={fullHeight ? 'flex h-full flex-col min-w-0 w-full max-w-full overflow-hidden' : 'space-y-3 min-w-0 w-full max-w-full overflow-hidden'}>
      <Tabs value={activeId} onValueChange={setActiveId} className={fullHeight ? 'flex h-full w-full min-w-0 flex-col overflow-hidden' : 'w-full min-w-0 overflow-hidden'}>
        <TabsList className="!flex !flex-nowrap !justify-start w-full min-w-0 overflow-x-auto h-auto bg-muted/40 p-1 gap-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full">
          {nonEmpty.map((p) => {
            const label = locale === 'zh-TW' ? p.category.labelZh : p.category.labelEn
            return (
              <TabsTrigger
                key={p.category.id}
                value={p.category.id}
                className="!flex-none text-xs h-7 px-3 whitespace-nowrap data-[state=active]:bg-background"
              >
                {label} ({p.rows.length})
              </TabsTrigger>
            )
          })}
        </TabsList>
        {nonEmpty.map((p) => (
          <TabsContent
            key={p.category.id}
            value={p.category.id}
            className={fullHeight ? 'mt-3 flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden' : 'mt-3 min-w-0 w-full max-w-full overflow-hidden'}
          >
            <LabPivotTable pivot={p} fullHeight={fullHeight} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
