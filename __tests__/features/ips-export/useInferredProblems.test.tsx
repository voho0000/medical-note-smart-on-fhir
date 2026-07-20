// Regression locks for the "IPS tab switch wipes AI suggestions" bug.
//
// The right panel unmounts inactive Radix tabs, so the fix is two-sided:
//  1. the ips-export tab is force-mounted (registry) so the hook's state
//     survives tab switches, and
//  2. because unmount no longer acts as an implicit reset, useInferredProblems
//     must drop its suggestions itself when the loaded PATIENT changes —
//     otherwise confirmed AI problems from one patient could merge into the
//     next imported patient's export.

import { act, renderHook } from '@testing-library/react'
import { useInferredProblems } from '@/features/ips-export/hooks/useInferredProblems'
import { getRightPanelFeatureById } from '@/src/shared/config/right-panel-registry'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'

let mockPatientId: string | null = 'pat-1'

// Path A seam — null keeps every legacy test on the pure-inference path.
let mockSummaryResult: MedicalSummaryResult | null = null

jest.mock('@/src/application/hooks/medical-summary/medical-summary-peek', () => ({
  useMedicalSummaryPeek: () => mockSummaryResult,
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: { ipsExport: { inferredProblems: { summaryImported: '已帶入（{count} 項）' } } },
  }),
}))

jest.mock('sonner', () => ({ toast: { success: jest.fn(), info: jest.fn(), warning: jest.fn(), error: jest.fn() } }))

jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatientQuery: () => ({
    data: mockPatientId ? { id: mockPatientId, resourceType: 'Patient' } : null,
  }),
}))

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalDataQuery: () => ({
    data: {
      conditions: [],
      medications: [],
      allergies: [],
      observations: [],
      vitalSigns: [],
      diagnosticReports: [],
      procedures: [],
      encounters: [
        {
          id: 'enc-1',
          reasonCode: [
            { text: 'E11.9 第二型糖尿病', coding: [{ code: 'E11.9' }] },
          ],
          // Recent visit so the deterministic 6-month ICD import has something.
          period: { start: new Date().toISOString() },
        },
      ],
      documentReferences: [],
      compositions: [],
      immunizations: [],
      consents: [],
      devices: [],
      carePlans: [],
    },
  }),
}))

const CANNED_LLM_RESPONSE = JSON.stringify({
  problems: [
    {
      labelZh: '第二型糖尿病',
      labelEn: 'Type 2 diabetes',
      inferenceConfidence: 'high',
      evidenceIcd10: 'E11.9',
      suggestedSnomed: null,
      supportingEvidence: [{ kind: 'encounter-icd', label: 'E11.9', icd10: 'E11.9' }],
      rationale: 'Recurrent outpatient E11.9.',
    },
  ],
})

jest.mock('@/src/application/hooks/ai/use-unified-ai.hook', () => ({
  useUnifiedAi: () => ({ query: async () => CANNED_LLM_RESPONSE }),
}))

jest.mock('@/src/application/stores/ai-config.store', () => ({
  useAllApiKeys: () => ({
    apiKey: 'test-key',
    geminiKey: null,
    perplexityKey: null,
    openAiCompatibleProfiles: [],
  }),
}))

describe('right-panel registry — ips-export tab persistence', () => {
  it('force-mounts the ips-export tab so inference state survives tab switches', () => {
    expect(getRightPanelFeatureById('ips-export')?.forceMount).toBe(true)
  })
})

describe('useInferredProblems — patient-scoped state', () => {
  beforeEach(() => {
    mockPatientId = 'pat-1'
    mockSummaryResult = null
  })

  it('keeps suggestions + confirmations across re-renders for the SAME patient', async () => {
    const { result, rerender } = renderHook(() => useInferredProblems())

    await act(async () => {
      await result.current.run()
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.problems).toHaveLength(1)

    act(() => {
      result.current.toggleConfirm(result.current.problems[0].id)
    })
    expect(result.current.confirmedCount).toBe(1)

    rerender()
    expect(result.current.status).toBe('ready')
    expect(result.current.problems).toHaveLength(1)
    expect(result.current.confirmedCount).toBe(1)
  })

  it('resets to idle when the loaded patient changes (no cross-patient leakage)', async () => {
    const { result, rerender } = renderHook(() => useInferredProblems())

    await act(async () => {
      await result.current.run()
    })
    act(() => {
      result.current.toggleConfirm(result.current.problems[0].id)
    })
    expect(result.current.confirmedCount).toBe(1)

    mockPatientId = 'pat-2'
    rerender()

    expect(result.current.status).toBe('idle')
    expect(result.current.problems).toEqual([])
    expect(result.current.confirmedCount).toBe(0)
    expect(result.current.confirmed).toEqual([])
  })

  it('resets when the patient is cleared (data deleted)', async () => {
    const { result, rerender } = renderHook(() => useInferredProblems())

    await act(async () => {
      await result.current.run()
    })
    expect(result.current.status).toBe('ready')

    mockPatientId = null
    rerender()

    expect(result.current.status).toBe('idle')
    expect(result.current.problems).toEqual([])
  })
})

describe('useInferredProblems — deterministic visit-ICD import (no AI)', () => {
  beforeEach(() => {
    mockPatientId = 'pat-1'
    mockSummaryResult = null
  })

  it('exposes the recent visit-ICD count for the (non-AI) import button', () => {
    const { result } = renderHook(() => useInferredProblems())
    expect(result.current.encounterIcdCount).toBe(1)
  })

  it('imports visit ICDs as candidates that default UNCHECKED (review gate intact)', () => {
    const { result } = renderHook(() => useInferredProblems())

    act(() => {
      result.current.importEncounterIcds()
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.problems).toHaveLength(1)
    expect(result.current.problems[0].origin).toBe('encounter-icd')
    expect(result.current.problems[0].sourceCoding?.code).toBe('E11.9')
    // Nothing pre-confirmed — the human-review gate still applies.
    expect(result.current.confirmedCount).toBe(0)
    expect(result.current.confirmed).toEqual([])
  })

  it('removeEncounterIcds withdraws ICD rows + their checks, back to idle when empty', () => {
    const { result } = renderHook(() => useInferredProblems())
    act(() => result.current.importEncounterIcds())
    act(() => result.current.toggleConfirm(result.current.problems[0].id))
    expect(result.current.confirmedCount).toBe(1)

    act(() => result.current.removeEncounterIcds())
    expect(result.current.problems).toHaveLength(0)
    expect(result.current.confirmedCount).toBe(0)
    expect(result.current.status).toBe('idle')
  })

  it('setAllConfirmed bulk-checks then clears every candidate', () => {
    const { result } = renderHook(() => useInferredProblems())
    act(() => result.current.importEncounterIcds())
    const total = result.current.problems.length
    expect(total).toBeGreaterThan(0)

    act(() => result.current.setAllConfirmed(true))
    expect(result.current.confirmedCount).toBe(total)
    expect(result.current.confirmed).toHaveLength(total)

    act(() => result.current.setAllConfirmed(false))
    expect(result.current.confirmedCount).toBe(0)
  })
})

describe('useInferredProblems — Path A (帶入醫療摘要)', () => {
  beforeEach(() => {
    mockPatientId = 'pat-1'
    mockSummaryResult = {
      problems: [
        {
          label: '第二型糖尿病',
          basis: '6 次就診申報',
          kind: 'diagnosis',
          sourceKeys: ['E1'],
        },
        {
          label: '慢性腎臟病',
          basis: '5 次檢驗異常',
          kind: 'lab',
          sourceKeys: ['L1'],
        },
      ],
      sourceIndex: [
        {
          key: 'E1',
          num: 1,
          verified: true,
          resourceType: 'Encounter',
          resourceId: 'enc-1',
          display: '門診（E11.9）',
          date: '2025-01-01',
        },
        {
          key: 'L1',
          num: 2,
          verified: true,
          resourceType: 'DiagnosticReport',
          resourceId: 'rep-1',
          display: 'eGFR',
          date: '2025-02-01',
        },
      ],
    } as unknown as MedicalSummaryResult
  })

  afterEach(() => {
    mockSummaryResult = null
  })

  it('exposes the summary problem count for the two-state trigger button', () => {
    const { result } = renderHook(() => useInferredProblems())
    expect(result.current.summaryProblemCount).toBe(2)
  })

  it('run() imports summary problems as candidates — default UNCHECKED', async () => {
    const { result } = renderHook(() => useInferredProblems())

    await act(async () => {
      await result.current.run()
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.problems).toHaveLength(2)
    expect(result.current.problems.every((p) => p.origin === 'summary')).toBe(true)
    // Nothing is pre-confirmed: the human-review gate still applies.
    expect(result.current.confirmedCount).toBe(0)
    expect(result.current.confirmed).toEqual([])

    // Evidence was reverse-resolved from the summary's own source index.
    expect(result.current.problems[0].evidence[0]).toMatchObject({
      kind: 'encounter-icd',
      sourceId: 'enc-1',
    })
    expect(result.current.problems[0].inferenceConfidence).toBe('medium')
    expect(result.current.problems[1].evidence[0]).toMatchObject({
      kind: 'lab',
      sourceId: 'rep-1',
    })
    expect(result.current.problems[1].inferenceConfidence).toBe('low')
  })

  it('confirming an imported candidate flows through the normal gate', async () => {
    const { result } = renderHook(() => useInferredProblems())

    await act(async () => {
      await result.current.run()
    })
    act(() => {
      result.current.toggleConfirm(result.current.problems[0].id)
    })
    expect(result.current.confirmedCount).toBe(1)
    expect(result.current.confirmed[0].origin).toBe('summary')
  })

  it('the two sources coexist: ICD import then summary run merge, and the ICD check survives', async () => {
    const { result } = renderHook(() => useInferredProblems())

    // 1. Import visit ICDs and check one.
    act(() => result.current.importEncounterIcds())
    const icdId = result.current.problems[0].id
    expect(icdId.startsWith('encounter-icd:')).toBe(true)
    act(() => result.current.toggleConfirm(icdId))
    expect(result.current.confirmedCount).toBe(1)

    // 2. Run the summary import — AI/summary rows lead, ICD rows survive.
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.problems).toHaveLength(3) // 2 summary + 1 ICD
    expect(result.current.problems[0].origin).toBe('summary')
    expect(result.current.problems[2].origin).toBe('encounter-icd')
    // The ICD confirmation survived the AI run; summary rows land unchecked.
    expect(result.current.confirmedCount).toBe(1)
    expect(result.current.confirmed[0].id).toBe(icdId)

    // 3. Re-importing ICDs replaces only the ICD rows (their checks reset),
    //    keeping the summary rows.
    act(() => result.current.importEncounterIcds())
    expect(result.current.problems).toHaveLength(3)
    expect(result.current.confirmedCount).toBe(0)

    // 4. Withdrawing the AI rows keeps only the ICD rows (status stays ready).
    act(() => result.current.removeAiProblems())
    expect(result.current.problems).toHaveLength(1)
    expect(result.current.problems[0].origin).toBe('encounter-icd')
    expect(result.current.status).toBe('ready')

    // 5. Withdrawing the ICDs too empties the list back to idle.
    act(() => result.current.removeEncounterIcds())
    expect(result.current.problems).toHaveLength(0)
    expect(result.current.status).toBe('idle')
  })
})
