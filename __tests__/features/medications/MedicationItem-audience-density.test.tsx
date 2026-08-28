import { render, screen, within } from '@testing-library/react'
import { MedicationItem } from '@/features/clinical-summary/medications/components/MedicationItem'
import type { MedicationRow } from '@/features/clinical-summary/medications/types'

let mockAudience: 'medical' | 'patient' = 'patient'

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: mockAudience }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      medications: {
        daysLeft: '剩 {n} 天',
        executionPeriod: '執行',
        durationCompact: '{n} 天',
        refillSummary: '累計 {count} 次',
        refillSummarySince: '累計 {count} 次 · {date} 起',
        frequencyLabel: '頻次',
        terminologySource: '健保署藥品主檔補充',
        terminologyIngredientLabel: '成分／含量',
        terminologyOfficialNameZhLabel: '中文品名',
        terminologyOfficialNameEnLabel: '英文品名',
        terminologyDoseFormLabel: '劑型',
        terminologyAtcLabel: 'ATC 分類',
        terminologySnapshotLabel: '藥典版本',
      },
    },
  }),
}))

jest.mock('@/src/application/hooks/use-resource-anchor.hook', () => ({
  useResourceAnchor: () => undefined,
}))

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({
    children,
    sideOffset: _sideOffset,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number }) => (
    <div {...props}>{children}</div>
  ),
}))

const terminology = {
  source: 'nhi-official-drug-master' as const,
  snapshotId: 'nhi-drug-terminology-20260728',
  officialNameZh: '愛克痰發泡錠600毫克',
  officialNameEn: 'ACTEIN EFFERVESCENT TABLETS 600MG',
  ingredientText: 'ACETYLCYSTEINE 600 MG',
  doseForm: '發泡錠',
  atcCode: 'R05CB01',
  atcNameEn: 'acetylcysteine',
}

function medicationRow(title: string, secondaryTitle?: string): MedicationRow {
  return {
    id: 'mr-1',
    title,
    secondaryTitle,
    status: 'active',
    startedOn: '2026/7/22',
    endDate: '2026/8/12',
    durationDays: 21,
    isInactive: false,
    isChronic: true,
    refillCount: 15,
    firstRefillDate: '2025/1/29',
    pharmacy: '長庚嘉義',
    drugTerminology: terminology,
    searchHaystack: '',
  }
}

describe('MedicationItem audience-aware compact terminology', () => {
  it('keeps the patient row Chinese-only and compact while exposing full terminology on hover', () => {
    mockAudience = 'patient'
    const { container } = render(
      <MedicationItem medication={medicationRow('愛克痰發泡錠600毫克')} />,
    )

    expect(screen.getAllByText('愛克痰發泡錠600毫克')).toHaveLength(2)
    const compactTitle = container.querySelector('[tabindex="0"]') as HTMLElement
    expect(within(compactTitle)
      .queryByText('ACTEIN EFFERVESCENT TABLETS 600MG')).not.toBeInTheDocument()
    expect(within(compactTitle)
      .queryByText('ACETYLCYSTEINE 600 MG')).not.toBeInTheDocument()
    expect(within(container.querySelector('[data-medication-cell="clinical"]') as HTMLElement)
      .queryByText(/R05CB01/)).not.toBeInTheDocument()
    const tooltip = screen.getByTestId('medication-terminology-tooltip')
    expect(tooltip).toHaveClass('bg-secondary', 'text-secondary-foreground', 'border-primary/20')
    expect(tooltip).not.toHaveClass('bg-foreground', 'text-background')
    expect(within(tooltip).getByText('愛克痰發泡錠600毫克')).toBeInTheDocument()
    expect(within(tooltip).getByText('ACTEIN EFFERVESCENT TABLETS 600MG')).toBeInTheDocument()
    expect(within(tooltip).getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
    expect(within(tooltip).getByText('R05CB01 · acetylcysteine')).toBeInTheDocument()
    expect(compactTitle).toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('data-medication-row-layout', 'three-lane')
    expect(container.querySelectorAll('[data-medication-cell]')).toHaveLength(3)
  })

  it('defaults to the ingredient name only without inline product name or ATC', () => {
    mockAudience = 'medical'
    const { container } = render(
      <MedicationItem
        medication={medicationRow(
          'ACETYLCYSTEINE 600 MG',
          'ACTEIN EFFERVESCENT TABLETS 600MG',
        )}
      />,
    )

    expect(screen.getAllByText('ACETYLCYSTEINE 600 MG')).toHaveLength(2)
    expect(screen.getAllByText(/ACTEIN EFFERVESCENT TABLETS 600MG/)).toHaveLength(1)
    const compactTitle = container.querySelector('[tabindex="0"]') as HTMLElement
    expect(within(compactTitle).getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
    expect(within(compactTitle)
      .queryByText(/ACTEIN EFFERVESCENT TABLETS 600MG/)).not.toBeInTheDocument()
    const tooltip = screen.getByTestId('medication-terminology-tooltip')
    expect(within(tooltip).getByText('愛克痰發泡錠600毫克')).toBeInTheDocument()
    expect(within(tooltip).getByText('ACTEIN EFFERVESCENT TABLETS 600MG')).toBeInTheDocument()
    expect(within(tooltip).getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
    expect(within(tooltip).getByText('R05CB01 · acetylcysteine')).toBeInTheDocument()
    expect(within(tooltip).getByText(/健保署藥品主檔補充/)).toBeInTheDocument()
    const scheduleLine = container.querySelector('[data-medication-schedule]')
    const clinicalLane = container.querySelector('[data-medication-cell="clinical"]')
    const supplyLane = container.querySelector('[data-medication-cell="supply"]')
    expect(scheduleLine).not.toHaveTextContent('R05CB01')
    expect(scheduleLine).toHaveTextContent('2026/7/22 → 2026/8/12 (21 天)')
    expect(scheduleLine).toHaveTextContent('長庚嘉義')
    expect(clinicalLane).not.toHaveTextContent('R05CB01')
    expect(supplyLane).toHaveTextContent('累計 15 次')
    expect(screen.getByText('累計 15 次 · 2025/1/29 起').parentElement)
      .not.toHaveAttribute('title')
    expect(container.querySelectorAll('[data-medication-cell]')).toHaveLength(3)
  })

  it('shows only the product name when product mode is selected', () => {
    mockAudience = 'medical'
    const { container } = render(
      <MedicationItem
        medication={medicationRow(
          'ACETYLCYSTEINE 600 MG',
          'ACTEIN EFFERVESCENT TABLETS 600MG',
        )}
        nameMode="product"
      />,
    )

    const compactTitle = container.querySelector('[tabindex="0"]') as HTMLElement
    expect(within(compactTitle)
      .getByText('ACTEIN EFFERVESCENT TABLETS 600MG')).toBeInTheDocument()
    expect(within(compactTitle)
      .queryByText('ACETYLCYSTEINE 600 MG')).not.toBeInTheDocument()
    expect(screen.getAllByText('ACETYLCYSTEINE 600 MG')).toHaveLength(1)
  })

  it('shows exact inpatient execution periods on the shared compact row', () => {
    mockAudience = 'medical'
    const { container } = render(
      <MedicationItem
        medication={medicationRow(
          'POTASSIUM CRESOLSULFONATE 90 MG',
          '美致康膠囊「成大」',
        )}
        executionPeriods={[
          {
            start: '2025-05-20T00:00:00+08:00',
            end: '2025-05-21T23:59:59+08:00',
          },
          {
            start: '2025-05-22T00:00:00+08:00',
            end: '2025-05-28T23:59:59+08:00',
          },
        ]}
      />,
    )

    const scheduleLine = container.querySelector('[data-medication-schedule]')
    expect(scheduleLine).toHaveTextContent(
      '執行 2025/05/20–2025/05/21、2025/05/22–2025/05/28',
    )
    expect(container.querySelectorAll('[data-medication-cell]')).toHaveLength(3)
  })

  it('keeps the days-left badge inside constrained parent layouts', () => {
    mockAudience = 'medical'
    const medication = {
      ...medicationRow(
        'ACETYLCYSTEINE 600 MG',
        'ACTEIN EFFERVESCENT TABLETS 600MG',
      ),
      daysRemaining: 2,
    }
    const { container } = render(<MedicationItem medication={medication} />)

    const row = container.firstElementChild
    const badge = screen.getByText('剩 2 天')
    expect(row).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-hidden')
    expect(row).toHaveClass('grid', 'bg-muted/40', 'py-1', 'dark:bg-muted/30')
    expect(badge.closest('[data-medication-cell="supply"]')).toHaveClass('w-[4.75rem]')
    expect(badge.parentElement).toHaveClass('w-full')
  })

  it('keeps the source frequency first in the compact schedule line', () => {
    mockAudience = 'medical'
    const medication = {
      ...medicationRow('ACETYLCYSTEINE 600 MG'),
      frequency: 'QDPC',
    }
    const { container } = render(<MedicationItem medication={medication} />)

    const scheduleLine = container.querySelector<HTMLElement>('[data-medication-schedule]')
    const frequency = container.querySelector<HTMLElement>('[data-medication-frequency]')
    expect(frequency).toHaveTextContent('QDPC')
    expect(frequency).toHaveAttribute('aria-label', '頻次：QDPC')
    expect(scheduleLine?.firstElementChild).toContainElement(frequency)
  })

  it('drops the individual card boundary inside a grouped medication surface', () => {
    mockAudience = 'medical'
    const { container } = render(
      <MedicationItem medication={medicationRow('ACETYLCYSTEINE 600 MG')} grouped />,
    )

    const row = container.firstElementChild
    expect(row).toHaveClass('rounded-none', 'border-0', 'bg-transparent')
    expect(row).not.toHaveClass('rounded-md', 'bg-muted/40')
  })

  it('reserves the localized chronic-badge width when a row is not chronic', () => {
    mockAudience = 'medical'
    const medication = {
      ...medicationRow(
        'BRIMONIDINE TARTRATE 1.5 MG/ML',
        'BRIMONIN OPHTHALMIC SOLUTION',
      ),
      category: '縮瞳劑',
      isChronic: false,
    }
    const { container } = render(<MedicationItem medication={medication} />)

    const chronicSlot = container.querySelector('[data-medication-chronic-slot]')
    expect(chronicSlot).toHaveAttribute('data-visible', 'false')
    expect(chronicSlot).toHaveAttribute('aria-hidden', 'true')
    expect(chronicSlot).toHaveClass('invisible', 'shrink-0')
    expect(chronicSlot).toHaveTextContent('慢箋')
    expect(screen.getByText('縮瞳劑')).toBeInTheDocument()
  })

  describe('narrow-row date folding', () => {
    // A 375pt phone gives the identity lane ~151px, and the full
    // "start → end (N 天) · institution" needs ~205px. Rather than spend a
    // third line on it — which cuts roughly a third of the medications visible
    // per screen — the end date folds away, but ONLY where it can be rebuilt.
    const dateText = () =>
      screen.getByTestId('medication-schedule-date')

    it('folds the end date behind a container query when the duration can rebuild it', () => {
      mockAudience = 'medical'
      render(<MedicationItem medication={medicationRow('AMOXICILLIN 500 MG')} />)

      const foldable = within(dateText()).getByText(/→/)
      expect(foldable).toHaveClass('hidden', '@min-[416px]:inline')
      // The start and the duration stay unconditionally — together they are the
      // same coverage window the range expressed.
      expect(dateText()).toHaveTextContent('2026/7/22')
      expect(dateText()).toHaveTextContent('21 天')
      // Nothing is lost on a pointer device even while folded.
      expect(dateText()).toHaveAttribute('title', '2026/7/22 → 2026/8/12 (21 天)')
    })

    it('keeps the end date visible when there is no duration to rebuild it', () => {
      mockAudience = 'medical'
      const medication = { ...medicationRow('AMOXICILLIN 500 MG'), durationDays: undefined }
      render(<MedicationItem medication={medication} />)

      // Without a duration the end date IS the coverage information, so folding
      // it would drop the only record of when the supply runs out.
      const end = within(dateText()).getByText(/→/)
      expect(end).not.toHaveClass('hidden')
      expect(dateText()).toHaveTextContent('2026/8/12')
    })

    it('leaves a stopped medication showing the date it ended', () => {
      mockAudience = 'medical'
      const medication = { ...medicationRow('AMOXICILLIN 500 MG'), isInactive: true }
      render(<MedicationItem medication={medication} />)

      expect(dateText()).toHaveTextContent('2026/8/12')
      expect(within(dateText()).queryByText(/→/)).toBeNull()
    })
  })

  it('gives category and ICD separate wide-layout rows instead of competing for one line', () => {
    mockAudience = 'medical'
    const medication = {
      ...medicationRow(
        'OXYBUTYNIN CHLORIDE 5 MG',
        'DITROPAN TABLETS 5 MG',
      ),
      category: '生殖泌尿道平滑肌鬆弛劑',
      icdCode: 'N40.0',
      icdText: '良性攝護腺增生未伴有下泌尿道症狀',
    }
    const { container } = render(<MedicationItem medication={medication} />)

    const clinicalLane = container.querySelector('[data-medication-cell="clinical"]')
    const category = screen.getByText('生殖泌尿道平滑肌鬆弛劑')
    const icd = screen.getByLabelText('N40.0 良性攝護腺增生未伴有下泌尿道症狀')

    // Thresholds are px, not rem: the root font-size is 12px here, so a rem
    // threshold would shift with the reader's font-size setting. The values are
    // the ones this layout has always used in practice. Phones stay on the
    // dense three-lane row — the date range, not the breakpoint, is what gives
    // way when the identity lane runs short (see the folding test below).
    expect(container.firstElementChild).toHaveClass(
      '@min-[312px]:grid-cols-[minmax(0,1.25fr)_minmax(7.5rem,0.75fr)_4.75rem]',
      '@min-[336px]:grid-cols-[minmax(0,1.2fr)_minmax(8.5rem,0.8fr)_4.75rem]',
      '@min-[384px]:grid-cols-[minmax(0,1.15fr)_minmax(10.5rem,1fr)_4.75rem]',
      '@min-[456px]:grid-cols-[minmax(0,1.15fr)_minmax(14rem,1fr)_4.75rem]',
    )
    expect(clinicalLane).toHaveClass('@min-[312px]:h-10', '@min-[312px]:grid-rows-2')
    expect(category).toHaveClass('max-w-full')
    expect(category).not.toHaveClass('max-w-[10rem]')
    expect(icd.parentElement).toHaveClass('@min-[312px]:row-start-2')
    const icdTooltip = screen.getByTestId('medication-icd-tooltip')
    expect(icdTooltip).toHaveClass(
      'border-primary/20',
      'bg-secondary',
      'text-secondary-foreground',
      'shadow-lg',
    )
    expect(icdTooltip).not.toHaveClass('bg-foreground', 'text-background')
  })
})
