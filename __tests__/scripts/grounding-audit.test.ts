// The deterministic "second pass": a bundle-grounded audit that catches
// hallucinations mere citation-resolution misses. Empirically an LLM verifier
// (flash-lite / flash-preview) MISSED the fabricated 內視鏡 these tests pin;
// this deterministic check does not, and it does not false-flag a legitimate
// "arrange an echo" recommendation.
import { auditSummaryGrounding, auditSafetyGrounding } from '@/scripts/lib/grounding-audit'

// Bundle text that contains a chest X-ray + creatinine + ECG, but NO endoscopy
// and NO echocardiogram.
const bundleBlob = JSON.stringify({ reports: ['胸腔檢查', '肌酸酐、血', '心電圖'] })
const catalog = [
  { key: 'L1', display: '胸腔檢查（各種角度部位）', resourceType: 'DiagnosticReport' },
  { key: 'L7', display: '肌酸酐、血', resourceType: 'DiagnosticReport' },
  { key: 'L16', display: '心電圖', resourceType: 'DiagnosticReport' },
  { key: 'L30', display: '腹部超音波，追蹤性', resourceType: 'DiagnosticReport' },
  { key: 'E5', display: '門診（K317 胃及十二指腸息肉）', resourceType: 'Encounter' },
]
const input = { bundleBlob, catalog }

describe('auditSummaryGrounding', () => {
  it('flags a problem whose basis names an absent endoscopy', () => {
    const ai = { problems: [{ label: '胃食道逆流', basis: '內視鏡報告與用藥', sources: ['E5'] }] }
    expect(auditSummaryGrounding(ai, input)).toEqual([
      expect.stringContaining('fabricated test "內視鏡" in problem[0]'),
    ])
  })

  it('does NOT flag a decision that RECOMMENDS an echo (arrange, not asserted)', () => {
    const ai = { decisions: [{ text: '安排心臟超音波評估', rationale: '心電圖顯示陳舊性梗塞', sources: ['L16'] }] }
    expect(auditSummaryGrounding(ai, input)).toEqual([])
  })

  it('flags a fabricated finding in a timeline label', () => {
    const ai = { timeline: [{ label: '因咳血住院與胃鏡檢查（診斷胃炎）', ref: 'L1' }] }
    expect(auditSummaryGrounding(ai, input)).toEqual([
      expect.stringContaining('fabricated test "胃鏡" in timeline[0]'),
    ])
  })

  it('flags a renal problem citing the chest X-ray (irrelevant citation)', () => {
    const ai = { problems: [{ label: '慢性腎臟病', basis: 'eGFR 32', sources: ['L1', 'L7'] }] }
    const issues = auditSummaryGrounding(ai, input)
    expect(issues).toEqual([expect.stringContaining('renal claim cites imaging L1')])
  })

  it('audits investigation text and rejects a renal trend citing a chest X-ray', () => {
    const ai = {
      investigations: [
        {
          label: '腎功能',
          trend: 'eGFR 35 → 32',
          interpretation: '數值下降',
          sources: ['L1'],
        },
      ],
    }
    expect(auditSummaryGrounding(ai, input)).toEqual([
      expect.stringContaining('renal investigation cites imaging L1'),
    ])
  })

  it('flags a polyp problem citing the abdominal ultrasound (which says nothing about polyps)', () => {
    const ai = { problems: [{ label: '胃及十二指腸息肉', basis: '腹部超音波', sources: ['L30'] }] }
    expect(auditSummaryGrounding(ai, input)).toEqual([expect.stringContaining('polyp cites imaging L30')])
  })

  it('flags a positional cross-reference', () => {
    const ai = { decisions: [{ text: '請照上述建議追蹤', rationale: '', sources: [] }] }
    expect(auditSummaryGrounding(ai, input)).toEqual([expect.stringContaining('positional cross-ref')])
  })

  it('returns [] for a fully grounded summary', () => {
    const ai = {
      problems: [{ label: '慢性腎臟病', basis: '肌酸酐上升', sources: ['L7'] }],
      timeline: [{ label: '胸部X光追蹤', ref: 'L1' }],
    }
    expect(auditSummaryGrounding(ai, input)).toEqual([])
  })
})

describe('auditSafetyGrounding', () => {
  it('flags a fabricated test asserted in an alert detail', () => {
    const scan = { alerts: [{ title: '胃部風險', detail: '內視鏡顯示胃炎', evidence: [], sources: ['E5'], category: 'other' }] }
    expect(auditSafetyGrounding(scan, input)).toEqual([expect.stringContaining('fabricated test "內視鏡"')])
  })

  it('does NOT flag a test named only in the recommendation field', () => {
    const scan = { alerts: [{ title: '心臟', detail: '心電圖異常', recommendation: '建議安排心臟超音波', evidence: [], sources: ['L16'], category: 'monitoring' }] }
    expect(auditSafetyGrounding(scan, input)).toEqual([])
  })

  it('flags a renal alert citing the chest X-ray', () => {
    const scan = { alerts: [{ title: '腎功能', detail: 'eGFR 32', evidence: [], sources: ['L1'], category: 'renal' }] }
    expect(auditSafetyGrounding(scan, input)).toEqual([expect.stringContaining('renal alert cites imaging L1')])
  })
})
