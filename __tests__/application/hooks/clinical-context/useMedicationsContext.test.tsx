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

  it('pairs each medication with only its own exact NHI terminology', () => {
    const clinicalData = {
      medications: [{
        id: 'betmiga',
        status: 'active',
        authoredOn: '2026-07-01',
        medicationCodeableConcept: {
          text: '貝坦利持續性藥效錠50毫克',
          coding: [{
            system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
            code: 'BC26216100',
            display: 'Betmiga Prolonged-release Tablets 50mg',
          }],
        },
        drugTerminology: {
          source: 'nhi-official-drug-master',
          snapshotId: 'nhi-drug-terminology-20260728',
          officialNameZh: '貝坦利持續性藥效錠50毫克',
          officialNameEn: 'Betmiga Prolonged-release Tablets 50mg',
          ingredientText: 'Mirabegron 50 MG',
          doseForm: '持續性藥效錠',
          atcCode: 'G04BD12',
          atcNameEn: 'mirabegron',
          atcLevel2Code: 'G04',
          atcLevel2NameZh: '泌尿系統用藥',
          atcLevel2NameEn: 'UROLOGICALS',
        },
      }, {
        id: 'betmiga-refill',
        status: 'active',
        authoredOn: '2026-06-01',
        medicationCodeableConcept: {
          text: '貝坦利持續性藥效錠50毫克',
          coding: [{
            system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
            code: 'BC26216100',
            display: 'Betmiga Prolonged-release Tablets 50mg',
          }],
        },
        drugTerminology: {
          source: 'nhi-official-drug-master',
          snapshotId: 'nhi-drug-terminology-20260728',
          officialNameZh: '貝坦利持續性藥效錠50毫克',
          officialNameEn: 'Betmiga Prolonged-release Tablets 50mg',
          ingredientText: 'Mirabegron 50 MG',
          doseForm: '持續性藥效錠',
          atcCode: 'G04BD12',
          atcNameEn: 'mirabegron',
          atcLevel2Code: 'G04',
          atcLevel2NameZh: '泌尿系統用藥',
          atcLevel2NameEn: 'UROLOGICALS',
        },
      }, {
        id: 'other-drug',
        status: 'active',
        authoredOn: '2026-07-02',
        medicationCodeableConcept: {
          coding: [{
            system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-drug-code',
            code: 'B000000100',
            display: 'Drug B 10mg',
          }],
        },
        drugTerminology: {
          source: 'nhi-official-drug-master',
          snapshotId: 'nhi-drug-terminology-20260728',
          ingredientText: 'INGREDIENT B 10 MG',
          atcCode: 'A01AA01',
          atcNameEn: 'ingredient-b',
          atcLevel2Code: 'A01',
          atcLevel2NameEn: 'STOMATOLOGICAL PREPARATIONS',
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

    const betmiga = result.current?.items.find((item) =>
      item.includes('Betmiga Prolonged-release Tablets 50mg'),
    ) ?? ''
    const other = result.current?.items.find((item) =>
      item.includes('Drug B 10mg'),
    ) ?? ''

    expect(betmiga).toContain('[NHI term T1]')
    expect(betmiga).toContain('(2 refills)')
    expect(betmiga).not.toContain('Records:')
    expect(other).toContain('[NHI term T2]')

    const terminologyLines = result.current?.items.filter((item) => /^  T\d+ — /.test(item)) ?? []
    const betmigaTerminology = terminologyLines.find((item) => item.startsWith('  T1 —')) ?? ''
    const otherTerminology = terminologyLines.find((item) => item.startsWith('  T2 —')) ?? ''
    expect(betmigaTerminology).toContain('NHI code=BC26216100')
    expect(betmigaTerminology).toContain('ingredient/strength=Mirabegron 50 MG')
    expect(betmigaTerminology).toContain('official product zh=貝坦利持續性藥效錠50毫克')
    expect(betmigaTerminology).toContain('dose form=持續性藥效錠')
    expect(betmigaTerminology).toContain('ATC=G04BD12 · mirabegron')
    expect(betmigaTerminology).toContain('ATC therapeutic subgroup=G04 · UROLOGICALS / 泌尿系統用藥')
    expect(betmigaTerminology).not.toContain('INGREDIENT B')
    expect(otherTerminology).toContain('ingredient/strength=INGREDIENT B 10 MG')
    expect(otherTerminology).not.toContain('Mirabegron')

    const completeContext = result.current?.items.join('\n') ?? ''
    expect(completeContext.match(/ingredient\/strength=Mirabegron 50 MG/g)).toHaveLength(1)
    expect(completeContext).toContain(
      'each T key applies only to medication rows marked with that same NHI term key',
    )
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

    expect(items[0]).toBe('Currently evidenced: none.')
    expect(items).toContain('Past medications (older than 90 days, 3):')
    expect(medicationRows).toHaveLength(3)
    expect(items.some((item) => item.includes('omitted for brevity'))).toBe(false)
  })

  it('suppresses unknown status noise in the authoritative medication list', () => {
    const clinicalData = {
      medications: [{
        id: 'unknown-status',
        status: 'unknown',
        authoredOn: '2026-07-01',
        medicationCodeableConcept: { text: 'AROMASIN 25MG' },
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
    const context = result.current?.items.join('\n') ?? ''

    expect(context).toContain('AROMASIN 25MG')
    expect(context).not.toContain('[status: unknown]')
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

    expect(all.result.current?.items).toContain('Other medication records (3):')
    expect(all.result.current?.items.join('\n')).not.toContain('INVALIDATED')
    expect(all.result.current?.items.join('\n')).not.toContain('ON HOLD')
    expect(all.result.current?.items.join('\n')).not.toContain('[status:')
    expect(all.result.current?.items).toContain('Currently evidenced: none.')

    const activeOnly = renderHook(
      () => useMedicationsContext(true, clinicalData as any, {
        medicationTimeRange: 'all',
        medicationChronic: 'all',
        medicationStatus: 'active',
      } as any),
      { wrapper: Wrapper },
    )
    expect(activeOnly.result.current?.items).toContain('Currently evidenced: none.')
  })

  it('uses the shared reference date to keep ended claims out of current medicines', () => {
    const clinicalData = {
      medications: [{
        id: 'ended-aromasin',
        status: 'completed',
        authoredOn: '2026-07-01',
        medicationCodeableConcept: { text: 'AROMASIN 25MG' },
        dispenseRequest: { expectedSupplyDuration: { value: 28, unit: 'days' } },
      }],
    }

    const { result } = renderHook(
      () => useMedicationsContext(true, clinicalData as any, {
        medicationTimeRange: 'all',
        medicationChronic: 'all',
        medicationStatus: 'all',
      } as any, false, Date.parse('2026-09-03T12:00:00+08:00')),
      { wrapper: Wrapper },
    )

    expect(result.current?.items).toContain('Currently evidenced: none.')
    expect(result.current?.items).toContain('Recently ended (last 90 days, 1):')
    expect(result.current?.items.join('\n')).toContain('last ended 2026-07-29')
  })
})
