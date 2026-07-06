import type { CalculatorDef, L } from '../types'
import { n, round, SEX_INPUT, WEIGHT_LOINC } from './_shared'

export const ELECTROLYTE: CalculatorDef[] = [
  // ── Corrected calcium (for albumin) ─────────────────────────────────────
    {
      id: 'corrected-calcium',
      name: { en: 'Calcium Correction for Albumin', zh: '白蛋白校正鈣' },
      category: 'electrolyte',
      blurb: { en: 'Corrects total calcium for low albumin.', zh: '依白蛋白校正血鈣。' },
      inputs: [
        { key: 'ca', type: 'number', label: { en: 'Calcium (total)', zh: '總鈣' }, unit: 'mg/dL', dimension: 'calcium', normalRange: { low: 8.5, high: 10.5 }, source: { kind: 'lab', keys: ['CA'] } },
        { key: 'alb', type: 'number', label: { en: 'Albumin', zh: '白蛋白' }, unit: 'g/dL', dimension: 'albumin', normalRange: { low: 3.5, high: 5.0 }, source: { kind: 'lab', keys: ['ALB'] } },
      ],
      compute: (v) => {
        const ca = n(v, 'ca'); const alb = n(v, 'alb')
        if (ca === undefined || alb === undefined) return null
        const corrected = ca + 0.8 * (4.0 - alb)
        const val = round(corrected, 1)
        let severity: 'normal' | 'moderate' | 'high' = 'normal'
        let interp: L
        if (val < 8.5) { severity = 'moderate'; interp = { en: 'Hypocalcemia', zh: '低血鈣' } }
        else if (val > 10.5) { severity = 'high'; interp = { en: 'Hypercalcemia', zh: '高血鈣' } }
        else interp = { en: 'Within normal range', zh: '正常範圍內' }
        return { value: String(val), unit: 'mg/dL', interpretation: interp, severity }
      },
      reference: 'Corrected Ca = measured Ca + 0.8 × (4.0 − albumin). Normal ~8.5–10.5 mg/dL.',
    },

  // ── Corrected sodium (for hyperglycemia) ────────────────────────────────
    {
      id: 'corrected-sodium',
      name: { en: 'Sodium Correction for Hyperglycemia', zh: '高血糖校正鈉' },
      category: 'electrolyte',
      blurb: { en: 'Corrects measured sodium for glucose.', zh: '依血糖校正血鈉。' },
      inputs: [
        { key: 'na', type: 'number', label: { en: 'Sodium (measured)', zh: '血鈉（實測）' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 136, high: 145 }, source: { kind: 'lab', keys: ['NA'] } },
        { key: 'glucose', type: 'number', label: { en: 'Glucose', zh: '血糖' }, unit: 'mg/dL', dimension: 'glucose', normalRange: { low: 70, high: 100 }, source: { kind: 'lab', keys: ['GLUCOSE', 'GLUCOSE-AC'] } },
      ],
      compute: (v) => {
        const na = n(v, 'na'); const glu = n(v, 'glucose')
        if (na === undefined || glu === undefined) return null
        const corrected = na + 2.4 * ((glu - 100) / 100)
        const val = round(corrected, 1)
        return {
          value: String(val), unit: 'mmol/L',
          interpretation: { en: 'Hillier factor (2.4 mmol/L per 100 mg/dL)', zh: 'Hillier 校正係數（每上升 100 mg/dL 加 2.4）' },
          severity: 'normal',
          extra: [{ label: { en: 'Measured Na', zh: '實測鈉' }, value: String(na) }],
        }
      },
      reference: 'Hillier TA, et al. Am J Med 1999. Corrected Na = Na + 2.4 × (glucose − 100)/100.',
    },

  // ── Anion gap (± albumin correction) ────────────────────────────────────
    {
      id: 'anion-gap',
      name: { en: 'Serum Anion Gap', zh: '血清陰離子間隙' },
      category: 'electrolyte',
      blurb: { en: 'Na − (Cl + HCO₃), with albumin correction.', zh: 'Na −（Cl + HCO₃），含白蛋白校正。' },
      inputs: [
        { key: 'na', type: 'number', label: { en: 'Sodium', zh: '鈉' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 136, high: 145 }, source: { kind: 'lab', keys: ['NA'] } },
        { key: 'cl', type: 'number', label: { en: 'Chloride', zh: '氯' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 98, high: 107 }, source: { kind: 'lab', keys: ['CL'] } },
        { key: 'hco3', type: 'number', label: { en: 'Bicarbonate (CO₂)', zh: '碳酸氫根 (CO₂)' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 22, high: 28 }, source: { kind: 'lab', keys: ['CO2'] } },
        { key: 'alb', type: 'number', label: { en: 'Albumin (optional)', zh: '白蛋白（選填）' }, unit: 'g/dL', dimension: 'albumin', normalRange: { low: 3.5, high: 5.0 }, source: { kind: 'lab', keys: ['ALB'] }, optional: true },
      ],
      compute: (v) => {
        const na = n(v, 'na'); const cl = n(v, 'cl'); const hco3 = n(v, 'hco3'); const alb = n(v, 'alb')
        if (na === undefined || cl === undefined || hco3 === undefined) return null
        const ag = na - (cl + hco3)
        const val = round(ag, 1)
        const extra: { label: L; value: string }[] = []
        if (alb !== undefined) {
          const corrected = ag + 2.5 * (4.0 - alb)
          extra.push({ label: { en: 'Albumin-corrected AG', zh: '白蛋白校正 AG' }, value: `${round(corrected, 1)} mmol/L` })
        }
        const high = (alb !== undefined ? ag + 2.5 * (4.0 - alb) : ag) > 12
        return {
          value: String(val), unit: 'mmol/L',
          interpretation: high
            ? { en: 'Elevated — consider high anion gap metabolic acidosis', zh: '偏高 — 考慮高陰離子間隙代謝性酸中毒' }
            : { en: 'Normal range (~8–12)', zh: '正常範圍（約 8–12）' },
          severity: high ? 'moderate' : 'normal',
          extra,
        }
      },
      reference: 'AG = Na − (Cl + HCO₃). Albumin-corrected AG = AG + 2.5 × (4.0 − albumin).',
    },

  // ── Calculated serum osmolality ─────────────────────────────────────────
    {
      id: 'serum-osmolality',
      name: { en: 'Serum Osmolality (calculated)', zh: '計算血清滲透壓' },
      category: 'electrolyte',
      blurb: { en: '2×Na + glucose/18 + BUN/2.8.', zh: '2×Na + 血糖/18 + BUN/2.8。' },
      inputs: [
        { key: 'na', type: 'number', label: { en: 'Sodium', zh: '鈉' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 136, high: 145 }, source: { kind: 'lab', keys: ['NA'] } },
        { key: 'glucose', type: 'number', label: { en: 'Glucose', zh: '血糖' }, unit: 'mg/dL', dimension: 'glucose', normalRange: { low: 70, high: 100 }, source: { kind: 'lab', keys: ['GLUCOSE', 'GLUCOSE-AC'] } },
        { key: 'bun', type: 'number', label: { en: 'BUN', zh: '尿素氮 (BUN)' }, unit: 'mg/dL', dimension: 'bun', normalRange: { low: 7, high: 20 }, source: { kind: 'lab', keys: ['BUN'] } },
      ],
      compute: (v) => {
        const na = n(v, 'na'); const glu = n(v, 'glucose'); const bun = n(v, 'bun')
        if (na === undefined || glu === undefined || bun === undefined) return null
        const osm = 2 * na + glu / 18 + bun / 2.8
        const val = round(osm, 1)
        let interp: L; let severity: 'normal' | 'moderate' | 'high'
        if (val < 275) { interp = { en: 'Low (< 275)', zh: '偏低（< 275）' }; severity = 'moderate' }
        else if (val <= 295) { interp = { en: 'Normal (275–295)', zh: '正常（275–295）' }; severity = 'normal' }
        else { interp = { en: 'High (> 295)', zh: '偏高（> 295）' }; severity = 'high' }
        return { value: String(val), unit: 'mOsm/kg', dimension: 'osmolality', interpretation: interp, severity }
      },
      reference: 'Calculated osmolality = 2×Na + glucose/18 + BUN/2.8. (Measured osmolality needed for osmolar gap.)',
    },

  // ── Free water deficit ──────────────────────────────────────────────────
    {
      id: 'free-water-deficit',
      name: { en: 'Free Water Deficit', zh: '自由水缺乏' },
      category: 'electrolyte',
      blurb: { en: 'Water deficit in hypernatremia.', zh: '高血鈉之缺水量估算。' },
      inputs: [
        { key: 'na', type: 'number', label: { en: 'Sodium', zh: '鈉' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 136, high: 145 }, source: { kind: 'lab', keys: ['NA'] } },
        { key: 'weight', type: 'number', label: { en: 'Weight', zh: '體重' }, unit: 'kg', dimension: 'weight', source: { kind: 'vital', loinc: WEIGHT_LOINC, vital: 'weight' } },
        SEX_INPUT,
      ],
      compute: (v) => {
        const na = n(v, 'na'); const wt = n(v, 'weight'); const female = v.sex === 'female'
        if (na === undefined || wt === undefined || wt <= 0) return null
        if (v.sex !== 'male' && v.sex !== 'female') return null // require confirmed sex
        const tbw = wt * (female ? 0.5 : 0.6)
        const deficit = tbw * (na / 140 - 1)
        const val = round(deficit, 1)
        return {
          value: String(val), unit: 'L',
          interpretation: na > 145
            ? { en: 'Hypernatremia — replace over 48h, avoid rapid correction', zh: '高血鈉 — 建議 48 小時內緩慢矯正,避免過快' }
            : { en: 'Na within/below normal — deficit not applicable', zh: '血鈉正常或偏低 — 缺水量不適用' },
          severity: na > 145 ? 'high' : 'normal',
          extra: [{ label: { en: 'Total body water', zh: '全身體液量' }, value: `${round(tbw, 1)} L` }],
        }
      },
      reference: 'Free water deficit = TBW × (Na/140 − 1); TBW = weight × 0.6 (M) / 0.5 (F).',
    },

  // ── Winter's formula ────────────────────────────────────────────────────
    {
      id: 'winters',
      name: { en: "Winter's Formula", zh: 'Winter 公式（預期 PaCO₂）' },
      category: 'electrolyte',
      audience: 'medical',
      blurb: { en: 'Expected PaCO₂ in metabolic acidosis.', zh: '代謝性酸中毒之預期 PaCO₂。' },
      inputs: [
        { key: 'hco3', type: 'number', label: { en: 'Bicarbonate (HCO₃)', zh: '碳酸氫根 (HCO₃)' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 22, high: 28 }, source: { kind: 'lab', keys: ['CO2'] } },
      ],
      compute: (v) => {
        const hco3 = n(v, 'hco3')
        if (hco3 === undefined) return null
        const expected = 1.5 * hco3 + 8
        return {
          value: `${round(expected - 2)}–${round(expected + 2)}`, unit: 'mmHg',
          interpretation: { en: 'Expected PaCO₂; measured above = concurrent respiratory acidosis, below = respiratory alkalosis', zh: '預期 PaCO₂；實測高於此範圍＝合併呼吸性酸中毒，低於＝呼吸性鹼中毒' },
          severity: 'normal',
          extra: [{ label: { en: 'Point estimate', zh: '中心值' }, value: `${round(expected)} mmHg` }],
        }
      },
      reference: "Winter's formula: expected PaCO₂ = 1.5 × HCO₃ + 8 ± 2 (metabolic acidosis).",
    },

  // ── Urine anion gap ─────────────────────────────────────────────────────
    {
      id: 'urine-anion-gap',
      name: { en: 'Urine Anion Gap', zh: '尿液陰離子間隙' },
      category: 'electrolyte',
      audience: 'medical',
      blurb: { en: 'Workup of normal-anion-gap acidosis.', zh: '正常陰離子間隙酸中毒之鑑別。' },
      inputs: [
        { key: 'uNa', type: 'number', label: { en: 'Urine sodium', zh: '尿液鈉' }, unit: 'mmol/L', dimension: 'electrolyte', source: { kind: 'labSpecimen', keys: ['NA'], loinc: ['2955-3'], specimen: 'urine' } },
        { key: 'uK', type: 'number', label: { en: 'Urine potassium', zh: '尿液鉀' }, unit: 'mmol/L', dimension: 'electrolyte', source: { kind: 'labSpecimen', keys: ['K'], loinc: ['2828-2'], specimen: 'urine' } },
        { key: 'uCl', type: 'number', label: { en: 'Urine chloride', zh: '尿液氯' }, unit: 'mmol/L', dimension: 'electrolyte', source: { kind: 'labSpecimen', keys: ['CL'], loinc: ['2078-4'], specimen: 'urine' } },
      ],
      compute: (v) => {
        const uNa = n(v, 'uNa'); const uK = n(v, 'uK'); const uCl = n(v, 'uCl')
        if (uNa === undefined || uK === undefined || uCl === undefined) return null
        const uag = uNa + uK - uCl
        const val = round(uag)
        return {
          value: String(val), unit: 'mmol/L',
          interpretation: uag < 0
            ? { en: 'Negative — appropriate NH₄⁺ excretion (e.g. GI HCO₃ loss / diarrhea)', zh: '負值 — NH₄⁺ 排泄正常（如腸胃道 HCO₃ 流失／腹瀉）' }
            : { en: 'Positive — impaired NH₄⁺ excretion (e.g. renal tubular acidosis)', zh: '正值 — NH₄⁺ 排泄受損（如腎小管酸中毒 RTA）' },
          severity: uag < 0 ? 'normal' : 'moderate',
        }
      },
      reference: 'UAG = UNa + UK − UCl. Negative → GI cause; positive → renal (RTA).',
    },

  // ── Transtubular potassium gradient ─────────────────────────────────────
    {
      id: 'ttkg',
      name: { en: 'Transtubular Potassium Gradient (TTKG)', zh: '跨小管鉀梯度 (TTKG)' },
      category: 'electrolyte',
      audience: 'medical',
      blurb: { en: 'Renal K handling in dyskalemia.', zh: '鉀異常時之腎臟排鉀評估。' },
      inputs: [
        { key: 'uK', type: 'number', label: { en: 'Urine potassium', zh: '尿液鉀' }, unit: 'mmol/L', dimension: 'electrolyte', source: { kind: 'labSpecimen', keys: ['K'], loinc: ['2828-2'], specimen: 'urine' } },
        { key: 'pK', type: 'number', label: { en: 'Serum potassium', zh: '血清鉀' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 3.5, high: 5.0 }, source: { kind: 'labSpecimen', keys: ['K'], loinc: ['2823-3'], specimen: 'blood' } },
        { key: 'uOsm', type: 'number', label: { en: 'Urine osmolality', zh: '尿液滲透壓' }, unit: 'mOsm/kg', dimension: 'osmolality', source: { kind: 'labLoinc', loinc: ['2695-5'] } },
        { key: 'pOsm', type: 'number', label: { en: 'Serum osmolality', zh: '血清滲透壓' }, unit: 'mOsm/kg', dimension: 'osmolality', normalRange: { low: 275, high: 295 }, source: { kind: 'labLoinc', loinc: ['2692-2'] } },
      ],
      compute: (v) => {
        const uK = n(v, 'uK'); const pK = n(v, 'pK'); const uOsm = n(v, 'uOsm'); const pOsm = n(v, 'pOsm')
        if ([uK, pK, uOsm, pOsm].some((x) => x === undefined) || !pK || !uOsm) return null
        const ttkg = (uK! * pOsm!) / (pK * uOsm)
        const val = round(ttkg, 1)
        const valid = uOsm! > pOsm!
        return {
          value: String(val),
          interpretation: !valid
            ? { en: 'Requires urine osmolality > serum — result unreliable here', zh: '需尿液滲透壓 > 血清滲透壓，此結果不可靠' }
            : { en: 'In hyperkalemia: < 7 suggests hypoaldosteronism; ≥ 7 appropriate renal response', zh: '高血鉀時：< 7 疑似醛固酮不足；≥ 7 表腎臟反應正常' },
          severity: 'normal',
        }
      },
      reference: 'TTKG = (UK × Posm) / (PK × Uosm). Valid only when Uosm > Posm and UNa > 25.',
    },

  // ── Osmolar gap ─────────────────────────────────────────────────────────
    {
      id: 'osmolar-gap',
      name: { en: 'Osmolar Gap', zh: '滲透壓間隙' },
      category: 'electrolyte',
      audience: 'medical',
      blurb: { en: 'Screen for toxic alcohols.', zh: '毒性酒精中毒篩檢。' },
      inputs: [
        { key: 'measured', type: 'number', label: { en: 'Measured osmolality', zh: '實測滲透壓' }, unit: 'mOsm/kg', dimension: 'osmolality', normalRange: { low: 275, high: 295 }, source: { kind: 'labLoinc', loinc: ['2692-2'] } },
        { key: 'na', type: 'number', label: { en: 'Sodium', zh: '鈉' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 136, high: 145 }, source: { kind: 'lab', keys: ['NA'] } },
        { key: 'glucose', type: 'number', label: { en: 'Glucose', zh: '血糖' }, unit: 'mg/dL', dimension: 'glucose', normalRange: { low: 70, high: 100 }, source: { kind: 'lab', keys: ['GLUCOSE', 'GLUCOSE-AC'] } },
        { key: 'bun', type: 'number', label: { en: 'BUN', zh: '尿素氮 (BUN)' }, unit: 'mg/dL', dimension: 'bun', normalRange: { low: 7, high: 20 }, source: { kind: 'lab', keys: ['BUN'] } },
        { key: 'etoh', type: 'number', label: { en: 'Ethanol (optional)', zh: '乙醇（選填）' }, unit: 'mg/dL', dimension: 'ethanol', optional: true, source: { kind: 'labLoinc', loinc: ['5643-2', '5640-8'] } },
      ],
      compute: (v) => {
        const measured = n(v, 'measured'); const na = n(v, 'na'); const glu = n(v, 'glucose'); const bun = n(v, 'bun'); const etoh = n(v, 'etoh')
        if (measured === undefined || na === undefined || glu === undefined || bun === undefined) return null
        const calc = 2 * na + glu / 18 + bun / 2.8 + (etoh !== undefined ? etoh / 3.7 : 0)
        const gap = measured - calc
        const val = round(gap, 1)
        return {
          value: String(val), unit: 'mOsm/kg', dimension: 'osmolality',
          interpretation: val > 10
            ? { en: '> 10 — elevated; consider toxic alcohols (methanol, ethylene glycol)', zh: '> 10 — 偏高；考慮毒性酒精（甲醇、乙二醇）' }
            : { en: '≤ 10 — normal', zh: '≤ 10 — 正常' },
          severity: val > 10 ? 'high' : 'normal',
          extra: [{ label: { en: 'Calculated osmolality', zh: '計算滲透壓' }, value: `${round(calc)} mOsm/kg` }],
        }
      },
      reference: 'Osmolar gap = measured − calculated (2×Na + glucose/18 + BUN/2.8 + ethanol/3.7). > 10 abnormal.',
    },
]
