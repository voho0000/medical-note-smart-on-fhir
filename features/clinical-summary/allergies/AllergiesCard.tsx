// Refactored AllergiesCard Component
"use client"

import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { useAllergies } from './hooks/useAllergies'
import { useActiveAllergies } from './hooks/useActiveAllergies'
import { AllergyList } from './components/AllergyList'

export function AllergiesCard() {
  const { t } = useLanguage()
  const { allergies, isLoading, error } = useAllergies()
  const activeAllergies = useActiveAllergies(allergies)

  return (
    <FeatureCard 
      title={t.allergies.title}
      featureId="allergies"
      isLoading={isLoading} 
      error={error}
      isEmpty={activeAllergies.length === 0}
      emptyMessage={t.allergies.noData}
    >
      <AllergyList allergies={activeAllergies} isLoading={false} error={null} />
    </FeatureCard>
  )
}
