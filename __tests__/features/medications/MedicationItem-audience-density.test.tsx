import { render, screen, within } from '@testing-library/react'
import { MedicationItem } from '@/features/clinical-summary/medications/components/MedicationItem'
import type { MedicationRow } from '@/features/clinical-summary/medications/types'

let mockAudience: 'medical' | 'patient' = 'patient'

jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: mockAudience }),
}))

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    t: {
      medications: {
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
  it('keeps the patient row Chinese-only and two lines tall', () => {
    mockAudience = 'patient'
    const { container } = render(
      <MedicationItem medication={medicationRow('愛克痰發泡錠600毫克')} />,
    )

    expect(screen.getByText('愛克痰發泡錠600毫克')).toBeInTheDocument()
    expect(screen.queryByText('ACTEIN EFFERVESCENT TABLETS 600MG')).not.toBeInTheDocument()
    expect(screen.queryByText('ACETYLCYSTEINE 600 MG')).not.toBeInTheDocument()
    expect(screen.queryByText('ATC R05CB01')).not.toBeInTheDocument()
    expect(screen.queryByTestId('medication-terminology-tooltip')).not.toBeInTheDocument()
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
})
