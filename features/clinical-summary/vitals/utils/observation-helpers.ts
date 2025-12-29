// Observation Helper Functions
import type { Observation, Coding } from '../types'

export function pickLatestByCode(list: Observation[], code: string): Observation | undefined {
  if (!list || !list.length) return undefined
  const filtered = list.filter(o => (o.code?.coding || []).some((c: Coding) => c.code === code))
  filtered.sort((a, b) => {
    const dateA = a.effectiveDateTime ? new Date(a.effectiveDateTime).getTime() : 0
    const dateB = b.effectiveDateTime ? new Date(b.effectiveDateTime).getTime() : 0
    return dateB - dateA
  })
  return filtered[0]
}

export function filterVitalSigns(observations: any[]): Observation[] {
  if (!observations || observations.length === 0) return []
  
  return observations.filter((obs): obs is Observation => {
    if (!obs || typeof obs !== 'object') return false
    
    const isVitalSign = obs.category?.some(
      (cat: any) => Array.isArray(cat.coding) && 
      cat.coding.some((c: any) => c?.code === 'vital-signs')
    )
    
    return !!isVitalSign
  })
}
