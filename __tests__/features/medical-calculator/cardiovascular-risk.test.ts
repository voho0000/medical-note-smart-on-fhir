import { CARDIOVASCULAR_RISK } from '@/features/medical-calculator/calculators/cardiovascular-risk'
import { CALCULATORS } from '@/features/medical-calculator/calculators'
import { createCvdRiskResult, isCurrentCvdRiskResult, resolveRiskContext, useCvdRiskResultsStore } from '@/features/medical-calculator/cardiovascular-risk-results'
import { applyHypertensionRiskResults } from '@/features/clinical-decision-support/utils/hypertension-risk-results'
import type { CalcValues } from '@/features/medical-calculator/types'
import type { CdssPatientProfile } from '@voho0000/personalized-care'
const calc=(id:string)=>CARDIOVASCULAR_RISK.find(c=>c.id===id)!
const centered:CalcValues={age:'55',sex:'female',sbp:'130',tc:String(4.8/.02586),hdl:String(1.3/.02586),egfr:'90',bmi:'25',smoking:'no',diabetes:'no',cvd:'no',bpTreatment:'no',statin:'no'}
const now=new Date('2026-09-12T08:00:00Z')
const autofill={resolve:()=>undefined}
describe('published cardiovascular equations in Medical Calculator',()=>{
 it('registers each model exactly once',()=>{
  for(const c of CARDIOVASCULAR_RISK)expect(CALCULATORS.filter(x=>x.id===c.id)).toHaveLength(1)
 })
 it.each([['female',3.5307022869694182],['male',4.60375035454346]])('PREVENT centered %s matches the published intercept', (sex,expected)=>{
  expect(calc('prevent-cvd').compute({...centered,sex:String(sex)})?.numericValue).toBeCloseTo(Number(expected),10)
 })
 it.each(['age','sex','sbp','tc','hdl','egfr','bmi','smoking','diabetes','cvd','bpTreatment','statin'])('PREVENT leaves missing %s unknown',key=>{
  expect(calc('prevent-cvd').compute({...centered,[key]:''})).toBeNull()
 })
 it.each([['age','29'],['age','80'],['sbp','201'],['egfr','14'],['tc','129'],['hdl','101'],['bmi','40'],['cvd','yes'],['smoking','unknown'],['sbp','NaN']])('does not extrapolate %s=%s',(key,value)=>{
  expect(calc('prevent-cvd').compute({...centered,[key]:value})).toBeNull()
 })
 it.each([
 ['male','low',4.997436620034456],['male','moderate',6.32304821673515],['male','high',6.593699066654246],['male','very-high',11.745125141928492],
 ['female','low',3.29399689373181],['female','moderate',3.874853539934131],['female','high',4.96499185848166],['female','very-high',10.357218633939326],
 ])('SCORE2 centered %s/%s uses the authors’ corrected calibration', (sex,region,expected)=>{
  expect(calc('score2').compute({...centered,age:'60',sbp:'120',tc:String(6/.02586),sex:String(sex),region:String(region)})?.numericValue).toBeCloseTo(Number(expected),9)
 })
 it.each([
 ['male','low',18.5621036609676],['male','moderate',23.941979028784445],['male','high',27.807827211781067],['male','very-high',39.708545990041955],
 ['female','low',15.158016366687232],['female','moderate',19.996559204230135],['female','high',30.591831437028528],['female','very-high',45.533472710883],
 ])('SCORE2-OP example predictors %s/%s use Methods Table 1 scales', (sex,region,expected)=>{
  expect(calc('score2-op').compute({...centered,age:'75',sbp:'140',tc:String(5.5/.02586),smoking:'yes',sex:String(sex),region:String(region)})?.numericValue).toBeCloseTo(Number(expected),9)
 })
 it('requires region, CVD status and the correct age model; SCORE2 excludes diabetes',()=>{
  const v={...centered,region:'low'}
  expect(calc('score2').compute({...v,region:''})).toBeNull()
  expect(calc('score2').compute({...v,diabetes:'yes'})).toBeNull()
  expect(calc('score2').compute({...v,age:'70'})).toBeNull()
  expect(calc('score2-op').compute({...v,age:'69'})).toBeNull()
  expect(calc('score2-op').compute({...v,age:'70',diabetes:'yes'})).not.toBeNull()
  expect(calc('score2-op').compute({...v,age:'90'})).toBeNull()
 })
 it('preserves raw precision and never assigns a guideline treatment category in the calculator',()=>{
  const result=calc('prevent-cvd').compute(centered)!
  expect(result.value).toBe('3.5');expect(result.numericValue).not.toBe(3.5);expect(result.severity).toBeUndefined()
 })
})
describe('calculator result handoff',()=>{
 const context={sbp:{value:'130',date:'2026-09-12',source:'Clinic BP'}}
 const seed=()=>resolveRiskContext(calc('prevent-cvd'),autofill,context)
 beforeEach(()=>useCvdRiskResultsStore.setState({byPatient:{}}))
 it('preserves inputs, provenance and unrounded numeric value through CDSS',()=>{
  const result=createCvdRiskResult('prevent-cvd',centered,seed(),now)!
  const profile:CdssPatientProfile={id:'patient-a',evaluatedAt:now.toISOString(),facts:{}}
  const updated=applyHypertensionRiskResults(profile,{'prevent-cvd':result},autofill,context,now)
  expect(updated.facts.preventCvdRisk10y).toMatchObject({numericValue:result.numericValue,unit:'%',calculator:{id:'prevent-cvd',status:'complete',horizonYears:10,endpoint:'total-cvd',version:result.version}})
  expect(updated.facts.preventCvdRisk10y.calculator?.inputs).toHaveLength(12)
  expect(profile.facts).toEqual({})
 })
 it('invalidates a result after BP/source date changes, expiry or future timestamps',()=>{
  const result=createCvdRiskResult('prevent-cvd',centered,seed(),now)!
  expect(isCurrentCvdRiskResult(result,seed().contextKey,now)).toBe(true)
  expect(isCurrentCvdRiskResult(result,seed().contextKey,new Date(now.getTime()+86400000))).toBe(false)
  expect(isCurrentCvdRiskResult(result,seed().contextKey,new Date(now.getTime()-1))).toBe(false)
  const changed=resolveRiskContext(calc('prevent-cvd'),autofill,{sbp:{...context.sbp,value:'150'}})
  expect(isCurrentCvdRiskResult(result,changed.contextKey,now)).toBe(false)
 })
 it('stores separately by patient and clears only the selected model',()=>{
  const record=createCvdRiskResult('prevent-cvd',centered,seed(),now)!
  const s=useCvdRiskResultsStore.getState();s.apply('a',record)
  expect(useCvdRiskResultsStore.getState().byPatient.b).toBeUndefined()
  s.clear('a','score2');expect(useCvdRiskResultsStore.getState().byPatient.a['prevent-cvd']).toBeDefined()
  s.clear('a','prevent-cvd');expect(useCvdRiskResultsStore.getState().byPatient.a).toEqual({})
 })
 it('does not turn a mismatched laboratory unit into a calculator input',()=>{
  const af={resolve:()=>({value:200,unit:'mmol/s',date:'2026-09-12'})}
  expect(resolveRiskContext(calc('prevent-cvd'),af).values.tc).toBe('')
 })
})
it('autofills TC, HDL and eGFR using the medical calculator canonical lab keys',()=>{
 const af={resolve:(source:import('@/features/medical-calculator/types').AutofillSource|undefined)=>{
  if(source?.kind!=='lab')return undefined
  const labs:Record<string,number>={CHOL:200,HDL:50,'EGFR(EPI)':75}
  const k=source.keys.find(key=>labs[key]!==undefined)
  return k?{value:labs[k],unit:k==='EGFR(EPI)'?'mL/min/1.73m²':'mg/dL',date:'2026-09-12'}:undefined
 }}
 expect(resolveRiskContext(calc('prevent-cvd'),af).values).toMatchObject({tc:'200',hdl:'50',egfr:'75',smoking:'',diabetes:'',bpTreatment:'',statin:''})
})
