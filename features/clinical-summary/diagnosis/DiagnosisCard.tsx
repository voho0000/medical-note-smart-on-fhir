// Refactored DiagnosisCard Component
"use client"

import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { useDiagnosis } from './hooks/useDiagnosis'
import { useDiagnosisRows } from './hooks/useDiagnosisRows'
import { DiagnosisList } from './components/DiagnosisList'

export function DiagnosesCard() {
  const { t } = useLanguage()
  const { conditions, isLoading, error } = useDiagnosis()
  const rows = useDiagnosisRows(conditions)

  return (
    <FeatureCard 
      title={t.conditions.title}
      isLoading={isLoading} 
      error={error}
      isEmpty={rows.length === 0}
      emptyMessage={t.conditions.noData}
    >
      <DiagnosisList diagnoses={rows} isLoading={false} error={null} />
    </FeatureCard>
  )
}
