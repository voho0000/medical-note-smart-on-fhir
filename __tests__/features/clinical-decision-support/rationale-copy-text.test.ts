import { buildRationaleCopyText } from '@/features/clinical-decision-support/utils/build-rationale-copy-text'
import type { CdssRecommendation } from '@/features/clinical-decision-support/types'

const recommendation: CdssRecommendation = {
  id: 'heart-failure-mra',
  moduleName: 'MRA 治療',
  domain: 'medication',
  priority: 'medium',
  status: 'actionable',
  title: 'HFrEF 適用 MRA，目前無處方',
  recommendation: '核對禁忌、不耐受與血流動力後，評估建立或最佳化 MRA。',
  rationale: '雲端藥歷涵蓋跨院處方，沒有這個類別即代表沒有在用。',
  patientEvidence: [
    { label: 'LVEF', value: '32%（2026-07-14）', factKeys: ['LVEF'] },
    { label: 'K', value: '4.9 mmol/L', factKeys: ['potassium'], sources: [{ resourceType: 'Observation', resourceId: 'k-1', date: '2026-08-28' }] },
    { label: 'MRA', value: '目前未使用', factKeys: ['mraTherapy'] },
  ],
  nextActions: ['評估建立或最佳化 MRA，並記錄臨床決定。'],
  guidelineReferences: [{
    id: 'esc-hf-2026-hfref-mra',
    title: '2026 ESC Guidelines for the Management of Heart Failure',
    publisher: 'ESC',
    version: '2026',
    url: 'https://example.org/esc-hf-2026',
    recommendationId: 'Recommendation Table 5',
    evidenceGrade: 'Class I, Level A',
    page: 37,
    summary: 'MRA is recommended for HFrEF.',
    citedStatements: [{ label: 'Rec. Table 5', text: 'An MRA is recommended for patients with HFrEF to reduce the risk of HF hospitalization and death.' }],
  }],
  safetyBoundary: '本卡不計算劑量、不開立醫囑。',
  semanticRule: {
    guidelineRecommendation: 'HFrEF 建議使用 MRA（Class I）。',
    eligibilityCriteria: ['LVEF <50%', 'eGFR >30、K <5.0'],
    patientData: [
      { label: 'LVEF', value: '32%（2026-07-14）', factKeys: ['LVEF'] },
      { label: 'K', value: '4.9 mmol/L', factKeys: ['potassium'], sources: [{ resourceType: 'Observation', resourceId: 'k-1', date: '2026-08-28' }] },
    ],
    decisionLogic: 'HFrEF 且 MRA 未使用，起始條件成立。',
    clinicalConclusion: '符合起始 MRA 的條件。',
    limitations: ['不判定健保給付。'],
  },
}

describe('buildRationaleCopyText', () => {
  it('lays out the card the way a chart note reads, in the pack\'s own words', () => {
    const text = buildRationaleCopyText(recommendation, 'zh-TW', {
      packId: 'heart-failure-cdss',
      packVersion: '0.2.0-poc',
      copiedOn: '2026-09-08',
    })

    expect(text.split('\n')[0]).toBe('【判定理由】MRA 治療')
    expect(text).toContain('判定：HFrEF 適用 MRA，目前無處方（符合介入條件）')
    // A value without an inline date borrows its source date; one with keeps its own.
    expect(text).toContain('- LVEF：32%（2026-07-14）')
    expect(text).toContain('- K：4.9 mmol/L（2026-08-28）')
    expect(text).toContain('指引建議：HFrEF 建議使用 MRA（Class I）。')
    expect(text).toContain('- LVEF <50%')
    expect(text).toContain('判定邏輯：HFrEF 且 MRA 未使用，起始條件成立。')
    expect(text).toContain('結論：符合起始 MRA 的條件。')
    expect(text).toContain('- 評估建立或最佳化 MRA，並記錄臨床決定。')
    expect(text).toContain('- 2026 ESC Guidelines for the Management of Heart Failure · 2026 · Recommendation Table 5 · Class I, Level A · PDF 第 37 頁')
    expect(text).toContain('「An MRA is recommended for patients with HFrEF to reduce the risk of HF hospitalization and death.」（Rec. Table 5）')
    expect(text).toContain('https://example.org/esc-hf-2026')
    expect(text).toContain('- 不判定健保給付。')
    expect(text).toContain('決策邊界：本卡不計算劑量、不開立醫囑。')
    expect(text.split('\n').at(-1)).toBe('來源：MediPrisma 個人化照護指引 · heart-failure-cdss 0.2.0-poc · 2026-09-08 · 唯讀決策支援，非診斷或醫囑')
    expect(text).not.toMatch(/\n{3}/)
  })

  it('falls back to the card fields when the pack ships no semantic rule', () => {
    const { semanticRule: _rule, ...bare } = recommendation
    const text = buildRationaleCopyText(bare, 'en')
    expect(text).toContain('[Decision rationale] MRA 治療')
    expect(text).toContain('Guideline recommendation：MRA is recommended for HFrEF.')
    expect(text).toContain('- MRA：目前未使用')
    expect(text).not.toContain('Source: MediPrisma')
  })
})
