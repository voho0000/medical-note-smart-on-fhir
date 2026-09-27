import { generateMedicalSummaryUseCase as useCase } from '@/src/core/use-cases/medical-summary/generate-medical-summary.use-case'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'

test('retrying another card preserves the original excerpts on every retained claim', () => {
  const evidence = [{ source: 'D1', quote: 'Possible pneumonia; follow-up assessment pending.' }]
  const claim = { sourceKeys: ['D1'], documentEvidence: evidence }
  const result = {
    headline: '來源文件待追蹤事項',
    summary: [{ text: '文件記載疑似肺炎。', emphasis: false, ...claim }],
    investigations: [{ label: '影像', kind: 'imaging', direction: 'single', trend: '單次檢查', interpretation: '待追蹤', ...claim }],
    medicationEducation: [{ name: 'Synthetic medication', benefit: '文件記載用途', attention: '依醫囑', ...claim }],
    medicationReview: { overview: '來源紀錄',
      regimen: [{ group: '來源用藥', name: 'Synthetic medication', ...claim }],
      changes: [{ type: 'uncertain', medication: 'Synthetic medication', summary: '待確認', ...claim }],
      reconciliation: [{ reason: 'other', text: '待確認', ...claim }],
    },
    problems: [{ label: '疑似肺炎', kind: 'discharge', basis: '文件', ...claim }],
    decisions: [{ text: '文件記載待追蹤', urgency: 'routine', ...claim }],
    timeline: [{ key: 'D1', date: '2026-01-01', label: '歷史紀錄', category: 'encounter', resourceType: 'DocumentReference', resourceId: 'synthetic-document', documentEvidence: evidence }],
    sourceIndex: [],
  } as unknown as MedicalSummaryResult
  const retained = useCase.createAiDraftFromResult(result)
  const retried = useCase.mergeModuleResult(retained, 'medications', { medicationEducation: [], medicationReview: { regimen: [], changes: [], reconciliation: [] } })
  const all = [retained.summary[0], retained.investigations[0], retained.medicationEducation[0], retained.medicationReview.regimen[0],
    retained.medicationReview.changes[0], retained.medicationReview.reconciliation[0], retained.problems[0], retained.decisions[0], retained.timeline[0]]
  for (const item of all) expect(item.documentEvidence).toEqual(evidence)
  expect(retried.problems[0].documentEvidence).toEqual(evidence)
  expect(retried.summary[0].documentEvidence).toEqual(evidence)
  expect(retried.timeline[0].documentEvidence).toEqual(evidence)
  retained.problems[0].documentEvidence![0].quote = 'changed copy'
  expect(result.problems[0].documentEvidence![0].quote).toBe(evidence[0].quote)
})
