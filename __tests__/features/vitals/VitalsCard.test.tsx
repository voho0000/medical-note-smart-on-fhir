import { render, screen } from '@testing-library/react'
import { VitalsCard } from '@/features/clinical-summary/vitals/VitalsCard'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook')
jest.mock('@/src/application/providers/language.provider')

const vitalCategory = [{ coding: [{ code: 'vital-signs' }] }]
const loinc = (code: string) => ({ coding: [{ system: 'http://loinc.org', code }] })

function obs(code: string, value: number, unit: string, effectiveDateTime: string) {
  return { resourceType: 'Observation', category: vitalCategory, code: loinc(code), effectiveDateTime, valueQuantity: { value, unit } }
}
function bp(sys: number, dia: number, effectiveDateTime: string) {
  return {
    resourceType: 'Observation', category: vitalCategory, code: loinc('85354-9'), effectiveDateTime,
    component: [
      { code: loinc('8480-6'), valueQuantity: { value: sys, unit: 'mmHg' } },
      { code: loinc('8462-4'), valueQuantity: { value: dia, unit: 'mmHg' } },
    ],
  }
}
function mockVitals(vitalSigns: any[]) {
  jest.mocked(useClinicalData).mockReturnValue({ vitalSigns, resourceReady: { vitalSigns: true }, error: null } as any)
}

describe('VitalsCard', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 28, 10))
    jest.mocked(useLanguage).mockReturnValue({ t: zhTW, locale: 'zh-TW' } as any)
  })
  afterEach(() => jest.useRealTimers())

  it('shows one date for readings a health check took together', () => {
    mockVitals([
      obs('8302-2', 168, 'cm', '2018-02-12T00:00:00+08:00'),
      obs('29463-7', 78, 'kg', '2018-02-12T00:00:00+08:00'),
      bp(154, 88, '2018-02-12T00:00:00+08:00'),
    ])
    const { container } = render(<VitalsCard />)

    expect(container.querySelectorAll('time')).toHaveLength(1)
    expect(container.querySelector('time')).toHaveTextContent('8 年前')
    expect(screen.getByText('154/88 mmHg')).toBeInTheDocument()
    // No heart rate in the source: no empty 心率 — placeholder.
    expect(screen.queryByText('心率')).not.toBeInTheDocument()
  })

  it('dates each reading when they were taken on different days', () => {
    mockVitals([
      obs('8302-2', 168, 'cm', '2018-02-12T00:00:00+08:00'),
      bp(150, 80, '2026-08-25T09:10:00+08:00'),
    ])
    const { container } = render(<VitalsCard />)

    const lines = [...container.querySelectorAll('[data-slot="card-content"] p')]
    expect(lines).toHaveLength(2)
    // Newest first, each line carrying its own date — the 2026 blood pressure
    // no longer lends its date to the 2018 height.
    expect(lines[0]).toHaveTextContent('血壓')
    expect(lines[0].querySelector('time')).toHaveAttribute('dateTime', '2026-08-25')
    expect(lines[0]).toHaveTextContent('1 個月前')
    expect(lines[1]).toHaveTextContent('身高')
    expect(lines[1].querySelector('time')).toHaveAttribute('dateTime', '2018-02-12')
    expect(lines[1]).toHaveTextContent('8 年前')
  })

  it('says there is nothing when the source has no vital signs', () => {
    mockVitals([])
    render(<VitalsCard />)
    expect(screen.getByText('無生命徵象資料。')).toBeInTheDocument()
  })
})
