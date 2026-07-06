// Improved Medication List Component with Collapsible Sections
"use client"

import { useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/src/application/providers/language.provider"
import type { MedicationRow } from '../types'
import { MedicationItem } from './MedicationItem'
import { MedicationHistoryList } from './MedicationHistoryList'
import { useGroupedMedications } from '../hooks/useGroupedMedications'

interface MedicationListProps {
  medications: MedicationRow[]
  isLoading: boolean
  error: Error | null
  /** When true, MedicationItem renders a "目前服用" chip on rows that came
   *  from a FHIR MedicationStatement (rather than a MedicationRequest).
   *  Set by MedListCard only when the list is mixed-source; pure single-source
   *  lists are signalled via a card-level banner instead. */
  showSourceChip?: boolean
  sourceChipStatementLabel?: string
  sourceChipStatementTooltip?: string
}

export function MedicationList({
  medications,
  isLoading,
  error,
  showSourceChip = false,
  sourceChipStatementLabel,
  sourceChipStatementTooltip,
}: MedicationListProps) {
  const { t } = useLanguage()
  const mt = (t.medications as any)
  const [showInactive, setShowInactive] = useState(false)
  const { activeMedications, inactiveMedicationGroups } = useGroupedMedications(medications)

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t.common.loading}</div>
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  if (medications.length === 0) {
    return <div className="text-sm text-muted-foreground">{mt.noData}</div>
  }

  const totalInactive = inactiveMedicationGroups.reduce((sum, group) => sum + group.count, 0)

  return (
    <div className="space-y-4">
      {/* Currently in use Medications */}
      {activeMedications.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-foreground">
            {mt.currentlyInUse} ({activeMedications.length})
          </h3>
          <div className="space-y-1">
            {activeMedications.map((medication) => (
              <MedicationItem
                key={medication.id}
                medication={medication}
                showSourceChip={showSourceChip}
                sourceChipStatementLabel={sourceChipStatementLabel}
                sourceChipStatementTooltip={sourceChipStatementTooltip}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Medications - Collapsible */}
      {totalInactive > 0 && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="w-full justify-between px-0 hover:bg-transparent"
          >
            <div className="flex items-center gap-2">
              {showInactive ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <History className="h-4 w-4" />
              <span className="text-sm font-semibold">
                {mt.history} ({totalInactive} {mt.historyStopped})
              </span>
            </div>
          </Button>

          {showInactive && (
            <MedicationHistoryList groups={inactiveMedicationGroups} />
          )}
        </div>
      )}
    </div>
  )
}
