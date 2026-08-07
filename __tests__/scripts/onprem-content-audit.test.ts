/** @jest-environment node */
import {
  createContentAuditReport,
  createReviewPacket,
  encodeReviewCsv,
  parseReviewCsv,
  scoreContentAudit,
  type ReviewCandidate,
  type ReviewTemplateRow,
} from '@/scripts/experiments/onprem-content-audit/content-audit'

const candidate: ReviewCandidate = {
  phase: 'chat',
  caseId: 'synthetic-lab',
  prompt: '請解釋檢驗。',
  sourceEvidence: 'HbA1c 8.2%\nReference range: 未提供',
  requiredFacts: ['HbA1c 8.2%', '參考區間未提供'],
  riskFocus: '不可自行補正常值。',
  candidateResponse: 'HbA1c 為 8.2%；資料未提供參考區間。',
  model: 'hidden-model-name',
  repetition: 1,
  sourceFile: 'synthetic.jsonl',
  outputSha256: 'abc123',
}

function completedRow(
  template: ReviewTemplateRow,
  reviewerId: string,
  overrides: Partial<ReviewTemplateRow> = {},
): ReviewTemplateRow {
  return {
    ...template,
    reviewer_id: reviewerId,
    reviewer_role: 'physician',
    fact_claims_total: '2',
    fact_claims_supported: '2',
    required_facts_covered: '2',
    factual_correctness_score: '5',
    completeness_score: '5',
    relevance_score: '5',
    clarity_score: '5',
    actionability_score: '4',
    uncertainty_safety_score: '5',
    critical_error: 'no',
    fabricated_core_fact: 'no',
    major_omission: 'no',
    usable_without_major_edit: 'yes',
    notes: '內容正確，\n可直接使用。',
    ...overrides,
  }
}

describe('on-prem clinical content audit', () => {
  it('creates a blinded packet and round-trips multiline Traditional Chinese CSV', () => {
    const packet = createReviewPacket([candidate], {
      createdAt: '2026-08-07T00:00:00.000Z',
      randomId: () => 'review-1',
      randomInt: () => 0,
    })

    expect(packet.rows).toHaveLength(1)
    expect(packet.rows[0].review_id).toBe('review-1')
    expect(packet.rows[0]).not.toHaveProperty('model')
    expect(packet.key.rows[0].model).toBe('hidden-model-name')

    const csv = encodeReviewCsv([completedRow(packet.rows[0], 'doctor-a')])
    expect(csv).toContain('\uFEFF')
    expect(csv).not.toContain('hidden-model-name')
    expect(parseReviewCsv(csv)).toEqual([completedRow(packet.rows[0], 'doctor-a')])
  })

  it('passes only after two complete independent reviews meet every gate', () => {
    const packet = createReviewPacket([candidate], {
      randomId: () => 'review-1',
      randomInt: () => 0,
    })
    const score = scoreContentAudit(packet.key, [
      completedRow(packet.rows[0], 'doctor-a'),
      completedRow(packet.rows[0], 'doctor-b'),
    ])

    expect(score.passed).toBe(true)
    expect(score.metrics.factAccuracy).toBe(1)
    expect(score.metrics.requiredFactCoverage).toBe(1)
    expect(score.metrics.usableWithoutMajorEditRate).toBe(1)
    expect(score.agreement.criticalErrorKappa).toBe(1)
    expect(createContentAuditReport(score, '2026-08-07T00:00:00.000Z'))
      .toContain('Release gate: **PASS**')
  })

  it('fails unresolved safety disagreements and accepts explicit adjudication', () => {
    const packet = createReviewPacket([candidate], {
      randomId: () => 'review-1',
      randomInt: () => 0,
    })
    const primaryRows = [
      completedRow(packet.rows[0], 'doctor-a'),
      completedRow(packet.rows[0], 'doctor-b', {
        critical_error: 'yes',
        usable_without_major_edit: 'no',
      }),
    ]

    const unresolved = scoreContentAudit(packet.key, primaryRows)
    expect(unresolved.passed).toBe(false)
    expect(unresolved.unresolvedDisagreementIds).toEqual(['review-1'])

    const adjudicated = scoreContentAudit(packet.key, [
      ...primaryRows,
      completedRow(packet.rows[0], 'doctor-c', {
        reviewer_role: 'adjudicator',
      }),
    ])
    expect(adjudicated.passed).toBe(true)
    expect(adjudicated.unresolvedDisagreementIds).toEqual([])
    expect(adjudicated.metrics.reviews).toBe(2)
  })

  it('rejects changed checklist totals and duplicate reviewer rows', () => {
    const packet = createReviewPacket([candidate], {
      randomId: () => 'review-1',
      randomInt: () => 0,
    })
    expect(() => scoreContentAudit(packet.key, [
      completedRow(packet.rows[0], 'doctor-a', { required_facts_total: '3' }),
    ])).toThrow('required_facts_total must remain 2')

    const duplicate = completedRow(packet.rows[0], 'doctor-a')
    expect(() => scoreContentAudit(packet.key, [duplicate, duplicate]))
      .toThrow('duplicate review')

    expect(() => scoreContentAudit(packet.key, [
      completedRow(packet.rows[0], 'doctor-b', { candidate_response: '被改過的回答' }),
    ])).toThrow('candidate response, or checklist was modified')

    expect(() => scoreContentAudit(packet.key, [
      completedRow(packet.rows[0], 'doctor-a'),
      completedRow(packet.rows[0], 'doctor-b'),
      completedRow(packet.rows[0], 'doctor-c', { reviewer_role: 'adjudicator' }),
    ])).toThrow('adjudication requires a primary-reviewer binary disagreement')
  })

  it('reports AI triage separately and never counts it as a clinical reviewer', () => {
    const packet = createReviewPacket([candidate], {
      randomId: () => 'review-1',
      randomInt: () => 0,
    })
    const score = scoreContentAudit(packet.key, [
      completedRow(packet.rows[0], 'ai-auditor', { reviewer_role: 'ai-preliminary' }),
    ])

    expect(score.passed).toBe(false)
    expect(score.metrics.reviews).toBe(0)
    expect(score.preliminaryAiMetrics?.reviews).toBe(1)
    expect(score.preliminaryAiMetrics?.factAccuracy).toBe(1)
    expect(score.insufficientReviewIds).toEqual(['review-1'])
    expect(createContentAuditReport(score, '2026-08-07T00:00:00.000Z'))
      .toContain('AI preliminary triage (not release evidence)')
  })
})
