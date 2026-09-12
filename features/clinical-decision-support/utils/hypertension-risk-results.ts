/** Adapter from Medical Calculator results to pack facts; no score formula. */
import { CARDIOVASCULAR_RISK, type CvdRiskId } from '@/features/medical-calculator/calculators/cardiovascular-risk'
import { isCurrentCvdRiskResult, resolveRiskContext, type CvdRiskResults, type RiskContext } from '@/features/medical-calculator/cardiovascular-risk-results'
import type { Autofill } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'
import type { CdssPatientProfile } from '../types'
import type { ClinicVitals } from '../stores/clinic-vitals.store'
export const HTN_RISK_FACTS: Record<CvdRiskId,string> = { 'prevent-cvd':'preventCvdRisk10y',score2:'score2Risk10y','score2-op':'score2OpRisk10y' }
export function clinicRiskContext(vitals?:ClinicVitals):RiskContext {
 const bp=vitals?.entries.systolic
 return bp?{sbp:{value:String(bp.value),date:bp.measuredOn,source:'Clinic BP / 門診血壓'}}:{}
}
export function applyHypertensionRiskResults(profile:CdssPatientProfile,results:CvdRiskResults,autofill:Autofill,context:RiskContext,now=new Date()):CdssPatientProfile {
 const facts={...profile.facts}
 for(const calc of CARDIOVASCULAR_RISK){
  const id=calc.id as CvdRiskId,key=HTN_RISK_FACTS[id],record=results[id]
  delete facts[key]
  if(profile.facts.ascvdDiagnosis || profile.facts.heartFailureDiagnosis)continue
  if(id==='score2' && profile.eligibleDiseasePackIds?.includes('dm-poc'))continue
  if(!isCurrentCvdRiskResult(record,resolveRiskContext(calc,autofill,context).contextKey,now))continue
  facts[key]={numericValue:record.numericValue,unit:'%',date:record.recordedAt,
   zh:`${calc.name.zh} ${record.numericValue.toFixed(1)}%（醫療計算機）`,en:`${calc.name.en} ${record.numericValue.toFixed(1)}% (Medical Calculator)`,
   calculator:{id,version:record.version,status:'complete',evaluatedAt:record.recordedAt,horizonYears:10,endpoint:id==='prevent-cvd'?'total-cvd':'fatal-nonfatal-cvd',region:record.values.region,inputs:record.inputs},
  }
 }
 return {...profile,evaluatedAt:now.toISOString(),facts}
}
