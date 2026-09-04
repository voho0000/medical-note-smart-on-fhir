"use client"

// Cumulative lab report view (VGH 累積報告 style).
// Pivot: rows = tests, columns = dates (newest first).
// Categories tabs: CBC, 生化, 血糖, 癌症指數, 尿液.
// Expand/fullscreen is handled at the parent level (ReportsCard) so the
// whole Reports section can be enlarged, not just this view.
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronDown, Loader2, TrendingUp } from "lucide-react"
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
import { CANONICAL_KEYS } from "@voho0000/clinical-lab-normalization/canonical"
import { getAnalyteDisplayParts } from "@voho0000/clinical-lab-normalization/display"
import type { AnalyteNameMode } from "@voho0000/clinical-lab-normalization/display"
import { useReportNameMode } from "../context/report-name-mode.context"
import { useOptionalRightDetail } from "@/src/application/providers/right-detail.provider"
import {
  buildLabTrendSeries,
  type LabTrendSeries,
} from "@/src/shared/utils/lab-trend.utils"
// Trend charts pull in the whole charting library, but they only ever mount
// after the clinician clicks a trend. Keep them out of first paint, then warm
// the shared chunk while the browser is idle so the first click does not pay
// the download/parse cost. The cached promise also deduplicates idle, hover,
// focus and click requests. next/dynamic options must remain inline literals
// because Next statically analyses them.
type CumulativeLabTrendModule = typeof import("./CumulativeLabTrendDetail")
let cumulativeLabTrendModulePromise: Promise<CumulativeLabTrendModule> | null = null
let resolvedCumulativeLabTrendModule: CumulativeLabTrendModule | null = null

function loadCumulativeLabTrendModule(): Promise<CumulativeLabTrendModule> {
  if (resolvedCumulativeLabTrendModule) {
    return Promise.resolve(resolvedCumulativeLabTrendModule)
  }
  cumulativeLabTrendModulePromise ??= import("./CumulativeLabTrendDetail").then((module) => {
    resolvedCumulativeLabTrendModule = module
    return module
  })
  return cumulativeLabTrendModulePromise
}

function preloadCumulativeLabTrendModule(): void {
  void loadCumulativeLabTrendModule()
}

const CumulativeLabTrendDetail = dynamic(
  () => loadCumulativeLabTrendModule().then((m) => m.CumulativeLabTrendDetail),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      </div>
    ),
  },
)
const CumulativeLabTrendDialog = dynamic(
  () => loadCumulativeLabTrendModule().then((m) => m.CumulativeLabTrendDialog),
  { ssr: false },
)
import {
  SUBTAB_LIST_CLASSES,
  SUBTAB_TRIGGER_CLASSES,
} from "@/src/shared/config/ui-theme.config"
import { AnalyteSearchBox } from "./AnalyteSearchBox"
import { ReportNameModeSwitch } from "./ReportNameModeSwitch"
import { MicrobiologyCumulativeView } from "./MicrobiologyCumulativeView"
import type { TrendWindow } from "../utils/trend-time-scale"

interface OpenTrendRequest {
  series: LabTrendSeries
  title: string
  sourceId: string
}

interface OpenTrendTarget {
  categoryId: string
  mapKey: string
  testKey: string
  displayName: string
  nameMode: AnalyteNameMode
  title: string
  sourceId: string
}

interface CumulativeLabReportProps {
  observations: any[]
  /** Naming-mode control is owned by ReportsCard so it remains available
   *  while cumulative data is preparing, but positioned in this toolbar. */
  nameModeControl?: ReactNode
  /** When true, allow table to take more vertical space (e.g., parent fullscreen mode) */
  fullHeight?: boolean
  /** Active category id, lifted to the parent so the selected sub-tab (生化 …)
   *  survives the fullscreen toggle — which remounts this component and would
   *  otherwise reset the selection back to the first category (血液). When
   *  omitted the component falls back to its own internal state. */
  activeCategoryId?: string
  onCategoryChange?: (id: string) => void
  /** Canonical test key to horizontally reveal (e.g. CRP) after navigation. */
  focusAnalyteKey?: string
  /** Re-triggers focus when the same analyte is requested again. */
  focusNonce?: number
  /** Last range explicitly selected by the user; shared across analytes. */
  trendWindow?: TrendWindow
  onTrendWindowChange?: (window: TrendWindow) => void
}

// A chemistry pivot is mostly empty cells (tens of thousands of them on a
// years-of-data panel). One shared style object keeps React from allocating —
// and diffing — a new one per cell on every render.
const MISSING_DATA_CELL_STYLE = {
  backgroundImage: 'var(--clinical-missing-data-pattern)',
} as const

// Date rows below this count render in full: virtualization costs a scroll
// subscription plus per-row measurement, which is pure overhead on the short
// panels most patients have — and keeps existing behaviour bit-identical there.
const VIRTUALIZE_DATE_ROW_THRESHOLD = 60
// Compact single-line row at text-xs with py-1. Rows carrying a per-cell unit
// or "推估單位" line are taller; measureElement corrects the estimate on mount.
const ESTIMATED_DATE_ROW_HEIGHT = 28
// The virtualizer measures the scroll container, which also holds the sticky
// header. That makes its computed window a superset of the truly visible rows
// (the header covers the top of the viewport), never a subset — so a modest
// overscan is enough and no scrollMargin correction is needed.
const DATE_ROW_OVERSCAN = 8

// `other` remains a valid catch-all in the shared lab categorisation model so
// uncategorised source-labelled labs are not lost from visit details, exports,
// or AI context. It is not a clinician-facing cumulative-report panel.
const CUMULATIVE_REPORT_CATEGORIES = LAB_CATEGORIES.filter(
  (category) => category.id !== 'other',
)

function formatDateLabel(d: string): string {
  return d.length >= 10 ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : d
}

function isMissingLabValue(value: string | undefined): boolean {
  const trimmed = value?.trim()
  return !trimmed || trimmed === '—'
}

function EmptyCell({ mapKey, label }: { mapKey: string; label: string }) {
  return (
    <td
      key={mapKey}
      className="border-l bg-muted/50 px-1 py-1 text-center"
      title={label}
      aria-label={label}
      style={MISSING_DATA_CELL_STYLE}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">&nbsp;</span>
    </td>
  )
}

const LabPivotTable = memo(function LabPivotTable({
  pivot,
  fullHeight = false,
  focusAnalyteKey,
  focusNonce,
  nameMode,
  activeTrendSourceId,
  onOpenTrend,
}: {
  pivot: LabPivot
  fullHeight?: boolean
  focusAnalyteKey?: string
  focusNonce?: number
  nameMode: AnalyteNameMode
  activeTrendSourceId?: string
  onOpenTrend: (target: OpenTrendTarget) => void
}) {
  const { t, locale } = useLanguage()
  const { audience } = useAudience()
  // Callback-ref-into-state (not useRef): the virtualizer must re-measure on
  // the render in which the scroll container attaches, and a ref assignment
  // does not schedule one. Same workaround as ReportsTabContent.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const categoryLabels = (t.reports as any).cumulativeCategories || {}
  const subgroupLabels = (t.reports as any).cumulativeSubgroups || {}
  const categoryLabel = categoryLabels[pivot.category.id] || pivot.category.id
  const subgroupLabel = (sgId: string) => subgroupLabels[sgId] || sgId
  const missingValueLabel = locale.startsWith('zh') ? '無資料' : 'No data'
  // Recognized analytes use the same audience-aware display map as report
  // cards, so internal keys such as CA / EGFR(M) never leak into this surface.
  // Unknown tests keep useLabPivot's source-derived displayName. Patient mode
  // can split a long name and its abbreviation across two header lines.
  const columnParts = (testKey: string, displayName: string): { name: string; abbr: string | null } =>
    nameMode === 'original' || !CANONICAL_KEYS.has(testKey)
      ? { name: displayName, abbr: null }
      : getAnalyteDisplayParts(testKey, audience, locale)

  useEffect(() => {
    if (!focusAnalyteKey) return
    const container = scrollEl
    if (!container) return
    const header = Array.from(
      container.querySelectorAll<HTMLElement>('[data-lab-test-key]'),
    ).find((element) => element.dataset.labTestKey === focusAnalyteKey)
    if (!header) return

    const centeredLeft = header.offsetLeft
      - (container.clientWidth / 2)
      + (header.offsetWidth / 2)
    container.scrollTo({ left: Math.max(0, centeredLeft), behavior: 'smooth' })
  }, [focusAnalyteKey, focusNonce, pivot.category.id, pivot.rows, scrollEl])

  // Transposed layout (matches VGH 累積報告): dates = rows, tests = columns.
  // Group columns by subgroup; render a top-row of subgroup headers spanning
  // their member columns.
  //
  // Memoized on `pivot` because the unit pass walks EVERY cell of every
  // column: on a years-of-data chemistry panel that is tens of thousands of
  // cells, and this component re-renders on unrelated parent state (tab
  // measurement, focus, dialog open).
  const { groupedColumns, flatTests, inferredUnitInHeader } = useMemo(() => {
    const subgroups = pivot.category.subgroups || []
    const columns: { sg: LabSubgroup | null; tests: typeof pivot.rows }[] = []
    if (subgroups.length > 0) {
      for (const sg of subgroups) {
        const members = pivot.rows.filter((r) => r.subgroupId === sg.id)
        if (members.length > 0) columns.push({ sg, tests: members })
      }
      const orphans = pivot.rows.filter((r) => !r.subgroupId || !subgroups.some((s) => s.id === r.subgroupId))
      if (orphans.length > 0) columns.push({ sg: null, tests: orphans })
    } else {
      columns.push({ sg: null, tests: pivot.rows })
    }
    const tests = columns.flatMap((g) => g.tests)
    return {
      groupedColumns: columns,
      flatTests: tests,
      inferredUnitInHeader: new Map(
        tests.map((test) => {
          const unitBearingCells = [...test.values.values()].filter(
            (cell) => !isMissingLabValue(cell.value) && !!cell.unit,
          )
          return [
            test.mapKey,
            !!test.unit &&
              unitBearingCells.length > 0 &&
              unitBearingCells.every((cell) => cell.unitInferred),
          ] as const
        }),
      ),
    }
  }, [pivot])

  // Every date row × analyte column is real DOM. A chemistry panel with years
  // of data is hundreds of rows × dozens of columns — tens of thousands of
  // cells — and visited categories stay mounted, so the cost never goes away
  // after a tab switch. Past the threshold only the scrolled-to window renders.
  const shouldVirtualizeRows = pivot.dates.length > VIRTUALIZE_DATE_ROW_THRESHOLD
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns its mutable measurement callbacks here.
  const rowVirtualizer = useVirtualizer({
    // Measurement runs from the ref-attachment lifecycle; TanStack's default
    // flushSync update is invalid while React is already committing it.
    useFlushSync: false,
    count: pivot.dates.length,
    enabled: shouldVirtualizeRows && !!scrollEl,
    getScrollElement: () => scrollEl,
    estimateSize: () => ESTIMATED_DATE_ROW_HEIGHT,
    overscan: DATE_ROW_OVERSCAN,
    getItemKey: (index) => pivot.dates[index] ?? index,
  })

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

  const heightClass = fullHeight ? 'max-h-[calc(100vh-220px)]' : 'max-h-[60vh]'
  const hasSubgroups = groupedColumns.some((g) => g.sg !== null)

  const virtualRows = shouldVirtualizeRows ? rowVirtualizer.getVirtualItems() : []
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = virtualRows.length > 0
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0

  // `measureRef` is only passed on the virtualized path — it is TanStack's
  // measureElement, which needs the data-index attribute to identify the row.
  const renderDateRow = (
    date: string,
    dateIdx: number,
    measureRef?: (node: HTMLTableRowElement | null) => void,
  ) => (
    <tr
      key={date}
      data-index={dateIdx}
      ref={measureRef}
      className={dateIdx % 2 === 0 ? 'bg-card' : 'bg-muted/20'}
    >
      {/* The sticky date column must remain opaque so horizontally
          scrolling values never show through it. Keep it on the card
          surface rather than the darker app canvas: dense dark-mode
          tables then read as one calm sheet instead of black stripes. */}
      <td className="sticky left-0 z-10 bg-card border-r px-2 py-1 font-medium whitespace-nowrap">
        {formatDateLabel(date)}
      </td>
      {flatTests.map((test) => {
        const cell = test.values.get(date)
        const showInferredUnitInHeader =
          inferredUnitInHeader.get(test.mapKey) === true
        if (!cell) {
          return <EmptyCell key={test.mapKey} mapKey={test.mapKey} label={missingValueLabel} />
        }
        if (isMissingLabValue(cell.value)) {
          return <EmptyCell key={test.mapKey} mapKey={test.mapKey} label={missingValueLabel} />
        }
        const cls = cell.isAbnormal ? 'text-clinical-abnormal font-medium' : 'text-foreground'
        return (
          <td
            key={test.mapKey}
            className={`border-l px-1 py-1 text-center ${cls}`}
            title={cell.interpretationCode ? `Interpretation: ${cell.interpretationCode}` : undefined}
          >
            <span>{cell.value}</span>
            {!test.unit && cell.unit && (
              <div className="text-[0.625rem] font-normal leading-tight text-muted-foreground whitespace-nowrap">
                {cell.unit}
              </div>
            )}
            {cell.unitInferred && !showInferredUnitInHeader && (
              <div
                className="text-[0.5625rem] font-normal leading-tight text-sky-700 dark:text-sky-300 whitespace-nowrap"
                title={locale.startsWith('zh')
                  ? '健康存摺 SDK 未提供單位；此單位由轉換器依規則推估'
                  : 'The SDK did not provide a unit; the converter inferred it under an audited policy'}
              >
                {locale.startsWith('zh') ? '推估單位' : 'inferred unit'}
              </div>
            )}
          </td>
        )
      })}
    </tr>
  )

  return (
    <div
      ref={setScrollEl}
      role="region"
      aria-label={`${categoryLabel}累積檢驗表，可水平捲動`}
      tabIndex={0}
      className={`w-full max-w-full overflow-x-auto overflow-y-auto ${heightClass} rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-muted/30`}
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
                    className="border-b border-l bg-muted/70 p-1 text-center text-[0.6875rem] font-bold tracking-wide text-muted-foreground"
                  >
                    {subgroupLabel(g.sg.id)}
                  </th>
                ) : (
                  <th
                    key={`sg-other-${i}`}
                    colSpan={g.tests.length}
                    className="border-b border-l bg-muted/70 p-1 text-center text-[0.6875rem] font-bold tracking-wide text-muted-foreground"
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
              const isFocused = test.testKey === focusAnalyteKey
              const sourceId = `cumulative-trend:${pivot.category.id}:${test.mapKey}`
              const isTrendActive = activeTrendSourceId === sourceId
              const canTrend = test.trendChartable === true
              const showInferredUnitInHeader =
                inferredUnitInHeader.get(test.mapKey) === true
              const heading = (
                <>
                  <div className="flex items-start justify-center gap-1 leading-tight">
                    <span className="max-w-[4.5rem] break-words">{name}</span>
                    {canTrend && (
                      <TrendingUp className="mt-px h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </div>
                  {(abbr || test.unit) && (
                    <div className="text-[0.625rem] font-normal text-muted-foreground leading-tight whitespace-nowrap">
                      {abbr ?? ''}{abbr && test.unit ? ' · ' : ''}{test.unit ?? ''}
                    </div>
                  )}
                  {showInferredUnitInHeader && (
                    <div
                      className="text-[0.5625rem] font-normal leading-tight text-sky-700 dark:text-sky-300 whitespace-nowrap"
                      title={locale.startsWith('zh')
                        ? '健康存摺 SDK 未提供單位；此欄單位由轉換器依規則推估'
                        : 'The SDK did not provide a unit; this column unit was inferred under an audited policy'}
                    >
                      {locale.startsWith('zh') ? '推估單位' : 'inferred unit'}
                    </div>
                  )}
                </>
              )
              return (
                <th
                  key={test.mapKey}
                  data-lab-test-key={test.testKey}
                  data-trend-active={isTrendActive ? 'true' : undefined}
                  className={isFocused || isTrendActive
                    ? "min-w-[46px] border-b-2 border-b-primary border-l bg-primary/10 p-0 text-center align-bottom font-semibold text-foreground"
                    : "min-w-[46px] border-b border-l bg-muted/80 p-0 text-center align-bottom font-medium"}
                >
                  {canTrend ? (
                    <button
                      type="button"
                      data-detail-source-id={sourceId}
                      onPointerEnter={preloadCumulativeLabTrendModule}
                      onFocus={preloadCumulativeLabTrendModule}
                      onClick={() => onOpenTrend({
                        categoryId: pivot.category.id,
                        mapKey: test.mapKey,
                        testKey: test.testKey,
                        displayName: test.displayName,
                        nameMode,
                        sourceId,
                        title: abbr ? `${name} (${abbr})` : name,
                      })}
                      className="flex min-h-11 w-full min-w-11 flex-col items-center justify-end px-1 py-1.5 transition-colors hover:bg-primary/10 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      aria-label={locale.startsWith('zh')
                        ? `查看 ${name} 趨勢`
                        : `View ${name} trend`}
                      title={locale.startsWith('zh') ? `查看 ${name} 趨勢` : `View ${name} trend`}
                    >
                      {heading}
                    </button>
                  ) : (
                    <div className="flex min-h-11 min-w-11 flex-col items-center justify-end px-1 py-1.5">
                      {heading}
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
          {/* Padding-row virtualization rather than absolute positioning: a
              <tbody> must hold contiguous rows for the sticky header and
              sticky date column to keep their column alignment, so the
              off-screen range collapses into two zero-content spacer rows.
              Column widths are still driven by the always-rendered headers
              (min-w-[46px]), so the visible window cannot re-flow them. */}
          {shouldVirtualizeRows ? (
            <>
              {paddingTop > 0 && (
                <tr aria-hidden="true" style={{ height: paddingTop }}>
                  <td colSpan={flatTests.length + 1} className="p-0" />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const date = pivot.dates[virtualRow.index]
                if (date === undefined) return null
                return renderDateRow(
                  date,
                  virtualRow.index,
                  rowVirtualizer.measureElement,
                )
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden="true" style={{ height: paddingBottom }}>
                  <td colSpan={flatTests.length + 1} className="p-0" />
                </tr>
              )}
            </>
          ) : (
            pivot.dates.map((date, dateIdx) => renderDateRow(date, dateIdx))
          )}
        </tbody>
      </table>
    </div>
  )
})

export const CumulativeLabReport = memo(function CumulativeLabReport({
  observations,
  nameModeControl,
  fullHeight = false,
  activeCategoryId,
  onCategoryChange,
  focusAnalyteKey,
  focusNonce,
  trendWindow,
  onTrendWindowChange,
}: CumulativeLabReportProps) {
  const nameMode = useReportNameMode()
  const pivots = useLabPivot(observations, nameMode)
  const { t } = useLanguage()
  const rightDetail = useOptionalRightDetail()
  const [dialogTrend, setDialogTrend] = useState<OpenTrendRequest | null>(null)
  const categoryLabels = (t.reports as any).cumulativeCategories || {}

  // Reports is itself mounted during an idle period by LeftPanelLayout. Start
  // the optional chart chunk immediately after the cumulative table's first
  // paint; waiting for a second idle deadline can leave the first trend click
  // racing a still-unloaded chart on busy or slower machines.
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const preload = () => {
      if (!cancelled) preloadCumulativeLabTrendModule()
    }
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(preload, 0)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  // Show every category tab, even when the patient has no data — pinnedColumns
  // ensures key analytes still appear as empty column headers so users can see
  // what's expected to be there.
  const nonEmpty = useMemo(() => {
    return CUMULATIVE_REPORT_CATEGORIES
      .map((cat) => pivots[cat.id])
      .filter((p) => !!p)
  }, [pivots])

  // Split into primary categories and hiddenByDefault ones (blood gas, and
  // future extra groups). Extra groups surface automatically when the row is
  // wide enough; in a narrow row the user can add them from 「查看更多」. A Set
  // of revealed ids (rather than a single boolean) keeps each manual choice.
  const visibleCats = useMemo(() => nonEmpty.filter((p) => !p.category.hiddenByDefault), [nonEmpty])
  const hiddenCats = useMemo(() => nonEmpty.filter((p) => p.category.hiddenByDefault), [nonEmpty])

  const [internalActiveId, setInternalActiveId] = useState<string>(() => visibleCats[0]?.category.id || nonEmpty[0]?.category.id || 'cbc')
  // Single focus channel fed by both sources — the parent's props (AI-citation
  // navigation) and the in-table analyte search. Whichever acted last wins, and
  // `seq` always advances so re-picking the same analyte re-runs the centring
  // effect in LabPivotTable.
  const [focusRequest, setFocusRequest] = useState<{ key: string; seq: number } | null>(
    () => (focusAnalyteKey ? { key: focusAnalyteKey, seq: 0 } : null),
  )
  const [seenPropNonce, setSeenPropNonce] = useState(focusNonce)
  if (focusNonce !== seenPropNonce) {
    setSeenPropNonce(focusNonce)
    if (focusAnalyteKey) {
      setFocusRequest((previous) => ({ key: focusAnalyteKey, seq: (previous?.seq ?? 0) + 1 }))
    }
  }
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set())
  const tabsViewportRef = useRef<HTMLDivElement>(null)
  const allTabsMeasureRef = useRef<HTMLDivElement>(null)
  const [hasRoomForAll, setHasRoomForAll] = useState(false)
  // Prefer the parent-controlled id (survives the fullscreen remount) when it
  // points at a category that still has data; otherwise use internal state.
  const activeId = (activeCategoryId && nonEmpty.some((p) => p.category.id === activeCategoryId))
    ? activeCategoryId
    : internalActiveId
  const activeIsMicrobiology = activeId === 'microbio'
  // A category's table remains mounted after the first visit. New categories
  // select immediately and show a compact preparation state for one paint,
  // keeping a large table mount out of the pointer/keyboard event itself.
  const [readyCategoryIds, setReadyCategoryIds] = useState<Set<string>>(
    () => new Set([activeId]),
  )
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null)

  useEffect(() => {
    const categoryToPrepare = pendingCategoryId
      ?? (readyCategoryIds.has(activeId) ? null : activeId)
    if (!categoryToPrepare || readyCategoryIds.has(categoryToPrepare)) return
    let timer: number | undefined
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        startTransition(() => {
          setReadyCategoryIds((previous) => previous.has(categoryToPrepare)
            ? previous
            : new Set(previous).add(categoryToPrepare))
          setPendingCategoryId((current) => current === categoryToPrepare ? null : current)
        })
      }, 0)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [activeId, pendingCategoryId, readyCategoryIds])

  const activeTrendSourceId = dialogTrend?.sourceId
    ?? (rightDetail?.detail?.sourceId.startsWith('cumulative-trend:')
      ? rightDetail.detail.sourceId
      : undefined)

  const openTrend = useCallback((target: OpenTrendTarget) => {
    const series = buildLabTrendSeries(observations, {
      categoryId: target.categoryId,
      mapKey: target.mapKey,
      testKey: target.testKey,
      displayName: target.displayName,
      nameMode: target.nameMode,
    })
    // Availability is indexed during the pivot build. Keep this final guard so
    // a source update between render and click can never open an unsafe chart.
    if (!series.chartable) return
    const request: OpenTrendRequest = {
      series,
      title: target.title,
      sourceId: target.sourceId,
    }
    // Keep cumulative-report trends on the same shared detail surface as the
    // other report tabs at every split-workspace width. On phones this gives
    // the clinician the fixed close/back header and preserves the originating
    // tab + scroll position. The standalone fullscreen report still uses its
    // own dialog because it does not have the split workspace beside it.
    const canUseRightPane = !fullHeight && !!rightDetail

    if (canUseRightPane) {
      setDialogTrend(null)
      const TrendDetail = resolvedCumulativeLabTrendModule?.CumulativeLabTrendDetail
        ?? CumulativeLabTrendDetail
      rightDetail.showDetail({
        sourceId: request.sourceId,
        title: (
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            {request.title} · {(t.reports as any).cumulativeTrend?.title ?? '趨勢'}
          </span>
        ),
        node: (
          <TrendDetail
            key={request.sourceId}
            series={request.series}
            initialWindow={trendWindow}
            onWindowChange={onTrendWindowChange}
          />
        ),
      })
      return
    }

    setDialogTrend(request)
  }, [fullHeight, observations, onTrendWindowChange, rightDetail, t.reports, trendWindow])

  // Measure the real tab bar rather than relying on a screen-size breakpoint:
  // the left report pane can be resized independently from the window. The
  // invisible probe contains every category with the same typography and
  // spacing as the real tabs. If it fits, minority panels can be surfaced
  // directly and the 「查看更多」 picker is unnecessary.
  const measurementKey = nonEmpty
    .map((p) => `${p.category.id}:${categoryLabels[p.category.id] || p.category.id}:${p.dates.length}`)
    .join('|')

  useEffect(() => {
    const viewport = tabsViewportRef.current
    const allTabs = allTabsMeasureRef.current
    if (!viewport || !allTabs) return

    let disposed = false
    const measure = () => {
      if (disposed) return
      setHasRoomForAll(allTabs.scrollWidth <= viewport.clientWidth + 1)
    }

    measure()

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measure)
    observer?.observe(viewport)
    observer?.observe(allTabs)
    window.addEventListener('resize', measure)

    // A late-loading webfont can change label widths without resizing the
    // viewport. ResizeObserver normally catches it; fonts.ready is a fallback
    // for browsers that do not report that intrinsic-size change.
    void document.fonts?.ready.then(measure)

    return () => {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measurementKey, activeId])

  // A hidden category is "shown" once all tabs fit, the user picked it
  // (revealedIds), or it's the active tab (e.g. a fullscreen remount restored a
  // blood-gas selection — Radix renders nothing for a value with no matching
  // trigger/content).
  const isHiddenShown = (id: string) => hasRoomForAll || revealedIds.has(id) || id === activeId
  const shownHidden = hiddenCats.filter((p) => isHiddenShown(p.category.id))
  const shownCats = [...visibleCats, ...shownHidden]
  // Hidden groups not yet surfaced → the dropdown's menu items. When empty, the
  // 「查看更多」 button disappears (all extras are already tabs).
  const pickableHidden = hiddenCats.filter((p) => !isHiddenShown(p.category.id))

  const setActiveId = (id: string) => {
    setInternalActiveId(id)
    if (!readyCategoryIds.has(id)) setPendingCategoryId(id)
    onCategoryChange?.(id)
  }

  // Picking an analyte from the search box switches category and focuses the
  // column. The nonce must change on every pick so choosing the same analyte
  // twice re-runs the centring effect.
  const pickAnalyte = (hit: { categoryId: string; testKey: string }) => {
    if (hiddenCats.some((p) => p.category.id === hit.categoryId)) {
      setRevealedIds((previous) => {
        if (previous.has(hit.categoryId)) return previous
        const next = new Set(previous)
        next.add(hit.categoryId)
        return next
      })
    }
    setActiveId(hit.categoryId)
    setFocusRequest((previous) => ({ key: hit.testKey, seq: (previous?.seq ?? 0) + 1 }))
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

  const TrendDialog = resolvedCumulativeLabTrendModule?.CumulativeLabTrendDialog
    ?? CumulativeLabTrendDialog

  return (
    <div className={fullHeight ? '@container flex h-full flex-col min-w-0 w-full max-w-full overflow-hidden' : '@container space-y-3 min-w-0 w-full max-w-full overflow-hidden'}>
      {/* Cumulative utilities share one responsive row: finder left, trend
          guidance centred, and naming mode right. Keep all three visible at
          zoomed desktop widths; only genuinely narrow panels drop the hint. */}
      <div className="mb-1 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @min-[390px]:grid-cols-[minmax(140px,160px)_minmax(0,1fr)_auto] @min-[480px]:grid-cols-[minmax(200px,220px)_minmax(0,1fr)_auto] @min-[640px]:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_auto]">
        {activeIsMicrobiology ? (
          <span className="min-w-0 truncate text-xs font-medium text-foreground">
            {(t.reports as any).microbiologyCumulative?.toolbarLabel ?? '依採檢日追蹤'}
          </span>
        ) : (
          <AnalyteSearchBox
            pivots={nonEmpty}
            categoryLabels={categoryLabels}
            nameMode={nameMode}
            onPick={pickAnalyte}
            className="w-full min-w-0 @min-[390px]:max-w-[160px] @min-[480px]:max-w-[220px] @min-[640px]:max-w-[260px]"
          />
        )}
        <span className="hidden min-w-0 max-w-full items-center justify-self-center gap-1 overflow-hidden text-[0.6875rem] text-muted-foreground @min-[390px]:inline-flex">
          {activeIsMicrobiology ? (
            <span className="min-w-0 truncate">
              {(t.reports as any).microbiologyCumulative?.hint ?? '點列查看完整原文'}
            </span>
          ) : (
            <>
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="block min-w-0 truncate @min-[480px]:hidden">
                {(t.reports as any).cumulativeTrend?.hintShort ?? '查看趨勢'}
              </span>
              <span className="hidden min-w-0 truncate @min-[480px]:block">
                {(t.reports as any).cumulativeTrend?.hint ?? '點檢驗名稱查看趨勢'}
              </span>
            </>
          )}
        </span>
        <div className="col-start-2 justify-self-end @min-[390px]:col-start-3">
          {nameModeControl ?? <ReportNameModeSwitch responsiveLabels />}
        </div>
      </div>
      <Tabs value={activeId} onValueChange={setActiveId} className={fullHeight ? 'flex h-full w-full min-w-0 flex-col overflow-hidden' : 'w-full min-w-0 overflow-hidden'}>
        <div className="relative flex min-w-0 items-center gap-2">
          <TabsList
            ref={tabsViewportRef}
            aria-label={(t.reports as any).cumulative ?? '累積報告分類'}
            className={`${SUBTAB_LIST_CLASSES} !flex min-w-0 flex-1 snap-x !flex-nowrap !justify-start gap-0 overflow-x-auto max-md:!min-h-[36px] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30`}
          >
            {shownCats.map((p) => {
              const label = categoryLabels[p.category.id] || p.category.id
              return (
                <TabsTrigger
                  key={p.category.id}
                  value={p.category.id}
                  className={`${SUBTAB_TRIGGER_CLASSES} !min-w-fit !flex-none snap-start whitespace-nowrap text-xs max-md:!min-h-[36px]`}
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
                    className="inline-flex min-h-[44px] !min-w-fit !flex-none snap-start items-center gap-0.5 whitespace-nowrap px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-md:!min-h-[36px] xl:min-h-[24px]"
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
          {/* Intrinsic-width probe used only to decide whether every category
              fits in one row. Fixed positioning keeps it out of both layout
              and the horizontal scroll area; aria-hidden keeps the duplicate
              labels out of the accessibility tree. */}
          <div
            ref={allTabsMeasureRef}
            data-cumulative-tabs-measure=""
            aria-hidden="true"
            className="fixed left-0 top-0 invisible pointer-events-none flex w-max items-center gap-1 p-1"
          >
            {nonEmpty.map((p) => {
              const label = categoryLabels[p.category.id] || p.category.id
              return (
                <span
                  key={p.category.id}
                  className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-lg border border-transparent px-2 text-xs ${p.category.id === activeId ? 'font-semibold' : 'font-medium'}`}
                >
                  {label} ({p.dates.length})
                </span>
              )
            })}
          </div>
        </div>
        {shownCats.map((p) => (
          <TabsContent
            key={p.category.id}
            value={p.category.id}
            forceMount={readyCategoryIds.has(p.category.id) || undefined}
            className={fullHeight ? 'mt-1 flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden' : 'mt-1 min-w-0 w-full max-w-full overflow-hidden'}
          >
            {readyCategoryIds.has(p.category.id) ? (
              p.category.id === 'microbio' ? (
                <MicrobiologyCumulativeView
                  observations={observations}
                  nameMode={nameMode}
                  fullHeight={fullHeight}
                />
              ) : (
                <LabPivotTable
                  pivot={p}
                  fullHeight={fullHeight}
                  focusAnalyteKey={p.category.id === activeId ? focusRequest?.key : undefined}
                  focusNonce={focusRequest?.seq}
                  nameMode={nameMode}
                  activeTrendSourceId={activeTrendSourceId}
                  onOpenTrend={openTrend}
                />
              )
            ) : (
              <div
                role="status"
                aria-live="polite"
                className="flex min-h-24 items-center justify-center gap-2 rounded-md border border-border/70 bg-muted/25 px-4 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>{t.common.loading}</span>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
      {dialogTrend && (
        <TrendDialog
          key={dialogTrend.sourceId}
          title={`${dialogTrend.title} · ${(t.reports as any).cumulativeTrend?.title ?? '趨勢'}`}
          series={dialogTrend.series}
          initialWindow={trendWindow}
          onWindowChange={onTrendWindowChange}
          open
          onOpenChange={(open) => {
            if (!open) setDialogTrend(null)
          }}
        />
      )}
    </div>
  )
})
