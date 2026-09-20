import { calculatePrevent } from '@/features/medical-calculator/calculators/prevent'
import { buildPreventReading, applyPreventReading } from '@/features/clinical-decision-support/utils/prevent-reading'
import { usePreventStore } from '@/features/clinical-decision-support/stores/prevent-inputs.store'
import type { CalcValues } from '@/features/medical-calculator/types'
import { convertToBase } from '@/features/medical-calculator/units'
const base: CalcValues = { sex:'female',age:'50',tc:'240',hdl:'55',sbp:'160',bmi:'35',egfr:'90',dm:'no',smoking:'no',statin:'no',bptreat:'yes',cvd:'no',subclinical:'no',genetic:'no',eskd:'no',limitedLife:'no' }
describe('PREVENT ASCVD official synthetic comparisons, 2026-09-16', () => {
  test.each([['female',0.1,0.6],['male',0.2,1.1]])('low SBP / high eGFR %s', (sex,ten,thirty) => {
    const r=calculatePrevent({...base,sex:String(sex),age:'35',tc:'150',hdl:'90',sbp:'100',egfr:'120',bptreat:'no'})
    expect(Number(r.risk10!.toFixed(1))).toBe(ten); expect(Number(r.risk30!.toFixed(1))).toBe(thirty)
  })
  test.each([
    ['female',false,3.6,19.9], ['male',false,4.9,23.6],
    ['female',true,25.0,52.3], ['male',true,23.7,48.6],
  ])('%s multiple risk factors %s', (sex, multiple, ten, thirty) => {
    const r = calculatePrevent({...base,sex,...(multiple?{dm:'yes',smoking:'yes',statin:'yes',egfr:'45'}:{})})
    expect(r.status).toBe('ready')
    expect(Number(r.risk10!.toFixed(1))).toBe(ten)
    expect(Number(r.risk30!.toFixed(1))).toBe(thirty)
  })
  test.each(['dm','smoking','statin','bptreat','cvd','subclinical','genetic','eskd','limitedLife','sex','tc'])('unknown %s never means no',key => {
    expect(calculatePrevent({...base,[key]:''}).status).toBe('needs-data')
  })
  test.each(['cvd','subclinical','genetic','eskd','limitedLife'])('exclusion %s',key => {
    expect(calculatePrevent({...base,[key]:'yes'}).status).toBe('ineligible')
  })
  test.each([29,80,94])('age %s not clamped',age => expect(calculatePrevent({...base,age:String(age)}).status).toBe('ineligible'))
  test.each([30,59,60,79])('age %s horizon', age => {
    const r = calculatePrevent({...base,age:String(age)})
    expect(r.status).toBe('ready'); expect(r.risk30 !== undefined).toBe(age <= 59)
  })
  test.each([['tc','129'],['hdl','101'],['sbp','201'],['bmi','40'],['egfr','14'],['tc','NaN']])('invalid %s %s', (key,value) => expect(calculatePrevent({...base,[key]:value}).status).toBe('needs-data'))
})
test('bridge clears old scores; record exclusion cannot be bypassed', () => {
  const p = {id:'test',facts:{ascvdDiagnosis:{zh:'ASCVD',en:'ASCVD'}}}
  const r = buildPreventReading(p,{resolve:()=>undefined},base)
  expect(r.result.status).toBe('ineligible')
  const computed = applyPreventReading({id:'test',facts:{}},buildPreventReading({id:'test',facts:{}},{resolve:()=>undefined},base))
  expect(computed.facts.preventAscvd10YearRisk.numericValue).toBeGreaterThan(0)
  expect(applyPreventReading(computed,r).facts.preventAscvd10YearRisk).toBeUndefined()
})
test('patient switch clears inputs and rejects a stale callback', () => {
  const s = usePreventStore.getState(); s.activate('one'); s.setInput('one','smoking','yes')
  s.activate('two'); s.setInput('one','smoking','no')
  expect(usePreventStore.getState().inputs).toEqual({})
  s.setInput('two','smoking',''); expect(usePreventStore.getState().inputs.smoking).toBe('')
  s.clear('two'); expect(usePreventStore.getState().inputs).toEqual({})
})
test('real autofill contract uses age y and canonical CHOL, never substitutes a default', () => {
  const r=buildPreventReading({id:'test',facts:{}},{resolve:source => source?.kind === 'age' ? {value:94,unit:'y',date:''} : source?.kind === 'lab' && source.keys.includes('CHOL') ? {value:240,unit:'mg/dL',date:'2026-09-01'} : undefined},{})
  expect(r.values.age).toBe('94'); expect(r.values.tc).toBe('240')
  expect(r.result.status).toBe('ineligible'); expect(r.result.issues).toContain('age')
})
test('indexed eGFR spelling variants are equivalent; absolute clearance is not', () => {
  for (const unit of ['mL/min/1.73m²','mL/min/1.73m2','mL/min/{1.73_m2}']) expect(convertToBase(60,unit,'egfr')?.value).toBe(60)
  expect(convertToBase(60,'mL/min','egfr')).toBeNull()
})
