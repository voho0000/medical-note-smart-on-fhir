// ProblemListCard — standalone "active problems / problem list" view.
//
// Different from DiagnosesCard: this card shows conditions explicitly tagged
// with FHIR category `problem-list-item` (the canonical FHIR problem-list
// representation, used by IPS and other document-type bundles). VGH-style
// encounter-bound diagnoses are shown in 就診紀錄, not here — so this card
// stays empty for VGH data and only surfaces standalone problem-list items.
"use client"

import { useMemo } from 'react'
import { useLanguage } from "@/src/application/providers/language.provider"
import { FeatureCard } from "@/src/shared/components"
import { useDiagnosis } from '../diagnosis/hooks/useDiagnosis'
import { useDiagnosisRows } from '../diagnosis/hooks/useDiagnosisRows'
import { DiagnosisList } from '../diagnosis/components/DiagnosisList'

function isProblemListItem(cond: any): boolean {
  const categories = cond?.category
  if (!Array.isArray(categories)) return false
  return categories.some((cat: any) =>
    Array.isArray(cat?.coding) &&
    cat.coding.some((c: any) => c?.code === 'problem-list-item')
  )
}

export function ProblemListCard() {
  const { t } = useLanguage()
  const { conditions, isLoading, error } = useDiagnosis()

  const filteredConditions = useMemo(
    () => (Array.isArray(conditions) ? conditions.filter(isProblemListItem) : []),
    [conditions]
  )

  const rows = useDiagnosisRows(filteredConditions)
  const tt = (t as any).problemList || { title: 'Problem List', noData: 'No problem list items.' }

  return (
    <FeatureCard
      title={tt.title}
      featureId="problem-list"
      isLoading={isLoading}
      error={error}
      isEmpty={rows.length === 0}
      emptyMessage={tt.noData}
    >
      <DiagnosisList diagnoses={rows} isLoading={false} error={null} />
    </FeatureCard>
  )
}
