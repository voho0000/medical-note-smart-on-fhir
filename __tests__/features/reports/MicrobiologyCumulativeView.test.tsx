import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CumulativeLabReport } from '@/features/clinical-summary/reports/components/CumulativeLabReport'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { LanguageProvider } from '@/src/application/providers/language.provider'

const NHI_SYSTEM = 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code'

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
  it('renders a specimen-by-stage cumulative matrix and expands source detail', () => {
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
        ]}
      />,
      { wrapper: TestProviders },
    )

    expect(screen.getByTestId('microbiology-cumulative-view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sputum 分枝桿菌' })).toBeInTheDocument()
    expect(screen.getByText('直接鏡檢／染色')).toBeInTheDocument()
    expect(screen.getByText('培養')).toBeInTheDocument()
    expect(screen.getByText('26/06/12')).toBeInTheDocument()
    expect(screen.queryByText('點檢驗名稱查看趨勢')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /No Growth for Mycobacterium/ }))
    expect(screen.getByRole('heading', { name: '26/06/12 · 培養' })).toBeInTheDocument()
    expect(screen.getByText('示範醫院')).toBeInTheDocument()
  })

  it('warns that a missing specimen is not an infection episode', () => {
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

    expect(screen.getByRole('heading', { name: '檢體未提供 一般細菌' })).toBeInTheDocument()
    expect(screen.getByText('僅依檢驗階段與日期排列，不代表同一次感染事件。')).toBeInTheDocument()
  })
})
