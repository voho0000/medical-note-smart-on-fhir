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
        { key: 'weight', type: 'number', label: { en: 'Weight', zh: '體重' }, unit: 'kg', dimension: 'weight', source: { kind: 'vital', loinc: WEIGHT_LOINC, vital: 'weight' } },
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

  // ── CKD prognosis / follow-up — KDIGO 2012 heat map (NHI 健保存摺) ─────────
    // Patient-facing CKD risk & follow-up tool from Taiwan's 健保存摺, built on
    // the KDIGO 2012 GFR×albuminuria grid. Risk colour = KDIGO 4-colour
    // prognosis map; follow-up frequency + the 5th 深紅色 (ESRD) band = KDIGO's
    // "frequency of monitoring" grid (1/1/2/3/≥4 per year). Boundaries,
    // 18-cell colours and per-cell frequencies verified against the KDIGO 2013
    // Summary of Recommendation Statements.
    {
      id: 'ckd-kdigo-risk',
      name: { en: 'CKD Prognosis / Follow-up (KDIGO)', zh: '慢性腎臟病預後與追蹤 (KDIGO)' },
      category: 'renal',
      audience: 'both',
      blurb: {
        en: 'CKD risk category & recommended follow-up from eGFR + albuminuria.',
        zh: '由 eGFR 與白蛋白尿分期評估慢性腎臟病風險與建議追蹤頻率。',
      },
      inputs: [
        { key: 'egfr', type: 'number', label: { en: 'eGFR', zh: '腎絲球過濾率 (eGFR)' }, unit: 'mL/min/1.73m²', normalRange: { low: 90, high: 120 }, source: { kind: 'lab', keys: ['EGFR', 'EGFR(EPI)', 'EGFR(M)'] } },
        { key: 'acr', type: 'number', label: { en: 'Urine albumin/creatinine ratio (ACR)', zh: '尿液白蛋白/肌酸酐比值 (ACR)' }, unit: 'mg/g', optional: true, source: { kind: 'labSpecimen', keys: ['ACR'], loinc: ['9318-7', '14959-1'], specimen: 'urine' } },
        { key: 'pcr', type: 'number', label: { en: 'Urine protein/creatinine ratio (PCR)', zh: '尿液蛋白/肌酸酐比值 (PCR)' }, unit: 'mg/g', optional: true, source: { kind: 'labLoinc', loinc: ['2890-2'] } },
      ],
      compute: (v) => {
        const egfr = n(v, 'egfr'); const acr = n(v, 'acr'); const pcr = n(v, 'pcr')
        if (egfr === undefined || egfr < 0) return null
        const gfrLabels = ['G1', 'G2', 'G3a', 'G3b', 'G4', 'G5']
        const gfrRanges = ['≥90', '60–89', '45–59', '30–44', '15–29', '<15']
        const g = egfr >= 90 ? 0 : egfr >= 60 ? 1 : egfr >= 45 ? 2 : egfr >= 30 ? 3 : egfr >= 15 ? 4 : 5
        const gfrRow: { label: L; value: string } = { label: { en: 'GFR category', zh: '腎功能分期' }, value: `${gfrLabels[g]} (${gfrRanges[g]} mL/min/1.73m²)` }

        // Albuminuria index from ACR (preferred) or PCR fallback (mg/g).
        let a: number; let albDesc: string
        if (acr !== undefined && acr >= 0) {
          a = acr < 30 ? 0 : acr > 300 ? 2 : 1
          albDesc = `A${a + 1} (ACR ${['<30', '30–300', '>300'][a]} mg/g)`
        } else if (pcr !== undefined && pcr >= 0) {
          a = pcr < 150 ? 0 : pcr >= 500 ? 2 : 1
          albDesc = `A${a + 1} (PCR ${['<150', '150–500', '≥500'][a]} mg/g)`
        } else {
          // eGFR alone — stage the kidney function, prompt for albuminuria.
          const sev: 'normal' | 'moderate' | 'high' = g <= 1 ? 'normal' : g <= 3 ? 'moderate' : 'high'
          return {
            value: gfrLabels[g],
            interpretation: { en: 'Enter ACR or PCR for full risk staging', zh: '請輸入 ACR 或 PCR 以完整評估風險' },
            severity: sev,
            extra: [gfrRow],
          }
        }

        // KDIGO 4-colour prognosis grid (0 green / 1 yellow / 2 orange / 3 red).
        const prognosis = [
          [0, 1, 2], // G1
          [0, 1, 2], // G2
          [1, 2, 3], // G3a
          [2, 3, 3], // G3b
          [3, 3, 3], // G4
          [3, 3, 3], // G5
        ]
        // KDIGO monitoring frequency (times/year); 4 = ≥4× = Taiwan 深紅色 (ESRD).
        const followup = [
          [1, 1, 2],
          [1, 1, 2],
          [1, 2, 3],
          [2, 3, 3],
          [3, 3, 4],
          [4, 4, 4],
        ]
        const freq = followup[g][a]
        const color = freq === 4 ? 4 : prognosis[g][a] // 4 = deep-red / ESRD
        const band: L = [
          { en: 'Low risk (green)', zh: '低風險（綠色）' },
          { en: 'Moderately increased risk (yellow)', zh: '風險中度增加（黃色 · 初期）' },
          { en: 'High risk (orange)', zh: '高風險（橙色 · 觀察期）' },
          { en: 'Very high risk (red)', zh: '極高風險（紅色 · 警戒期）' },
          { en: 'Kidney failure — ESRD (deep red)', zh: '末期腎病（深紅色）' },
        ][color]
        const severity: 'normal' | 'low' | 'moderate' | 'high' = color === 0 ? 'normal' : color === 1 ? 'low' : color === 2 ? 'moderate' : 'high'
        const freqText: L = freq === 1
          ? { en: 'once a year', zh: '每年 1 次' }
          : freq === 2
            ? { en: 'twice a year', zh: '每年 2 次' }
            : freq === 3
              ? { en: '3 times a year', zh: '每年 3 次' }
              : { en: 'at least 4 times a year', zh: '每年至少 4 次' }
        const caveat: L = color === 0
          ? { en: 'Green with no other markers of kidney damage is not necessarily CKD. ACR assumed in mg/g.', zh: '綠色且無其他腎臟損傷指標者未必為慢性腎臟病。ACR 以 mg/g 計。' }
          : { en: 'ACR assumed in mg/g; ACR/PCR–stage relationships are approximate.', zh: 'ACR 以 mg/g 計；ACR／PCR 對應分期為近似值。' }
        return {
          value: `${gfrLabels[g]} · A${a + 1}`,
          interpretation: band,
          severity,
          extra: [
            gfrRow,
            { label: { en: 'Albuminuria', zh: '白蛋白尿分期' }, value: albDesc },
          ],
          notes: {
            en: `Suggested follow-up: ${freqText.en}. ${caveat.en} A guide only — discuss management with your doctor.`,
            zh: `建議追蹤頻率：${freqText.zh}。${caveat.zh}此為參考建議，實際處置請與醫師討論。`,
          },
        }
      },
      reference: 'KDIGO 2012 CKD guideline (GFR G1–G5 × albuminuria A1–A3). ACR: A1 <30 / A2 30–300 / A3 >300 mg/g; PCR: A1 <150 / A2 150–500 / A3 ≥500 mg/g. Follow-up (×/yr) and the 5th ESRD band from KDIGO\'s monitoring-frequency grid; as used in Taiwan NHI 健保存摺.',
    },
]
