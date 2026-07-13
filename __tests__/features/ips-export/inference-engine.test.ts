import {
  buildEvidenceDigest,
  buildInferencePrompt,
  runProblemInference,
  hasPrimaryEvidence,
  type EvidenceDigest,
} from '@/features/ips-export/utils/inference-engine'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeData(partial: Partial<ClinicalDataCollection> = {}): ClinicalDataCollection {
  return {
    conditions: [],
    medications: [],
    allergies: [],
    observations: [],
    vitalSigns: [],
    diagnosticReports: [],
    imagingStudies: [],
    procedures: [],
    encounters: [],
    documentReferences: [],
    compositions: [],
    immunizations: [],
    consents: [],
    devices: [],
    carePlans: [],
    ...partial,
  }
}

/** Encode a (possibly Chinese) string to UTF-8 base64 the way the bridge does. */
function b64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin)
}

// ── buildEvidenceDigest ──────────────────────────────────────────────────────

describe('buildEvidenceDigest — encounter ICDs', () => {
  it('groups by normalized ICD with count + recency + richest label', () => {
    const data = makeData({
      encounters: [
        {
          id: 'e1',
          period: { start: '2025-01-10' },
          reasonCode: [{ text: 'E11.9 第二型糖尿病', coding: [{ code: 'E119' }] }],
        },
        {
          id: 'e2',
          period: { start: '2025-03-20' },
          reasonCode: [{ coding: [{ code: 'E11.9' }] }],
        },
        {
          id: 'e3',
          period: { start: '2025-02-01' },
          reasonCode: [{ text: 'I10 原發性高血壓', coding: [{ code: 'I10' }] }],
        },
      ],
    })
    const digest = buildEvidenceDigest(data)
    // E11.9 appears twice → sorted first by count.
    expect(digest.encounterIcds[0].icd10).toBe('E11.9')
    expect(digest.encounterIcds[0].count).toBe(2)
    expect(digest.encounterIcds[0].lastDate).toBe('2025-03-20')
    expect(digest.encounterIcds[0].textZh).toBe('E11.9 第二型糖尿病')
    expect(digest.encounterIcds[0].encounterIds).toEqual(['e1', 'e2'])
    expect(digest.encounterIcds[1].icd10).toBe('I10')
  })

  it('ignores reasonCodes with no usable code', () => {
    const data = makeData({
      encounters: [{ id: 'e1', reasonCode: [{ text: 'no code', coding: [{ display: 'X' }] }] }],
    })
    expect(buildEvidenceDigest(data).encounterIcds).toHaveLength(0)
  })
})

describe('buildEvidenceDigest — chronic meds', () => {
  it('keeps only chronic (continuous) meds and dedups by name', () => {
    const data = makeData({
      medications: [
        {
          id: 'm1',
          medicationCodeableConcept: { text: 'Metformin' },
          courseOfTherapyType: { coding: [{ code: 'continuous' }] },
          category: [{ text: '降血糖藥', coding: [{ display: 'ANTIDIABETICS' }] }],
        },
        {
          id: 'm2',
          medicationCodeableConcept: { text: 'Metformin' },
          courseOfTherapyType: { coding: [{ code: 'continuous' }] },
        },
        {
          id: 'm3',
          medicationCodeableConcept: { text: 'Amoxicillin' },
          // acute — no courseOfTherapyType
        },
      ],
    })
    const digest = buildEvidenceDigest(data)
    expect(digest.chronicMeds).toHaveLength(1)
    expect(digest.chronicMeds[0].name).toBe('Metformin')
    expect(digest.chronicMeds[0].classEn).toBe('ANTIDIABETICS')
    expect(digest.chronicMeds[0].classZh).toBe('降血糖藥')
  })
})

describe('buildEvidenceDigest — discharge excerpts', () => {
  it('decodes + strips HTML from a LOINC 18842-5 document', () => {
    const data = makeData({
      documentReferences: [
        {
          id: 'd1',
          date: '2025-04-01',
          type: { coding: [{ code: '18842-5', display: 'Discharge summary' }] },
          content: [{ attachment: { contentType: 'text/html', data: b64('<p>出院診斷：慢性腎臟病 第三期</p>') } }],
        },
      ],
    })
    const digest = buildEvidenceDigest(data)
    expect(digest.dischargeExcerpts).toHaveLength(1)
    expect(digest.dischargeExcerpts[0].text).toContain('出院診斷：慢性腎臟病 第三期')
    expect(digest.dischargeExcerpts[0].kind).toBe('discharge-excerpt')
    expect(digest.dischargeExcerpts[0].truncated).toBe(false)
  })

  it('head/tail truncates an over-long narrative', () => {
    const long = 'HEAD_' + 'x'.repeat(500) + '_TAIL'
    const data = makeData({
      documentReferences: [
        {
          id: 'd1',
          type: { coding: [{ code: '18842-5' }] },
          content: [{ attachment: { data: b64(long) } }],
        },
      ],
    })
    const digest = buildEvidenceDigest(data, new Date(), 100)
    const ex = digest.dischargeExcerpts[0]
    expect(ex.truncated).toBe(true)
    expect(ex.text.length).toBeLessThan(long.length)
    expect(ex.text).toContain('HEAD_')
    expect(ex.text).toContain('_TAIL')
    expect(ex.text).toContain('…')
  })

  it('skips non-discharge documents', () => {
    const data = makeData({
      documentReferences: [
        {
          id: 'd1',
          type: { coding: [{ code: '11502-2', display: 'Lab report' }] },
          content: [{ attachment: { data: b64('<p>not a discharge</p>') } }],
        },
      ],
    })
    expect(buildEvidenceDigest(data).dischargeExcerpts).toHaveLength(0)
  })

  it('folds composition section narratives', () => {
    const data = makeData({
      compositions: [
        {
          id: 'c1',
          date: '2025-05-01',
          section: [
            { title: 'Diagnosis', text: { div: '<div>Heart failure NYHA II</div>' } },
            { title: 'Plan', text: { div: '<div>Continue carvedilol</div>' } },
          ],
        },
      ],
    })
    const digest = buildEvidenceDigest(data)
    const comp = digest.dischargeExcerpts.find((d) => d.kind === 'composition')
    expect(comp?.text).toContain('Heart failure NYHA II')
    expect(comp?.text).toContain('Continue carvedilol')
  })
})

describe('buildEvidenceDigest — abnormal labs', () => {
  it('keeps abnormal-by-interpretation and abnormal-by-range, drops normal', () => {
    const data = makeData({
      observations: [
        {
          id: 'o1',
          code: { text: 'HbA1c' },
          valueQuantity: { value: 9.2, unit: '%' },
          interpretation: { coding: [{ code: 'H' }] },
          effectiveDateTime: '2025-03-01',
        },
        {
          id: 'o2',
          code: { text: 'Creatinine' },
          valueQuantity: { value: 3.1, unit: 'mg/dL' },
          referenceRange: [{ low: { value: 0.6 }, high: { value: 1.3 } }],
          effectiveDateTime: '2025-02-01',
        },
        {
          id: 'o3',
          code: { text: 'Sodium' },
          valueQuantity: { value: 140, unit: 'mmol/L' },
          referenceRange: [{ low: { value: 135 }, high: { value: 145 } }],
          interpretation: { coding: [{ code: 'N' }] },
        },
      ],
    })
    const digest = buildEvidenceDigest(data)
    const names = digest.abnormalLabs.map((l) => l.name)
    expect(names).toContain('HbA1c')
    expect(names).toContain('Creatinine')
    expect(names).not.toContain('Sodium')
    // most recent first
    expect(digest.abnormalLabs[0].name).toBe('HbA1c')
  })

  it('scans diagnostic-report members and dedups by id', () => {
    const shared = {
      id: 'o1',
      code: { text: 'ALT' },
      valueQuantity: { value: 200, unit: 'U/L' },
      interpretation: { coding: [{ code: 'HH' }] },
    }
    const data = makeData({
      observations: [shared],
      diagnosticReports: [{ id: 'r1', _observations: [shared] }],
    })
    expect(buildEvidenceDigest(data).abnormalLabs).toHaveLength(1)
  })
})

describe('hasPrimaryEvidence', () => {
  const empty: EvidenceDigest = {
    encounterIcds: [],
    chronicMeds: [],
    dischargeExcerpts: [],
    abnormalLabs: [],
  }
  it('is false when only abnormal labs exist', () => {
    expect(hasPrimaryEvidence({ ...empty, abnormalLabs: [{ name: 'X', value: '1', obsId: 'o1' }] })).toBe(false)
  })
  it('is true with at least one primary source', () => {
    expect(hasPrimaryEvidence({ ...empty, chronicMeds: [{ name: 'Metformin', medId: 'm1' }] })).toBe(true)
  })
})

// ── runProblemInference (end-to-end with a mock LLM) ─────────────────────────

describe('runProblemInference', () => {
  const data = makeData({
    encounters: [
      { id: 'e1', period: { start: '2025-01-01' }, reasonCode: [{ coding: [{ code: 'E11.9' }] }] },
    ],
  })

  it('returns text-only problems (no coding) from the mock LLM output', async () => {
    const llm = jest.fn(async () =>
      JSON.stringify({
        problems: [
          { labelZh: '第二型糖尿病', labelEn: 'Type 2 diabetes', inferenceConfidence: 'high' },
        ],
      }),
    )
    const out = await runProblemInference({ data, llm })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('inferred-0')
    expect(out[0].labelEn).toBe('Type 2 diabetes')
    // The problem list carries no diagnosis codes.
    expect(out[0]).not.toHaveProperty('coding')
    expect(out[0]).not.toHaveProperty('strategy')
  })

  it('dedups two candidates with the same normalized label', async () => {
    const llm = jest.fn(async () =>
      JSON.stringify({
        problems: [
          { labelEn: 'Type 2 diabetes', inferenceConfidence: 'high' },
          { labelEn: 'Type 2 diabetes', inferenceConfidence: 'medium' },
        ],
      }),
    )
    const out = await runProblemInference({ data, llm })
    expect(out).toHaveLength(1)
  })

  it('returns [] and does NOT call the LLM when there is no primary evidence', async () => {
    const llm = jest.fn(async () => '{"problems":[]}')
    const out = await runProblemInference({ data: makeData(), llm })
    expect(out).toEqual([])
    expect(llm).not.toHaveBeenCalled()
  })

  it('returns [] when the LLM call throws', async () => {
    const llm = jest.fn(async () => {
      throw new Error('network')
    })
    expect(await runProblemInference({ data, llm })).toEqual([])
  })

  it('returns [] when the LLM returns garbage', async () => {
    const llm = jest.fn(async () => 'I cannot help with that')
    expect(await runProblemInference({ data, llm })).toEqual([])
  })
})

// ── buildInferencePrompt ─────────────────────────────────────────────────────

describe('buildInferencePrompt', () => {
  it('embeds the digest and instructs a text-only (no-code) problem list', () => {
    const digest = buildEvidenceDigest(
      makeData({
        encounters: [{ id: 'e1', reasonCode: [{ coding: [{ code: 'E11.9' }] }] }],
        medications: [
          {
            id: 'm1',
            medicationCodeableConcept: { text: 'Metformin' },
            courseOfTherapyType: { coding: [{ code: 'continuous' }] },
          },
        ],
      }),
    )
    const [system, user] = buildInferencePrompt(digest)
    expect(system.role).toBe('system')
    expect(user.role).toBe('user')
    // digest present
    expect(user.content).toContain('E11.9')
    expect(user.content).toContain('Metformin')
    // NO SNOMED allowlist / coding machinery
    expect(user.content).not.toContain('44054006')
    expect(user.content.toLowerCase()).not.toContain('allowlist')
    expect(user.content.toLowerCase()).not.toContain('suggestedsnomed')
    // system prompt asks for names only, no codes
    expect(system.content.toLowerCase()).not.toContain('snomed ct concept')
    expect(system.content.toLowerCase()).toContain('text-only')
  })
})
