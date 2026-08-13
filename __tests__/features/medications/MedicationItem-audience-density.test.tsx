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
    expect(within(container.firstElementChild?.children[1] as HTMLElement)
      .queryByText(/R05CB01/)).not.toBeInTheDocument()
    const tooltip = screen.getByTestId('medication-terminology-tooltip')
    expect(within(tooltip).getByText('愛克痰發泡錠600毫克')).toBeInTheDocument()
    expect(within(tooltip).getByText('ACTEIN EFFERVESCENT TABLETS 600MG')).toBeInTheDocument()
    expect(within(tooltip).getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
    expect(within(tooltip).getByText('R05CB01 · acetylcysteine')).toBeInTheDocument()
    expect(compactTitle).toBeInTheDocument()
    expect(container.firstElementChild?.children).toHaveLength(2)
  })

  it('shows ingredient first and product second on one line without inline ATC', () => {
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
    expect(screen.getAllByText(/ACTEIN EFFERVESCENT TABLETS 600MG/)).toHaveLength(2)
    const tooltip = screen.getByTestId('medication-terminology-tooltip')
    expect(within(tooltip).getByText('愛克痰發泡錠600毫克')).toBeInTheDocument()
    expect(within(tooltip).getByText('ACTEIN EFFERVESCENT TABLETS 600MG')).toBeInTheDocument()
    expect(within(tooltip).getByText('ACETYLCYSTEINE 600 MG')).toBeInTheDocument()
    expect(within(tooltip).getByText('R05CB01 · acetylcysteine')).toBeInTheDocument()
    expect(within(tooltip).getByText(/健保署藥品主檔補充/)).toBeInTheDocument()
    const metadataLine = container.firstElementChild?.children[1]
    expect(metadataLine).not.toHaveTextContent('R05CB01')
    expect(container.firstElementChild?.children).toHaveLength(2)
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

    const metadataLine = container.firstElementChild?.children[1]
    expect(metadataLine).toHaveTextContent(
      '執行 2025/05/20–2025/05/21、2025/05/22–2025/05/28',
    )
    expect(container.firstElementChild?.children).toHaveLength(2)
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
    expect(badge).toHaveClass('shrink-0')
  })
})
