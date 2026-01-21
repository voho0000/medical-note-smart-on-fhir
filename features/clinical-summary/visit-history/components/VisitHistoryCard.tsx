"use client"

import { useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { useVisitHistory } from "../hooks/useVisitHistory"
import { useEncounterDetails } from "../hooks/useEncounterDetails"
import { useClinicalNotes } from "../hooks/useClinicalNotes"
import { VisitItem } from "./VisitItem"

export function VisitHistoryCard() {
  const { t, locale } = useLanguage()
  const {
    encounters = [],
    medications = [],
    diagnosticReports = [],
    observations = [],
    procedures = [],
    documentReferences = [],
    compositions = [],
    isLoading,
    error,
  } = useClinicalData()
  
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null)
  
  const visitHistory = useVisitHistory(encounters)
  const clinicalNotes = useClinicalNotes(documentReferences, compositions)
  const encounterDetails = useEncounterDetails(medications, diagnosticReports, observations, procedures, clinicalNotes, locale)

  return (
    <Card className={CARD_BORDER_CLASSES.clinical}>
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
