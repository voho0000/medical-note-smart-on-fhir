// Refactored ReportsCard Component
"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TAB_ACTIVE_CLASSES, CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Menu, Maximize2, Minimize2 } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { useReportsData } from './hooks/useReportsData'
import { useOrphanObservations } from './hooks/useOrphanObservations'
import { useProcedureRows } from './hooks/useProcedureRows'
import { useGroupedRows } from './hooks/useGroupedRows'
import { ReportsTabContent } from './components/ReportsTabContent'
import { CumulativeLabReport } from './components/CumulativeLabReport'
import type { Row } from './types'

export function ReportsCard() {
  const { t } = useLanguage()
  const { diagnosticReports = [], observations = [], procedures = [], isLoading, error } = useClinicalData()
  const [activeTab, setActiveTab] = useState("cumulative")
  const [expanded, setExpanded] = useState(false)

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
    const all = [...reportRows, ...orphanRows, ...procedureRows]
    all.sort((a, b) => {
      const dateA = a.obs[0]?.effectiveDateTime
      const dateB = b.obs[0]?.effectiveDateTime
      const timeA = dateA ? new Date(dateA).getTime() : 0
      const timeB = dateB ? new Date(dateB).getTime() : 0
      return timeB - timeA
    })
    return all
  }, [reportRows, orphanRows, procedureRows])

  const groupedRows = useGroupedRows(rows)

  const tabConfigs = useMemo(() => {
    const { tabs: reportTabs } = t.reports
    const cumulativeLabel = (reportTabs as any).cumulative || 'Cumulative'
    const configs = [
      { value: "cumulative", label: cumulativeLabel, rows: [] as Row[], isCumulative: true },
      { value: "all", label: `${reportTabs.all} (${groupedRows.all.length})`, rows: groupedRows.all, isCumulative: false },
      { value: "lab", label: `${reportTabs.lab} (${groupedRows.lab.length})`, rows: groupedRows.lab, isCumulative: false },
      { value: "imaging", label: `${reportTabs.imaging} (${groupedRows.imaging.length})`, rows: groupedRows.imaging, isCumulative: false },
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

  const reportsContent = (
    <Tabs value={activeTab} onValueChange={setActiveTab} className={expanded ? 'flex h-full w-full flex-col' : 'w-full'}>
      {/* Desktop tabs row with maximize button on the right */}
      <div className="hidden md:flex items-center gap-2 mb-6">
        <TabsList className="flex-1 !flex !flex-nowrap !justify-start min-w-0 overflow-x-auto h-9 bg-muted/40 p-1 border border-border/50 gap-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full">
          {tabConfigs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={`!flex-none px-3 capitalize text-sm whitespace-nowrap ${TAB_ACTIVE_CLASSES.clinical}`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={expanded ? 'Minimize' : 'Expand to fullscreen'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Mobile dropdown - shown on small screens */}
      <div className="mb-6 md:hidden flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex-1 justify-between">
              <span className="truncate">
                {tabConfigs.find(t => t.value === activeTab)?.label || tabConfigs[0]?.label}
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
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={expanded ? 'Minimize' : 'Expand to fullscreen'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {tabConfigs.map((tab) =>
        tab.isCumulative ? (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className={expanded ? 'mt-0 flex-1 min-h-0' : 'mt-0'}
          >
            <CumulativeLabReport observations={observations} fullHeight={expanded} />
          </TabsContent>
        ) : (
          <ReportsTabContent key={tab.value} value={tab.value} rows={tab.rows} />
        )
      )}
    </Tabs>
  )

  if (expanded) {
    return (
      <>
        {/* Placeholder to maintain layout in original spot */}
        <Card className={`${CARD_BORDER_CLASSES.clinical} opacity-30 pointer-events-none`}>
          <CardContent className="px-4 pb-4 h-40 flex items-center justify-center text-muted-foreground">
            <Maximize2 className="h-6 w-6 mr-2" />
            <span className="text-sm">Reports expanded — click X to close</span>
          </CardContent>
        </Card>

        {/* Fullscreen overlay */}
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-4 sm:p-6 flex flex-col"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex-1 w-full max-w-7xl mx-auto min-h-0 bg-background rounded-lg border shadow-lg p-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {reportsContent}
          </div>
        </div>
      </>
    )
  }

  return (
    <Card className={CARD_BORDER_CLASSES.clinical}>
      <CardContent className="px-4 pb-4">
        {reportsContent}
      </CardContent>
    </Card>
  )
}
