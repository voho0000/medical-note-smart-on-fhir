// Refactored MedListCard Component
"use client"

import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { useMedications } from './hooks/useMedications'
import { useMedicationRows } from './hooks/useMedicationRows'
import { MedicationList } from './components/MedicationList'

export function MedListCard() {
  const { t } = useLanguage()
  const { medications, isLoading, error } = useMedications()
  const rows = useMedicationRows(medications)

  return (
    <FeatureCard 
      title={t.medications.title}
      isLoading={isLoading} 
      error={error}
      isEmpty={rows.length === 0}
      emptyMessage={t.medications.noData}
    >
      <MedicationList medications={rows} isLoading={false} error={null} />
    </FeatureCard>
  )
}
