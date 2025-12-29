// Refactored DiagnosisCard Component
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClinicalData } from "@/src/application/providers/clinical-data.provider"
import { useDiagnosisRows } from './hooks/useDiagnosisRows'
import { DiagnosisList } from './components/DiagnosisList'

export function DiagnosesCard() {
  const { conditions = [], isLoading, error } = useClinicalData()
  const rows = useDiagnosisRows(conditions)
  

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnosis / Problem List</CardTitle>
      </CardHeader>
      <CardContent>
        <DiagnosisList 
          diagnoses={rows} 
          isLoading={isLoading} 
          error={error} 
        />
      </CardContent>
    </Card>
  )
}
