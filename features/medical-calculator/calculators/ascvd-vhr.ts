import type { CalculatorDef, CalcResult, CalcValues, SelectInput } from '../types'

export const ASCVD_VHR_VERSION = 'ascvd-vhr-2023:v1'
export const ASCVD_VHR_CRITERIA = [
  ['vhr:major:recent-acs', '主要事件：近 12 個月 ACS', 'Major event: ACS within 12 months'],
  ['vhr:major:prior-mi', '主要事件：其他獨立心肌梗塞（不含上述 ACS）', 'Major event: separate MI(s), excluding the ACS above'],
  ['vhr:major:ischemic-stroke', '主要事件：缺血性中風病史', 'Major event: ischemic stroke'],
  ['vhr:major:symptomatic-pad', '主要事件：有症狀 PAD（跛行且 ABI <0.85，或血運重建／截肢）', 'Major event: symptomatic PAD (claudication with ABI <0.85, or revascularization/amputation)'],
  ['vhr:high:age', '高風險條件：年齡 ≥65 歲', 'High-risk condition: age ≥65'],
  ['vhr:high:familial-hypercholesterolemia', '高風險條件：家族性高膽固醇血症', 'High-risk condition: familial hypercholesterolemia'],
  ['vhr:high:prior-revascularization', '高風險條件：主要事件以外的 CABG／PCI', 'High-risk condition: CABG/PCI outside major event(s)'],
  ['vhr:high:diabetes', '高風險條件：糖尿病', 'High-risk condition: diabetes'],
  ['vhr:high:hypertension', '高風險條件：高血壓', 'High-risk condition: hypertension'],
  ['vhr:high:ckd', '高風險條件：CKD（eGFR 15–59）', 'High-risk condition: CKD (eGFR 15–59)'],
  ['vhr:high:smoking', '高風險條件：目前吸菸', 'High-risk condition: current smoking'],
  ['vhr:high:persistent-ldl', '高風險條件：最大耐受 statin 加 ezetimibe 下 LDL-C 持續 ≥100 mg/dL', 'High-risk condition: LDL-C persistently ≥100 mg/dL on maximally tolerated statin and ezetimibe'],
  ['vhr:high:heart-failure', '高風險條件：心衰竭病史', 'High-risk condition: congestive heart failure'],
] as const

export interface AscvdRiskResult extends CalcResult {
  assessment: 'very-high' | 'not-very-high' | 'indeterminate'
  majorEvents: number
  highRiskConditions: number
  missing: string[]
}

const inputs: SelectInput[] = ASCVD_VHR_CRITERIA.map(([key, zh, en]) => ({
  key, type: 'select', label: { zh, en }, defaultValue: 'unknown',
  options: [
    { value: 'unknown', label: { zh: '未知／尚未確認', en: 'Unknown / unconfirmed' } },
    { value: 'no', label: { zh: '已確認不符合', en: 'Confirmed absent' } },
    { value: 'yes', label: { zh: key === 'vhr:major:prior-mi' ? '1 次獨立心肌梗塞' : '已確認符合', en: key === 'vhr:major:prior-mi' ? '1 separate MI' : 'Confirmed present' } },
    ...(key === 'vhr:major:prior-mi' ? [{ value: '2', label: { zh: '≥2 次獨立心肌梗塞', en: '≥2 separate MIs' } }] : []),
  ],
}))

/** The sole Table 10 counting and classification implementation. Unknown is
 * never zero. Already sufficient confirmed evidence can establish very-high
 * risk; otherwise a negative classification requires excluding every possible
 * combination of still-unknown criteria. This is not a 10-year risk percent. */
export const ASCVD_VHR_CALCULATOR = {
  id: 'ascvd-vhr-2023', name: { zh: 'ASCVD 極高風險分類', en: 'ASCVD very-high-risk classification' },
  category: 'cardiac', audience: 'medical',
  blurb: { zh: 'AHA/ACC 2023 CCD · Table 10 · 次級預防', en: 'AHA/ACC 2023 CCD · Table 10 · Secondary prevention' },
  inputs,
  compute(values: CalcValues): AscvdRiskResult {
    let majorEvents = 0, highRiskConditions = 0, possibleMajor = 0, possibleHigh = 0
    const missing: string[] = []
    for (const input of inputs) {
      const raw = values[input.key]
      const valid = input.options.some(option => option.value === raw)
      const unknown = !valid || raw === 'unknown'
      const points = raw === 'yes' ? 1 : raw === '2' && input.key === 'vhr:major:prior-mi' ? 2 : 0
      if (input.key.startsWith('vhr:major:')) {
        majorEvents += points
        possibleMajor += unknown ? (input.key === 'vhr:major:prior-mi' ? 2 : 1) : points
      } else {
        highRiskConditions += points
        possibleHigh += unknown ? 1 : points
      }
      if (unknown) missing.push(input.key)
    }
    const meets = (major: number, high: number) => major >= 2 || (major >= 1 && high >= 2)
    const assessment = meets(majorEvents, highRiskConditions) ? 'very-high' : meets(possibleMajor, possibleHigh) ? 'indeterminate' : 'not-very-high'
    const interpretation = assessment === 'very-high' ? { zh: '極高風險', en: 'Very high risk' }
      : assessment === 'not-very-high' ? { zh: '未達極高風險條件', en: 'Very-high-risk criteria not met' }
      : { zh: '尚無法判定，需補資料', en: 'Indeterminate; additional information needed' }
    return {
      assessment, majorEvents, highRiskConditions, missing,
      value: assessment === 'very-high' ? 'VHR' : assessment === 'not-very-high' ? 'Non-VHR' : '—',
      interpretation, severity: assessment === 'very-high' ? 'high' : 'moderate',
      extra: [
        { label: { zh: '已確認主要事件（≥2 已足以分類）', en: 'Confirmed major events (≥2 suffices)' }, value: String(majorEvents) },
        { label: { zh: '已確認高風險條件', en: 'Confirmed high-risk conditions' }, value: String(highRiskConditions) },
        { label: { zh: '未確認項目', en: 'Unconfirmed criteria' }, value: String(missing.length) },
      ],
      notes: { zh: '≥2 次主要 ASCVD 事件，或 1 次主要事件加 ≥2 項高風險條件。每個獨立事件只計一次；未見診斷碼不代表沒有病史。此分類用於已確立 ASCVD 的次級預防，不是 10 年發病率。', en: '≥2 major ASCVD events, or 1 major event with ≥2 high-risk conditions. Count each distinct event once. Absent codes do not establish a negative history. This secondary-prevention classification is not a 10-year event probability.' },
    }
  },
  reference: 'Virani et al. 2023 AHA/ACC CCD Guideline, Table 10, JACC 82:867 (PDF p.35). https://doi.org/10.1016/j.jacc.2023.04.003',
} satisfies CalculatorDef
