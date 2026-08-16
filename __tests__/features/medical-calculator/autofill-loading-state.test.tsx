import { render, screen } from '@testing-library/react'
import { CalculatorDetail } from '@/features/medical-calculator/components/CalculatorDetail'
import { CALCULATORS } from '@/features/medical-calculator/calculators'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { useLabAutofill } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'

jest.mock('@/features/medical-calculator/hooks/use-lab-autofill.hook', () => ({
  useLabAutofill: jest.fn(),
}))

const mockUseLabAutofill = jest.mocked(useLabAutofill)

/** Autofill with nothing in it — what the hook returns while the chart loads. */
function emptyAutofill() {
  return { resolve: () => undefined, sex: undefined }
}

/** Autofill that can answer a serum-creatinine lookup. */
function populatedAutofill() {
  return {
    resolve: (source: any) =>
      source?.kind === 'lab' || source?.kind === 'labLoinc'
        ? { value: 1.93, unit: 'mg/dL', date: '2026-06-02' }
        : undefined,
    sex: 'male' as const,
  }
}

function state(over: Partial<ReturnType<typeof useLabAutofill>> = {}) {
  return {
    autofill: emptyAutofill(),
    isLoading: false,
    error: null,
    retry: jest.fn(async () => {}),
    ...over,
  } as ReturnType<typeof useLabAutofill>
}

const egfr = CALCULATORS.find((c) => c.id === 'egfr-ckd-epi-2021')!

function renderDetail() {
  return render(
    <LanguageProvider>
      <CalculatorDetail
        calc={egfr}
        onBack={() => {}}
        isFavorite={false}
        onToggleFavorite={() => {}}
      />
    </LanguageProvider>,
  )
}

describe('calculator autofill loading/error states', () => {
  afterEach(() => jest.clearAllMocks())

  it('says the chart is still loading instead of leaving the blank field unexplained', () => {
    mockUseLabAutofill.mockReturnValue(state({ isLoading: true }))
    renderDetail()
    expect(screen.getByText(/病人資料載入中/)).toBeInTheDocument()
    // The wording must not let a blank read as a clinical absence.
    expect(screen.getByText(/空白欄位不代表沒有這項檢驗/)).toBeInTheDocument()
  })

  it('surfaces a fetch failure with a retry instead of an empty form', () => {
    mockUseLabAutofill.mockReturnValue(state({ error: new Error('network down') }))
    renderDetail()
    expect(screen.getByRole('alert')).toHaveTextContent(/無法讀取病人資料/)
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument()
  })

  it('stays quiet once the data has settled', () => {
    mockUseLabAutofill.mockReturnValue(state({ autofill: populatedAutofill() }))
    renderDetail()
    expect(screen.queryByText(/病人資料載入中/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('fills the inputs when the chart arrives after the calculator was opened', () => {
    // Opening a calculator mid-load used to seed from the empty autofill and
    // never revisit it, leaving the fields blank for the rest of the session.
    mockUseLabAutofill.mockReturnValue(state({ isLoading: true }))
    const { rerender } = renderDetail()
    expect(screen.queryByDisplayValue('1.93')).not.toBeInTheDocument()

    mockUseLabAutofill.mockReturnValue(state({ autofill: populatedAutofill() }))
    rerender(
      <LanguageProvider>
        <CalculatorDetail
          calc={egfr}
          onBack={() => {}}
          isFavorite={false}
          onToggleFavorite={() => {}}
        />
      </LanguageProvider>,
    )

    expect(screen.getByDisplayValue('1.93')).toBeInTheDocument()
  })
})
