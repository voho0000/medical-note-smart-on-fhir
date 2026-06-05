// Refactored ReportsCard Component
"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TAB_ACTIVE_CLASSES, CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Menu, Maximize2, Minimize2, Search, X, Loader2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { useReportsData } from './hooks/useReportsData'
import { useOrphanObservations } from './hooks/useOrphanObservations'
import { useProcedureRows } from './hooks/useProcedureRows'
import { useGroupedRows } from './hooks/useGroupedRows'
import { groupMultiRegionStudies } from './utils/multi-region-grouping'
import { ReportsTabContent } from './components/ReportsTabContent'
import { CumulativeLabReport } from './components/CumulativeLabReport'
import type { Row } from './types'

// Stable empty array so React.memo / virtualizer keep skipping when no
// search match needs expansion. Recreating [] every render would break
// referential equality on the prop.
const EMPTY_EXPANDED_IDS: string[] = []

export function ReportsCard() {
  const { t } = useLanguage()
  const { diagnosticReports = [], observations = [], procedures = [], isLoading, error } = useClinicalData()
  const [activeTab, setActiveTab] = useState("cumulative")
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
      setActiveTab(val)
      setVisitedTabs(prev => prev.has(val) ? prev : new Set(prev).add(val))
      setPendingTab(null)
    })
  }
  const [expanded, setExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const { reportRows, seenIds } = useReportsData(diagnosticReports)
  const procedureRows = useProcedureRows(procedures, observations)
  
  // Mark procedure-category observations as seen so they don't appear as orphans
  const procedureObsIds = useMemo(() => {
    const ids = new Set<string>()
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
  }, [observations, procedures])
  
  const allSeenIds = useMemo(() => {
    const combined = new Set(seenIds)
    procedureObsIds.forEach(id => combined.add(id))
    return combined
  }, [seenIds, procedureObsIds])
  
  const orphanRows = useOrphanObservations(observations, allSeenIds)

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
      const dateStrs: string[] = []
      if (row.effectiveDate) {
        const d = new Date(row.effectiveDate)
        dateStrs.push(d.toLocaleDateString())                          // 1/22/2026
        const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate()
        dateStrs.push(`${y}/${m}/${day}`)                              // 2026/1/22
        dateStrs.push(`${y}/${String(m).padStart(2,'0')}/${String(day).padStart(2,'0')}`) // 2026/01/22
        dateStrs.push(`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`) // 2026-01-22
      }
      // Also look inside accordion children — a multi-item report like
      // "全套血液檢查Ⅰ（八項）" has its individual analytes (RBC, WBC, etc.)
      // in row.obs, and composite tests like BP carry components on each
      // observation. Without checking these, searching for "RBC" misses
      // the row it lives in.
      const innerMatch = row.obs.some((o: any) => {
        const codeText = (o?.code?.text || o?.code?.coding?.[0]?.display || '').toLowerCase()
        if (codeText.includes(q)) return true
        return Array.isArray(o?.component) && o.component.some((c: any) => {
          const cText = (c?.code?.text || c?.code?.coding?.[0]?.display || '').toLowerCase()
          return cText.includes(q)
        })
      })
      return (
        row.title.toLowerCase().includes(q) ||
        row.meta.toLowerCase().includes(q) ||
        dateStrs.some(s => s.toLowerCase().includes(q)) ||
        innerMatch
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
      const innerHit = row.obs.some((o: any) => {
        const codeText = (o?.code?.text || o?.code?.coding?.[0]?.display || '').toLowerCase()
        if (codeText.includes(q)) return true
        return Array.isArray(o?.component) && o.component.some((c: any) => {
          const cText = (c?.code?.text || c?.code?.coding?.[0]?.display || '').toLowerCase()
          return cText.includes(q)
        })
      })
      if (innerHit) ids.push(row.id)
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

  const tabConfigs = useMemo(() => {
    const { tabs: reportTabs } = t.reports
    const cumulativeLabel = (reportTabs as any).cumulative || 'Cumulative'
    const configs = [
      { value: "cumulative", label: cumulativeLabel, rows: [] as Row[], isCumulative: true },
      { value: "all", label: `${reportTabs.all} (${groupedRows.all.length})`, rows: groupedRows.all, isCumulative: false },
      { value: "lab", label: `${reportTabs.lab} (${groupedRows.lab.length})`, rows: groupedRows.lab, isCumulative: false },
      // Tab badge count reflects the post-grouping list (a 6-row multi-region
      // CT now reads as 1 row in the badge), so the number a user sees and
      // the cards they can click on match.
      { value: "imaging", label: `${reportTabs.imaging} (${imagingRows.length})`, rows: imagingRows, isCumulative: false },
      { value: "vitals", label: `${reportTabs.vitals} (${groupedRows.vitals.length})`, rows: groupedRows.vitals, isCumulative: false },
      { value: "procedures", label: `${reportTabs.procedures} (${groupedRows.procedures.length})`, rows: groupedRows.procedures, isCumulative: false },
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
  }, [groupedRows, t])

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

  if (rows.length === 0) {
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
    <Tabs value={activeTab} onValueChange={handleTabChange} className={expanded ? 'flex h-full w-full min-w-0 flex-col overflow-hidden' : 'w-full min-w-0 overflow-hidden'}>
      {/* Desktop tabs */}
      <TabsList className={`hidden md:!flex !justify-start shrink-0 mb-6 !flex-nowrap w-full min-w-0 overflow-x-auto h-9 bg-muted/40 p-1 border border-border/50 gap-1 ${expanded ? 'pr-28' : 'pr-12'} [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full`}>
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
              className={`!flex-1 !min-w-fit px-3 capitalize text-sm whitespace-nowrap ${TAB_ACTIVE_CLASSES.clinical}`}
            >
              {showSpinner && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {tab.label}
            </TabsTrigger>
          )
        })}
      </TabsList>

      {/* Mobile dropdown - shown on small screens (maximize button is absolute, no need here) */}
      <div className="mb-6 md:hidden pr-12">
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
                onClick={() => setActiveTab(tab.value)}
                className={activeTab === tab.value ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : ""}
              >
                {tab.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search bar — hidden on cumulative tab */}
      {activeTab !== "cumulative" && (
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋檢驗名稱、日期..."
            className="w-full rounded-md border border-input bg-background pl-8 pr-8 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
            <CumulativeLabReport observations={observations} fullHeight={expanded} />
          </TabsContent>
        ) : (
          <ReportsTabContent
            key={tab.value}
            value={tab.value}
            rows={tab.rows}
            fullHeight={expanded}
            forceMount={keepMounted}
            defaultOpenIds={expandedRowIds}
          />
        )
      })}
    </Tabs>
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
    <Card className={`${CARD_BORDER_CLASSES.clinical} relative w-full max-w-full`}>
      {expandButton}
      <CardContent className="px-4 pb-4 overflow-hidden min-w-0">
        {reportsContent}
      </CardContent>
    </Card>
  )
}
