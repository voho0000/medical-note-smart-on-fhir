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

let mockPatientId: string | null = 'pat-1'

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
          period: { start: '2025-01-01' },
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
  useAllApiKeys: () => ({ apiKey: 'test-key', geminiKey: null, perplexityKey: null }),
}))

describe('right-panel registry — ips-export tab persistence', () => {
  it('force-mounts the ips-export tab so inference state survives tab switches', () => {
    expect(getRightPanelFeatureById('ips-export')?.forceMount).toBe(true)
  })
})

describe('useInferredProblems — patient-scoped state', () => {
  beforeEach(() => {
    mockPatientId = 'pat-1'
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
