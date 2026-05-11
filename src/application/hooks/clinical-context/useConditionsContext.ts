// Conditions Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection, DataFilters } from "@/src/core/entities/clinical-context.entity"
import { mapAndFilter } from "./formatters"
import type { ClinicalData } from "./types"
import { lookupIcd, buildIcdDictionary } from "@/src/shared/utils/icd-lookup"

function formatConditionName(condition: any, dict: Map<string, string>): string {
  const text = condition.code?.text
  const coding = condition.code?.coding ?? []
  const icdCoding = coding.find((c: any) => c.system?.toLowerCase().includes('icd')) || coding[0]
  const code = icdCoding?.code
  const display = icdCoding?.display
  const lookup = code ? lookupIcd(code, dict) : undefined

  // Prefer text first, then coding display, then ICD lookup
  const baseName = text || display || lookup || code || 'Unknown diagnosis'
  // If we have an ICD code, prepend it
  if (code && code !== baseName) {
    return `${code} - ${baseName}`
  }
  return baseName
}

export function useConditionsContext(
  includeConditions: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters
): ClinicalContextSection | null {
  return useMemo(() => {
    if (!includeConditions || !clinicalData?.conditions?.length) return null

    // Build ICD dictionary from current conditions for cross-referencing
    const icdDict = buildIcdDictionary(clinicalData.conditions as any[])

    // Filter conditions by status if filter is set to 'active'
    let conditions = clinicalData.conditions
    if (filters?.conditionStatus === 'active') {
      conditions = conditions.filter((condition: any) => {
        const clinicalStatus = condition.clinicalStatus?.coding?.[0]?.code || 
                              condition.clinicalStatus?.text ||
                              condition.clinicalStatus
        
        // If no status field, treat as active
        if (!clinicalStatus) return true
        
        // Include active, recurrence, relapse statuses
        return clinicalStatus === 'active' || 
               clinicalStatus === 'recurrence' || 
               clinicalStatus === 'relapse'
      })
    }

    // Separate active and resolved conditions
    const activeConditions = conditions.filter((condition: any) => {
      const clinicalStatus = condition.clinicalStatus?.coding?.[0]?.code || 
                            condition.clinicalStatus?.text ||
                            condition.clinicalStatus
      
      // If no status, treat as active
      if (!clinicalStatus) return true
      
      const statusStr = typeof clinicalStatus === 'string' 
        ? clinicalStatus.toLowerCase() 
        : String(clinicalStatus).toLowerCase()
      
      return statusStr === 'active' || 
             statusStr === 'recurrence' || 
             statusStr === 'relapse'
    })
    
    const resolvedConditions = conditions.filter((condition: any) => {
      const clinicalStatus = condition.clinicalStatus?.coding?.[0]?.code || 
                            condition.clinicalStatus?.text ||
                            condition.clinicalStatus
      
      if (!clinicalStatus) return false
      
      const statusStr = typeof clinicalStatus === 'string' 
        ? clinicalStatus.toLowerCase() 
        : String(clinicalStatus).toLowerCase()
      
      return statusStr !== 'active' && 
             statusStr !== 'recurrence' && 
             statusStr !== 'relapse'
    })
    
    const items: string[] = []
    
    // Add active conditions
    if (activeConditions.length > 0) {
      items.push('Active Conditions:')
      activeConditions.forEach((condition: any) => {
        const name = formatConditionName(condition, icdDict)
        const date = condition.recordedDate ? ` (recorded: ${new Date(condition.recordedDate).toLocaleDateString()})` : ''
        items.push(`  • ${name}${date}`)
      })
    }

    // Add resolved conditions
    if (resolvedConditions.length > 0) {
      if (items.length > 0) items.push('') // Add blank line separator
      items.push('Resolved Conditions:')
      resolvedConditions.forEach((condition: any) => {
        const name = formatConditionName(condition, icdDict)
        const date = condition.recordedDate ? ` (${new Date(condition.recordedDate).toLocaleDateString()})` : ''
        const status = condition.clinicalStatus?.coding?.[0]?.code ||
                      condition.clinicalStatus?.text ||
                      condition.clinicalStatus
        const statusLabel = status ? ` [${status}]` : ''
        items.push(`  • ${name}${date}${statusLabel}`)
      })
    }

    if (items.length === 0) return null

    return { title: "Patient's Conditions", items }
  }, [includeConditions, clinicalData, filters])
}
