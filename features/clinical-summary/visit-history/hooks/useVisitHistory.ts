import { useMemo } from "react"
import { getReferenceId, getCodeText } from "../utils/formatters"

type VisitType = 'outpatient' | 'inpatient' | 'emergency' | 'home' | 'virtual' | 'other'

export interface VisitRecord {
  id: string
  type: VisitType
  date: string
  location?: string
  reason?: string
  diagnosis?: string
  status: string
  department?: string
  physician?: string
}

export function useVisitHistory(encounters: any[]) {
  return useMemo<VisitRecord[]>(() => {
    if (!Array.isArray(encounters)) return []
    
    return encounters
      .filter((encounter: any) => {
        const status = encounter.status
        return status === 'finished' || status === 'in-progress' || status === 'arrived'
      })
      .map((encounter: any) => {
        let type: VisitType = 'other'
        const classCode = encounter.class?.code?.toLowerCase()
        const reasonText = (encounter.reasonCode?.[0]?.text || '').toLowerCase()
        
        if (classCode === 'ambulatory' || classCode === 'outpatient' || 
            reasonText.includes('prenatal') || reasonText.includes('check up') || reasonText.includes('postnatal')) {
          type = 'outpatient'
        } 
        else if (classCode === 'emergency' || reasonText.includes('emergency')) {
          type = 'emergency'
        }
        else if (classCode === 'inpatient' || reasonText.includes('admission') || reasonText.includes('hospital')) {
          type = 'inpatient'
        }
        else if (classCode === 'home') {
          type = 'home'
        }
        else if (classCode === 'virtual') {
          type = 'virtual'
        }
        
        let location = encounter.location?.[0]?.location?.display || 
                     (encounter.serviceProvider?.display && 
                      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(encounter.serviceProvider.display)
                      ? encounter.serviceProvider.display 
                      : '')
        
        const reason = encounter.reasonCode?.[0]?.text || 
                      encounter.reasonReference?.[0]?.display ||
                      encounter.type?.[0]?.text
        
        const diagnosis = encounter.diagnosis?.find((d: any) => d.rank === 1)?.condition?.display ||
                         encounter.diagnosis?.[0]?.condition?.display

        let department = ''
        let physician = ''
        if (type === 'outpatient') {
          department = encounter.type?.[0]?.coding?.[0]?.display || 
                      encounter.type?.[0]?.text ||
                      encounter.serviceType?.coding?.[0]?.display ||
                      ''
          department = department.replace('門診', '').trim()

          const participant = encounter.participant?.find((p: any) => 
            p?.individual?.display || p?.actor?.display
          )
          physician = participant?.individual?.display || participant?.actor?.display || ''
        }

        return {
          id: encounter.id,
          type,
          date: encounter.period?.start || '',
          location,
          reason,
          diagnosis,
          status: encounter.status,
          department: department || undefined,
          physician: physician || undefined
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [encounters])
}
