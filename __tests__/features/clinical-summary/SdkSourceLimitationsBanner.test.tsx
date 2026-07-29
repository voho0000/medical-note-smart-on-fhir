import { render, screen } from '@testing-library/react'
import { SdkSourceLimitationsBanner } from '@/features/clinical-summary/components/SdkSourceLimitationsBanner'
import { useClinicalData } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'
import { useLanguage } from '@/src/application/providers/language.provider'

jest.mock('@/src/application/hooks/clinical-data/use-clinical-data-query.hook')
jest.mock('@/src/application/providers/language.provider')

function mockSdkSource(version: string, mergedCount: number, distinctValueGroups: number) {
  jest.mocked(useClinicalData).mockReturnValue({
    isLoading: false,
    sourceMetadata: {
      source: 'health-bank-sdk-json',
      converterVersion: version,
      labDuplicateMerge: {
        sourceCount: 10,
        convertedCount: 8,
        mergedCount,
        conflictingValueGroupCount: distinctValueGroups,
      },
      unitInference: {
        policyVersion: 'sdk-unit-policy-v1',
        inferredCount: 2,
        unitlessCount: 6,
        unresolvedCount: 1,
      },
    },
  } as any)
}

describe('SdkSourceLimitationsBanner', () => {
  beforeEach(() => {
    jest.mocked(useLanguage).mockReturnValue({ locale: 'zh-TW' } as any)
  })

  it('states that version 0.1.4 merged qualified duplicates and preserved distinct results', () => {
    mockSdkSource('0.1.4', 394, 44)

    render(<SdkSourceLimitationsBanner />)

    expect(screen.getByText(/確認為相同的重複表示，合併 394 筆/))
      .toHaveTextContent('另有 44 組同日不同數值，已全部保留')
    expect(screen.queryByText(/請重新匯入原始 SDK JSON/)).not.toBeInTheDocument()
  })

  it('asks legacy conversions to be re-imported instead of claiming preservation', () => {
    mockSdkSource('0.1.0', 156, 46)

    render(<SdkSourceLimitationsBanner />)

    expect(screen.getByText(/這份資料由舊版轉換器 0.1.0 產生/))
      .toHaveTextContent('其中 46 組不同數值可能只保留一筆')
    expect(screen.getByText(/請重新匯入原始 SDK JSON/))
      .toHaveTextContent('以 0.1.3 或更新版本完整保留')
    expect(screen.queryByText(/已全部保留/)).not.toBeInTheDocument()
  })
})
