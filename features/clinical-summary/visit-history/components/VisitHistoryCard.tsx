"use client"

import { useMemo, useState } from "react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useClinicalData } from "@/src/application/hooks/clinical-data/use-clinical-data-query.hook"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CARD_BORDER_CLASSES } from "@/src/shared/config/ui-theme.config"
import { cn } from "@/src/shared/utils/cn.utils"
import { buildIcdDictionary } from "@/src/shared/utils/icd-lookup"
import { useVisitHistory } from "../hooks/useVisitHistory"
import { useEncounterDetails } from "../hooks/useEncounterDetails"
import { useClinicalNotes } from "../hooks/useClinicalNotes"
import { VisitItem } from "./VisitItem"

type VisitTypeFilter = 'all' | 'outpatient' | 'inpatient' | 'emergency'

const FILTER_TYPES: VisitTypeFilter[] = ['all', 'outpatient', 'inpatient', 'emergency']

export function VisitHistoryCard() {
  const { t, locale } = useLanguage()
  const {
    encounters = [],
    medications = [],
    diagnosticReports = [],
    observations = [],
    procedures = [],
    conditions = [],
    documentReferences = [],
    compositions = [],
    isLoading,
    error,
  } = useClinicalData()

  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<VisitTypeFilter>('all')

  const visitHistory = useVisitHistory(encounters)
  const clinicalNotes = useClinicalNotes(documentReferences, compositions)
  const encounterDetails = useEncounterDetails(medications, diagnosticReports, observations, procedures, clinicalNotes, conditions, locale)
  const icdDict = useMemo(() => buildIcdDictionary(conditions), [conditions])

  const counts = useMemo(() => {
    const c = { all: visitHistory.length, outpatient: 0, inpatient: 0, emergency: 0 }
    for (const v of visitHistory) {
      if (v.type === 'outpatient') c.outpatient++
      else if (v.type === 'inpatient') c.inpatient++
      else if (v.type === 'emergency') c.emergency++
    }
    return c
  }, [visitHistory])

  const filteredVisits = useMemo(() => {
    if (typeFilter === 'all') return visitHistory
    return visitHistory.filter((v) => v.type === typeFilter)
  }, [visitHistory, typeFilter])

  const handleFilterChange = (f: VisitTypeFilter) => {
    setTypeFilter(f)
    setExpandedVisitId(null)
  }

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
            {/* Type filter */}
            <div className="flex flex-wrap gap-1.5">
              {FILTER_TYPES.map((f) => {
                const label = f === 'all' ? t.visitHistory.filterAll : t.visitHistory.badges[f]
                const count = counts[f]
                if (f !== 'all' && count === 0) return null
                const active = typeFilter === f
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleFilterChange(f)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border bg-background text-foreground hover:bg-muted"
                    )}
                  >
                    {label}
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      active ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Visit list */}
            {filteredVisits.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">{t.visitHistory.noDetails}</div>
            ) : (
              filteredVisits.map((visit) => (
                <VisitItem
                  key={visit.id}
                  visit={visit}
                  details={encounterDetails.get(visit.id)}
                  icdDict={icdDict}
                  isExpanded={expandedVisitId === visit.id}
                  onToggle={() => setExpandedVisitId((prev) => (prev === visit.id ? null : visit.id))}
                />
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
