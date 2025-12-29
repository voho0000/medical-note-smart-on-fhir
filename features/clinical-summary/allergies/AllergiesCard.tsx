// Refactored AllergiesCard Component
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { useActiveAllergies } from './hooks/useActiveAllergies'
import { AllergyList } from './components/AllergyList'

export function AllergiesCard() {
  const { allergies = [], isLoading, error } = useClinicalData()
  const activeAllergies = useActiveAllergies(allergies)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allergies & Intolerances</CardTitle>
      </CardHeader>
      <CardContent>
        <AllergyList 
          allergies={activeAllergies} 
          isLoading={isLoading} 
          error={error} 
        />
      </CardContent>
    </Card>
  )
}
