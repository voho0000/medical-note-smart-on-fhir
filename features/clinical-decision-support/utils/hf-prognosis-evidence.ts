import type { CdssPatientProfile } from '../types'
import type { PrognosisEvidence } from '@/features/medical-calculator/prognosis/models'

/** Display original facts for review; do not interpret diagnoses, drugs or units as model inputs. */
export function hfPrognosisEvidence(facts: CdssPatientProfile['facts'] | undefined, isEnglish: boolean): PrognosisEvidence {
  if (!facts) return {}
  const keys: Record<string, string> = {
    age: 'age', sex: 'sex', LVEF: 'LVEF', nyha: 'physicianNyhaClass',
    bloodPressure: 'bloodPressure', serumCreatinine: 'serumCreatinine', bodyMassIndex: 'bodyMassIndex',
    bodyWeight: 'bodyWeight', sodium: 'sodium', hemoglobin: 'hemoglobin', uricAcid: 'uricAcid',
    totalCholesterol: 'totalCholesterol',
  }
  return Object.fromEntries(Object.entries(keys).flatMap(([key, factKey]) => {
    const fact = facts[factKey]
    const value = fact?.[isEnglish ? 'en' : 'zh']
    if (!value?.trim()) return []
    return [[key, {
      value, date: fact.date,
      source: fact.sources?.map(source => `${source.resourceType}${source.resourceId ? `/${source.resourceId}` : ''}`).join(' · ')
        || (isEnglish ? 'CDSS assessment data' : 'CDSS 評估資料'),
    }]]
  }))
}
