// Observation Helper Functions
import type { Observation } from '@/src/shared/types/fhir.types'

type Coding = { code?: string; display?: string }

// NHI Taiwan may omit vital-signs category; detect by display name instead
const VITAL_DISPLAY_KEYWORDS = [
  'systolic', 'diastolic', 'blood pressure',
  'body weight', 'body height', 'bmi', 'body mass',
  'heart rate', 'pulse rate', 'respiratory rate',
  'body temperature', 'oxygen saturation',
  'waist circumference',
]

function hasVitalKeyword(obs: any): boolean {
  const texts = [
    ...(obs.code?.coding || []).flatMap((c: any) => [c.display, c.code]),
    obs.code?.text,
  ].filter(Boolean).map((s: string) => s.toLowerCase())
  return texts.some(t => VITAL_DISPLAY_KEYWORDS.some(kw => t.includes(kw)))
}

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

export function pickLatestByDisplay(list: Observation[], displaySubstring: string): Observation | undefined {
  if (!list || !list.length) return undefined
  const lower = displaySubstring.toLowerCase()
  const filtered = list.filter(o =>
    (o.code?.coding || []).some((c: any) =>
      c.display?.toLowerCase().includes(lower) || c.code?.toLowerCase().includes(lower)
    ) || o.code?.text?.toLowerCase().includes(lower)
  )
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

    return !!(isVitalSign || hasVitalKeyword(obs))
  })
}
