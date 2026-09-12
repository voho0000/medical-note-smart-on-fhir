/** Chart evidence → Medical Calculator → versioned fact. No host/CDSS score formula. */
import { deriveVeryHighRiskEvidence, type CdssLocale, type CdssPatientProfile } from '@voho0000/personalized-care'
import { ASCVD_VHR_CALCULATOR, ASCVD_VHR_VERSION } from './calculators/ascvd-vhr'
import type { CalcValues } from './types'
import type { AscvdRiskInputs } from './stores/ascvd-risk-inputs.store'

export function buildAscvdRiskReading(profile: CdssPatientProfile, overrides?: AscvdRiskInputs, locale: CdssLocale = 'zh-TW') {
  const table = deriveVeryHighRiskEvidence(profile, locale).table
  const values: CalcValues = {}
  const excluded: string[] = []
  for (const input of ASCVD_VHR_CALCULATOR.inputs) {
    const item = table.items.find(row => row.id === input.key)
    const enabled = profile.evidenceOverrides?.[input.key] !== false
    if (!enabled) excluded.push(input.key)
    values[input.key] = !enabled ? 'unknown' : overrides?.entries[input.key]?.value
      ?? (item?.direction === 'supports' ? 'yes' : item?.direction === 'against' ? 'no' : 'unknown')
  }
  return { values, excluded, table, result: ASCVD_VHR_CALCULATOR.compute(values) }
}

export function applyAscvdRiskReading(profile: CdssPatientProfile, overrides?: AscvdRiskInputs): CdssPatientProfile {
  const { result, values, excluded } = buildAscvdRiskReading(profile, overrides)
  const facts = { ...profile.facts }
  for (const input of ASCVD_VHR_CALCULATOR.inputs) {
    const entry = overrides?.entries[input.key]
    if (!entry || excluded.includes(input.key)) continue
    const choice = input.options.find(option => option.value === values[input.key])
    facts[`ascvdCriterion:${input.key}`] = {
      zh: `醫師確認：${choice?.label.zh ?? '未知'}`, en: `Physician-confirmed: ${choice?.label.en ?? 'Unknown'}`,
      date: entry.modifiedAt, textEvidence: { direction: 'unknown', matchedTerms: [`criterion:${values[input.key] === '2' ? 'yes' : values[input.key]}`] },
    }
  }
  facts.ascvdVeryHighRisk = {
    zh: `${result.interpretation!.zh}；主要事件至少 ${result.majorEvents}、高風險條件 ${result.highRiskConditions}，未確認 ${result.missing.length} 項`,
    en: `${result.interpretation!.en}; at least ${result.majorEvents} major event(s), ${result.highRiskConditions} high-risk condition(s), ${result.missing.length} unconfirmed`,
    date: profile.evaluatedAt,
    textEvidence: { direction: result.assessment === 'very-high' ? 'supports' : result.assessment === 'not-very-high' ? 'against' : 'unknown', matchedTerms: [`calculator:${ASCVD_VHR_VERSION}`, `assessment:${result.assessment}`, ...result.missing.map(key => `missing:${key}`)] },
  }
  return { ...profile, facts }
}
