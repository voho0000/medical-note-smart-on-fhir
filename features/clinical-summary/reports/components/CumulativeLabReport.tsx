"use client"

// Cumulative lab report view (VGH 累積報告 style).
// Pivot: rows = tests, columns = dates (newest first).
// Categories tabs: CBC, 生化, 血糖, 癌症指數, 尿液.
import { useMemo, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useLabPivot, type LabPivot, type LabRow } from "../hooks/useLabPivot"
import { LAB_CATEGORIES } from "@/src/shared/utils/lab-categories"

interface CumulativeLabReportProps {
  observations: any[]
}

function formatDateLabel(d: string): string {
  // d is "YYYY-MM-DD"; show as YY/MM/DD to save column width
  return d.length >= 10 ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : d
}

function LabPivotTable({ pivot, expanded = false }: { pivot: LabPivot; expanded?: boolean }) {
  const { t } = useLanguage()
  if (pivot.rows.length === 0 || pivot.dates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        {t.reports.noData}
      </div>
    )
  }

  const heightClass = expanded ? 'max-h-[calc(100vh-180px)]' : 'max-h-[60vh]'
  return (
    <div className={`overflow-auto ${heightClass} rounded-md border`}>
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

interface InnerProps {
  nonEmpty: LabPivot[]
  activeId: string
  setActiveId: (id: string) => void
  locale: string
  expanded: boolean
  onToggleExpand: () => void
}

function CumulativeLabReportInner({ nonEmpty, activeId, setActiveId, locale, expanded, onToggleExpand }: InnerProps) {
  return (
    <div className={expanded ? 'flex h-full flex-col' : 'space-y-3'}>
      <Tabs value={activeId} onValueChange={setActiveId} className={expanded ? 'flex h-full w-full flex-col' : 'w-full'}>
        <div className="flex items-center gap-2 min-w-0">
          <TabsList className="flex-1 !inline-flex !flex-nowrap !justify-start !w-auto overflow-x-auto h-auto bg-muted/40 p-1 gap-1 min-w-0 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full">
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
          <button
            type="button"
            onClick={onToggleExpand}
            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={expanded ? 'Minimize' : 'Expand to fullscreen'}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
        {nonEmpty.map((p) => (
          <TabsContent
            key={p.category.id}
            value={p.category.id}
            className={expanded ? 'mt-3 flex-1 min-h-0' : 'mt-3'}
          >
            <LabPivotTable pivot={p} expanded={expanded} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

export function CumulativeLabReport({ observations }: CumulativeLabReportProps) {
  const pivots = useLabPivot(observations)
  const { locale } = useLanguage()
  const [expanded, setExpanded] = useState(false)

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

  if (expanded) {
    return (
      <>
        {/* Placeholder to maintain layout */}
        <div className="space-y-3 opacity-30 pointer-events-none select-none">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-wrap h-auto bg-muted/40 p-1 gap-1 rounded-md">
              {nonEmpty.map((p) => {
                const label = locale === 'zh-TW' ? p.category.labelZh : p.category.labelEn
                return (
                  <span key={p.category.id} className="text-xs h-7 px-3 inline-flex items-center">
                    {label} ({p.rows.length})
                  </span>
                )
              })}
            </div>
            <Maximize2 className="h-4 w-4 mx-2 text-muted-foreground" />
          </div>
          <div className="border rounded-md p-8 text-center text-muted-foreground">
            <Maximize2 className="h-8 w-8 mx-auto mb-2" />
            <div>Expanded mode</div>
          </div>
        </div>

        {/* Fullscreen overlay */}
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-4 sm:p-6 flex flex-col"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex-1 w-full max-w-7xl mx-auto min-h-0 bg-background rounded-lg border shadow-lg p-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <CumulativeLabReportInner
              nonEmpty={nonEmpty}
              activeId={activeId}
              setActiveId={setActiveId}
              locale={locale}
              expanded={true}
              onToggleExpand={() => setExpanded(false)}
            />
          </div>
        </div>
      </>
    )
  }

  return (
    <CumulativeLabReportInner
      nonEmpty={nonEmpty}
      activeId={activeId}
      setActiveId={setActiveId}
      locale={locale}
      expanded={false}
      onToggleExpand={() => setExpanded(true)}
    />
  )
}
