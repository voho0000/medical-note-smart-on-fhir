import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CumulativeLabReport } from '@/features/clinical-summary/reports/components/CumulativeLabReport'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { LanguageProvider } from '@/src/application/providers/language.provider'

const NHI_SYSTEM = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code'

beforeAll(() => {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AudienceProvider>{children}</AudienceProvider>
    </LanguageProvider>
  )
}

function observation({ id, code, name, specimen, date, value }: {
  id: string
  code: string
  name: string
  specimen?: string
  date: string
  value: string
}) {
  return {
    id,
    status: 'final',
    effectiveDateTime: `${date}T00:00:00+08:00`,
    code: {
      text: name,
      coding: [
        { system: NHI_SYSTEM, code, display: name },
        { system: 'https://nhi-fhir-bridge.local/CodeSystem/his-local-lab', code: name, display: name },
      ],
    },
    ...(specimen ? { specimen: { display: specimen } } : {}),
    valueString: value,
    performer: [{ display: '示範醫院' }],
  }
}

describe('MicrobiologyCumulativeView', () => {
  it('renders one collection event per row with dates descending and expands source detail', () => {
    render(
      <CumulativeLabReport
        activeCategoryId="microbio"
        observations={[
          observation({
            id: 'stain',
            code: '13025C',
            name: '抗酸性濃縮抹片染色檢查',
            specimen: 'Sputum',
            date: '2026-05-22',
            value: 'acid fast bacilli not found',
          }),
          observation({
            id: 'culture',
            code: '13026C',
            name: 'TB Culture',
            specimen: 'Sputum',
            date: '2026-06-12',
            value: 'No Growth for Mycobacterium',
          }),
          observation({
            id: 'blood-culture',
            code: '13016B',
            name: 'Blood Culture',
            specimen: 'Blood',
            date: '2026-06-13',
            value: 'No Growth For Aerobes And Anaerobes',
          }),
        ]}
      />,
      { wrapper: TestProviders },
    )

    expect(screen.getByTestId('microbiology-cumulative-view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '微生物累積結果' })).toBeInTheDocument()

    // Workflow columns, in clinical reading order.
    expect(screen.getByText('鏡檢／染色')).toBeInTheDocument()
    expect(screen.getByText('培養／鑑定')).toBeInTheDocument()
    // This dataset has no susceptibility results, so the column stays hidden.
    expect(screen.queryByText('藥敏')).not.toBeInTheDocument()

    // One row per collection event, newest date first.
    const rowButtons = screen.getAllByRole('button', { name: /完整報告/ })
    expect(rowButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '26/06/13 Blood 一般細菌 完整報告',
      '26/06/12 Sputum 分枝桿菌 完整報告',
      '26/05/22 Sputum 分枝桿菌 完整報告',
    ])
    // The stain value stays in the grid; specimen columns are merged rows, so
    // the 13026C row reads Mycobacterial Culture with its verbatim value.
    expect(screen.getByText(/No Growth for Mycobacterium/)).toBeInTheDocument()
    expect(screen.getByText('AFB smear').parentElement).toHaveTextContent(
      'AFB smear · acid fast bacilli not found',
    )
    expect(screen.queryByText('點檢驗名稱查看趨勢')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '26/06/12 Sputum 分枝桿菌 完整報告' }))
    const detail = screen.getByText('來源名稱：TB Culture').closest('td') as HTMLElement
    expect(within(detail).getByText('Mycobacterial Culture')).toBeInTheDocument()
    expect(within(detail).getByText('No Growth for Mycobacterium')).toBeInTheDocument()
    expect(within(detail).getByText('示範醫院')).toBeInTheDocument()
    expect(within(detail).getByText('13026C')).toBeInTheDocument()
  })

  it('keeps a missing specimen low-confidence without inventing one', () => {
    render(
      <CumulativeLabReport
        activeCategoryId="microbio"
        observations={[
          observation({
            id: 'unknown',
            code: '13007C',
            name: 'Aerobic Culture',
            date: '2026-01-14',
            value: 'Mixed flora',
          }),
        ]}
      />,
      { wrapper: TestProviders },
    )

    expect(screen.getByText('未提供')).toBeInTheDocument()
    const specimenHint = screen.getByRole('button', {
      name: '健保署資料未提供檢體來源，無法判斷結果來自痰、尿液或其他檢體；同日結果也不一定屬於同一份檢體。',
    })
    expect(specimenHint).toBeInTheDocument()

    fireEvent.click(specimenHint)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      '健保署資料未提供檢體來源，無法判斷結果來自痰、尿液或其他檢體；同日結果也不一定屬於同一份檢體。',
    )
  })

  it('preserves every source row and exposes repeated result counts', () => {
    render(
      <CumulativeLabReport
        activeCategoryId="microbio"
        observations={[
          observation({
            id: 'compound-under-culture-code',
            code: '13026C',
            name: '分枝桿菌培養及抗酸性染色',
            date: '2025-05-22',
            value: 'acid fast bacilli not found',
          }),
          observation({
            id: 'tb-culture',
            code: '13026C',
            name: 'TB Culture',
            date: '2025-05-22',
            value: 'No Growth for Mycobacterium',
          }),
          observation({
            id: 'compound-under-smear-code',
            code: '13025C',
            name: '分枝桿菌培養及抗酸性染色',
            date: '2025-05-22',
            value: 'acid fast bacilli not found',
          }),
          observation({
            id: 'mismatched-tb-culture',
            code: '13013C',
            name: 'TB Culture',
            date: '2025-05-22',
            value: 'acid fast bacilli not found',
          }),
        ]}
      />,
      { wrapper: TestProviders },
    )

    expect(screen.getByText(/AFB smear/).parentElement).toHaveTextContent('×2')
    fireEvent.click(screen.getByRole('button', { name: '25/05/22 未提供 分枝桿菌 完整報告' }))
    const detail = screen.getAllByText('來源名稱：TB Culture')[0].closest('td') as HTMLElement
    const articles = within(detail).getAllByRole('article')

    expect(articles).toHaveLength(4)
    expect(within(detail).getAllByText('來源名稱：分枝桿菌培養及抗酸性染色')).toHaveLength(2)
    expect(within(detail).getAllByText('來源名稱：TB Culture')).toHaveLength(2)
    expect(within(detail).getAllByText('acid fast bacilli not found')).toHaveLength(3)
    expect(within(detail).getByText('No Growth for Mycobacterium')).toBeInTheDocument()
  })

  it('places a culture-named report in susceptibility when its content is an antibiogram', () => {
    render(
      <CumulativeLabReport
        activeCategoryId="microbio"
        observations={[
          observation({
            id: 'culture-antibiogram',
            code: '13009C',
            name: 'Aerobic Culture(Pus/Wound)',
            date: '2026-02-10',
            value: '菌名：Escherichia coli 菌量：Light AN:S CTX:I CXM:I CZ-O:R',
          }),
        ]}
      />,
      { wrapper: TestProviders },
    )

    expect(screen.getByText('藥敏')).toBeInTheDocument()
    expect(screen.queryByText('培養／鑑定')).not.toBeInTheDocument()
    const row = screen.getByRole('button', {
      name: '26/02/10 Pus / Wound 一般細菌 完整報告',
    }).closest('tr')
    expect(row).toHaveTextContent('Pus / Wound')
    expect(row).toHaveTextContent('推定')
    expect(row).toHaveTextContent('Escherichia coli')
    expect(row).toHaveTextContent('S 1 · I 2 · R 1')
  })
})
