"use client"

// Cumulative lab report view (VGH 累積報告 style).
// Pivot: rows = tests, columns = dates (newest first).
// Categories tabs: CBC, 生化, 血糖, 癌症指數, 尿液.
// Expand/fullscreen is handled at the parent level (ReportsCard) so the
// whole Reports section can be enlarged, not just this view.
import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLabPivot, type LabPivot } from "../hooks/useLabPivot"
import { LAB_CATEGORIES, type LabSubgroup } from "@/src/shared/utils/lab-categories"
import { getAnalyteDisplayParts } from "@/src/shared/utils/lab-normalize"

interface CumulativeLabReportProps {
  observations: any[]
  /** When true, allow table to take more vertical space (e.g., parent fullscreen mode) */
  fullHeight?: boolean
  /** Active category id, lifted to the parent so the selected sub-tab (生化 …)
   *  survives the fullscreen toggle — which remounts this component and would
   *  otherwise reset the selection back to the first category (血液). When
   *  omitted the component falls back to its own internal state. */
  activeCategoryId?: string
  onCategoryChange?: (id: string) => void
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
        {/* z-layering for the dual-sticky table: header row (z-20) must sit
            ABOVE the sticky date column (z-10) or the scrolling dates paint
            over the column names; the top-left corner cell (z-30) stays above
            both. */}
        <thead className="sticky top-0 z-20">
          {/* Subgroup header row */}
          {hasSubgroups && (
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-30 bg-muted border-b border-r px-2 py-1.5 text-left font-semibold whitespace-nowrap min-w-[64px]"
              >
                {categoryLabel}
              </th>
              {groupedColumns.map((g, i) =>
                g.sg ? (
                  <th
                    key={`sg-${g.sg.id}`}
                    colSpan={g.tests.length}
                    className="bg-muted/70 backdrop-blur border-b border-l p-1 text-center text-[0.6875rem] font-bold tracking-wide text-muted-foreground"
                  >
                    {subgroupLabel(g.sg.id)}
                  </th>
                ) : (
                  <th
                    key={`sg-other-${i}`}
                    colSpan={g.tests.length}
                    className="bg-muted/70 backdrop-blur border-b border-l p-1 text-center text-[0.6875rem] font-bold tracking-wide text-muted-foreground"
                  >
                    {(t.reports as any).otherSubgroup ?? 'Other'}
                  </th>
                )
              )}
            </tr>
          )}
          {/* Test name header row */}
          <tr>
            {!hasSubgroups && (
              <th className="sticky left-0 z-30 bg-muted border-b border-r px-2 py-1.5 text-left font-semibold whitespace-nowrap min-w-[64px]">
                {categoryLabel}
              </th>
            )}
            {flatTests.map((test) => {
              const { name, abbr } = columnParts(test.testKey, test.displayName)
              return (
                <th
                  key={test.mapKey}
                  className="bg-muted/80 backdrop-blur border-b border-l px-1 py-1.5 text-center font-medium align-bottom min-w-[46px]"
                >
                  <div className="mx-auto max-w-[4.5rem] leading-tight break-words">{name}</div>
                  {(abbr || test.unit) && (
                    <div className="text-[0.625rem] font-normal text-muted-foreground leading-tight whitespace-nowrap">
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
              {/* The sticky date column MUST be opaque — the row's bg-muted/20
                  zebra tint is semi-transparent, so the previous bg-inherit let
                  the value columns scroll through and overlap the dates. A solid
                  opaque bg-background frozen column fixes it (the faint zebra
                  difference vs the cell is imperceptible). */}
              <td className="sticky left-0 z-10 bg-background border-r px-2 py-1 font-medium whitespace-nowrap">
                {formatDateLabel(date)}
              </td>
              {flatTests.map((test) => {
                const cell = test.values.get(date)
                if (!cell) {
                  return (
                    <td key={test.mapKey} className="border-l px-1 py-1 text-center text-muted-foreground">
                      —
                    </td>
                  )
                }
                const cls = cell.isAbnormal ? 'text-red-600 font-medium' : 'text-foreground'
                return (
                  <td
                    key={test.mapKey}
                    className={`border-l px-1 py-1 text-center ${cls}`}
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

export function CumulativeLabReport({ observations, fullHeight = false, activeCategoryId, onCategoryChange }: CumulativeLabReportProps) {
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

  // Split into always-visible categories and hiddenByDefault ones (blood gas,
  // and future extra groups), which surface only after the user picks them from
  // the 「查看更多」 dropdown. A Set of revealed ids (rather than a single boolean)
  // so multiple hidden groups can each be added independently — the dropdown is
  // a picker, not an all-or-nothing toggle.
  const visibleCats = useMemo(() => nonEmpty.filter((p) => !p.category.hiddenByDefault), [nonEmpty])
  const hiddenCats = useMemo(() => nonEmpty.filter((p) => p.category.hiddenByDefault), [nonEmpty])

  const [internalActiveId, setInternalActiveId] = useState<string>(() => visibleCats[0]?.category.id || nonEmpty[0]?.category.id || 'cbc')
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set())
  // Prefer the parent-controlled id (survives the fullscreen remount) when it
  // points at a category that still has data; otherwise use internal state.
  const activeId = (activeCategoryId && nonEmpty.some((p) => p.category.id === activeCategoryId))
    ? activeCategoryId
    : internalActiveId

  // A hidden category is "shown" once the user picked it (revealedIds) or it's
  // the active tab (e.g. a fullscreen remount restored a blood-gas selection —
  // Radix renders nothing for a value with no matching trigger/content).
  const isHiddenShown = (id: string) => revealedIds.has(id) || id === activeId
  const shownHidden = hiddenCats.filter((p) => isHiddenShown(p.category.id))
  const shownCats = [...visibleCats, ...shownHidden]
  // Hidden groups not yet surfaced → the dropdown's menu items. When empty, the
  // 「查看更多」 button disappears (all extras are already tabs).
  const pickableHidden = hiddenCats.filter((p) => !isHiddenShown(p.category.id))

  const setActiveId = (id: string) => {
    setInternalActiveId(id)
    onCategoryChange?.(id)
  }
  const revealCategory = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setActiveId(id)
  }

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
          {shownCats.map((p) => {
            const label = categoryLabels[p.category.id] || p.category.id
            return (
              <TabsTrigger
                key={p.category.id}
                value={p.category.id}
                className="!flex-none !min-w-fit text-xs h-7 px-2 whitespace-nowrap data-[state=active]:bg-background"
              >
                {label} ({p.dates.length})
              </TabsTrigger>
            )
          })}
          {/* 「查看更多」 dropdown — a picker over hiddenByDefault groups (blood
              gas, and future extra groups). Selecting an item reveals it as a
              real tab and switches to it; the button hides once every extra is
              already shown. A dropdown (not an all-or-nothing toggle) so more
              cumulative-report groups can be added without cluttering the bar. */}
          {pickableHidden.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="!flex-none !min-w-fit inline-flex items-center gap-0.5 text-xs h-7 px-2 whitespace-nowrap rounded-sm text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
                >
                  {(t.reports as any).cumulativeShowMore || 'More'}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[8rem]">
                {pickableHidden.map((p) => {
                  const label = categoryLabels[p.category.id] || p.category.id
                  return (
                    <DropdownMenuItem
                      key={p.category.id}
                      onSelect={() => revealCategory(p.category.id)}
                      className="text-xs"
                    >
                      {label} ({p.dates.length})
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TabsList>
        {shownCats.map((p) => (
          <TabsContent
            key={p.category.id}
            value={p.category.id}
            className={fullHeight ? 'mt-1 flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden' : 'mt-1 min-w-0 w-full max-w-full overflow-hidden'}
          >
            <LabPivotTable pivot={p} fullHeight={fullHeight} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
