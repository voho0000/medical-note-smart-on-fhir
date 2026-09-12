import type { CalculatorDef, CalcResult, CalcValues, SelectInput } from '../types'
import coefficients from './prevent-coefficients.json'

export const PREVENT_VERSION = 'base-ascvd-v1'
export interface PreventResult extends CalcResult {
  risk: { ascvd10: number; ascvd30?: number; model: 'base'; version: typeof PREVENT_VERSION }
}
const yesNo = (key: string, zh: string, en: string): SelectInput => ({ key, type: 'select', label: { zh, en }, defaultValue: '', options: [
  { value: 'no', label: { zh: '否', en: 'No' } }, { value: 'yes', label: { zh: '是', en: 'Yes' } },
] })
export const PREVENT_RANGES: Record<string, readonly [number, number]> = {
  age: [30, 79], tc: [130, 320], hdl: [20, 100], sbp: [90, 200], bmi: [18.5, 39.9], egfr: [15, 140],
}
/** No default negatives or clamping. Outside the model population is not low risk. */
export function preventInvalidInputs(v: CalcValues): string[] {
  const bad = Object.entries(PREVENT_RANGES).filter(([key, [low, high]]) => !v[key]?.trim() || !Number.isFinite(Number(v[key])) || Number(v[key]) < low || Number(v[key]) > high).map(([key]) => key)
  if (!['male', 'female'].includes(v.sex)) bad.push('sex')
  for (const key of ['dm', 'smoking', 'bpTx', 'statin', 'cvd']) if (!['yes', 'no'].includes(v[key])) bad.push(key)
  return bad
}
/** Khan et al., Circulation 2024, Supplement Table S12. Coefficient provenance in docs/PREVENT.md. */
export function calculatePrevent(v: CalcValues): PreventResult | null {
  if (preventInvalidInputs(v).length || v.cvd !== 'no') return null
  const age = (Number(v.age) - 55) / 10
  const nonHdl = (Number(v.tc) - Number(v.hdl)) / 38.67 - 3.5
  const hdl = (Number(v.hdl) / 38.67 - 1.3) / 0.3
  const lowSbp = (Math.min(Number(v.sbp), 110) - 110) / 20
  const highSbp = (Math.max(Number(v.sbp), 110) - 130) / 20
  const lowBmi = (Math.min(Number(v.bmi), 30) - 25) / 5
  const highBmi = (Math.max(Number(v.bmi), 30) - 30) / 5
  const lowEgfr = (Math.min(Number(v.egfr), 60) - 60) / -15
  const highEgfr = (Math.max(Number(v.egfr), 60) - 90) / -15
  const dm = Number(v.dm === 'yes'), smoking = Number(v.smoking === 'yes')
  const bpTx = Number(v.bpTx === 'yes'), statin = Number(v.statin === 'yes')
  const terms = [age, nonHdl, hdl, lowSbp, highSbp, dm, smoking, lowBmi, highBmi, lowEgfr, highEgfr, bpTx, statin, bpTx * highSbp, statin * nonHdl, age * nonHdl, age * hdl, age * highSbp, age * dm, age * smoking, age * highBmi, age * lowEgfr, 1]
  const sex = v.sex as 'female' | 'male'
  const probability = (values: number[], betas: number[]) => 100 / (1 + Math.exp(-values.reduce((sum, term, i) => sum + term * betas[i], 0)))
  const ascvd10 = probability(terms, coefficients.base_10yr[sex])
  const ascvd30 = Number(v.age) < 60 ? probability([age, age * age, ...terms.slice(1)], coefficients.base_30yr[sex]) : undefined
  return {
    value: ascvd10.toFixed(1), unit: '%',
    interpretation: { zh: '10 年 ASCVD 風險', en: '10-year ASCVD risk' },
    risk: { ascvd10, ...(ascvd30 !== undefined ? { ascvd30 } : {}), model: 'base', version: PREVENT_VERSION },
    extra: [{ label: { zh: '30 年 ASCVD 風險', en: '30-year ASCVD risk' }, value: ascvd30 === undefined ? '— (age 30–59 only)' : `${ascvd30.toFixed(1)}%` }],
    notes: { zh: '基礎模型；未加入 UACR、HbA1c 或社會剝奪指數。適用於無已知心血管疾病的成人；美國族群模型，未經台灣族群再校準。風險百分比不等於藥物效益。', en: 'Base model without UACR, HbA1c or social deprivation index. Adults without known CVD; US population model, not recalibrated for Taiwan. Risk is not treatment benefit.' },
  }
}
export const PREVENT_ASCVD: Omit<CalculatorDef, 'compute'> & { compute: typeof calculatePrevent } = {
  id: 'prevent-ascvd', category: 'cardiac', name: { zh: 'PREVENT ASCVD 風險', en: 'PREVENT ASCVD Risk' },
  blurb: { zh: '初級預防：10 年及 30 年 ASCVD 風險（基礎模型）。', en: 'Primary prevention: 10- and 30-year ASCVD risk (base model).' },
  inputs: [
    { key: 'age', type: 'number', label: { zh: '年齡', en: 'Age' }, unit: 'y', source: { kind: 'age' } },
    { key: 'sex', type: 'select', label: { zh: '模型使用的性別', en: 'Sex used by the model' }, defaultValue: '', source: { kind: 'sex' }, options: [{ value: 'female', label: { zh: '女性', en: 'Female' } }, { value: 'male', label: { zh: '男性', en: 'Male' } }] },
    { key: 'tc', type: 'number', label: { zh: '總膽固醇', en: 'Total cholesterol' }, unit: 'mg/dL', dimension: 'cholesterol', source: { kind: 'lab', keys: ['CHOL'] } },
    { key: 'hdl', type: 'number', label: { zh: 'HDL-C', en: 'HDL-C' }, unit: 'mg/dL', dimension: 'cholesterol', source: { kind: 'lab', keys: ['HDL'] } },
    { key: 'sbp', type: 'number', label: { zh: '收縮壓', en: 'Systolic BP' }, unit: 'mmHg', source: { kind: 'vital', loinc: ['8480-6'], vital: 'sbp' } },
    { key: 'bmi', type: 'number', label: { zh: 'BMI', en: 'BMI' }, unit: 'kg/m²', source: { kind: 'bmi' } },
    { key: 'egfr', type: 'number', label: { zh: 'eGFR', en: 'eGFR' }, unit: 'mL/min/1.73m²', source: { kind: 'lab', keys: ['EGFR', 'EGFR(EPI)', 'EGFR(M)'] } },
    yesNo('dm', '糖尿病', 'Diabetes'), yesNo('smoking', '目前吸菸', 'Current smoking'),
    yesNo('bpTx', '目前使用降血壓藥', 'Current antihypertensive treatment'), yesNo('statin', '目前使用 statin', 'Current statin treatment'),
    yesNo('cvd', '已有心血管疾病（含 ASCVD、心衰竭）', 'Known cardiovascular disease (including ASCVD or HF)'),
  ],
  compute: calculatePrevent,
  reference: 'Khan SS et al. Circulation. 2024;149:430–449. doi:10.1161/CIRCULATIONAHA.123.067626. Supplement Table S12; base ASCVD model.',
  coherence: { keys: ['tc', 'hdl', 'egfr', 'sbp', 'bmi'], windowDays: 90 },
}
