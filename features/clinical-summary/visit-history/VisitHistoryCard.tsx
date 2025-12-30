"use client"

import { useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useVisitHistory } from "./hooks/useVisitHistory"
import { useEncounterDetails } from "./hooks/useEncounterDetails"
import { VisitItem } from "./VisitItem"

export function VisitHistoryCard() {
  const { t, locale } = useLanguage()
  const {
    encounters = [],
    medications = [],
    diagnosticReports = [],
    observations = [],
    procedures = [],
    isLoading,
    error,
  } = useClinicalData()
  
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null)
  
  const visitHistory = useVisitHistory(encounters)
  const encounterDetails = useEncounterDetails(medications, diagnosticReports, observations, procedures, locale)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.tabs.visits}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">{t.common.loading}</div>
        ) : error ? (
          <div className="text-sm text-red-600">
            {error instanceof Error ? error.message : t.errors.fetchClinicalData}
          </div>
        ) : visitHistory.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t.procedures.noData}</div>
        ) : (
          <div className="space-y-3">
            {visitHistory.map((visit) => (
              <VisitItem
                key={visit.id}
                visit={visit}
                details={encounterDetails.get(visit.id)}
                isExpanded={expandedVisitId === visit.id}
                onToggle={() => setExpandedVisitId((prev) => (prev === visit.id ? null : visit.id))}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
