// Refactored ReportsCard Component
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { useReportsData } from './hooks/useReportsData'
import { useOrphanObservations } from './hooks/useOrphanObservations'
import { useProcedureRows } from './hooks/useProcedureRows'
import { useGroupedRows } from './hooks/useGroupedRows'
import { ReportsTabContent } from './components/ReportsTabContent'
import type { Row } from './types'

export function ReportsCard() {
  const { diagnosticReports = [], observations = [], procedures = [], isLoading, error } = useClinicalData()

  const { reportRows, seenIds } = useReportsData(diagnosticReports)
  const orphanRows = useOrphanObservations(observations, seenIds)
  const procedureRows = useProcedureRows(procedures)

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
    const configs = [
      { value: "all", label: `All (${groupedRows.all.length})`, rows: groupedRows.all },
      { value: "lab", label: `Labs (${groupedRows.lab.length})`, rows: groupedRows.lab },
      { value: "imaging", label: `Imaging (${groupedRows.imaging.length})`, rows: groupedRows.imaging },
      { value: "procedures", label: `Procedures (${groupedRows.procedures.length})`, rows: groupedRows.procedures },
    ]
    return configs.filter((config) => config.value === "all" || config.rows.length > 0)
  }, [groupedRows])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Loading reports...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-600">
          Error loading reports: {error?.message || 'Unknown error'}
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No reports available
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-2">
            {tabConfigs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="capitalize">
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
