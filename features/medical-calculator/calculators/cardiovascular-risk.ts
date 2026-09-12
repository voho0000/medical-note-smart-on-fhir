/** Published risk equations live only in medical-calculator. CDSS consumes the
 * unrounded result and its provenance, never these coefficients or UI text.
 * Sources and model-version notes: docs/HTN-CDSS.md. */
import type { CalculatorDef, CalcInput, CalcResult, CalcValues, L } from '../types'
import { AGE_INPUT, SEX_INPUT } from './_shared'
const l = (en: string, zh = en): L => ({ en, zh })
export const CVD_RISK_VERSION = '2026-09-12.v1'
export const CVD_RISK_IDS = ['prevent-cvd', 'score2', 'score2-op'] as const
export type CvdRiskId = typeof CVD_RISK_IDS[number]
export function isCvdRiskId(id: string): id is CvdRiskId { return (CVD_RISK_IDS as readonly string[]).includes(id) }
const yesNo = (key: string, en: string, zh: string): CalcInput => ({ key, type: 'select', label: l(en, zh), defaultValue: '', options: [{ value: 'no', label: l('No', '否') }, { value: 'yes', label: l('Yes', '是') }] })
const baseInputs: CalcInput[] = [AGE_INPUT, { ...SEX_INPUT, defaultValue: '' },
  { key: 'sbp', type: 'number', label: l('Systolic BP', '收縮壓'), unit: 'mmHg', source: { kind: 'vital', loinc: ['8480-6'], vital: 'sbp' } },
  { key: 'tc', type: 'number', label: l('Total cholesterol', '總膽固醇'), unit: 'mg/dL', dimension: 'cholesterol', source: { kind: 'lab', keys: ['CHOL'] } },
  { key: 'hdl', type: 'number', label: l('HDL cholesterol', 'HDL 膽固醇'), unit: 'mg/dL', dimension: 'cholesterol', source: { kind: 'lab', keys: ['HDL'] } },
  yesNo('smoking', 'Current smoking', '目前吸菸'), yesNo('diabetes', 'Diabetes', '糖尿病'),
  yesNo('cvd', 'Established cardiovascular disease (including heart failure)', '已知心血管疾病（含心衰竭）'),
]
const regionInput: CalcInput = { key: 'region', type: 'select', label: l('European risk region (select explicitly)', '歐洲風險地區（請明確選擇）'), defaultValue: '', options: [
  { value: 'low', label: l('Low', '低風險地區') }, { value: 'moderate', label: l('Moderate', '中風險地區') }, { value: 'high', label: l('High', '高風險地區') }, { value: 'very-high', label: l('Very high', '極高風險地區') },
] }
const number = (v: CalcValues, key: string) => v[key]?.trim() ? Number(v[key]) : NaN
const inRange = (x: number, low: number, high: number) => Number.isFinite(x) && x >= low && x <= high
const known = (v: CalcValues, keys: string[]) => keys.every(k => ['yes', 'no'].includes(v[k]))
const flag = (v: CalcValues, key: string) => v[key] === 'yes' ? 1 : 0
const result = (risk: number, notes: L): CalcResult => ({ numericValue: risk, value: risk.toFixed(1), unit: '%', interpretation: l('10-year cardiovascular risk', '10 年心血管風險'), notes })
const preventNotes = l('PREVENT-CVD base model (ASCVD + heart failure), US population, age 30–79 without CVD. No UACR, HbA1c or SDI add-on. Confirm applicability outside the US; this is not PREVENT-ASCVD.', 'PREVENT-CVD 基礎模型（ASCVD＋心衰竭），適用 30–79 歲且無已知 CVD 的美國族群；未加 UACR、HbA1c 或 SDI。美國以外需確認適用性；此結果不是 PREVENT-ASCVD。')
const scoreNotes = l('European regional calibration; no region is inferred for Taiwan. Confirm eligibility and applicability. SCORE2 excludes diabetes; neither score replaces clinical assessment of established CVD or severe comorbidity.', '依歐洲地區校準，不替台灣預設地區。請確認適用性；SCORE2 不適用糖尿病。已知 CVD 或嚴重共病需獨立臨床評估。')
// Khan et al. Circulation 2024, base total-CVD 10-year coefficients;
// independently transcribed from the published equation reproduced by CDC KDSS Q811.
const PREVENT = {
 female: [-3.307728, .7939329, .0305239, -.1606857, -.2394003, .360078, .8667604, .5360739, .6045917, .0433769, .3151672, -.1477655, -.0663612, .1197879, -.0819715, .0306769, -.0946348, -.27057, -.078715, -.1637806],
 male: [-3.031168, .7688528, .0736174, -.0954431, -.4347345, .3362658, .7692857, .4386871, .5378979, .0164827, .288879, -.1337349, -.0475924, .150273, -.0517874, .0191169, -.1049477, -.2251948, -.0895067, -.1543702],
}
// SCORE2 authors' four-decimal correction: Eur Heart J 43(3):241, Table 1.
const SCORE2 = {
 male: { b: [.3742,.6012,.2777,.1458,-.2698,-.0755,-.0255,-.0281,.0426], survival: .9605, scales: [[-.5699,.7476],[-.1565,.8009],[.3207,.936],[.5836,.8294]] },
 female: { b: [.4648,.7744,.3131,.1002,-.2606,-.1088,-.0277,-.0226,.0613], survival: .9776, scales: [[-.738,.7019],[-.3143,.7701],[.571,.9369],[.9412,.8329]] },
}
// SCORE2-OP original supplement Methods Tables 1–3 (20210604_v2).
// Use Table 1 regional scales, not the conflicting worked-example scales.
const OP = {
 male: { b: [.0634,.4245,.3524,.0094,.085,-.3564,-.0174,-.0247,-.0005,.0073,.0091], survival: .7576, mean: .0929, scales: [[-.34,1.19],[.01,1.25],[.08,1.15],[.05,.7]] },
 female: { b: [.0789,.601,.4921,.0102,.0605,-.304,-.0107,-.0255,-.0004,-.0009,.0154], survival: .8082, mean: .229, scales: [[-.52,1.01],[-.1,1.1],[.38,1.09],[.38,.69]] },
}
const dot = (b: number[], x: number[]) => b.reduce((s, v, i) => s + v * x[i], 0)
const regions = ['low','moderate','high','very-high']
export const CARDIOVASCULAR_RISK: CalculatorDef[] = [{
 id: 'prevent-cvd', name: l('PREVENT-CVD (10-year)', 'PREVENT-CVD（10 年）'), category: 'cardiac',
 blurb: l('Base model: age 30–79, SBP 90–200, TC 130–320, HDL 20–100, eGFR 15–140, BMI 18.5–39.9. Fill all inputs; no silent clipping.', '基礎模型：30–79 歲、SBP 90–200、TC 130–320、HDL 20–100、eGFR 15–140、BMI 18.5–39.9。請填齊資料；不會自動截斷超範圍值。'),
 inputs: [...baseInputs,
  { key: 'egfr', type: 'number', label: l('eGFR'), unit: 'mL/min/1.73m²', source: { kind: 'lab', keys: ['EGFR', 'EGFR(EPI)', 'EGFR(M)'] } },
  { key: 'bmi', type: 'number', label: l('BMI'), unit: 'kg/m²', source: { kind: 'bmi' } },
  yesNo('bpTreatment', 'Taking BP-lowering medication', '目前服用降壓藥'), yesNo('statin', 'Taking a statin', '目前服用 statin'),
 ],
 coherence: { keys: ['sbp','tc','hdl','egfr','bmi'], windowDays: 90 },
 compute(v) {
  const age=number(v,'age'),sbp=number(v,'sbp'),tc=number(v,'tc'),hdl=number(v,'hdl'),gfr=number(v,'egfr'),bmi=number(v,'bmi')
  if (!['male','female'].includes(v.sex) || v.cvd !== 'no' || !known(v,['smoking','diabetes','bpTreatment','statin']) || !inRange(age,30,79) || !inRange(sbp,90,200) || !inRange(tc,130,320) || !inRange(hdl,20,100) || tc <= hdl || !inRange(gfr,15,140) || !inRange(bmi,18.5,39.9)) return null
  const a=(age-55)/10,c=(tc-hdl)*.02586-3.5,h=(hdl*.02586-1.3)/.3,s1=(Math.min(sbp,110)-110)/20,s2=(Math.max(sbp,110)-130)/20,g1=(Math.min(gfr,60)-60)/-15,g2=(Math.max(gfr,60)-90)/-15,d=flag(v,'diabetes'),s=flag(v,'smoking'),bp=flag(v,'bpTreatment'),st=flag(v,'statin')
  const lp=dot(PREVENT[v.sex as keyof typeof PREVENT],[1,a,c,h,s1,s2,d,s,g1,g2,bp,st,bp*s2,st*c,a*c,a*h,a*s2,a*d,a*s,a*g1])
  return result(100/(1+Math.exp(-lp)),preventNotes)
 },
 reference: 'Khan SS et al. Circulation 2024;149:430–449. doi:10.1161/CIRCULATIONAHA.123.067626. CDC published equation: https://wwwn.cdc.gov/KDSS/detail.aspx?Qnum=Q811&topic=1',
}, ...(['score2','score2-op'] as const).map((id): CalculatorDef => ({
 id, name: l(id==='score2'?'SCORE2 (10-year)':'SCORE2-OP (10-year)',id==='score2'?'SCORE2（10 年）':'SCORE2-OP（10 年）'), category: 'cardiac',
 blurb: l(id==='score2'?'Age 40–69, no diabetes or CVD. SBP 100–200; TC 3–8 and HDL 0.7–2.5 mmol/L (enter mg/dL).':'Age 70–89, no CVD. SBP 100–200; TC 3–8 and HDL 0.7–2.5 mmol/L (enter mg/dL).', id==='score2'?'40–69 歲、無糖尿病與 CVD。SBP 100–200；TC 3–8、HDL 0.7–2.5 mmol/L（請輸入 mg/dL）。':'70–89 歲、無 CVD。SBP 100–200；TC 3–8、HDL 0.7–2.5 mmol/L（請輸入 mg/dL）。'),
 inputs: [...baseInputs, regionInput], coherence: { keys: ['sbp','tc','hdl'], windowDays: 90 },
 compute(v) {
  const age=number(v,'age'),sbp=number(v,'sbp'),tc=number(v,'tc')*.02586,hdl=number(v,'hdl')*.02586,region=regions.indexOf(v.region),op=id==='score2-op'
  if (!['male','female'].includes(v.sex) || v.cvd!=='no' || !known(v,['smoking','diabetes']) || (!op && v.diabetes!=='no') || !inRange(age,op?70:40,op?89:69) || !inRange(sbp,100,200) || !inRange(tc,3,8) || !inRange(hdl,.7,2.5) || tc<=hdl || region<0) return null
  const sex=v.sex as 'male'|'female',s=flag(v,'smoking'),d=flag(v,'diabetes')
  let lp: number, survival: number, scales: number[]
  if (op) {
   const m=OP[sex],a=age-73,b=sbp-150,c=tc-6,h=hdl-1.4
   lp=dot(m.b,[a,d,s,b,c,h,a*d,a*s,a*b,a*c,a*h])-m.mean; survival=m.survival; scales=m.scales[region]
  } else {
   const m=SCORE2[sex],a=(age-60)/5,b=(sbp-120)/20,c=tc-6,h=(hdl-1.3)/.5
   lp=dot(m.b,[a,s,b,c,h,a*s,a*b,a*c,a*h]); survival=m.survival; scales=m.scales[region]
  }
  // ln(-ln(1-p)) = ln(-ln(S0)) + LP; avoids loss of precision.
  const risk=-Math.expm1(-Math.exp(scales[0]+scales[1]*(Math.log(-Math.log(survival))+lp)))*100
  return { ...result(risk,scoreNotes), extra: [{ label:l('Calibration region','校準地區'),value:v.region }] }
 },
 reference: id==='score2'?'SCORE2 working group. Eur Heart J 2021;42:2439–2454. doi:10.1093/eurheartj/ehab309; four-decimal coefficients: https://academic.oup.com/eurheartj/article/43/3/241/6433491':'SCORE2-OP working group. Eur Heart J 2021;42:2455–2467. doi:10.1093/eurheartj/ehab312. Supplementary Methods Tables 1–3 (20210604_v2).',
}))]
