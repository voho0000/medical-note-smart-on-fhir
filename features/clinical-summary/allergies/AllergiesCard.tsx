// Refactored AllergiesCard Component
"use client"

import { FeatureCard } from "@/src/shared/components"
import { useAllergies } from './hooks/useAllergies'
import { useActiveAllergies } from './hooks/useActiveAllergies'
import { AllergyList } from './components/AllergyList'

export function AllergiesCard() {
  const { allergies, isLoading, error } = useAllergies()
  const activeAllergies = useActiveAllergies(allergies)

  return (
    <FeatureCard 
      title="Allergies & Intolerances" 
      isLoading={isLoading} 
      error={error}
      isEmpty={activeAllergies.length === 0}
      emptyMessage="No active allergies found"
    >
      <AllergyList allergies={activeAllergies} isLoading={false} error={null} />
    </FeatureCard>
  )
}
