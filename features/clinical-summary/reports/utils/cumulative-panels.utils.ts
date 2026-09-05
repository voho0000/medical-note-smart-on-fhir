// Split one category pivot into the panels its LabCategory.stackedPanels
// declares (直式 cumulative report only).
//
// Why a split at all: 生化 carries five subgroups and 19+ columns; on a
// half-width clinical panel that is a horizontal scroll for every glance at
// 肝功能. Two narrower tables under one section heading read top-to-bottom
// like the rest of the stacked layout.
//
// Each panel keeps ONLY the collection dates on which at least one of its own
// analytes has a value — a liver panel drawn monthly should not show a hatched
// row for every weekly renal draw. A panel that holds pinned (always-shown)
// columns but no data keeps its header and renders the no-data row, matching
// the single-table behaviour for an empty category.
import type { LabPivot, LabRow } from '@/src/shared/utils/lab-pivot.utils'

function hasValue(row: LabRow, date: string): boolean {
  const value = row.values.get(date)?.value?.trim()
  return !!value && value !== '—'
}

export function splitPivotIntoStackedPanels(pivot: LabPivot): LabPivot[] {
  const panels = pivot.category.stackedPanels
  if (!panels || panels.length === 0) return [pivot]

  const listed = new Set(panels.flat())
  const rowsByPanel: LabRow[][] = panels.map((subgroupIds) => {
    const wanted = new Set(subgroupIds)
    return pivot.rows.filter((row) => !!row.subgroupId && wanted.has(row.subgroupId))
  })
  // Unlisted / unassigned subgroups tail the last panel so no analyte is lost.
  const orphans = pivot.rows.filter((row) => !row.subgroupId || !listed.has(row.subgroupId))
  if (orphans.length > 0) rowsByPanel[rowsByPanel.length - 1].push(...orphans)

  const result = rowsByPanel
    .filter((rows) => rows.length > 0)
    .map((rows): LabPivot => ({
      category: pivot.category,
      rows,
      dates: pivot.dates.filter((date) => rows.some((row) => hasValue(row, date))),
    }))
  return result.length > 0 ? result : [pivot]
}
