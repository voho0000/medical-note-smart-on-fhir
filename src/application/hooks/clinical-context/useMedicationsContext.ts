// Medications Context Hook
import { useMemo } from "react"
import type { ClinicalContextSection } from "@/src/core/entities/clinical-context.entity"
import type { ClinicalData } from "./types"
import type { DataFilters } from "@/src/core/entities/clinical-context.entity"

export function useMedicationsContext(
  includeMedications: boolean,
  clinicalData: ClinicalData | null,
  filters?: DataFilters
): ClinicalContextSection | null {
  return useMemo(() => {
    if (!includeMedications || !clinicalData?.medications?.length) return null

    // Filter by medication status first
    const filtered = clinicalData.medications.filter(m => 
      filters?.medicationStatus === 'all' || m.status === 'active' || m.status === 'completed'
    )

    if (filtered.length === 0) return null

    // Separate active and stopped medications
    const activeMeds = filtered.filter(m => 
      m.status === 'active' || m.status === 'completed'
    )
    const stoppedMeds = filtered.filter(m => 
      m.status !== 'active' && m.status !== 'completed'
    )
    
    const items: string[] = []
    
    // Add active medications
    if (activeMeds.length > 0) {
      items.push('Active Medications:')
      activeMeds.forEach(m => {
        const name = m.medicationCodeableConcept?.text || 'Unknown medication'
        const date = m.authoredOn ? ` (started: ${new Date(m.authoredOn).toLocaleDateString()})` : ''
        items.push(`  • ${name}${date}`)
      })
    }
    
    // Add stopped medications
    if (stoppedMeds.length > 0) {
      if (items.length > 0) items.push('') // Add blank line separator
      items.push('Stopped Medications:')
      stoppedMeds.forEach(m => {
        const name = m.medicationCodeableConcept?.text || 'Unknown medication'
        const date = m.authoredOn ? ` (${new Date(m.authoredOn).toLocaleDateString()})` : ''
        const status = m.status ? ` [${m.status}]` : ''
        items.push(`  • ${name}${date}${status}`)
      })
    }

    if (items.length === 0) return null

    return { title: "Patient's Medications", items }
  }, [includeMedications, clinicalData, filters])
}
