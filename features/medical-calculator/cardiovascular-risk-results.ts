import { useEffect } from 'react'
import { create } from 'zustand'
import { resolveInput } from './autofill-compute'
import { CARDIOVASCULAR_RISK, CVD_RISK_VERSION, type CvdRiskId } from './calculators/cardiovascular-risk'
import type { Autofill } from './hooks/use-lab-autofill.hook'
import type { CalcValues, CalculatorDef } from './types'
export interface RiskContextInput { value: string; date?: string; source: string }
export type RiskContext = Record<string, RiskContextInput>
export interface CvdRiskResult {
 calculatorId: CvdRiskId
 version: string
 numericValue: number
 recordedAt: string
 values: CalcValues
 contextKey: string
 inputs: { key: string; label: string; value: string; unit?: string; date?: string; source: string }[]
}
export function resolveRiskContext(calc: CalculatorDef, autofill: Autofill, context: RiskContext = {}) {
 const values: CalcValues = {}
 const metadata: RiskContext = {}
 for (const input of calc.inputs) {
  const resolved = resolveInput(input, autofill)
  const override = context[input.key]
  const value = override?.value ?? (resolved.unconvertible ? '' : resolved.value)
  values[input.key] = value
  metadata[input.key] = override ?? { value, date: resolved.date || undefined, source: resolved.filled ? resolved.source?.testName ?? 'Patient record / 病歷' : '' }
 }
 return { values, metadata, contextKey: JSON.stringify(metadata) }
}
/** Only the calculator creates a result. Consumers receive an immutable snapshot. */
export function createCvdRiskResult(id: CvdRiskId, values: CalcValues, seeded: ReturnType<typeof resolveRiskContext>, now = new Date()): CvdRiskResult | undefined {
 const calc = CARDIOVASCULAR_RISK.find(c => c.id === id)!
 const computed = calc.compute(values)
 if (computed?.numericValue === undefined || !Number.isFinite(computed.numericValue)) return undefined
 return {
  calculatorId: id, version: CVD_RISK_VERSION, numericValue: computed.numericValue, recordedAt: now.toISOString(), values: { ...values }, contextKey: seeded.contextKey,
  inputs: calc.inputs.map(i => ({ key:i.key, label:i.label.zh, value:values[i.key], unit:i.type==='number'?i.unit:undefined,
   date:values[i.key]===seeded.values[i.key]?seeded.metadata[i.key].date:undefined,
   source:values[i.key]===seeded.values[i.key] && seeded.metadata[i.key].source ? seeded.metadata[i.key].source : 'Physician confirmed / 醫師確認',
  })),
 }
}
export function isCurrentCvdRiskResult(result: CvdRiskResult | undefined, contextKey: string, now = new Date()): result is CvdRiskResult {
 if (!result || result.version !== CVD_RISK_VERSION || result.contextKey !== contextKey || !Number.isFinite(result.numericValue) || result.numericValue < 0 || result.numericValue > 100) return false
 const age = now.getTime() - new Date(result.recordedAt).getTime()
 return age >= 0 && age < 86400000
}
export type CvdRiskResults = Partial<Record<CvdRiskId,CvdRiskResult>>
const EMPTY: CvdRiskResults = {}
/** Patient-scoped, session-only. No PHI is written to localStorage or telemetry.
 * Refresh intentionally requires re-confirmation; this is not a longitudinal record. */
export const useCvdRiskResultsStore = create<{
 byPatient: Record<string,CvdRiskResults>
 apply: (patientId:string,result:CvdRiskResult)=>void
 clear: (patientId:string,id:CvdRiskId)=>void
}>(set=>({
 byPatient:{},
 apply:(patientId,result)=>set(s=>({byPatient:{...s.byPatient,[patientId]:{...s.byPatient[patientId],[result.calculatorId]:result}}})),
 clear:(patientId,id)=>set(s=>{const entries={...s.byPatient[patientId]}; delete entries[id]; return {byPatient:{...s.byPatient,[patientId]:entries}}}),
}))
export function useCvdRiskResults(patientId?: string) {
 const results=useCvdRiskResultsStore(s=>patientId?s.byPatient[patientId]??EMPTY:EMPTY)
 useEffect(()=>{
  if(!patientId)return
  const entries=Object.entries(results)
  if(!entries.length)return
  const expiry=Math.min(...entries.map(([,r])=>new Date(r!.recordedAt).getTime()+86400000))
  const timer=setTimeout(()=>{
   for(const [id,r] of entries)if(new Date(r!.recordedAt).getTime()+86400000<=Date.now())useCvdRiskResultsStore.getState().clear(patientId,id as CvdRiskId)
  },Math.max(0,expiry-Date.now()))
  return ()=>clearTimeout(timer)
 },[patientId,results])
 return results
}
