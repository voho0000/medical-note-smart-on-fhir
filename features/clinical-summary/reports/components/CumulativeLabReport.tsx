"use client"

// Cumulative lab report view (VGH 累積報告 style).
// Pivot: rows = tests, columns = dates (newest first).
// Categories tabs: CBC, 生化, 血糖, 癌症指數, 尿液.
// Expand/fullscreen is handled at the parent level (ReportsCard) so the
// whole Reports section can be enlarged, not just this view.
import { useMemo, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLabPivot, type LabPivot } from "../hooks/useLabPivot"
import { LAB_CATEGORIES, type LabSubgroup } from "@/src/shared/utils/lab-categories"
import { getAnalyteDisplayParts } from "@/src/shared/utils/lab-normalize"

interface CumulativeLabReportProps {
  observations: any[]
  /** When true, allow table to take more vertical space (e.g., parent fullscreen mode) */
  fullHeight?: boolean
}

function formatDateLabel(d: string): string {
  return d.length >= 10 ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : d
}

function LabPivotTable({ pivot, fullHeight = false }: { pivot: LabPivot; fullHeight?: boolean }) {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  const categoryLabels = (t.reports as any).cumulativeCategories || {}
  const subgroupLabels = (t.reports as any).cumulativeSubgroups || {}
  const categoryLabel = categoryLabels[pivot.category.id] || pivot.category.id
  const subgroupLabel = (sgId: string) => subgroupLabels[sgId] || sgId
  // Column header parts: medical audience keeps useLabPivot's displayName
  // (preserves glucose-subtype labels like "Glu-AC" / "Finger Sugar" that the
  // pivot derives from GLUCOSE_SUBTYPE_LABEL). Patient audience splits the
  // long-form translation into a primary NAME plus a parenthetical English
  // abbreviation, so the header can render them on two lines (name above,
  // "(WBC) unit" below) instead of one wide string. Sort order is unaffected —
  // testKey-driven sorting upstream uses canonical keys.
  const columnParts = (testKey: string, displayName: string): { name: string; abbr: string | null } =>
    audience === 'medical'
      ? { name: displayName, abbr: null }
      : getAnalyteDisplayParts(testKey, audience, locale)
  // When there are no columns at all (no pinned columns and no data) show the
  // empty-state message. If there are columns but no data dates, fall through
  // so the column headers still render with a "no data" body row.
  if (pivot.rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 text-center">
        {t.reports.noData}
      </div>
    )
  }

  // Transposed layout (matches VGH 累積報告): dates = rows, tests = columns.
  // Group columns by subgroup; render a top-row of subgroup headers spanning
  // their member columns.
  const subgroups = pivot.category.subgroups || []
  const groupedColumns: { sg: LabSubgroup | null; tests: typeof pivot.rows }[] = []
  if (subgroups.length > 0) {
    for (const sg of subgroups) {
      const members = pivot.rows.filter((r) => r.subgroupId === sg.id)
      if (members.length > 0) groupedColumns.push({ sg, tests: members })
    }
    const orphans = pivot.rows.filter((r) => !r.subgroupId || !subgroups.some((s) => s.id === r.subgroupId))
    if (orphans.length > 0) groupedColumns.push({ sg: null, tests: orphans })
  } else {
    groupedColumns.push({ sg: null, tests: pivot.rows })
  }
  const flatTests = groupedColumns.flatMap((g) => g.tests)

  const heightClass = fullHeight ? 'max-h-[calc(100vh-220px)]' : 'max-h-[60vh]'
  const hasSubgroups = groupedColumns.some((g) => g.sg !== null)

  return (
    <div
      className={`w-full max-w-full overflow-x-auto overflow-y-auto ${heightClass} rounded-md border [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/30`}
      style={{ scrollbarWidth: 'thin' }}
    >
      <table className="text-xs border-collapse w-max min-w-full">
        <thead className="sticky top-0 z-10">
          {/* Subgroup header row */}
          {hasSubgroups && (
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-30 bg-muted/95 border-b border-r p-2 text-left font-semibold whitespace-nowrap min-w-[88px]"
              >
                {categoryLabel}
              </th>
              {groupedColumns.map((g, i) =>
                g.sg ? (
                  <th
                    key={`sg-${g.sg.id}`}
                    colSpan={g.tests.length}
                    className="bg-muted/70 backdrop-blur border-b border-l p-1 text-center text-[11px] font-bold tracking-wide text-muted-foreground"
                  >
                    {subgroupLabel(g.sg.id)}
                  </th>
                ) : (
                  <th
                    key={`sg-other-${i}`}
                    colSpan={g.tests.length}
                    className="bg-muted/70 backdrop-blur border-b border-l p-1 text-center text-[11px] font-bold tracking-wide text-muted-foreground"
                  >
                    Other
                  </th>
                )
              )}
            </tr>
          )}
          {/* Test name header row */}
          <tr>
            {!hasSubgroups && (
              <th className="sticky left-0 z-30 bg-muted/95 border-b border-r p-2 text-left font-semibold whitespace-nowrap min-w-[88px]">
                {categoryLabel}
              </th>
            )}
            {flatTests.map((test) => {
              const { name, abbr } = columnParts(test.testKey, test.displayName)
              return (
                <th
                  key={test.mapKey}
                  className="bg-muted/80 backdrop-blur border-b border-l p-2 text-center font-medium align-bottom min-w-[64px]"
                >
                  <div className="mx-auto max-w-[6rem] leading-tight break-words">{name}</div>
                  {(abbr || test.unit) && (
                    <div className="text-[10px] font-normal text-muted-foreground leading-tight whitespace-nowrap">
                      {/* Second line: English short code + unit. No parens — the
                          code is already on its own line. A middot separates the
                          code from the unit (matches the app's "·" convention)
                          when both are present; medical audience shows the unit
                          alone (abbr is null). */}
                      {abbr ?? ''}{abbr && test.unit ? ' · ' : ''}{test.unit ?? ''}
                    </div>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {pivot.dates.length === 0 && (
            <tr>
              <td
                colSpan={flatTests.length + 1}
                className="p-4 text-center text-sm text-muted-foreground"
              >
                {t.reports.noData}
              </td>
            </tr>
          )}
          {pivot.dates.map((date, dateIdx) => (
            <tr key={date} className={dateIdx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
              <td className="sticky left-0 z-10 bg-inherit border-r p-2 font-medium whitespace-nowrap">
                {formatDateLabel(date)}
              </td>
              {flatTests.map((test) => {
                const cell = test.values.get(date)
                if (!cell) {
                  return (
                    <td key={test.mapKey} className="border-l p-1.5 text-center text-muted-foreground">
                      —
                    </td>
                  )
                }
                const cls = cell.isAbnormal ? 'text-red-600 font-medium' : 'text-foreground'
                return (
                  <td
                    key={test.mapKey}
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

export function CumulativeLabReport({ observations, fullHeight = false }: CumulativeLabReportProps) {
  const pivots = useLabPivot(observations)
  const { t } = useLanguage()
  const categoryLabels = (t.reports as any).cumulativeCategories || {}

  // Show every category tab, even when the patient has no data — pinnedColumns
  // ensures key analytes still appear as empty column headers so users can see
  // what's expected to be there.
  const nonEmpty = useMemo(() => {
    return LAB_CATEGORIES
      .map((cat) => pivots[cat.id])
      .filter((p) => !!p)
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
            const label = categoryLabels[p.category.id] || p.category.id
            return (
              <TabsTrigger
                key={p.category.id}
                value={p.category.id}
                className="!flex-1 !min-w-fit text-xs h-7 px-3 whitespace-nowrap data-[state=active]:bg-background"
              >
                {label} ({p.dates.length})
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
