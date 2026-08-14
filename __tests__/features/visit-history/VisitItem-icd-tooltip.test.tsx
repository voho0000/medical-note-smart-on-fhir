import { fireEvent, render, screen, within } from '@testing-library/react'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { RightDetailProvider } from '@/src/application/providers/right-detail.provider'
import { VisitItem } from '@/features/clinical-summary/visit-history/components/VisitItem'

jest.mock(
  '@/features/clinical-summary/visit-history/components/VisitDetailContent',
  () => ({
    VisitDetailContent: () => null,
    visitHasDetails: () => false,
  }),
)

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('VisitItem ICD tooltip', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    })
  })

  beforeEach(() => {
    localStorage.setItem('medical-note-locale', 'zh-TW')
  })

  it.each([
    ['western', '西醫'],
    ['tcm', '中醫'],
    ['dental', '牙醫'],
  ] as const)('shows the %s care-discipline badge', (careDiscipline, label) => {
    render(
      <LanguageProvider>
        <RightDetailProvider>
          <VisitItem
            visit={{
              id: `visit-${careDiscipline}`,
              type: 'outpatient',
              careDiscipline,
              date: '2026-06-23',
              icdCodes: [],
              status: 'finished',
            }}
            isExpanded={false}
            onToggle={() => undefined}
          />
        </RightDetailProvider>
      </LanguageProvider>,
    )

    const badge = screen.getByText(label)
    expect(badge).toHaveAttribute('data-care-discipline', careDiscipline)
    expect(badge).toHaveClass('bg-muted/60', 'text-muted-foreground')
  })

  it.each([
    ['western', 'Western Medicine'],
    ['tcm', 'Traditional Chinese Medicine'],
    ['dental', 'Dental'],
  ] as const)('localizes the %s care-discipline badge in English', (careDiscipline, label) => {
    localStorage.setItem('medical-note-locale', 'en')
    render(
      <LanguageProvider>
        <RightDetailProvider>
          <VisitItem
            visit={{
              id: `visit-en-${careDiscipline}`,
              type: 'outpatient',
              careDiscipline,
              date: '2026-06-23',
              icdCodes: [],
              status: 'finished',
            }}
            isExpanded={false}
            onToggle={() => undefined}
          />
        </RightDetailProvider>
      </LanguageProvider>,
    )

    expect(screen.getByText('Outpatient')).toBeInTheDocument()
    const badge = screen.getByText(label)
    expect(badge).toHaveAttribute('data-care-discipline', careDiscipline)
  })

  it('uses the same colour hierarchy and row surface as grouped reports', () => {
    render(
      <LanguageProvider>
        <RightDetailProvider>
          <VisitItem
            visit={{
              id: 'visit-report-tone',
              type: 'outpatient',
              careDiscipline: 'western',
              date: '2026-08-12',
              location: '示範長青醫院',
              icdCodes: [],
              status: 'finished',
            }}
            details={{
              diagnoses: [],
              tests: [{}],
              medications: [{}],
              reports: [{}],
              procedures: [],
            } as any}
            abnormalCount={2}
            isExpanded={false}
            onToggle={() => undefined}
          />
        </RightDetailProvider>
      </LanguageProvider>,
    )

    const row = screen.getByText('示範長青醫院').closest('[data-tour="visit-tour-row"]')
    expect(row).toHaveClass('bg-muted/40', 'border-border/90')
    expect(screen.getByText('門診')).toHaveClass('bg-emerald-100', 'text-emerald-700')
    expect(screen.getByText('示範長青醫院').parentElement).toHaveClass('text-blue-600/80')
    const medicationStat = screen.getByLabelText('用藥 1')
    expect(medicationStat).toHaveAttribute('data-visit-stat', 'medications')
    expect(medicationStat).toHaveClass('border-border/60')
    expect(medicationStat.querySelector('svg')).toBeNull()
    expect(within(medicationStat).getByText('用藥')).toHaveClass('text-muted-foreground')
    expect(within(medicationStat).getByText('1')).toHaveClass('tabular-nums', 'bg-foreground/[0.06]')
    expect(medicationStat).not.toHaveClass('bg-green-50')

    expect(screen.getByLabelText('檢驗 1').querySelector('svg')).toBeNull()
    expect(screen.getByLabelText('檢查報告 1').querySelector('svg')).toBeNull()
    const abnormalStat = screen.getByLabelText('異常 2')
    expect(abnormalStat).toHaveAttribute('data-visit-stat', 'abnormal')
    expect(within(abnormalStat).getByText('異常').parentElement).toHaveClass('bg-red-100', 'text-red-700')
  })

  it('shows the complete code and diagnosis in an explicit tooltip', async () => {
    render(
      <LanguageProvider>
        <RightDetailProvider>
          <VisitItem
            visit={{
              id: 'visit-1',
              type: 'outpatient',
              careDiscipline: 'western',
              date: '2026-02-10',
              institution: '示範北辰醫院',
              reason: 'I35.9 - 非風濕性未明示主動脈瓣疾患',
              icdCodes: [{
                code: 'I35.9',
                description: '非風濕性未明示主動脈瓣疾患',
              }],
              status: 'finished',
            }}
            isExpanded={false}
            onToggle={() => undefined}
          />
        </RightDetailProvider>
      </LanguageProvider>,
    )

    const icdChip = screen.getByLabelText('I35.9 非風濕性未明示主動脈瓣疾患')
    expect(icdChip).not.toHaveAttribute('title')

    fireEvent.focus(icdChip)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(
      'I35.9 非風濕性未明示主動脈瓣疾患',
    )
    expect(tooltip).toHaveClass(
      'border-primary/20',
      'bg-secondary',
      'text-secondary-foreground',
      'shadow-lg',
    )
    expect(tooltip).not.toHaveClass('bg-foreground', 'text-background')
  })

  it('previews hidden ICDs on focus and wraps complete descriptions after expansion', async () => {
    render(
      <LanguageProvider>
        <RightDetailProvider>
          <VisitItem
            visit={{
              id: 'visit-many-icds',
              type: 'outpatient',
              careDiscipline: 'western',
              date: '2026-08-12',
              reason: 'J18.9 - 肺炎，未明示病原體',
              icdCodes: [
                { code: 'J18.9', description: '肺炎，未明示病原體' },
                { code: 'K57.10', description: '小腸憩室疾病，未伴有穿孔或膿瘍' },
                { code: 'D72.821', description: '單核球增多症' },
              ],
              status: 'finished',
            }}
            isExpanded={false}
            onToggle={() => undefined}
          />
        </RightDetailProvider>
      </LanguageProvider>,
    )

    expect(screen.queryByLabelText('K57.10 小腸憩室疾病，未伴有穿孔或膿瘍')).not.toBeInTheDocument()
    const expandButton = screen.getByRole('button', { name: '預覽並展開其他 2 個 ICD 碼' })
    expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.focus(expandButton)
    const preview = await screen.findByTestId('secondary-icd-preview')
    expect(preview).toHaveClass('bg-secondary', 'text-secondary-foreground', 'border-primary/20', 'shadow-lg')
    expect(preview).not.toHaveClass('bg-popover', 'bg-foreground', 'text-background')
    expect(preview).toHaveTextContent('K57.10')
    expect(preview).toHaveTextContent('小腸憩室疾病，未伴有穿孔或膿瘍')
    expect(preview).toHaveTextContent('D72.821')
    expect(preview).toHaveTextContent('單核球增多症')
    expect(within(preview).getByText('K57.10')).toHaveClass('text-secondary-foreground')
    expect(within(preview).getByText('小腸憩室疾病，未伴有穿孔或膿瘍'))
      .toHaveClass('text-secondary-foreground/80')

    fireEvent.click(expandButton)

    const icdList = screen.getByLabelText('K57.10 小腸憩室疾病，未伴有穿孔或膿瘍')
      .closest('[data-icd-list-state]')
    expect(icdList).toHaveAttribute('data-icd-list-state', 'expanded')
    expect(icdList).toHaveClass('flex-wrap', 'overflow-visible')
    const expandedDescription = screen.getByText('小腸憩室疾病，未伴有穿孔或膿瘍')
    expect(expandedDescription).toHaveClass('whitespace-normal', 'break-words', 'text-clip')
    expect(expandedDescription).not.toHaveClass('truncate')
    expect(screen.queryByTestId('secondary-icd-preview')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收合其他 ICD 碼' })).toHaveAttribute('aria-expanded', 'true')
  })
})
