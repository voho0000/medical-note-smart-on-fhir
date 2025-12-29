// Refactored VitalsCard Component
"use client"

import { FeatureCard } from "@/src/shared/components"
import { useVitals } from './hooks/useVitals'
import { useVitalsView } from './hooks/useVitalsView'
import { VitalsGrid } from './components/VitalsGrid'

export function VitalsCard() {
  const { vitalSigns, isLoading, error } = useVitals()
  const vitals = useVitalsView(vitalSigns)

  return (
    <FeatureCard 
      title="Vitals" 
      isLoading={isLoading} 
      error={error}
      isEmpty={false}
    >
      <VitalsGrid vitals={vitals} isLoading={false} error={null} />
    </FeatureCard>
  )
}
