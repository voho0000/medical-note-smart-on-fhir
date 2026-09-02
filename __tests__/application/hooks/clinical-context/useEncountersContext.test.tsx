import { renderHook } from '@testing-library/react'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useEncountersContext } from '@/src/application/hooks/clinical-context/useEncountersContext'

jest.mock('@/src/shared/hooks/use-now.hook', () => ({
  useNow: () => new Date('2026-07-10T00:00:00Z').getTime(),
}))

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>
    <AudienceProvider>{children}</AudienceProvider>
  </LanguageProvider>
)

function activeMedication(index: number) {
  return {
    id: `med-${index}`,
    status: 'active',
    encounter: { reference: 'Encounter/enc-1' },
    authoredOn: '2026-07-01T00:00:00Z',
    medicationCodeableConcept: { text: `Drug ${String(index).padStart(2, '0')}` },
    dispenseRequest: {
      expectedSupplyDuration: { value: 30, unit: 'days' },
    },
  }
}

describe('useEncountersContext medication chronology', () => {
  it('uses the English medication coding display in the visit-linked row', () => {
    const medication = {
      ...activeMedication(1),
      medicationCodeableConcept: {
        text: '福適佳膜衣錠10毫克',
        coding: [{ display: 'Forxiga Film-coated Tablets 10mg' }],
      },
    }
    const clinicalData = {
      encounters: [{ id: 'enc-1', period: { start: '2026-07-01T00:00:00Z' } }],
      medications: [medication],
    }

    const { result } = renderHook(
      () => useEncountersContext(true, clinicalData as any, 'all'),
      { wrapper: Wrapper },
    )
    const context = result.current?.items.join('\n') ?? ''

    expect(context.match(/Forxiga Film-coated Tablets 10mg/g)).toHaveLength(1)
    expect(context).not.toContain('福適佳膜衣錠10毫克')
    expect(context).not.toContain('Currently active medication records')
  })

  it('does not repeat an unavailable medication status in visit chronology', () => {
    const clinicalData = {
      encounters: [{ id: 'enc-1', period: { start: '2026-07-01T00:00:00Z' } }],
      medications: [{
        ...activeMedication(1),
        status: 'unknown',
      }],
    }

    const { result } = renderHook(
      () => useEncountersContext(true, clinicalData as any, 'all'),
      { wrapper: Wrapper },
    )
    const context = result.current?.items.join('\n') ?? ''

    expect(context).toContain('Drug 01 × 30d')
    expect(context).not.toContain('[status: unknown]')
  })

  it('keeps every visit-linked medication row without repeating the active regimen summary', () => {
    const clinicalData = {
      encounters: [{
        id: 'enc-1',
        period: { start: '2026-07-01T00:00:00Z' },
      }],
      medications: Array.from({ length: 18 }, (_, index) => activeMedication(index + 1)),
    }

    const { result } = renderHook(
      () => useEncountersContext(true, clinicalData as any, 'all'),
      { wrapper: Wrapper },
    )

    const items = result.current?.items ?? []
    const context = items.join('\n')
    const medicationRows = context.match(/• Drug \d+/g) ?? []

    expect(items[0]).toBe('Recent visits (showing 1 of 1):')
    expect(medicationRows).toHaveLength(18)
    expect(medicationRows.at(-1)).toContain('Drug 18')
    expect(items.some((item) => item.includes('Currently active medication records'))).toBe(false)
    expect(items.join('\n')).toContain("'Patient's Medications' is the authoritative regimen list")
    expect(items.some((item) => item.includes('…and'))).toBe(false)
  })

  it('groups matching outpatient visits and states the ICD billing caveat only once', () => {
    const outpatient = (id: string, date: string) => ({
      id,
      status: 'finished',
      class: { code: 'AMB', display: 'ambulatory' },
      type: [{
        text: '門診',
        coding: [{
          system: 'https://nhi-fhir-bridge.github.io/CodeSystem/encounter-kind',
          code: 'outpatient',
          display: '門診',
        }],
      }],
      period: { start: `${date}T00:00:00+08:00` },
      serviceProvider: {
        reference: 'Organization/vghtpe',
        display: '臺北榮總;門診;0601160016',
      },
      reasonCode: [{
        text: '左側女性乳房未明示部位惡性腫瘤',
        coding: [{ code: 'C50.912', display: '左側女性乳房未明示部位惡性腫瘤' }],
      }],
    })
    const clinicalData = {
      encounters: [
        outpatient('enc-1', '2026-07-01'),
        outpatient('enc-2', '2026-06-24'),
        outpatient('enc-3', '2026-05-07'),
      ],
      medications: [{
        ...activeMedication(1),
        encounter: { reference: 'Encounter/enc-1' },
      }],
    }

    const { result } = renderHook(
      () => useEncountersContext(true, clinicalData as any, 'all'),
      { wrapper: Wrapper },
    )
    const items = result.current?.items ?? []
    const context = items.join('\n')

    expect(items.filter((item) => item.startsWith('▶ '))).toHaveLength(1)
    expect(context).toContain('▶ 臺北榮總 · 門診 · ambulatory')
    expect(context).toContain('ICD: C50.912 - 左側女性乳房未明示部位惡性腫瘤')
    expect(context).toContain('Dates: 2026-07-01, 2026-06-24, 2026-05-07')
    expect(context).toContain('Total: 3 visits')
    expect(context).toContain('2026-07-01:\n    Medications:\n    • Drug 01')
    expect(context.match(/billing codes recorded for visits/g)).toHaveLength(1)
    expect(context).not.toContain('ICD codes on visit record')
  })

  it('merges sparse inpatient claim fragments but keeps separate admissions and emergency visits', () => {
    const makeAcuteVisit = (
      id: string,
      classCode: string,
      date: string,
      endDate = date,
    ) => ({
      id,
      status: 'finished',
      class: { code: classCode },
      type: [{
        text: classCode === 'IMP' ? '住院' : '急診',
        coding: [{
          system: 'https://nhi-fhir-bridge.github.io/CodeSystem/encounter-kind',
          code: classCode === 'IMP' ? 'inpatient' : 'emergency',
        }],
      }],
      period: {
        start: `${date}T00:00:00+08:00`,
        end: `${endDate}T00:00:00+08:00`,
      },
      serviceProvider: { reference: 'Organization/same', display: '同一醫院' },
      reasonCode: [{ coding: [{ code: 'N39.0', display: 'Urinary tract infection' }] }],
    })
    const clinicalData = {
      encounters: [
        makeAcuteVisit('ip-fragment-1', 'IMP', '2026-06-19'),
        makeAcuteVisit('ip-fragment-2', 'IMP', '2026-06-21'),
        makeAcuteVisit('ip-fragment-3', 'IMP', '2026-06-22'),
        makeAcuteVisit('ip-fragment-4', 'IMP', '2026-06-24'),
        makeAcuteVisit('ip-fragment-5', 'IMP', '2026-06-29'),
        makeAcuteVisit('ip-separate', 'IMP', '2026-05-01', '2026-05-03'),
        makeAcuteVisit('ed-1', 'EMER', '2026-04-01'),
        makeAcuteVisit('ed-2', 'EMER', '2026-03-01'),
      ],
    }

    const { result } = renderHook(
      () => useEncountersContext(true, clinicalData as any, 'all'),
      { wrapper: Wrapper },
    )

    const context = result.current?.items.join('\n') ?? ''
    expect(result.current?.items.filter((item) => item.startsWith('▶ '))).toHaveLength(4)
    expect(context).toContain('▶ 2026-06-19–2026-06-29 · 同一醫院 · 住院 · IMP')
    expect(context).toContain('Source records: 5 (merged as one inpatient episode)')
    expect(context).toContain('▶ 2026-05-01–2026-05-03 · 同一醫院 · 住院 · IMP')
    expect(context.match(/· EMER/g)).toHaveLength(2)
  })

  it('includes every selected encounter instead of silently limiting the export to 10 visits', () => {
    const clinicalData = {
      encounters: Array.from({ length: 29 }, (_, index) => ({
        id: `enc-${index + 1}`,
        period: { start: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00Z` },
      })),
      medications: [],
    }

    const { result } = renderHook(
      () => useEncountersContext(true, clinicalData as any, 'all'),
      { wrapper: Wrapper },
    )

    const items = result.current?.items ?? []
    const visitRows = items.filter((item) => item.startsWith('▶ '))

    expect(items[0]).toBe('Recent visits (showing 29 of 29):')
    expect(visitRows).toHaveLength(29)
    expect(items.some((item) => item.includes('omitted for brevity'))).toBe(false)
  })

  it('omits source status semantics from procedures and honours category switches', () => {
    const clinicalData = {
      encounters: [{ id: 'enc-1', period: { start: '2026-07-01T00:00:00Z' } }],
      medications: [activeMedication(1)],
      procedures: [{
        id: 'proc-1',
        status: 'not-done',
        encounter: { reference: 'Encounter/enc-1' },
        performedDateTime: '2026-07-01T00:00:00Z',
        code: { text: 'Bronchoscopy' },
      }],
    }

    const withProcedure = renderHook(
      () => useEncountersContext(true, clinicalData as any, 'all', {
        includeMedications: false,
        includeProcedures: true,
        filters: { procedureTimeRange: 'all', procedureVersion: 'all' },
      }),
      { wrapper: Wrapper },
    )
    const included = withProcedure.result.current?.items.join('\n') ?? ''
    expect(included).toContain('Bronchoscopy')
    expect(included).not.toContain('not-done')
    expect(included).not.toContain('status:')
    expect(included).not.toContain('Drug 01')

    const withoutProcedure = renderHook(
      () => useEncountersContext(true, clinicalData as any, 'all', {
        includeMedications: false,
        includeProcedures: false,
      }),
      { wrapper: Wrapper },
    )
    expect(withoutProcedure.result.current?.items.join('\n')).not.toContain('Bronchoscopy')
  })
})
