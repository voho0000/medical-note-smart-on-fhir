import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CumulativeLabReport } from '@/features/clinical-summary/reports/components/CumulativeLabReport'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { useCumulativeReportPrefsStore } from '@/src/application/stores/cumulative-report-prefs.store'
import { DEFAULT_CUMULATIVE_CATEGORY_ORDER } from '@/features/clinical-summary/reports/utils/cumulative-order.utils'

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AudienceProvider>{children}</AudienceProvider>
    </LanguageProvider>
  )
}

// One CRP (chemistry) per day, newest 2026-09-05 — five collection dates, so
// the default 最新三筆 hides two of them.
function crpObservations(dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) => {
    const day = new Date(2026, 8, 5 - index)
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return {
      id: `crp-${index}`,
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '1988-5', display: 'CRP' }] },
      effectiveDateTime: iso,
      valueQuantity: { value: 1 + index / 10, unit: 'mg/dL' },
    }
  })
}

const section = (id: string) =>
  document.querySelector<HTMLElement>(`[data-cumulative-section="${id}"]`)
const chip = (id: string) =>
  document.querySelector<HTMLElement>(`[data-cumulative-jump-chip="${id}"]`)
const dateRows = (id: string) =>
  section(id)?.querySelectorAll('tbody tr[data-index]') ?? []

describe('CumulativeLabReport 直式 (stacked) layout', () => {
  const scrollIntoView = jest.fn()

  beforeEach(() => {
    localStorage.clear()
    useCumulativeReportPrefsStore.setState({
      layoutMode: 'stacked',
      range: 'latest3',
      categoryOrder: null,
    })
    scrollIntoView.mockClear()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: jest.fn(),
    })
  })

  it('is the default layout and renders every category as a section', () => {
    // A fresh device has no persisted preference — 直式 must be what opens.
    useCumulativeReportPrefsStore.persist?.clearStorage?.()
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    for (const id of DEFAULT_CUMULATIVE_CATEGORY_ORDER) {
      expect(section(id)).not.toBeNull()
    }
    // No category sub-tabs at all in this layout.
    expect(screen.queryByRole('tablist', { name: '累積報告分類' })).not.toBeInTheDocument()
    // hiddenByDefault panels (血氣 / 病毒抗原) are plain sections here, not
    // items behind the 「查看更多」 picker.
    expect(screen.queryByRole('button', { name: '查看更多' })).not.toBeInTheDocument()
    expect(within(section('bloodgas')!).getByRole('heading', { name: /血氣/ })).toBeInTheDocument()
    expect(within(section('serology')!).getByRole('heading', { name: /病毒抗原/ })).toBeInTheDocument()
  })

  it('renders a compact expected-columns line for a category with no data', () => {
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    const lipid = section('lipid')!
    expect(lipid.querySelector('table')).toBeNull()
    expect(lipid).toHaveTextContent('此分類尚無檢驗資料（預期欄位：')
    // Pinned columns are named so the clinician can tell "not ordered" from
    // "not supported".
    expect(lipid).toHaveTextContent('LDL')
  })

  it('applies 最新三筆 per category and expands one section at a time', () => {
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    const chem = section('chem')!
    expect(dateRows('chem')).toHaveLength(3)
    expect(chem).toHaveTextContent('5 個日期')
    expect(chem).toHaveTextContent('顯示最新 3 筆')

    const showMore = within(chem).getByRole('button', { name: /查看更多 · 其餘 2 筆/ })
    fireEvent.click(showMore)

    expect(dateRows('chem')).toHaveLength(5)
    expect(chem).toHaveTextContent('已展開全部 5 筆')
    const collapse = within(chem).getByRole('button', { name: /收合 · 回到最新三筆（3 筆）/ })

    fireEvent.click(collapse)
    expect(dateRows('chem')).toHaveLength(3)
  })

  it('changes how many rows every section shows from the range selector', () => {
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    fireEvent.click(screen.getAllByRole('radio', { name: '最新一筆' })[0])

    expect(dateRows('chem')).toHaveLength(1)
    expect(section('chem')).toHaveTextContent('顯示最新 1 筆')
    expect(useCumulativeReportPrefsStore.getState().range).toBe('latest1')
    // A window range labels itself with the window, not with a count of rows.
    fireEvent.click(screen.getAllByRole('radio', { name: '最近一年' })[0])
    expect(section('chem')).toHaveTextContent('最近一年 5 筆')
    expect(dateRows('chem')).toHaveLength(5)
  })

  it('jumps to a section from the chip row', () => {
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    fireEvent.click(chip('urine')!)

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(chip('urine')).toHaveAttribute('aria-current', 'true')
  })

  it('reorders categories from a section header and persists the new order', () => {
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    const chemHeader = section('chem')!.querySelector('h3')!.parentElement!
    fireEvent.click(within(chemHeader).getByRole('button', { name: '生化 往上移' }))

    const order = useCumulativeReportPrefsStore.getState().categoryOrder
    expect(order?.slice(0, 3)).toEqual(['cbc', 'chem', 'coag'])
    // Both the sections and the chip row follow the same order.
    const sectionIds = [...document.querySelectorAll('[data-cumulative-section]')]
      .map((element) => (element as HTMLElement).dataset.cumulativeSection)
    expect(sectionIds.slice(0, 3)).toEqual(['cbc', 'chem', 'coag'])
    const chipIds = [...document.querySelectorAll('[data-cumulative-jump-chip]')]
      .map((element) => (element as HTMLElement).dataset.cumulativeJumpChip)
    expect(chipIds.slice(0, 3)).toEqual(['cbc', 'chem', 'coag'])
    // 血液 is now first and cannot move up.
    expect(within(section('cbc')!.querySelector('h3')!.parentElement!)
      .getByRole('button', { name: '血液 往上移' })).toBeDisabled()
  })

  it('reorders and resets from the 調整順序 panel', async () => {
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    fireEvent.click(screen.getByRole('button', { name: '調整分類順序' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('分類順序')).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: '尿液 往上移' }))
    expect(useCumulativeReportPrefsStore.getState().categoryOrder)
      .toEqual(expect.arrayContaining(['urine']))
    const afterMove = useCumulativeReportPrefsStore.getState().categoryOrder!
    expect(afterMove.indexOf('urine')).toBe(afterMove.indexOf('microbio') - 1)

    fireEvent.click(within(panel).getByRole('button', { name: '恢復預設' }))
    expect(useCumulativeReportPrefsStore.getState().categoryOrder).toBeNull()
  })

  it('scrolls the owning section into view and highlights the cited column', async () => {
    const { rerender } = render(
      <CumulativeLabReport
        observations={crpObservations(5)}
        activeCategoryId="chem"
        focusAnalyteKey="CRP"
        focusNonce={3}
      />,
      { wrapper: TestProviders },
    )

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    const crpHeader = section('chem')!.querySelector('[data-lab-test-key="CRP"]')
    expect(crpHeader).toHaveClass('bg-primary/10', 'border-b-primary')
    // Only the cited section highlights: 血液 also carries no CRP column, and
    // no other section may claim the focus key.
    expect(document.querySelectorAll('[data-lab-test-key="CRP"].bg-primary\\/10'))
      .toHaveLength(1)

    scrollIntoView.mockClear()
    rerender(
      <CumulativeLabReport
        observations={crpObservations(5)}
        activeCategoryId="chem"
        focusAnalyteKey="CRP"
        focusNonce={4}
      />,
    )
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
  })

  it('scrolls to the owning section when an analyte is picked from the finder', async () => {
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    const finder = screen.getByRole('combobox', { name: '搜尋檢驗項目' })
    fireEvent.change(finder, { target: { value: 'CRP' } })
    const hit = await screen.findByRole('option', { name: /CRP/ })

    scrollIntoView.mockClear()
    fireEvent.click(within(hit).getByRole('button'))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(section('chem')!.querySelector('[data-lab-test-key="CRP"]'))
      .toHaveClass('bg-primary/10')
  })

  it('remembers the layout choice and hands the tabs layout back', () => {
    render(<CumulativeLabReport observations={crpObservations(5)} />, { wrapper: TestProviders })

    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: '分頁' }))
    })

    expect(useCumulativeReportPrefsStore.getState().layoutMode).toBe('tabs')
    expect(screen.getByRole('tablist', { name: '累積報告分類' })).toBeInTheDocument()
    expect(document.querySelector('[data-cumulative-section]')).toBeNull()
    expect(JSON.parse(localStorage.getItem('cumulative-report-prefs') ?? '{}'))
      .toMatchObject({ state: { layoutMode: 'tabs' } })
  })

  it('embeds the microbiology grid without its own title bar or scroller', () => {
    render(
      <CumulativeLabReport
        observations={[
          {
            id: 'tb-culture',
            status: 'final',
            effectiveDateTime: '2026-06-12T00:00:00+08:00',
            code: {
              text: 'TB Culture',
              coding: [{
                system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code',
                code: '13026C',
                display: 'TB Culture',
              }],
            },
            specimen: { display: 'Sputum' },
            valueString: 'No Growth for Mycobacterium',
          },
        ]}
      />,
      { wrapper: TestProviders },
    )

    const microbio = section('microbio')!
    expect(within(microbio).getByTestId('microbiology-cumulative-view')).toBeInTheDocument()
    // The section heading already names the panel.
    expect(within(microbio).queryByRole('heading', { name: '微生物累積結果' })).not.toBeInTheDocument()
    expect(within(microbio).getByTestId('microbiology-cumulative-view'))
      .not.toHaveClass('max-h-[60vh]')
  })
})
