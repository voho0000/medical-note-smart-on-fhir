import type { CdssPatientProfile } from '../types'
import type { PreventReading } from '@/features/medical-calculator/prevent-reading'
/** Adapter only: probability and eligibility belong to Medical Calculator. */
export function applyPreventReading(profile: CdssPatientProfile, reading: PreventReading): CdssPatientProfile {
  const facts = { ...profile.facts }
  delete facts.preventAscvd10YearRisk
  delete facts.preventAscvd30YearRisk
  const risk = reading.result?.risk
  if (!risk) return { ...profile, facts }
  for (const [years, value] of [[10, risk.ascvd10], [30, risk.ascvd30]] as const) {
    if (value === undefined) continue
    facts[`preventAscvd${years}YearRisk`] = {
      zh: `醫療計算機 PREVENT ${years} 年 ASCVD ${value.toFixed(1)}%（基礎模型）`,
      en: `Medical Calculator PREVENT ${years}-year ASCVD ${value.toFixed(1)}% (base model)`,
      numericValue: value, unit: '%', date: profile.evaluatedAt?.slice(0, 10),
      textEvidence: { direction: 'unknown', matchedTerms: [`calculator:prevent-ascvd@${risk.version}`, 'endpoint:ascvd', 'model:base', 'eligibility:confirmed'] },
      sources: reading.inputs.flatMap(input => input.source ? [input.source] : []),
    }
  }
  return { ...profile, facts }
}
