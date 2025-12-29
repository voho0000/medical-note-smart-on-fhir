// Refactored VitalsCard Component
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { useVitalsView } from './hooks/useVitalsView'
import { VitalsGrid } from './components/VitalsGrid'

export function VitalsCard() {
  const { vitalSigns = [], isLoading, error } = useClinicalData()
  const vitals = useVitalsView(vitalSigns)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vitals</CardTitle>
      </CardHeader>
      <CardContent>
        <VitalsGrid vitals={vitals} isLoading={isLoading} error={error} />
      </CardContent>
    </Card>
  )
}
