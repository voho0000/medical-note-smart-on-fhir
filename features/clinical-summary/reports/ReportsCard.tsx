// Refactored ReportsCard Component
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TAB_ACTIVE_CLASSES, CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Menu, Maximize2, Minimize2, Search, X, Loader2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useResourceNavigationStore } from "@/src/application/stores/resource-navigation.store"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { dateSearchTokens } from "@/src/shared/utils/date.utils"
import { useReportsData } from './hooks/useReportsData'
import { useOrphanObservations } from './hooks/useOrphanObservations'
import { useProcedureRows } from './hooks/useProcedureRows'
import { useGroupedRows } from './hooks/useGroupedRows'
import { groupMultiRegionStudies } from './utils/multi-region-grouping'
import { groupLabReportsByDay } from './utils/lab-day-grouping'
import { ReportsTabContent } from './components/ReportsTabContent'
import { CumulativeLabReport } from './components/CumulativeLabReport'
import type { Row } from './types'
import { rowInnerMatch } from './utils/report-search'
import { LAB_CATEGORIES } from '@/src/shared/utils/lab-categories'
import { ReportNameModeProvider } from './context/report-name-mode.context'
import { ReportNameModeSwitch } from './components/ReportNameModeSwitch'
import type { AnalyteNameMode } from '@/src/shared/utils/lab-normalize'

// Stable empty array so React.memo / virtualizer keep skipping when no
// search match needs expansion. Recreating [] every render would break
// referential equality on the prop.
const EMPTY_EXPANDED_IDS: string[] = []
const EMPTY_RESOURCES: any[] = []
const CUMULATIVE_CATEGORY_IDS = new Set(LAB_CATEGORIES.map((category) => category.id))
const NAME_MODE_TABS = new Set(['cumulative', 'all', 'lab', 'imaging', 'vitals'])

export function ReportsCard() {
  const { t } = useLanguage()
  const { diagnosticReports = [], imagingStudies = [], observations = [], procedures = [], isLoading, error } = useClinicalData()
  const [activeTab, setActiveTab] = useState("cumulative")
  // The cumulative destination only needs Observation pivots. Defer the much
  // heavier raw-report pipeline (DR grouping, narrative dedup, orphan rows,
  // day grouping) until a raw tab is actually requested.
  const [rawReportsEnabled, setRawReportsEnabled] = useState(() => {
    const pending = useResourceNavigationStore.getState().pending
    return Boolean(pending && pending.reportView !== 'cumulative')
  })
  // Lifted here (not inside CumulativeLabReport) so the selected cumulative
  // sub-category (生化 …) survives the fullscreen toggle, which remounts the
  // reports content under a different parent.
  const [cumulativeCategoryId, setCumulativeCategoryId] = useState<string | undefined>(() => {
    const pending = useResourceNavigationStore.getState().pending
    const categoryId = pending?.reportView === 'cumulative'
      ? pending.cumulativeCategoryId
      : undefined
    return categoryId && CUMULATIVE_CATEGORY_IDS.has(categoryId) ? categoryId : undefined
  })
  const [cumulativeFocus, setCumulativeFocus] = useState<{
    analyteKey: string
    nonce: number
  } | null>(() => {
    const state = useResourceNavigationStore.getState()
    const analyteKey = state.pending?.reportView === 'cumulative'
      ? state.pending.cumulativeAnalyteKey
      : undefined
    return analyteKey ? { analyteKey, nonce: state.seq } : null
  })
  const handleCumulativeCategoryChange = (categoryId: string) => {
    setCumulativeCategoryId(categoryId)
    setCumulativeFocus(null)
  }
  // Tabs the user has visited at least once in this session. We forceMount
  // only these so the *first* paint of ReportsCard (e.g. when the user
  // switches from "病人資訊" to "報告") doesn't have to mount 500+ rows of
  // every sub-tab at once — only the default tab gets work upfront. Once
  // a sub-tab is visited, it stays mounted so subsequent tab switches are
  // instant (the original perf goal).
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['cumulative']))
  // Two-phase switch keeps the spinner-on-target-tab feedback for the
  // rare case a tab is heavy to mount on its first visit. Phase 1 (urgent)
  // sets pendingTab so the spinner appears immediately on the clicked tab.
  // Phase 2 (next frame) actually swaps activeTab. With virtualization,
  // the second phase is essentially free — only a viewport's worth of
  // rows is ever mounted, no matter how big the tab is.
  const [pendingTab, setPendingTab] = useState<string | null>(null)
  const handleTabChange = (val: string) => {
    setSearchQuery("")
    setPendingTab(val)
    requestAnimationFrame(() => {
      if (val !== 'cumulative') setRawReportsEnabled(true)
      setActiveTab(val)
      setVisitedTabs(prev => prev.has(val) ? prev : new Set(prev).add(val))
      setPendingTab(null)
    })
  }
  const [expanded, setExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [nameMode, setNameMode] = useState<AnalyteNameMode>('standardized')
  // The same preference follows the user across report views whose titles can
  // be normalized. Procedures have no matching control, so they retain their
  // established standardized labels.
  const effectiveNameMode: AnalyteNameMode = NAME_MODE_TABS.has(activeTab)
    ? nameMode
    : 'standardized'

  const { reportRows, seenIds } = useReportsData(
    rawReportsEnabled ? diagnosticReports : EMPTY_RESOURCES,
    rawReportsEnabled ? imagingStudies : EMPTY_RESOURCES,
    effectiveNameMode,
  )
  const procedureRows = useProcedureRows(
    rawReportsEnabled ? procedures : EMPTY_RESOURCES,
    rawReportsEnabled ? observations : EMPTY_RESOURCES,
  )

  // Mark procedure-category observations as seen so they don't appear as orphans
  const procedureObsIds = useMemo(() => {
    const ids = new Set<string>()
    if (!rawReportsEnabled) return ids
    observations.forEach((obs: any) => {
      if (!obs?.category || !obs?.id) return
      const categories = Array.isArray(obs.category) ? obs.category : [obs.category]
      const isProcedureObs = categories.some((cat: any) => {
        const coding = cat?.coding?.[0]
        return coding?.code?.toLowerCase() === 'procedure'
      })
      if (isProcedureObs && obs.encounter?.reference) {
        // Check if this observation is linked to a procedure
        const hasMatchingProcedure = procedures.some((proc: any) =>
          proc?.encounter?.reference === obs.encounter.reference
        )
        if (hasMatchingProcedure) {
          ids.add(obs.id)
        }
      }
    })
    return ids
  }, [observations, procedures, rawReportsEnabled])

  const allSeenIds = useMemo(() => {
    const combined = new Set(seenIds)
    procedureObsIds.forEach(id => combined.add(id))
    return combined
  }, [seenIds, procedureObsIds])

  const orphanRows = useOrphanObservations(
    rawReportsEnabled ? observations : EMPTY_RESOURCES,
    allSeenIds,
    effectiveNameMode,
  )

  // ── Resource navigation (cited DiagnosticReport/Observation in the
  // Medical Summary tab) ────────────────────────────────────────────────
  // Rows are virtualised AND live behind sub-tabs, so this card claims the
  // navigation itself: pick the sub-tab containing the row, then hand the
  // row id to ReportsTabContent which scrolls/expands/flashes it.
  const [navTarget, setNavTarget] = useState<{ id: string; tab: string; nonce: number } | null>(null)
  const resolveNavTarget = useCallback((nonce?: number) => {
    if (nonce === undefined) return
    const state = useResourceNavigationStore.getState()
    if (state.pending && state.seq === nonce) state.consume()
    setNavTarget((current) => current?.nonce === nonce ? null : current)
  }, [])

  const rows: Row[] = useMemo(() => {
    const all: Row[] = [...reportRows, ...orphanRows, ...procedureRows] as Row[]
    all.sort((a, b) => {
      const dateA = a.obs[0]?.effectiveDateTime
      const dateB = b.obs[0]?.effectiveDateTime
      const timeA = dateA ? new Date(dateA).getTime() : 0
      const timeB = dateB ? new Date(dateB).getTime() : 0
      return timeB - timeA
    })
    // Detect same-title rows sharing the same calendar date → need time for disambiguation
    const titleDateCount = new Map<string, number>()
    for (const row of all) {
      const dateOnly = row.effectiveDate
        ? new Date(row.effectiveDate).toISOString().slice(0, 10)
        : ''
      const key = `${row.title}|${dateOnly}`
      titleDateCount.set(key, (titleDateCount.get(key) || 0) + 1)
    }
    for (const row of all) {
      const dateOnly = row.effectiveDate
        ? new Date(row.effectiveDate).toISOString().slice(0, 10)
        : ''
      const key = `${row.title}|${dateOnly}`
      if ((titleDateCount.get(key) || 0) > 1) row.showTime = true
    }

    // Detect possible duplicates: same title + date + institution + single-obs value
    const dupKey = (row: Row) => {
      const dateOnly = row.effectiveDate
        ? new Date(row.effectiveDate).toISOString().slice(0, 10)
        : ''
      const singleValue = row.obs.length === 1
        ? (row.obs[0]?.valueQuantity?.value ?? row.obs[0]?.valueString ?? '')
        : ''
      return `${row.title}|${dateOnly}|${row.institution ?? ''}|${singleValue}`
    }
    const dupCount = new Map<string, number>()
    for (const row of all) {
      const k = dupKey(row)
      dupCount.set(k, (dupCount.get(k) || 0) + 1)
    }
    for (const row of all) {
      if ((dupCount.get(dupKey(row)) || 0) > 1) row.isPossibleDuplicate = true
    }

    return all
  }, [reportRows, orphanRows, procedureRows])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      // Gregorian + 民國(ROC) date tokens so 2025/11/20 and 114/11/20 both match.
      const dateStrs = dateSearchTokens(row.effectiveDate)
      // rowInnerMatch also looks inside accordion children — a multi-item panel
      // like "全套血液檢查Ⅰ（八項）" keeps its analytes (RBC, WBC…) in row.obs,
      // including numeric, coded, and free-text result values.
      return (
        row.title.toLowerCase().includes(q) ||
        row.meta.toLowerCase().includes(q) ||
        (row.institution ?? '').toLowerCase().includes(q) ||
        dateStrs.some(s => s.toLowerCase().includes(q)) ||
        rowInnerMatch(row, q)
      )
    })
  }, [rows, searchQuery])

  // Ids of rows whose match came from inner observations — we auto-expand
  // their accordions so the user can see what was matched without an extra
  // click. Rows that matched on their own title don't need expansion.
  const expandedRowIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return EMPTY_EXPANDED_IDS
    const ids: string[] = []
    for (const row of filteredRows) {
      // Skip if the row itself already matches on title — no need to expand.
      if (row.title.toLowerCase().includes(q)) continue
      if (rowInnerMatch(row, q)) ids.push(row.id)
    }
    // Preserve referential equality across renders when nothing changes so
    // React.memo on ReportRow keeps skipping.
    return ids.length === 0 ? EMPTY_EXPANDED_IDS : ids
  }, [filteredRows, searchQuery])

  const groupedRows = useGroupedRows(filteredRows)

  // Apply multi-region NHI study grouping to the imaging tab. Same-day
  // same-code studies (typical CT/MRI multi-region exams that NHI bills
  // under one code without a body-part field) collapse into a single
  // synthetic group row that ReportRow dispatches to MultiRegionStudyCard.
  // See features/.../utils/multi-region-grouping.ts and bridge v0.17.1's
  // SMART-side guidance for the rationale.
  const imagingRows = useMemo(
    () => groupMultiRegionStudies(groupedRows.imaging),
    [groupedRows.imaging],
  )

  // Lab tab: 健保存摺 ships one DR per analyte, so the default view folds
  // same-(collection day, institution) reports into one LabDayGroupCard —
  // the hospital's「一天一張檢驗單」reading unit. The flat single-item list
  // stays one toggle away. Grouping runs on the FILTERED rows so a search
  // shows day groups containing exactly the matching members.
  const [labByDay, setLabByDay] = useState(true)
  const labRows = useMemo(
    () => (labByDay ? groupLabReportsByDay(groupedRows.lab) : groupedRows.lab),
    [groupedRows.lab, labByDay],
  )

  const tabConfigs = useMemo(() => {
    const { tabs: reportTabs } = t.reports
    const cumulativeLabel = (reportTabs as any).cumulative || 'Cumulative'
    const withCount = (label: string, count: number) => rawReportsEnabled
      ? `${label} (${count})`
      : label
    const configs = [
      { value: "cumulative", label: cumulativeLabel, rows: [] as Row[], isCumulative: true },
      { value: "all", label: withCount(reportTabs.all, groupedRows.all.length), rows: groupedRows.all, isCumulative: false },
      // Badge count follows the active view (day groups vs single items),
      // matching the imaging precedent: the number shown = cards clickable.
      { value: "lab", label: withCount(reportTabs.lab, labRows.length), rows: labRows, isCumulative: false },
      // Tab badge count reflects the post-grouping list (a 6-row multi-region
      // CT now reads as 1 row in the badge), so the number a user sees and
      // the cards they can click on match.
      { value: "imaging", label: withCount(reportTabs.imaging, imagingRows.length), rows: imagingRows, isCumulative: false },
      { value: "vitals", label: withCount(reportTabs.vitals, groupedRows.vitals.length), rows: groupedRows.vitals, isCumulative: false },
      { value: "procedures", label: withCount(reportTabs.procedures, groupedRows.procedures.length), rows: groupedRows.procedures, isCumulative: false },
    ]
    // Always show Cumulative, All, Lab, Imaging, Vitals tabs; only hide Procedures if empty
    return configs.filter((config) =>
      config.value === "cumulative" ||
      config.value === "all" ||
      config.value === "lab" ||
      config.value === "imaging" ||
      config.value === "vitals" ||
      config.rows.length > 0
    )
  }, [groupedRows, imagingRows, labRows, rawReportsEnabled, t])

  // Claim DiagnosticReport / Observation navigations. Row.id is the DR id;
  // orphan-observation rows carry the obs id, so match either directly or
  // via a member observation. Runs before the early returns below so hook
  // order stays stable across loading states.
  const navPending = useResourceNavigationStore((s) => s.pending)
  const navSeq = useResourceNavigationStore((s) => s.seq)
  const consumeNav = useResourceNavigationStore((s) => s.consume)
  useEffect(() => {
    if (!navPending || navPending.reportView === 'cumulative' || rawReportsEnabled) return
    if (!['DiagnosticReport', 'ImagingStudy', 'Observation'].includes(navPending.resourceType)) return
    const timer = window.setTimeout(() => setRawReportsEnabled(true), 0)
    return () => window.clearTimeout(timer)
  }, [navPending, rawReportsEnabled])

  useEffect(() => {
    if (!navPending) return
    if (navPending.reportView === 'cumulative') {
      const categoryId = navPending.cumulativeCategoryId
      if (!categoryId || !CUMULATIVE_CATEGORY_IDS.has(categoryId)) return
      consumeNav()
      // Consuming the store request re-runs this effect immediately. Schedule
      // the local view switch independently so that rerender cannot cancel it.
      setTimeout(() => {
        setSearchQuery('')
        setPendingTab(null)
        setActiveTab('cumulative')
        setVisitedTabs((prev) => prev.has('cumulative') ? prev : new Set(prev).add('cumulative'))
        setCumulativeCategoryId(categoryId)
        setCumulativeFocus(navPending.cumulativeAnalyteKey
          ? { analyteKey: navPending.cumulativeAnalyteKey, nonce: navSeq }
          : null)
        setNavTarget(null)
      }, 0)
      return
    }
    if (!['DiagnosticReport', 'ImagingStudy', 'Observation'].includes(navPending.resourceType)) return
    const hit = rows.find(
      (r) => r.id === navPending.resourceId
        || r.diagnosticReportIds?.includes(navPending.resourceId)
        || r.imagingStudyIds?.includes(navPending.resourceId)
        || r.obs.some((o) => o?.id === navPending.resourceId),
    )
    if (!hit) return // unclaimed → the generic fallback toast explains
    const tab = tabConfigs.find((c) => !c.isCumulative && c.rows.some((r) => r.id === hit.id))
    if (!tab) return
    // Do not use handleTabChange: requestAnimationFrame is frozen in
    // backgrounded tabs. A timer preserves that behaviour while keeping the
    // external-store effect free of synchronous local-state cascades.
    setTimeout(() => {
      setSearchQuery('')
      setActiveTab(tab.value)
      setVisitedTabs((prev) => (prev.has(tab.value) ? prev : new Set(prev).add(tab.value)))
      setNavTarget({ id: hit.id, tab: tab.value, nonce: navSeq })
    }, 0)
  }, [navPending, navSeq, rows, tabConfigs, consumeNav])

  if (isLoading) {
    return (
      <Card className={CARD_BORDER_CLASSES.clinical}>
        <CardHeader>
          <CardTitle>{t.reports.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t.common.loading}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={CARD_BORDER_CLASSES.clinical}>
        <CardHeader>
          <CardTitle>{t.reports.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-600">
          {t.common.error}: {error?.message || t.errors.unknown}
        </CardContent>
      </Card>
    )
  }

  // `rows` is intentionally empty while raw-report work is deferred on the
  // cumulative tab. It is therefore NOT a valid empty-data signal. Check the
  // underlying clinical resources instead so lazy loading cannot hide the
  // entire ReportsCard (including the cumulative Observation pivot).
  const hasReportResources = diagnosticReports.length > 0
    || imagingStudies.length > 0
    || observations.length > 0
    || procedures.length > 0
  if (!hasReportResources) {
    return (
      <Card className={CARD_BORDER_CLASSES.clinical}>
        <CardHeader>
          <CardTitle>{t.reports.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t.reports.noData}
        </CardContent>
      </Card>
    )
  }

  const expandButton = (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="absolute top-2 right-2 z-30 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border bg-background/95 text-muted-foreground hover:bg-accent hover:text-foreground shadow-sm transition-colors"
      title={expanded ? 'Minimize' : 'Expand to fullscreen'}
    >
      {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{expanded ? 'Minimize' : 'Fullscreen'}</span>
    </button>
  )

  const reportsContent = (
    <ReportNameModeProvider value={effectiveNameMode} onChange={setNameMode}>
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className={`${expanded ? 'flex h-full w-full min-w-0 flex-col overflow-hidden' : 'w-full min-w-0'} ${activeTab === 'cumulative' ? 'gap-0' : ''}`}
      >
        {/* Desktop tabs */}
        <TabsList className={`hidden md:!flex !justify-start shrink-0 ${activeTab === 'cumulative' ? 'mb-0.5' : 'mb-2'} !flex-nowrap w-full min-w-0 overflow-x-auto h-9 bg-muted/40 p-1 border border-border/50 gap-1 ${expanded ? 'pr-28' : 'pr-12'} [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full`}>
          {tabConfigs.map((tab) => {
            // Spinner appears on the tab the user is currently switching to,
            // for the duration of useTransition's pending window. Tells the
            // user "your click registered, content is being prepared" instead
            // of leaving the UI looking frozen.
            const showSpinner = pendingTab === tab.value
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={`!flex-none !min-w-fit px-2 capitalize text-sm whitespace-nowrap ${TAB_ACTIVE_CLASSES.clinical}`}
              >
                {showSpinner && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* Mobile dropdown - shown on small screens (maximize button is absolute, no need here) */}
        <div className={`${activeTab === 'cumulative' ? 'mb-0.5' : 'mb-2'} md:hidden pr-12`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="truncate inline-flex items-center gap-1">
                  {pendingTab && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                  {tabConfigs.find(t => t.value === (pendingTab ?? activeTab))?.label || tabConfigs[0]?.label}
                </span>
                <Menu className="ml-2 h-4 w-4 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
              {tabConfigs.map((tab) => (
                <DropdownMenuItem
                  key={tab.value}
                  onClick={() => handleTabChange(tab.value)}
                  className={activeTab === tab.value ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : ""}
                >
                  {tab.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Cumulative-only utility row. Keeping it deliberately short avoids
            the large empty band of the first iteration while preventing the
            setting from competing with either level of navigation. */}
        {activeTab === 'cumulative' && (
          <div className="mb-0.5 flex h-7 shrink-0 items-center justify-end px-1">
            <ReportNameModeSwitch />
          </div>
        )}

        {/* Search bar — hidden on cumulative tab */}
        {activeTab !== "cumulative" && (
          <div className="mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋檢驗名稱、結果、機構、日期..."
                  className="w-full rounded-md border border-input bg-background pl-8 pr-8 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {(activeTab === 'all' || activeTab === 'imaging' || activeTab === 'vitals') && (
                <ReportNameModeSwitch className="shrink-0" />
              )}
            </div>
            {searchQuery.trim() && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                顯示 {filteredRows.length} / 共 {rows.length} 筆
              </p>
            )}
            {/* Lab view toggle — 依採檢日 folds the NHI one-DR-per-analyte
                fragmentation into one card per (day × institution); 單項列表
                is the original flat list. Lab tab only. */}
            {activeTab === "lab" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ReportNameModeSwitch />

                <span className="h-4 w-px bg-border" aria-hidden />

                <div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-0.5" role="group" aria-label={(t.reports as any).labViewLabel}>
                  {([
                    { byDay: true, label: (t.reports as any).byCollectionDay, title: (t.reports as any).byCollectionDayTooltip },
                    { byDay: false, label: (t.reports as any).flatList, title: undefined },
                  ] as const).map((opt) => (
                    <button
                      key={String(opt.byDay)}
                      type="button"
                      onClick={() => setLabByDay(opt.byDay)}
                      title={opt.title}
                      aria-pressed={labByDay === opt.byDay}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        labByDay === opt.byDay
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tabConfigs.map((tab) => {
          // Only forceMount tabs the user has actually visited. Unvisited tabs
          // fall back to Radix's default "render only when active", which means
          // their 500+ rows aren't paid for on the initial mount of ReportsCard.
          const keepMounted = visitedTabs.has(tab.value) || undefined
          return tab.isCumulative ? (
            <TabsContent
              key={tab.value}
              value={tab.value}
              forceMount={keepMounted}
              className={expanded ? 'mt-0 flex-1 min-h-0 min-w-0 w-full max-w-full overflow-hidden' : 'mt-0 min-w-0 w-full max-w-full overflow-hidden'}
            >
              <CumulativeLabReport
                observations={observations}
                fullHeight={expanded}
                activeCategoryId={cumulativeCategoryId}
                onCategoryChange={handleCumulativeCategoryChange}
                focusAnalyteKey={cumulativeFocus?.analyteKey}
                focusNonce={cumulativeFocus?.nonce}
              />
            </TabsContent>
          ) : (
            <ReportsTabContent
              key={tab.value}
              value={tab.value}
              rows={tab.rows}
              isActive={activeTab === tab.value}
              fullHeight={expanded}
              forceMount={keepMounted}
              defaultOpenIds={expandedRowIds}
              searchActive={!!searchQuery.trim()}
              query={searchQuery}
              scrollToId={navTarget?.tab === tab.value ? navTarget.id : null}
              scrollNonce={navTarget?.nonce}
              onScrollResolved={resolveNavTarget}
            />
          )
        })}
      </Tabs>
    </ReportNameModeProvider>
  )

  if (expanded) {
    return (
      <>
        {/* Placeholder to maintain layout in original spot */}
        <Card className={`${CARD_BORDER_CLASSES.clinical} opacity-30 pointer-events-none`}>
          <CardContent className="px-4 pb-4 h-40 flex items-center justify-center text-muted-foreground">
            <Maximize2 className="h-6 w-6 mr-2" />
            <span className="text-sm">Reports expanded — click outside to close</span>
          </CardContent>
        </Card>

        {/* Fullscreen overlay */}
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-4 sm:p-6 flex flex-col"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative flex-1 w-full max-w-7xl mx-auto min-h-0 bg-background rounded-lg border shadow-lg p-4 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {expandButton}
            {reportsContent}
          </div>
        </div>
      </>
    )
  }

  return (
    // pt-3 halves the Card's default pt-6 (24px → 12px) so the report group
    // tabs sit closer to the card's top edge.
    <Card className={`${CARD_BORDER_CLASSES.clinical} relative w-full max-w-full pt-3`}>
      {expandButton}
      <CardContent className="px-4 pb-4 min-w-0">
        {reportsContent}
      </CardContent>
    </Card>
  )
}
