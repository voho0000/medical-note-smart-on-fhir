// Refactored VitalsCard Component
"use client"

import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { useVitals } from './hooks/useVitals'
import { useVitalsView } from './hooks/useVitalsView'
import { VitalsGrid } from './components/VitalsGrid'

export function VitalsCard() {
  const { t } = useLanguage()
  const { vitalSigns, isLoading, error } = useVitals()
  const vitals = useVitalsView(vitalSigns)

  return (
    <FeatureCard 
      title={t.vitals.title}
      isLoading={isLoading} 
      error={error}
      isEmpty={false}
    >
      <VitalsGrid vitals={vitals} isLoading={false} error={null} />
    </FeatureCard>
  )
}
