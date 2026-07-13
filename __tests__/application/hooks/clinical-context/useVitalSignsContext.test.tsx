import { renderHook } from '@testing-library/react'
import { useVitalSignsContext } from '@/src/application/hooks/clinical-context/useVitalSignsContext'

describe('useVitalSignsContext record fidelity', () => {
  it('retains every missing-id measurement instead of deduplicating them all under undefined', () => {
    const clinicalData = {
      vitalSigns: [
        { code: { text: 'Heart rate' }, effectiveDateTime: '2026-07-01', valueQuantity: { value: 70, unit: '/min' }, status: 'final' },
        { code: { text: 'Heart rate' }, effectiveDateTime: '2026-07-02', valueQuantity: { value: 80, unit: '/min' }, status: 'final' },
      ],
    }
    const { result } = renderHook(() => useVitalSignsContext(true, clinicalData as any, {
      vitalSignsTimeRange: 'all',
      vitalSignsVersion: 'all',
    } as any))

    expect(result.current).toHaveLength(1)
    expect(result.current[0].items).toHaveLength(2)
    expect(result.current[0].items.join('\n')).toContain('70 /min')
    expect(result.current[0].items.join('\n')).toContain('80 /min')
  })

  it('does not emit entered-in-error vital signs', () => {
    const clinicalData = {
      vitalSigns: [{
        id: 'invalid',
        code: { text: 'Heart rate' },
        effectiveDateTime: '2026-07-01',
        valueQuantity: { value: 999, unit: '/min' },
        status: 'entered-in-error',
      }],
    }
    const { result } = renderHook(() => useVitalSignsContext(true, clinicalData as any, {
      vitalSignsTimeRange: 'all',
      vitalSignsVersion: 'all',
    } as any))

    expect(result.current[0]?.items).toEqual(['No vital signs found within the selected time range.'])
  })
})
