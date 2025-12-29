// Refactored DiagnosisCard Component
"use client"

import { FeatureCard } from "@/src/shared/components"
import { useDiagnosis } from './hooks/useDiagnosis'
import { useDiagnosisRows } from './hooks/useDiagnosisRows'
import { DiagnosisList } from './components/DiagnosisList'

export function DiagnosesCard() {
  const { conditions, isLoading, error } = useDiagnosis()
  const rows = useDiagnosisRows(conditions)

  return (
    <FeatureCard 
      title="Diagnosis / Problem List" 
      isLoading={isLoading} 
      error={error}
      isEmpty={rows.length === 0}
      emptyMessage="No active diagnoses"
    >
      <DiagnosisList diagnoses={rows} isLoading={false} error={null} />
    </FeatureCard>
  )
}
