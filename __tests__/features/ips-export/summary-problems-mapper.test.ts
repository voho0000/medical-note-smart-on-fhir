// IPS Path A (帶入醫療摘要) — mapping the Medical Summary's problem list into
// text-only IPS candidates.
//
// Safety locks:
//  - evidence mapping is deterministic and tolerant (bad keys / unknown
//    resource types are skipped, never throw);
//  - the confidence heuristic never exceeds 'medium';
//  - candidates are text-only — the mapper never generates any diagnosis code.

import type { SummaryProblem } from '@/src/core/entities/medical-summary.entity'
import {
  mapSummaryProblemsToIpsCandidates,
  type SummarySourceLookupEntry,
} from '@/features/ips-export/utils/summary-problems-mapper'

const SOURCES: SummarySourceLookupEntry[] = [
  { key: 'E1', resourceType: 'Encounter', resourceId: 'enc-1', display: '門診（E11.9 第二型糖尿病）', date: '2025-01-01' },
  { key: 'C1', resourceType: 'Condition', resourceId: 'cond-1', display: '慢性腎臟病', date: '2024-11-02' },
  { key: 'L1', resourceType: 'DiagnosticReport', resourceId: 'rep-1', display: 'HbA1c', date: '2025-02-01' },
  { key: 'M1', resourceType: 'MedicationRequest', resourceId: 'med-1', display: 'Metformin', date: '2025-01-15' },
  { key: 'M2', resourceType: 'MedicationDispense', resourceId: 'med-2', display: 'Forxiga', date: '2025-01-20' },
  { key: 'D1', resourceType: 'DocumentReference', resourceId: 'doc-1', display: '出院病摘', date: '2024-12-01' },
  { key: 'D2', resourceType: 'Composition', resourceId: 'comp-1', display: '臨床紀錄', date: '2024-12-05' },
  { key: 'K1', resourceType: 'CarePlan', resourceId: 'cp-1', display: '糖尿病照護計畫', date: '2024-10-01' },
  { key: 'P1', resourceType: 'Procedure', resourceId: 'proc-1', display: '手術', date: '2024-09-01' },
  // Unverified ref shape (cached sourceIndex row whose key didn't resolve).
  { key: 'X9' },
]

const problem = (over: Partial<SummaryProblem>): SummaryProblem => ({
  label: '第二型糖尿病',
  kind: 'diagnosis',
  sourceKeys: [],
  ...over,
})

describe('mapSummaryProblemsToIpsCandidates — evidence mapping', () => {
  it('maps resource types to IPS evidence kinds and carries id/date/display', () => {
    const [c] = mapSummaryProblemsToIpsCandidates(
      [problem({ sourceKeys: ['E1', 'L1', 'M1', 'M2', 'D1', 'D2', 'K1'] })],
      SOURCES,
    )
    expect(c.evidence.map((e) => e.kind)).toEqual([
      'encounter-icd', // Encounter
      'lab', // DiagnosticReport
      'medication', // MedicationRequest
      'medication', // MedicationDispense (Medication* prefix)
      'discharge-excerpt', // DocumentReference
      'composition', // Composition
      'composition', // CarePlan
    ])
    expect(c.evidence[0]).toMatchObject({
      label: '門診（E11.9 第二型糖尿病）',
      sourceId: 'enc-1',
      date: '2025-01-01',
    })
  })

  it('tolerates unknown keys, unresolved refs and unmapped resource types', () => {
    const [c] = mapSummaryProblemsToIpsCandidates(
      [problem({ sourceKeys: ['NOPE', 'X9', 'P1', 'L1'] })],
      SOURCES,
    )
    // NOPE (not in sources), X9 (no resourceType) and P1 (Procedure — unmapped)
    // are skipped; the problem itself survives with the remaining evidence.
    expect(c.evidence).toHaveLength(1)
    expect(c.evidence[0].kind).toBe('lab')
  })

  it('marks candidates as summary-origin, text-only, with basis as rationale', () => {
    const [c] = mapSummaryProblemsToIpsCandidates(
      [problem({ basis: '5 次檢驗異常', sourceKeys: ['L1'] })],
      SOURCES,
    )
    expect(c.origin).toBe('summary')
    // Candidates carry no diagnosis code fields at all.
    expect(c).not.toHaveProperty('coding')
    expect(c).not.toHaveProperty('strategy')
    expect(c).not.toHaveProperty('needsManualCoding')
    expect(c.rationale).toBe('5 次檢驗異常')
    expect(c.id).toBe('summary-0')
  })

  it('drops problems with an empty label but keeps the rest', () => {
    const out = mapSummaryProblemsToIpsCandidates(
      [problem({ label: '  ' }), problem({ label: '高血壓' })],
      SOURCES,
    )
    expect(out).toHaveLength(1)
    expect(out[0].labelZh).toBe('高血壓')
  })
})

describe('mapSummaryProblemsToIpsCandidates — confidence heuristic', () => {
  it('is medium with coded Encounter evidence', () => {
    const [c] = mapSummaryProblemsToIpsCandidates([problem({ sourceKeys: ['E1'] })], SOURCES)
    expect(c.inferenceConfidence).toBe('medium')
  })

  it('is medium with coded Condition evidence', () => {
    const [c] = mapSummaryProblemsToIpsCandidates([problem({ sourceKeys: ['C1'] })], SOURCES)
    expect(c.inferenceConfidence).toBe('medium')
  })

  it('is low with only lab/medication/document evidence', () => {
    const [c] = mapSummaryProblemsToIpsCandidates(
      [problem({ sourceKeys: ['L1', 'M1', 'D1'] })],
      SOURCES,
    )
    expect(c.inferenceConfidence).toBe('low')
  })

  it('is low with no resolvable evidence at all', () => {
    const [c] = mapSummaryProblemsToIpsCandidates([problem({ sourceKeys: ['NOPE'] })], SOURCES)
    expect(c.inferenceConfidence).toBe('low')
  })
})

describe('mapSummaryProblemsToIpsCandidates — label language split', () => {
  it('keeps a CJK label on labelZh', () => {
    const [c] = mapSummaryProblemsToIpsCandidates([problem({ label: '第二型糖尿病' })], SOURCES)
    expect(c.labelZh).toBe('第二型糖尿病')
    expect(c.labelEn).toBe('')
  })

  it('keeps an English label on labelEn', () => {
    const [c] = mapSummaryProblemsToIpsCandidates([problem({ label: 'Type 2 diabetes' })], SOURCES)
    expect(c.labelZh).toBe('')
    expect(c.labelEn).toBe('Type 2 diabetes')
  })
})
