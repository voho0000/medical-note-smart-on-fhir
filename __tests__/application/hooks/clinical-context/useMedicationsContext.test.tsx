import { renderHook, waitFor } from '@testing-library/react'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useMedicationsContext } from '@/src/application/hooks/clinical-context/useMedicationsContext'

jest.mock('@/src/shared/hooks/use-now.hook', () => ({
  useNow: () => new Date('2026-07-10T00:00:00Z').getTime(),
}))

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>
    <AudienceProvider>{children}</AudienceProvider>
  </LanguageProvider>
)

function pastMedication(index: number) {
  return {
    id: `past-med-${index}`,
    status: 'completed',
    authoredOn: `2025-0${index}-01T00:00:00Z`,
    medicationCodeableConcept: { text: `Past Drug ${index}` },
    dispenseRequest: {
      expectedSupplyDuration: { value: 30, unit: 'days' },
    },
  }
}

describe('useMedicationsContext full export', () => {
  it('uses English coding.display for AI context even in patient audience mode', async () => {
    localStorage.setItem('medical-note-audience', 'patient')
    const clinicalData = {
      medications: [{
        id: 'forxiga',
        status: 'active',
        authoredOn: '2026-07-01',
        medicationCodeableConcept: {
          text: '福適佳膜衣錠10毫克',
          coding: [{ display: 'Forxiga Film-coated Tablets 10mg' }],
        },
      }],
    }

    const { result } = renderHook(
      () => useMedicationsContext(true, clinicalData as any, {
        medicationTimeRange: 'all',
        medicationChronic: 'all',
        medicationStatus: 'all',
      } as any),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      const context = result.current?.items.join('\n') ?? ''
      expect(context).toContain('Forxiga Film-coated Tablets 10mg')
      expect(context).not.toContain('福適佳膜衣錠10毫克')
    })
    localStorage.removeItem('medical-note-audience')
  })

  it('lists past medications instead of replacing them with an omitted count', () => {
    const clinicalData = {
      medications: [pastMedication(1), pastMedication(2), pastMedication(3)],
    }

    const { result } = renderHook(
      () => useMedicationsContext(true, clinicalData as any, {
        medicationTimeRange: 'all',
        medicationChronic: 'all',
        medicationStatus: 'all',
      } as any),
      { wrapper: Wrapper },
    )

    const items = result.current?.items ?? []
    const medicationRows = items.filter((item) => item.startsWith('  • Past Drug'))

    expect(items[0]).toBe('Past medications (older than 90 days, 3):')
    expect(medicationRows).toHaveLength(3)
    expect(items.some((item) => item.includes('omitted for brevity'))).toBe(false)
  })

  it('never promotes draft, on-hold, or entered-in-error records to current medication', () => {
    const clinicalData = {
      medications: [
        { id: 'draft', status: 'draft', authoredOn: '2026-07-01', medicationCodeableConcept: { text: 'Draft Drug' } },
        { id: 'hold', status: 'on-hold', authoredOn: '2026-07-01', medicationCodeableConcept: { text: 'Held Drug' } },
        { id: 'error', status: 'entered-in-error', authoredOn: '2026-07-01', medicationCodeableConcept: { text: 'Invalid Drug' } },
      ],
    }
    const all = renderHook(
      () => useMedicationsContext(true, clinicalData as any, {
        medicationTimeRange: 'all',
        medicationChronic: 'all',
        medicationStatus: 'all',
      } as any),
      { wrapper: Wrapper },
    )

    expect(all.result.current?.items).toContain('Other medication records — not active (3):')
    expect(all.result.current?.items.join('\n')).toContain('INVALIDATED—do not treat as a medication')
    expect(all.result.current?.items.join('\n')).toContain('ON HOLD—not currently in use')
    expect(all.result.current?.items.some((item) => item.startsWith('Currently in use'))).toBe(false)

    const activeOnly = renderHook(
      () => useMedicationsContext(true, clinicalData as any, {
        medicationTimeRange: 'all',
        medicationChronic: 'all',
        medicationStatus: 'active',
      } as any),
      { wrapper: Wrapper },
    )
    expect(activeOnly.result.current).toBeNull()
  })
})
