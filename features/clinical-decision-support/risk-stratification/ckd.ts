import type { CdssFactSource } from '../types'

export type CkdGStage = 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5'
export type CkdAStage = 'A1' | 'A2' | 'A3'

export function classifyEgfr(value: number | undefined): CkdGStage | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined
  if (value >= 90) return 'G1'
  if (value >= 60) return 'G2'
  if (value >= 45) return 'G3a'
  if (value >= 30) return 'G3b'
  if (value >= 15) return 'G4'
  return 'G5'
}

export function classifyUacr(valueMgG: number | undefined): CkdAStage | undefined {
  if (valueMgG === undefined || !Number.isFinite(valueMgG) || valueMgG < 0) return undefined
  if (valueMgG < 30) return 'A1'
  if (valueMgG <= 300) return 'A2'
  return 'A3'
}

export function ckdStageFromDiagnosis(code: string | undefined): CkdGStage | undefined {
  const normalized = code?.toUpperCase()
  if (!normalized) return undefined
  if (normalized === 'N18.1') return 'G1'
  if (normalized === 'N18.2') return 'G2'
  if (normalized === 'N18.31') return 'G3a'
  if (normalized === 'N18.32') return 'G3b'
  if (normalized === 'N18.4') return 'G4'
  if (normalized === 'N18.5' || normalized === 'N18.6') return 'G5'
  return undefined
}

export interface EgfrChangeAssessment {
  previousValue: number
  latestValue: number
  previousDate?: string
  latestDate?: string
  percentChange: number
  exceedsExpectedVariability: boolean
}

export function assessLatestEgfrChange(
  sources: readonly CdssFactSource[] | undefined,
): EgfrChangeAssessment | undefined {
  const values = (sources ?? [])
    .filter((source): source is CdssFactSource & { value: number } => (
      typeof source.value === 'number' && Number.isFinite(source.value)
    ))
    .sort((a, b) => (
      Date.parse(a.date ?? '') - Date.parse(b.date ?? '')
    ))
  if (values.length < 2) return undefined

  const previous = values.at(-2)!
  const latest = values.at(-1)!
  if (previous.value <= 0) return undefined
  const percentChange = ((latest.value - previous.value) / previous.value) * 100

  return {
    previousValue: previous.value,
    latestValue: latest.value,
    previousDate: previous.date,
    latestDate: latest.date,
    percentChange,
    exceedsExpectedVariability: Math.abs(percentChange) > 20,
  }
}
