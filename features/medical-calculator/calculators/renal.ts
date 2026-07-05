import type { CalculatorDef, L } from '../types'
import { n, round, SEX_INPUT, AGE_INPUT, WEIGHT_LOINC } from './_shared'

export const RENAL: CalculatorDef[] = [
  // ── eGFR — CKD-EPI 2021 (race-free) ─────────────────────────────────────
  {
      id: 'egfr-ckd-epi-2021',
      name: { en: 'eGFR (CKD-EPI 2021)', zh: 'eGFR (CKD-EPI 2021)' },
      category: 'renal',
      blurb: {
        en: 'Race-free estimated glomerular filtration rate.',
        zh: '不含種族因子之腎絲球過濾率估算。',
      },
      inputs: [
        { key: 'scr', type: 'number', label: { en: 'Creatinine', zh: '肌酸酐' }, unit: 'mg/dL', dimension: 'creatinine', normalRange: { low: 0.6, high: 1.2 }, source: { kind: 'lab', keys: ['CREA'] } },
        AGE_INPUT,
        SEX_INPUT,
      ],
      compute: (v) => {
        const scr = n(v, 'scr'); const age = n(v, 'age'); const female = v.sex === 'female'
        if (scr === undefined || age === undefined || scr <= 0 || age <= 0) return null
        const k = female ? 0.7 : 0.9
        const a = female ? -0.241 : -0.302
        const r = scr / k
        let egfr = 142 * Math.pow(Math.min(r, 1), a) * Math.pow(Math.max(r, 1), -1.200) * Math.pow(0.9938, age)
        if (female) egfr *= 1.012
        const val = round(egfr)
        let stage: L; let severity: 'normal' | 'low' | 'moderate' | 'high'
        if (val >= 90) { stage = { en: 'G1 — normal/high', zh: 'G1 — 正常或偏高' }; severity = 'normal' }
        else if (val >= 60) { stage = { en: 'G2 — mildly decreased', zh: 'G2 — 輕度下降' }; severity = 'normal' }
        else if (val >= 45) { stage = { en: 'G3a — mild–moderate', zh: 'G3a — 輕中度下降' }; severity = 'moderate' }
        else if (val >= 30) { stage = { en: 'G3b — moderate–severe', zh: 'G3b — 中重度下降' }; severity = 'moderate' }
        else if (val >= 15) { stage = { en: 'G4 — severely decreased', zh: 'G4 — 重度下降' }; severity = 'high' }
        else { stage = { en: 'G5 — kidney failure', zh: 'G5 — 腎衰竭' }; severity = 'high' }
        return { value: String(val), unit: 'mL/min/1.73m²', interpretation: stage, severity }
      },
      reference: 'Inker LA, et al. NEJM 2021 (CKD-EPI creatinine, no race coefficient).',
    },

  // ── eGFR — MDRD (4-variable, race-free) ─────────────────────────────────
    {
      id: 'egfr-mdrd',
      name: { en: 'eGFR (MDRD)', zh: 'eGFR (MDRD)' },
      category: 'renal',
      audience: 'medical',
      blurb: { en: '4-variable MDRD estimate.', zh: '四變數 MDRD 估算。' },
      inputs: [
        { key: 'scr', type: 'number', label: { en: 'Creatinine', zh: '肌酸酐' }, unit: 'mg/dL', dimension: 'creatinine', normalRange: { low: 0.6, high: 1.2 }, source: { kind: 'lab', keys: ['CREA'] } },
        AGE_INPUT,
        SEX_INPUT,
      ],
      compute: (v) => {
        const scr = n(v, 'scr'); const age = n(v, 'age'); const female = v.sex === 'female'
        if (scr === undefined || age === undefined || scr <= 0 || age <= 0) return null
        let egfr = 175 * Math.pow(scr, -1.154) * Math.pow(age, -0.203)
        if (female) egfr *= 0.742
        const val = round(egfr)
        let stage: L; let severity: 'normal' | 'moderate' | 'high'
        if (val >= 90) { stage = { en: 'G1 — normal/high', zh: 'G1 — 正常或偏高' }; severity = 'normal' }
        else if (val >= 60) { stage = { en: 'G2 — mildly decreased', zh: 'G2 — 輕度下降' }; severity = 'normal' }
        else if (val >= 30) { stage = { en: 'G3 — moderately decreased', zh: 'G3 — 中度下降' }; severity = 'moderate' }
        else if (val >= 15) { stage = { en: 'G4 — severely decreased', zh: 'G4 — 重度下降' }; severity = 'high' }
        else { stage = { en: 'G5 — kidney failure', zh: 'G5 — 腎衰竭' }; severity = 'high' }
        return { value: String(val), unit: 'mL/min/1.73m²', interpretation: stage, severity }
      },
      reference: 'Levey AS, et al. MDRD 4-variable (IDMS-traceable), race coefficient omitted.',
    },

  // ── Creatinine clearance — Cockcroft-Gault ──────────────────────────────
    {
      id: 'crcl-cockcroft-gault',
      name: { en: 'Creatinine Clearance (Cockcroft-Gault)', zh: '肌酸酐廓清率 (Cockcroft-Gault)' },
      category: 'renal',
      blurb: { en: 'Estimated CrCl for drug dosing.', zh: '藥物劑量調整用之肌酸酐廓清率估算。' },
      inputs: [
        { key: 'scr', type: 'number', label: { en: 'Creatinine', zh: '肌酸酐' }, unit: 'mg/dL', dimension: 'creatinine', normalRange: { low: 0.6, high: 1.2 }, source: { kind: 'lab', keys: ['CREA'] } },
        AGE_INPUT,
        { key: 'weight', type: 'number', label: { en: 'Weight', zh: '體重' }, unit: 'kg', dimension: 'weight', source: { kind: 'vital', loinc: WEIGHT_LOINC } },
        SEX_INPUT,
      ],
      compute: (v) => {
        const scr = n(v, 'scr'); const age = n(v, 'age'); const wt = n(v, 'weight'); const female = v.sex === 'female'
        if (scr === undefined || age === undefined || wt === undefined || scr <= 0 || age <= 0 || wt <= 0) return null
        const crcl = ((140 - age) * wt * (female ? 0.85 : 1)) / (72 * scr)
        const val = round(crcl)
        let severity: 'normal' | 'moderate' | 'high' = 'normal'
        if (val < 30) severity = 'high'
        else if (val < 60) severity = 'moderate'
        return {
          value: String(val), unit: 'mL/min', severity,
          interpretation: val < 30
            ? { en: 'Severe impairment — check renal dosing', zh: '嚴重不足 — 注意腎臟劑量調整' }
            : val < 60
              ? { en: 'Moderate impairment', zh: '中度不足' }
              : { en: 'Preserved', zh: '功能大致正常' },
        }
      },
      reference: 'Cockcroft DW, Gault MH. Nephron 1976. Uses actual body weight.',
    },

  // ── FENa (fractional excretion of sodium) ───────────────────────────────
    // Urine vs serum analytes matched by LOINC (bridge: 2161-8 urine Cr / 2160-0
    // serum Cr are stable & authoritative; no specimen field). See memory.
    {
      id: 'fena',
      name: { en: 'Fractional Excretion of Sodium (FENa)', zh: '鈉排泄分率 (FENa)' },
      category: 'renal',
      audience: 'medical',
      blurb: { en: 'Prerenal vs intrinsic AKI.', zh: '區分腎前性與腎實質性急性腎損傷。' },
      inputs: [
        { key: 'uNa', type: 'number', label: { en: 'Urine sodium', zh: '尿液鈉' }, unit: 'mmol/L', dimension: 'electrolyte', source: { kind: 'labSpecimen', keys: ['NA'], loinc: ['2955-3'], specimen: 'urine' } },
        { key: 'pNa', type: 'number', label: { en: 'Serum sodium', zh: '血清鈉' }, unit: 'mmol/L', dimension: 'electrolyte', normalRange: { low: 136, high: 145 }, source: { kind: 'labSpecimen', keys: ['NA'], loinc: ['2951-2'], specimen: 'blood' } },
        { key: 'uCr', type: 'number', label: { en: 'Urine creatinine', zh: '尿液肌酸酐' }, unit: 'mg/dL', dimension: 'creatinine', source: { kind: 'labSpecimen', keys: ['CREA'], loinc: ['2161-8'], specimen: 'urine' } },
        { key: 'pCr', type: 'number', label: { en: 'Serum creatinine', zh: '血清肌酸酐' }, unit: 'mg/dL', dimension: 'creatinine', normalRange: { low: 0.6, high: 1.2 }, source: { kind: 'labSpecimen', keys: ['CREA'], loinc: ['2160-0'], specimen: 'blood' } },
      ],
      compute: (v) => {
        const uNa = n(v, 'uNa'); const pNa = n(v, 'pNa'); const uCr = n(v, 'uCr'); const pCr = n(v, 'pCr')
        if ([uNa, pNa, uCr, pCr].some((x) => x === undefined) || !pNa || !uCr) return null
        const fena = (uNa! * pCr!) / (pNa * uCr) * 100
        const val = round(fena, 1)
        let interp: L; let severity: 'normal' | 'moderate' | 'high'
        if (val < 1) { interp = { en: '< 1% — prerenal', zh: '< 1% — 腎前性' }; severity = 'normal' }
        else if (val <= 2) { interp = { en: '1–2% — indeterminate', zh: '1–2% — 難以判定' }; severity = 'moderate' }
        else { interp = { en: '> 2% — intrinsic / ATN', zh: '> 2% — 腎實質性 / ATN' }; severity = 'high' }
        return { value: String(val), unit: '%', interpretation: interp, severity }
      },
      reference: 'FENa = (UNa × PCr) / (PNa × UCr) × 100. < 1% prerenal; unreliable on diuretics → use FEUrea.',
    },

  // ── FEUrea (fractional excretion of urea) ───────────────────────────────
    {
      id: 'feurea',
      name: { en: 'Fractional Excretion of Urea (FEUrea)', zh: '尿素排泄分率 (FEUrea)' },
      category: 'renal',
      audience: 'medical',
      blurb: { en: 'Prerenal vs intrinsic AKI (diuretic-independent).', zh: '腎前性 vs 腎實質性（不受利尿劑影響）。' },
      inputs: [
        { key: 'uUrea', type: 'number', label: { en: 'Urine urea nitrogen', zh: '尿液尿素氮' }, unit: 'mg/dL', dimension: 'bun', source: { kind: 'labSpecimen', keys: ['BUN'], loinc: ['3095-7'], specimen: 'urine' } },
        { key: 'pBun', type: 'number', label: { en: 'Serum BUN', zh: '血清尿素氮' }, unit: 'mg/dL', dimension: 'bun', normalRange: { low: 7, high: 20 }, source: { kind: 'labSpecimen', keys: ['BUN'], loinc: ['3094-0'], specimen: 'blood' } },
        { key: 'uCr', type: 'number', label: { en: 'Urine creatinine', zh: '尿液肌酸酐' }, unit: 'mg/dL', dimension: 'creatinine', source: { kind: 'labSpecimen', keys: ['CREA'], loinc: ['2161-8'], specimen: 'urine' } },
        { key: 'pCr', type: 'number', label: { en: 'Serum creatinine', zh: '血清肌酸酐' }, unit: 'mg/dL', dimension: 'creatinine', normalRange: { low: 0.6, high: 1.2 }, source: { kind: 'labSpecimen', keys: ['CREA'], loinc: ['2160-0'], specimen: 'blood' } },
      ],
      compute: (v) => {
        const uUrea = n(v, 'uUrea'); const pBun = n(v, 'pBun'); const uCr = n(v, 'uCr'); const pCr = n(v, 'pCr')
        if ([uUrea, pBun, uCr, pCr].some((x) => x === undefined) || !pBun || !uCr) return null
        const fe = (uUrea! * pCr!) / (pBun * uCr) * 100
        const val = round(fe, 1)
        let interp: L; let severity: 'normal' | 'moderate' | 'high'
        if (val < 35) { interp = { en: '< 35% — prerenal', zh: '< 35% — 腎前性' }; severity = 'normal' }
        else if (val <= 50) { interp = { en: '35–50% — indeterminate', zh: '35–50% — 難以判定' }; severity = 'moderate' }
        else { interp = { en: '> 50% — intrinsic / ATN', zh: '> 50% — 腎實質性 / ATN' }; severity = 'high' }
        return { value: String(val), unit: '%', interpretation: interp, severity }
      },
      reference: 'FEUrea = (UUrea × PCr) / (BUN × UCr) × 100. < 35% prerenal; reliable despite diuretics.',
    },
]
