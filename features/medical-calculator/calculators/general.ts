import type { CalculatorDef, L } from '../types'
import { n, round, SEX_INPUT, WEIGHT_LOINC, HEIGHT_LOINC } from './_shared'

export const GENERAL: CalculatorDef[] = [
  // ── LDL cholesterol (Friedewald) ────────────────────────────────────────
    {
      id: 'ldl-friedewald',
      name: { en: 'LDL Cholesterol (Friedewald)', zh: 'LDL 膽固醇 (Friedewald)' },
      category: 'general',
      blurb: { en: 'Calculated LDL from lipid panel.', zh: '由血脂計算 LDL。' },
      inputs: [
        { key: 'tc', type: 'number', label: { en: 'Total cholesterol', zh: '總膽固醇' }, unit: 'mg/dL', dimension: 'cholesterol', normalRange: { low: 125, high: 200 }, source: { kind: 'lab', keys: ['CHOL'] } },
        { key: 'hdl', type: 'number', label: { en: 'HDL', zh: 'HDL' }, unit: 'mg/dL', dimension: 'cholesterol', normalRange: { low: 40, high: 60 }, source: { kind: 'lab', keys: ['HDL'] } },
        { key: 'tg', type: 'number', label: { en: 'Triglycerides', zh: '三酸甘油酯' }, unit: 'mg/dL', dimension: 'triglyceride', normalRange: { low: 50, high: 150 }, source: { kind: 'lab', keys: ['TG'] } },
      ],
      compute: (v) => {
        const tc = n(v, 'tc'); const hdl = n(v, 'hdl'); const tg = n(v, 'tg')
        if (tc === undefined || hdl === undefined || tg === undefined) return null
        if (tg >= 400) {
          return { value: '—', interpretation: { en: 'TG ≥ 400 — Friedewald invalid, use direct LDL', zh: 'TG ≥ 400 — Friedewald 不適用,請改用直接 LDL' }, severity: 'moderate' }
        }
        const ldl = tc - hdl - tg / 5
        const val = round(ldl)
        let interp: L; let severity: 'normal' | 'moderate' | 'high'
        if (val < 100) { interp = { en: '< 100 — optimal', zh: '< 100 — 理想' }; severity = 'normal' }
        else if (val < 130) { interp = { en: '100–129 — near optimal', zh: '100–129 — 接近理想' }; severity = 'normal' }
        else if (val < 160) { interp = { en: '130–159 — borderline high', zh: '130–159 — 邊緣偏高' }; severity = 'moderate' }
        else if (val < 190) { interp = { en: '160–189 — high', zh: '160–189 — 偏高' }; severity = 'high' }
        else { interp = { en: '≥ 190 — very high', zh: '≥ 190 — 非常高' }; severity = 'high' }
        return { value: String(val), unit: 'mg/dL', interpretation: interp, severity }
      },
      reference: 'Friedewald: LDL = TC − HDL − TG/5 (mg/dL). Invalid when TG ≥ 400.',
    },

  // ── Estimated average glucose (eAG) from HbA1c ──────────────────────────
    {
      id: 'eag-from-a1c',
      name: { en: 'Estimated Average Glucose (from HbA1c)', zh: '平均血糖 eAG（從 HbA1c）' },
      category: 'general',
      audience: 'both',
      blurb: { en: 'Mean glucose corresponding to HbA1c.', zh: '對應 HbA1c 的平均血糖。' },
      inputs: [
        { key: 'a1c', type: 'number', label: { en: 'HbA1c', zh: '糖化血色素 HbA1c' }, unit: '%', normalRange: { low: 4, high: 5.6 }, source: { kind: 'lab', keys: ['HBA1C'] } },
      ],
      compute: (v) => {
        const a1c = n(v, 'a1c')
        if (a1c === undefined || a1c <= 0) return null
        const eag = 28.7 * a1c - 46.7
        const val = round(eag)
        return {
          value: String(val), unit: 'mg/dL',
          interpretation: a1c >= 6.5
            ? { en: 'HbA1c ≥ 6.5% — diabetes range', zh: 'HbA1c ≥ 6.5% — 糖尿病範圍' }
            : a1c >= 5.7
              ? { en: 'HbA1c 5.7–6.4% — prediabetes range', zh: 'HbA1c 5.7–6.4% — 糖尿病前期' }
              : { en: 'HbA1c < 5.7% — normal range', zh: 'HbA1c < 5.7% — 正常範圍' },
          severity: a1c >= 6.5 ? 'high' : a1c >= 5.7 ? 'moderate' : 'normal',
          extra: [{ label: { en: 'eAG', zh: 'eAG' }, value: `${round(eag / 18, 1)} mmol/L` }],
        }
      },
      reference: 'ADAG study (Nathan 2008): eAG (mg/dL) = 28.7 × HbA1c − 46.7.',
    },

  // ── Ideal & adjusted body weight (Devine) ───────────────────────────────
    {
      id: 'ideal-body-weight',
      name: { en: 'Ideal & Adjusted Body Weight', zh: '理想／校正體重' },
      category: 'general',
      blurb: { en: 'Devine IBW + adjusted BW for dosing.', zh: 'Devine 理想體重 + 校正體重（劑量用）。' },
      inputs: [
        { key: 'height', type: 'number', label: { en: 'Height', zh: '身高' }, unit: 'cm', dimension: 'height', source: { kind: 'vital', loinc: HEIGHT_LOINC, vital: 'height' } },
        SEX_INPUT,
        { key: 'weight', type: 'number', label: { en: 'Actual weight (for adjusted)', zh: '實際體重（校正用）' }, unit: 'kg', dimension: 'weight', source: { kind: 'vital', loinc: WEIGHT_LOINC, vital: 'weight' } },
      ],
      compute: (v) => {
        const ht = n(v, 'height'); const female = v.sex === 'female'; const wt = n(v, 'weight')
        if (ht === undefined || ht <= 0) return null
        if (v.sex !== 'male' && v.sex !== 'female') return null // require confirmed sex
        const inches = ht / 2.54
        const base = female ? 45.5 : 50
        const ibw = base + 2.3 * (inches - 60)
        if (ibw <= 0) return null
        const val = round(ibw, 1)
        const extra: { label: L; value: string }[] = []
        if (wt !== undefined && wt > 0) {
          const adj = ibw + 0.4 * (wt - ibw)
          extra.push({ label: { en: 'Adjusted body weight', zh: '校正體重' }, value: `${round(adj, 1)} kg` })
        }
        return { value: String(val), unit: 'kg', interpretation: { en: 'Ideal body weight (Devine)', zh: '理想體重 (Devine)' }, severity: 'normal', extra }
      },
      reference: 'Devine 1974. IBW = 50 (M) / 45.5 (F) + 2.3 × (height in inches − 60). AdjBW = IBW + 0.4 × (actual − IBW).',
    },

  // ── BMI ─────────────────────────────────────────────────────────────────
    {
      id: 'bmi',
      name: { en: 'Body Mass Index (BMI)', zh: '身體質量指數 (BMI)' },
      category: 'general',
      audience: 'both',
      blurb: { en: 'Weight-for-height; Taiwan MOHW cutoffs.', zh: '體重身高比；採衛福部標準。' },
      inputs: [
        { key: 'weight', type: 'number', label: { en: 'Weight', zh: '體重' }, unit: 'kg', dimension: 'weight', source: { kind: 'vital', loinc: WEIGHT_LOINC, vital: 'weight' } },
        { key: 'height', type: 'number', label: { en: 'Height', zh: '身高' }, unit: 'cm', dimension: 'height', source: { kind: 'vital', loinc: HEIGHT_LOINC, vital: 'height' } },
      ],
      compute: (v) => {
        const wt = n(v, 'weight'); const ht = n(v, 'height')
        if (wt === undefined || ht === undefined || ht <= 0) return null
        const m = ht / 100
        const bmi = wt / (m * m)
        const val = round(bmi, 1)
        // Taiwan MOHW cutoffs.
        let interp: L; let severity: 'normal' | 'low' | 'moderate' | 'high'
        if (val < 18.5) { interp = { en: 'Underweight', zh: '體重過輕' }; severity = 'low' }
        else if (val < 24) { interp = { en: 'Normal', zh: '正常範圍' }; severity = 'normal' }
        else if (val < 27) { interp = { en: 'Overweight', zh: '過重' }; severity = 'moderate' }
        else if (val < 30) { interp = { en: 'Obesity class I', zh: '輕度肥胖' }; severity = 'high' }
        else if (val < 35) { interp = { en: 'Obesity class II', zh: '中度肥胖' }; severity = 'high' }
        else { interp = { en: 'Obesity class III', zh: '重度肥胖' }; severity = 'high' }
        return { value: String(val), unit: 'kg/m²', interpretation: interp, severity }
      },
      reference: 'Taiwan MOHW: normal 18.5–24, overweight 24–27, obese ≥27 kg/m².',
    },
]
