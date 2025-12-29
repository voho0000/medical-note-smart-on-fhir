// Refactored MedListCard Component
"use client"

import { FeatureCard } from "@/src/shared/components"
import { useMedications } from './hooks/useMedications'
import { useMedicationRows } from './hooks/useMedicationRows'
import { MedicationList } from './components/MedicationList'

export function MedListCard() {
  const { medications, isLoading, error } = useMedications()
  const rows = useMedicationRows(medications)

  return (
    <FeatureCard 
      title="Medications" 
      isLoading={isLoading} 
      error={error}
      isEmpty={rows.length === 0}
      emptyMessage="No medications found"
    >
      <MedicationList medications={rows} isLoading={false} error={null} />
    </FeatureCard>
  )
}
