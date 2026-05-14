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
        // Support both full-word and standard HL7 ActCode short codes (AMB, IMP, EMER…)
        const classCode = (encounter.class?.code || encounter.class?.display || '').toLowerCase()
        const reasonText = (encounter.reasonCode?.[0]?.text || '').toLowerCase()
        // NHI Taiwan may encode type in serviceType or type[].text instead of class.code
        const serviceTypeText = (
          encounter.serviceType?.coding?.[0]?.display ||
          encounter.serviceType?.text || ''
        ).toLowerCase()
        const typeText = (
          encounter.type?.[0]?.coding?.[0]?.display ||
          encounter.type?.[0]?.text || ''
        ).toLowerCase()

        if (['emer', 'emergency', 'ed'].includes(classCode) ||
            reasonText.includes('emergency') ||
            serviceTypeText.includes('急診') || typeText.includes('急診')) {
          type = 'emergency'
        }
        else if (['imp', 'inpatient', 'acute', 'ss', 'obsenc', 'prenc'].includes(classCode) ||
                 reasonText.includes('admission') || reasonText.includes('hospital') ||
                 serviceTypeText.includes('住院') || typeText.includes('住院')) {
          type = 'inpatient'
        }
        else if (['amb', 'ambulatory', 'outpatient', 'op'].includes(classCode) ||
            reasonText.includes('prenatal') || reasonText.includes('check up') || reasonText.includes('postnatal') ||
            serviceTypeText.includes('門診') || typeText.includes('門診')) {
          type = 'outpatient'
        }
        else if (['hh', 'home'].includes(classCode)) {
          type = 'home'
        }
        else if (['vr', 'virtual', 'tele'].includes(classCode)) {
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

        let department = encounter.type?.[0]?.coding?.[0]?.display ||
                        encounter.type?.[0]?.text ||
                        encounter.serviceType?.coding?.[0]?.display ||
                        ''
        department = department.replace(/門診|住院|急診/g, '').trim()

        const participant = encounter.participant?.find((p: any) =>
          p?.individual?.display || p?.actor?.display
        )
        const physician = participant?.individual?.display || participant?.actor?.display || ''

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
