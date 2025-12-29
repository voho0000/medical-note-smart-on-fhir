// Custom Hook: Diagnosis Rows Processing
import { useMemo } from 'react'
import type { Condition, DiagnosisRow, Category, Coding } from '../types'
import { formatDate } from '../utils/fhir-helpers'

export function useDiagnosisRows(conditions: any[]) {
  return useMemo<DiagnosisRow[]>(() => {
    if (!conditions || !Array.isArray(conditions)) return []
    
    return (conditions as Condition[]).map(condition => {
      const categories: string[] = []
      if (condition.category) {
        condition.category.forEach((cat: Category) => {
          if (cat.coding) {
            cat.coding.forEach((coding: Coding) => {
              if (coding.display) categories.push(coding.display)
              else if (coding.code) categories.push(coding.code)
            })
          }
        })
      }

      return {
        id: condition.id || Math.random().toString(36),
        title: condition.code?.text || condition.code?.coding?.[0]?.display || 'Unknown',
        when: formatDate(condition.onsetDateTime || condition.recordedDate),
        clinical: typeof condition.clinicalStatus === 'string' 
          ? condition.clinicalStatus 
          : (condition.clinicalStatus?.coding?.[0]?.display || condition.clinicalStatus?.coding?.[0]?.code || ''),
        verification: typeof condition.verificationStatus === 'string'
          ? condition.verificationStatus
          : (condition.verificationStatus?.coding?.[0]?.display || condition.verificationStatus?.coding?.[0]?.code || ''),
        categories: categories,
      }
    })
  }, [conditions])
}
