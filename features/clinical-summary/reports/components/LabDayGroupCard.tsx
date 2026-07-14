// LabDayGroupCard
// Renders a synthetic Row that folds all lab DiagnosticReports sharing
// (collection day, institution, lab category) — the antidote to 健保存摺
// shipping one DR per analyte. The hospital reading unit is one report per
// lab SECTION —「血液一份報告、生化一份報告」— so each card is one such
// report, and a day's cards stack 血液 → 生化 → … in the list (a whole-day
// mega-sheet matched neither the NHI原樣 nor the hospital's model — user
// feedback 2026-07-07).
//
// UX contract (sibling of MultiRegionStudyCard):
//   • The collapsed header alone answers "when / which section / where /
//     how many items / anything abnormal?".
//   • Opening the card opens EVERYTHING inside — a lab report is read top
//     to bottom, so nested panels (CBC…) must not demand a second click.
//   • Every member renders through the SAME ReportRow used by the flat view
//     (with hideMeta — the header already states date + institution; same-
//     analyte serials keep a time-only badge), so trend dialogs / images /
//     bridge-dup badges / 向右展開 / per-DR source identity all keep
//     working. The grouping is display-only.
"use client"

import { useMemo, useState } from 'react'
import { AlertCircle, Building2, CalendarDays, ChevronDown } from 'lucide-react'
import { cn } from '@/src/shared/utils/cn.utils'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAudience } from '@/src/application/providers/audience.provider'
import { getAnalyteDisplayForMode } from '@/src/shared/utils/lab-normalize'
import type { Row } from '../types'
import { countAbnormalInRows } from '../utils/lab-day-grouping'
import { ReportRow } from './ReportRow'
import { useReportNameMode } from '../context/report-name-mode.context'

interface LabDayGroupCardProps {
  row: Row
  /** Member ids whose accordion should start open (search inner-match /
   *  resource navigation) — merged with ALL member ids because opening the
   *  card opens everything; any hit also auto-opens the card itself. */
  defaultOpen: string[]
  /** Active search query — forwarded for title highlighting; an active
   *  search also auto-opens the card (its members ARE the matches). */
  query?: string
}

const EMPTY_GROUPED_ROWS: Row[] = []

function formatDayLabel(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso.slice(0, 10)
  }
}

export function LabDayGroupCard({ row, defaultOpen, query }: LabDayGroupCardProps) {
  const { t } = useLanguage()
  const tr = (t as any).reports
  const members = row.groupedRows ?? EMPTY_GROUPED_ROWS

  // Auto-open when a search is active (the filtered members are exactly the
  // matches the user wants to see) or when navigation / inner-match targets a
  // member. Manual toggle overrides until the auto signal changes again.
  const autoOpen = !!query?.trim() || members.some((m) => defaultOpen.includes(m.id))
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const open = manualOpen ?? autoOpen

  // Analyte labels must match what ObservationBlock would have shown inside
  // the (former) nested panel — audience-aware canonical short codes for
  // clinicians, lay names for patients.
  const { audience } = useAudience()
  const { locale } = useLanguage()
  const nameMode = useReportNameMode()

  // FLATTEN multi-analyte panels: a hospital lab report is a flat list of
  // analytes — "Creatinine, serum ▸ (CREA, EGFR)" as a box-inside-the-box
  // read as visual noise (user feedback 2026-07-07). Each analyte becomes a
  // sibling pseudo-row rendered through the SAME ReportRow single-value
  // branch as everything else, so trend / abnormal / ref-range / serial-time
  // behaviours are identical. rawTitle stays the DR's, so the trend dialog's
  // history lookup still finds the panel series. Members that can't flatten
  // (image sets, 0-obs DRs) render whole, as before.
  const displayRows = useMemo(() => {
    const out: Row[] = []
    for (const m of members) {
      if (m.obs.length === 0 || (m.images && m.images.length > 0)) {
        out.push(m)
        continue
      }
      m.obs.forEach((o, i) => {
        const label = getAnalyteDisplayForMode(o, audience, locale, nameMode)
        out.push({
          ...m,
          id: `${m.id}::obs${i}`,
          title: label && label !== '—' ? label : m.title,
          obs: [o],
          images: undefined,
          // The dup badge describes the DR, not each analyte — first row only.
          bridgeDupCount: i === 0 ? m.bridgeDupCount : undefined,
          isPossibleDuplicate: i === 0 ? m.isPossibleDuplicate : undefined,
        })
      })
    }
    return out
  }, [members, audience, locale, nameMode])

  // Opening the card opens EVERYTHING inside it. Rows mount when the card
  // opens, so their uncontrolled accordions / long-text states pick this up
  // as initial state; each can still be collapsed by hand afterwards.
  const allRowsOpen = useMemo(
    () => [...new Set([...defaultOpen, ...displayRows.map((m) => m.id)])],
    [defaultOpen, displayRows],
  )

  const abnormalCount = useMemo(() => countAbnormalInRows(members), [members])
  // "N 項" = analyte count, matching the flat view's per-panel count: a CBC
  // panel contributes its analytes; narrative / 0-obs reports count as 1.
  const itemCount = useMemo(
    () => members.reduce((n, m) => n + Math.max(1, m.obs.length), 0),
    [members],
  )

  // Section chip label — names the card's ACTUAL contents in the cumulative
  // report's category vocabulary (血液 / 生化 / …). A chem card that absorbed
  // plain glucose reads 生化 / 血糖 / 生化・血糖 per dayGroupLabelIds; other
  // cards name their single category. 'other' falls back to the 其他 label.
  const labelId = (id: string) =>
    id !== 'other'
      ? ((tr.cumulativeCategories as Record<string, string> | undefined)?.[id] ?? id)
      : ((tr.otherSubgroup as string) || 'Other')
  const labelIds = row.dayGroupLabelIds ?? (row.dayGroupCategoryId ? [row.dayGroupCategoryId] : [])
  const categoryLabel = labelIds.length ? labelIds.map(labelId).join('・') : ((tr.otherSubgroup as string) || 'Other')

  const dayLabel = formatDayLabel(row.effectiveDate)

  return (
    <div className="rounded-lg border bg-muted/40">
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold tabular-nums text-foreground whitespace-nowrap">
          {dayLabel}
        </span>
        <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
          {categoryLabel}
        </span>
        {row.institution && (
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-blue-600/80 dark:text-blue-400/80">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{row.institution}</span>
          </span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {(tr.labDayCount as string).replace('{n}', String(itemCount))}
        </span>
        {abnormalCount > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <AlertCircle className="h-3 w-3" />
            {(tr.abnormalCount as string).replace('{n}', String(abnormalCount))}
          </span>
        )}
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="space-y-0 border-t border-border/60 px-1.5 py-1.5">
          {displayRows.map((m) => (
            <ReportRow key={m.id} row={m} defaultOpen={allRowsOpen} query={query} hideMeta />
          ))}
        </div>
      )}
    </div>
  )
}
