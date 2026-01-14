// Refactored ReportsCard Component
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { useReportsData } from './hooks/useReportsData'
import { useOrphanObservations } from './hooks/useOrphanObservations'
import { useProcedureRows } from './hooks/useProcedureRows'
import { useGroupedRows } from './hooks/useGroupedRows'
import { ReportsTabContent } from './components/ReportsTabContent'
import type { Row } from './types'

export function ReportsCard() {
  const { t } = useLanguage()
  const { diagnosticReports = [], observations = [], procedures = [], isLoading, error } = useClinicalData()

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
    const configs = [
      { value: "all", label: `${reportTabs.all} (${groupedRows.all.length})`, rows: groupedRows.all },
      { value: "lab", label: `${reportTabs.lab} (${groupedRows.lab.length})`, rows: groupedRows.lab },
      { value: "imaging", label: `${reportTabs.imaging} (${groupedRows.imaging.length})`, rows: groupedRows.imaging },
      { value: "vitals", label: `${reportTabs.vitals} (${groupedRows.vitals.length})`, rows: groupedRows.vitals },
      { value: "procedures", label: `${reportTabs.procedures} (${groupedRows.procedures.length})`, rows: groupedRows.procedures },
    ]
    // Always show All, Lab, Imaging, Vitals tabs; only hide Procedures if empty
    return configs.filter((config) => 
      config.value === "all" || 
      config.value === "lab" || 
      config.value === "imaging" || 
      config.value === "vitals" ||
      config.rows.length > 0
    )
  }, [groupedRows, t])

  if (isLoading) {
    return (
      <Card>
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
      <Card>
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
      <Card>
        <CardHeader>
          <CardTitle>{t.reports.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t.reports.noData}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="px-4 pb-4">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-6 flex w-full flex-wrap justify-start gap-1 h-9 bg-muted/40 p-1 border border-border/50">
            {tabConfigs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="capitalize text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabConfigs.map((tab) => (
            <ReportsTabContent key={tab.value} value={tab.value} rows={tab.rows} />
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}
