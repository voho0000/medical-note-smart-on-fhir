"use client"

// Cumulative lab report view (VGH 累積報告 style).
// Pivot: rows = tests, columns = dates (newest first).
// Categories tabs: CBC, 生化, 血糖, 癌症指數, 尿液.
import { useMemo, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useLabPivot, type LabPivot } from "../hooks/useLabPivot"
import { LAB_CATEGORIES } from "@/src/shared/utils/lab-categories"

interface CumulativeLabReportProps {
  observations: any[]
}

function formatDateLabel(d: string): string {
  // d is "YYYY-MM-DD"; show as YY/MM/DD to save column width
  return d.length >= 10 ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : d
}

function LabPivotTable({ pivot }: { pivot: LabPivot }) {
  const { t } = useLanguage()
  if (pivot.rows.length === 0 || pivot.dates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        {t.reports.noData}
      </div>
    )
  }

  return (
    <div className="overflow-auto max-h-[60vh] rounded-md border">
      <table className="text-xs border-collapse w-full">
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
          {pivot.rows.map((row, idx) => (
            <tr key={row.testKey} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
              <td className="sticky left-0 z-10 bg-inherit border-r p-2 font-medium whitespace-nowrap">
                <div>{row.displayName}</div>
                {row.unit && <div className="text-[10px] text-muted-foreground">{row.unit}</div>}
              </td>
              {pivot.dates.map((d) => {
                const cell = row.values.get(d)
                if (!cell) {
                  return (
                    <td key={d} className="border-l p-1.5 text-center text-muted-foreground">—</td>
                  )
                }
                const cls = cell.isAbnormal
                  ? "text-red-600 font-medium"
                  : "text-foreground"
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
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CumulativeLabReport({ observations }: CumulativeLabReportProps) {
  const pivots = useLabPivot(observations)
  const { locale } = useLanguage()

  // Only show categories that have data
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
    <div className="space-y-3">
      <Tabs value={activeId} onValueChange={setActiveId} className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto bg-muted/40 p-1 gap-1">
          {nonEmpty.map((p) => {
            const label = locale === 'zh-TW' ? p.category.labelZh : p.category.labelEn
            return (
              <TabsTrigger key={p.category.id} value={p.category.id} className="text-xs h-7 data-[state=active]:bg-background">
                {label} ({p.rows.length})
              </TabsTrigger>
            )
          })}
        </TabsList>
        {nonEmpty.map((p) => (
          <TabsContent key={p.category.id} value={p.category.id} className="mt-3">
            <LabPivotTable pivot={p} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
