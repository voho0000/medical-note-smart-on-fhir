// Refactored MedListCard Component
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { useMedicationRows } from './hooks/useMedicationRows'
import { MedicationList } from './components/MedicationList'

export function MedListCard() {
  const { medications = [], isLoading, error } = useClinicalData()
  const rows = useMedicationRows(medications)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Medications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <MedicationList 
          medications={rows} 
          isLoading={isLoading} 
          error={error} 
        />
      </CardContent>
    </Card>
  )
}
