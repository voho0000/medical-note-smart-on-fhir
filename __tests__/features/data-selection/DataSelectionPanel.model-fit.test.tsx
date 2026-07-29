import { render, screen } from '@testing-library/react'
import { DataSelectionPanel } from '@/features/data-selection/components/DataSelectionPanel'
import {
  ALL_DATA_FILTERS,
  ALL_DATA_SELECTION,
} from '@/src/shared/constants/data-selection.constants'

const mockClinicalAiInput = jest.fn()

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      common: { preview: '預覽' },
      dataSelection: {
        title: '資料選擇',
        scopeDescription: 'scope',
      },
    },
  }),
}))
jest.mock('@/src/application/hooks/use-clinical-context.hook', () => ({
  useClinicalContext: () => ({
    getFormattedClinicalContext: () => 'saved formatted',
    getFullClinicalContext: () => 'saved masked',
  }),
}))
jest.mock('@/src/application/hooks/ai-generation/use-clinical-ai-input.hook', () => ({
  useClinicalAiInput: (...args: unknown[]) => mockClinicalAiInput(...args),
}))
jest.mock('@/features/data-selection/hooks/useResolvedDataSelectionModel', () => ({
  useResolvedDataSelectionModel: () => ({
    modelId: 'small-model',
    contextLimit: 32_768,
  }),
}))
jest.mock('@/features/data-selection/hooks/useDataCategories', () => ({
  useDataCategories: () => [],
}))
jest.mock('@/features/data-selection/components/DataSelectionTab', () => ({
  DataSelectionTab: (props: {
    selectedData: { observations: boolean }
    filters: { encounterTimeRange: string; labDepth: string }
    displayedDocumentMode?: string
  }) => (
    <div data-testid="selection-values">
      {JSON.stringify({
        observations: props.selectedData.observations,
        encounterTimeRange: props.filters.encounterTimeRange,
        labDepth: props.filters.labDepth,
        documentMode: props.displayedDocumentMode ?? 'saved',
      })}
    </div>
  ),
}))
jest.mock('@/features/data-selection/components/PreviewTab', () => ({
  PreviewTab: () => null,
}))

const effectiveProfile = {
  selection: { ...ALL_DATA_SELECTION, observations: false },
  filters: {
    ...ALL_DATA_FILTERS,
    encounterTimeRange: '3m' as const,
    labDepth: 'latest' as const,
  },
  documentMode: 'latestAdmission' as const,
  documentIds: [],
}

function fittedInput(adapted: boolean) {
  return {
    dataReady: true,
    clinicalContext: 'context',
    formattedClinicalContext: 'formatted',
    effectiveProfile: adapted
      ? effectiveProfile
      : {
          selection: ALL_DATA_SELECTION,
          filters: ALL_DATA_FILTERS,
          documentMode: 'all',
          documentIds: [],
        },
    contextAdaptation: adapted
      ? {
          tier: 'tight',
          contextLimit: 32_768,
          targetTokens: 15_822,
          originalTokens: 30_000,
          adaptedTokens: 14_000,
        }
      : null,
  }
}

describe('DataSelectionPanel model-fitted controls', () => {
  beforeEach(() => {
    mockClinicalAiInput.mockReturnValue(fittedInput(true))
  })

  it('shows the temporary fitted controls for a small model and restores saved controls for a large model', () => {
    const props = {
      clinicalData: {} as never,
      selectedData: { ...ALL_DATA_SELECTION },
      filters: { ...ALL_DATA_FILTERS },
      onSelectionChange: jest.fn(),
      onFiltersChange: jest.fn(),
    }
    const { rerender } = render(<DataSelectionPanel {...props} />)

    expect(screen.getByTestId('selection-values')).toHaveTextContent(
      '"observations":false',
    )
    expect(screen.getByTestId('selection-values')).toHaveTextContent(
      '"encounterTimeRange":"3m"',
    )
    expect(screen.getByTestId('selection-values')).toHaveTextContent(
      '"labDepth":"latest"',
    )
    expect(screen.getByTestId('selection-values')).toHaveTextContent(
      '"documentMode":"latestAdmission"',
    )

    mockClinicalAiInput.mockReturnValue(fittedInput(false))
    rerender(<DataSelectionPanel {...props} />)

    expect(screen.getByTestId('selection-values')).toHaveTextContent(
      '"observations":true',
    )
    expect(screen.getByTestId('selection-values')).toHaveTextContent(
      '"encounterTimeRange":"all"',
    )
    expect(screen.getByTestId('selection-values')).toHaveTextContent(
      '"labDepth":"all"',
    )
    expect(screen.getByTestId('selection-values')).toHaveTextContent(
      '"documentMode":"saved"',
    )
  })
})
