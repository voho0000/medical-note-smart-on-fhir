'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CARDIOVASCULAR_RISK, type CvdRiskId } from '@/features/medical-calculator/calculators/cardiovascular-risk'
import { CardiovascularRiskCalculator } from '@/features/medical-calculator/components/CardiovascularRiskCalculator'
import { useCvdRiskResults, useCvdRiskResultsStore, type RiskContext } from '@/features/medical-calculator/cardiovascular-risk-results'
import { HTN_RISK_FACTS } from '../utils/hypertension-risk-results'
import type { CdssFact } from '../types'
export function HypertensionRiskResults({patientId,facts,context,isEnglish}:{patientId:string;facts:Readonly<Record<string,CdssFact>>;context:RiskContext;isEnglish:boolean}) {
 const [selected,setSelected]=useState<CvdRiskId>()
 const records=useCvdRiskResults(patientId)
 return <section className="overflow-hidden rounded-lg border border-border bg-card" data-testid="htn-risk-results">
  <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">{isEnglish?'Cardiovascular risk · Medical Calculator':'心血管風險 · 醫療計算機'}</h3>
  {selected?<div className="p-3"><CardiovascularRiskCalculator id={selected} patientId={patientId} context={context} locale={isEnglish?'en':'zh-TW'} onBack={()=>setSelected(undefined)} /></div>:<div className="grid divide-y divide-border @min-[42rem]:grid-cols-3">{CARDIOVASCULAR_RISK.map(calc=>{
   const id=calc.id as CvdRiskId,fact=facts[HTN_RISK_FACTS[id]],record=records[id]
   return <div key={id} className="min-w-0 space-y-2 p-3" data-testid={`htn-risk-${id}`}>
    <p className="text-sm font-medium">{isEnglish?calc.name.en:calc.name.zh}</p>
    <p className="text-base font-semibold tabular-nums">{fact?`${fact.numericValue?.toFixed(1)}%`:record?(isEnglish?'Reconfirmation needed':'資料已變更／需重新引用'):(isEnglish?'Not yet applied':'尚未引用')}</p>
    {fact?.calculator?<><p className="text-xs text-muted-foreground">{fact.date?.slice(0,10)} · {fact.calculator.version}{fact.calculator.region?` · ${fact.calculator.region}`:''}</p><details className="text-xs"><summary className="min-h-8 cursor-pointer">{isEnglish?'Inputs and sources':'輸入與來源'}</summary><ul className="space-y-1">{fact.calculator.inputs?.map(i=><li key={i.key} className="break-words">{i.label}：{i.value} {i.unit} · {i.source} {i.date?.slice(0,10)}</li>)}</ul></details></>:null}
    <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={()=>setSelected(id)} data-testid={`htn-open-${id}`}>{isEnglish?'Open calculator':'開啟計算機'}</Button>{record?<Button variant="ghost" className="min-h-11" onClick={()=>useCvdRiskResultsStore.getState().clear(patientId,id)}>{isEnglish?'Remove result':'取消引用'}</Button>:null}</div>
   </div>
  })}</div>}
  <p className="border-t border-border px-3 py-2 text-xs leading-5 text-muted-foreground">{isEnglish?'AHA: PREVENT-CVD ≥7.5%; ESC: SCORE2 / SCORE2-OP ≥10%. Each model has its own eligible population. Missing results remain unknown.':'AHA：PREVENT-CVD ≥7.5%；ESC：SCORE2／SCORE2-OP ≥10%。各模型適用族群不同；未完成的結果維持未知。'}</p>
 </section>
}
