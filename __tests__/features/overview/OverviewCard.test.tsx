/**
 * 總覽 rendered against the real demo bundle.
 *
 * The point of this suite is the contract the design brief insists on: the
 * four header tiles and the four card headers must always report the SAME
 * numbers, and narrowing the range must narrow them together. The clock is
 * pinned so the assertions do not decay as the demo bundle ages.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import bundle from '@/public/demo/demo-bundle.json'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import { OverviewCard } from '@/features/clinical-summary/overview'

// 2026-06-15 — the one anchor where the demo bundle has all four data kinds
// inside the default 3-month window AND strictly fewer inside the 1-month one.
// Pinned so these assertions do not decay as real time moves past the fixture.
const FIXED_NOW = new Date('2026-06-15T09:00:00+08:00').getTime()

jest.mock('@/src/shared/hooks/use-now.hook', () => ({
  useNow: () => new Date('2026-06-15T09:00:00+08:00').getTime(),
}))

jest.mock('@/src/application/providers/language.provider', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { zhTW: translations } = require('@/src/shared/i18n/locales/zh-TW')
  return { useLanguage: () => ({ t: translations, locale: 'zh-TW' }) }
})

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))

const mockUseClinicalData = jest.fn()
jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook', () => ({
  useClinicalData: () => mockUseClinicalData(),
}))

const resources: any[] = (bundle as any).entry.map((entry: any) => entry.resource)
const byType = (type: string) => resources.filter((resource) => resource.resourceType === type)
const observations = byType('Observation')
// The live hook re-attaches member Observations when `_include` came back
// empty; mirror that so report rows carry their results here too.
const diagnosticReports = byType('DiagnosticReport').map((report: any) => ({
  ...report,
  _observations: (report.result ?? [])
    .map((reference: any) => observations.find((o: any) => `Observation/${o.id}` === reference.reference))
    .filter(Boolean),
}))

const clinicalData = {
  encounters: byType('Encounter'),
  medications: byType('MedicationRequest'),
  diagnosticReports,
  imagingStudies: [],
  observations,
  procedures: byType('Procedure'),
  conditions: byType('Condition'),
  documentReferences: byType('DocumentReference'),
  compositions: byType('Composition'),
  resourceReady: new Proxy({}, { get: () => true }) as Record<string, boolean>,
  error: null,
}

/** Number carried by a header tile (e.g. 42 in "42 項 · 異常 6"). */
function tileValue(section: string): number {
  const tile = document.querySelector(`[data-overview-tile="${section}"]`)
  expect(tile).toBeTruthy()
  const digits = tile!.textContent?.match(/\d+/)
  return digits ? Number(digits[0]) : Number.NaN
}

/** First number in a section card's header count (e.g. 42 in "42 項 · 5 次採檢"). */
function sectionHeaderValue(sectionId: string): number {
  const card = document.getElementById(`overview-section-${sectionId}`)
  expect(card).toBeTruthy()
  const header = card!.querySelector('[data-slot="card-title"]')
  const digits = header?.textContent?.match(/\d+/)
  return digits ? Number(digits[0]) : Number.NaN
}

describe('OverviewCard (demo bundle)', () => {
  const originalResizeObserver = globalThis.ResizeObserver
  beforeAll(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })
  afterAll(() => { globalThis.ResizeObserver = originalResizeObserver })
  beforeEach(() => {
    mockUseClinicalData.mockReturnValue(clinicalData)
  })

  it('keeps all seven collection days and an older-only analyte in the expanded list', () => {
    const days = ['2026-04-01', '2026-04-08', '2026-04-15', '2026-05-01', '2026-05-08', '2026-06-01', '2026-06-08']
    const draws = days.map((day, index) => ({
      resourceType: 'Observation', id: `seven-days-${index}`, status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' }] },
      effectiveDateTime: `${day}T09:00:00+08:00`,
      valueQuantity: { value: 11 + index / 10, unit: 'g/dL' },
    }))
    mockUseClinicalData.mockReturnValue({ ...clinicalData, observations: [
      ...draws,
      { ...draws[0], id: 'culture-only-day', effectiveDateTime: '2026-04-02T09:00:00+08:00',
        code: { coding: [{ system: 'http://loinc.org', code: '600-7', display: 'Blood culture' }] },
        valueQuantity: undefined, valueString: 'No growth',
      },
      { ...draws[0], id: 'older-only-potassium',
        code: { coding: [{ system: 'http://loinc.org', code: '2823-3', display: 'Potassium' }] },
        valueQuantity: { value: 6.7, unit: 'mmol/L' },
      },
    ] })
    render(<OverviewCard />)
    expect(sectionHeaderValue('labs')).toBe(9)
    const card = document.getElementById('overview-section-labs')!
    fireEvent.click(within(card).getByRole('button', { name: zhTW.overview.expandList }))
    const dialog = within(screen.getByRole('dialog'))
    for (const day of days) expect(dialog.getByText(day.slice(5).replace('-', '/'))).toBeInTheDocument()
    expect(dialog.getByText('6.7')).toBeInTheDocument()
    expect(dialog.queryByText('04/02')).not.toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: '全部' }))
    expect(dialog.getByText('04/02')).toBeInTheDocument()
    expect(dialog.getByText('No growth')).toBeInTheDocument()
  })

  it('exposes the complete narrative laboratory result on click', async () => {
    const narrative = 'Synthetic culture result\n' + 'Organism and susceptibility details. '.repeat(30)
    mockUseClinicalData.mockReturnValue({ ...clinicalData, observations: [{
      resourceType: 'Observation', id: 'synthetic-culture', status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '600-7', display: 'Blood culture' }] },
      effectiveDateTime: '2026-06-01T09:00:00+08:00', valueString: narrative,
    }] })
    render(<OverviewCard />)
    const card = document.getElementById('overview-section-labs')!
    fireEvent.click(within(card).getByRole('button', { name: zhTW.overview.expandList }))
    const dialog = screen.getByRole('dialog')
    const trigger = [...dialog.querySelectorAll('span[tabindex="0"]')].find(element => element.textContent === narrative)!
    expect(trigger).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Organism and susceptibility details.')
  })

  it('renders the four sections with the default 3-month window', () => {
    render(<OverviewCard />)

    expect(screen.getByText('近3個月總覽')).toBeInTheDocument()
    // 2026/03/15 – 2026/06/15 in the zh-TW Intl format.
    expect(screen.getByText(/2026\/03\/15/)).toBeInTheDocument()

    for (const section of ['labs', 'reports', 'meds', 'visits']) {
      expect(document.getElementById(`overview-section-${section}`)).toBeInTheDocument()
    }
    for (const title of [
      zhTW.overview.sections.labs,
      zhTW.overview.sections.reports,
      zhTW.overview.sections.meds,
      zhTW.overview.sections.visits,
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0)
    }
    // No ResizeObserver in jsdom, so the card stays in its stacked, scrollable
    // presentation and every row renders.
    expect(screen.getByTestId('overview-card')).toHaveAttribute('data-overview-layout', 'stacked')
  })

  it('reports the same counts on the jump tiles and the card headers', () => {
    render(<OverviewCard />)

    for (const section of ['labs', 'reports', 'meds', 'visits']) {
      expect(tileValue(section)).toBe(sectionHeaderValue(section))
    }
  })

  it('finds real data in this window rather than rendering four empty cards', () => {
    render(<OverviewCard />)

    expect(tileValue('visits')).toBeGreaterThan(0)
    expect(tileValue('meds')).toBeGreaterThan(0)
    expect(tileValue('labs')).toBeGreaterThan(0)
    expect(tileValue('reports')).toBeGreaterThan(0)
  })

  it('narrows every count when the range chip drops to 1 month', () => {
    render(<OverviewCard />)

    const before = {
      labs: tileValue('labs'),
      reports: tileValue('reports'),
      meds: tileValue('meds'),
      visits: tileValue('visits'),
    }

    fireEvent.click(screen.getByRole('button', { name: zhTW.overview.ranges[1] }))

    expect(screen.getByText('近1個月總覽')).toBeInTheDocument()
    for (const section of ['labs', 'reports', 'meds', 'visits'] as const) {
      expect(tileValue(section)).toBeLessThanOrEqual(before[section])
      // Tiles and headers stay in lockstep after a range change too.
      expect(tileValue(section)).toBe(sectionHeaderValue(section))
    }
    // A narrower window must actually remove something from this bundle.
    expect(tileValue('visits')).toBeLessThan(before.visits)
  })

  it('keeps every section anchored while the chart holds no data at all', () => {
    mockUseClinicalData.mockReturnValue({
      ...clinicalData,
      encounters: [],
      medications: [],
      diagnosticReports: [],
      observations: [],
      procedures: [],
      conditions: [],
      documentReferences: [],
      compositions: [],
    })
    render(<OverviewCard />)

    for (const section of ['labs', 'reports', 'meds', 'visits']) {
      const card = document.getElementById(`overview-section-${section}`)
      expect(card).toBeInTheDocument()
      expect(within(card as HTMLElement).getByText(zhTW.overview.emptyWindow)).toBeInTheDocument()
    }
  })

  it('pins the clock used by the window so the assertions above are stable', () => {
    // Guards the fixture assumption rather than the component: if the demo
    // bundle stops carrying labs around this date, this test says so first.
    const labDays = observations
      .map((observation: any) => observation.effectiveDateTime)
      .filter(Boolean)
      .map((value: string) => new Date(value).getTime())
    expect(labDays.some((time: number) => time <= FIXED_NOW)).toBe(true)
  })
})
