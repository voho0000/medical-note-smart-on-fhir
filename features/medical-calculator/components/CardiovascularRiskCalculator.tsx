'use client'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/src/application/providers/language.provider'
import { usePatient } from '@/src/application/hooks/patient/use-patient-query.hook'
import { useLabAutofill } from '../hooks/use-lab-autofill.hook'
import { CARDIOVASCULAR_RISK, type CvdRiskId } from '../calculators/cardiovascular-risk'
import { createCvdRiskResult, isCurrentCvdRiskResult, resolveRiskContext, useCvdRiskResults, useCvdRiskResultsStore, type RiskContext } from '../cardiovascular-risk-results'
import { getCalcInfo } from '../calculators/info'
import { getCalcScoring } from '../calculators/scoring'
import { tr, type CalcValues } from '../types'
const EMPTY_CONTEXT: RiskContext = {}
/** Shared medical-calculator UI, also embedded in CDSS. All scoring stays here. */
export function CardiovascularRiskCalculator({ id, patientId: suppliedId, context = EMPTY_CONTEXT, onBack, locale: suppliedLocale }: {
 id:CvdRiskId; patientId?:string; context?:RiskContext; onBack:()=>void; locale?:string
}) {
 const { patient }=usePatient()
 const patientId=suppliedId??patient?.id
 const { locale }=useLanguage()
 const { autofill }=useLabAutofill()
 const calc=CARDIOVASCULAR_RISK.find(c=>c.id===id)!
 const seeded=useMemo(()=>resolveRiskContext(calc,autofill,context),[calc,autofill,context])
 const results=useCvdRiskResults(patientId)
 const saved=results[id]
 return <RiskForm key={`${patientId??'anonymous'}:${id}:${seeded.contextKey}`} id={id} patientId={patientId} seeded={seeded}
  initial={isCurrentCvdRiskResult(saved,seeded.contextKey)?saved.values:seeded.values} onBack={onBack} locale={suppliedLocale??locale} />
}
function RiskForm({id,patientId,seeded,initial,onBack,locale}:{id:CvdRiskId;patientId?:string;seeded:ReturnType<typeof resolveRiskContext>;initial:CalcValues;onBack:()=>void;locale:string}) {
 const calc=CARDIOVASCULAR_RISK.find(c=>c.id===id)!
 const [values,setValues]=useState(initial)
 const [confirmed,setConfirmed]=useState(false)
 const saved=useCvdRiskResults(patientId)[id]
 const applied=isCurrentCvdRiskResult(saved,seeded.contextKey) && calc.inputs.every(input=>saved.values[input.key]===values[input.key])
 const computed=calc.compute(values)
 const info=getCalcInfo(id),scoring=getCalcScoring(id)
 const zh=locale!=='en'
 const setValue=(key:string,value:string)=>{ setValues(v=>({...v,[key]:value}));setConfirmed(false);if(patientId)useCvdRiskResultsStore.getState().clear(patientId,id) }
 const missing=calc.inputs.filter(i=>!values[i.key]?.trim())
 return <section className="min-w-0 space-y-3" data-testid="cvd-risk-calculator">
  <div className="flex items-center gap-2"><Button variant="ghost" className="min-h-11" onClick={onBack}>{zh?'返回':'Back'}</Button><h3 className="text-sm font-semibold">{tr(locale,calc.name)}</h3></div>
  <p className="text-xs leading-5">{info.useWhen&&tr(locale,info.useWhen)}</p>
  <p className="text-xs leading-5 text-muted-foreground">{calc.blurb&&tr(locale,calc.blurb)}</p>
  <div className="grid gap-3 @min-[30rem]:grid-cols-2">{calc.inputs.map(input=><label key={input.key} className="min-w-0 space-y-1 text-xs" htmlFor={`risk-input-${input.key}`}>
   <span className="block font-medium">{tr(locale,input.label)} {input.type==='number'&&input.unit}</span>
   {input.type==='number'?<Input id={`risk-input-${input.key}`} data-testid={`risk-input-${input.key}`} type="number" step="any" className="min-h-11" value={values[input.key]??''} onChange={e=>setValue(input.key,e.target.value)} />:
    <select id={`risk-input-${input.key}`} data-testid={`risk-input-${input.key}`} className="min-h-11 w-full rounded-md border border-input bg-background px-2 text-sm" value={values[input.key]??''} onChange={e=>setValue(input.key,e.target.value)}><option value="">{zh?'請選擇':'Select'}</option>{input.options.map(o=><option key={o.value} value={o.value}>{tr(locale,o.label)}</option>)}</select>}
   {seeded.metadata[input.key]?.source&&values[input.key]===seeded.values[input.key]?<span className="block break-words text-muted-foreground">{seeded.metadata[input.key].source} {seeded.metadata[input.key].date?.slice(0,10)}</span>:null}
  </label>)}</div>
  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" aria-live="polite">
   <p className="text-lg font-semibold tabular-nums" data-testid="risk-result">{computed?`${computed.value}%`:zh?'尚無可引用結果':'No result available'}</p>
   <p className="text-xs leading-5">{computed?.notes?tr(locale,computed.notes):missing.length?(zh?'待補：':'Missing: ')+missing.map(i=>tr(locale,i.label)).join('、'):zh?'輸入超出適用範圍，或不符合此模型適用條件。':'Inputs are outside the supported range or model eligibility.'}</p>
   {computed?<label className="flex min-h-11 items-start gap-2 text-xs leading-5"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} data-testid="risk-confirm" /><span>{zh?'已核對上列輸入、日期及模型適用性；此次看診引用此結果。':'I have reviewed the inputs, dates and model applicability for this visit.'}</span></label>:null}
   <Button className="min-h-11" disabled={!computed||!confirmed||!patientId} data-testid="risk-apply" onClick={()=>{const record=createCvdRiskResult(id,values,seeded);if(record&&patientId)useCvdRiskResultsStore.getState().apply(patientId,record)}}>{zh?'引用至高血壓 CDSS':'Use in hypertension CDSS'}</Button>
   {applied?<p role="status" className="text-xs">{zh?'已引用；可返回 CDSS 查看更新。':'Applied. Return to CDSS to see the update.'}</p>:null}
   {!patientId?<p className="text-xs">{zh?'請先載入病人再引用。':'Load a patient to apply this result.'}</p>:null}
   <p className="text-xs text-muted-foreground">{zh?'只保留於本次瀏覽工作階段；重新整理、資料變更或超過 24 小時須重新引用。':'Session only. Reconfirm after refresh, data changes or 24 hours.'}</p>
  </div>
  <details className="text-xs leading-5"><summary className="min-h-11 cursor-pointer">{zh?'計算說明與注意事項':'Calculation and caveats'}</summary><p>{scoring?.formula&&tr(locale,scoring.formula)}</p><p>{scoring?.note&&tr(locale,scoring.note)}</p><p>{info.caveats&&tr(locale,info.caveats)}</p></details>
  <p className="break-words text-xs leading-5 text-muted-foreground">{calc.reference}</p>
 </section>
}
