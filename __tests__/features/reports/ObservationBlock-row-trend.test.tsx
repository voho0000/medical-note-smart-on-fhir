import { fireEvent, render, screen } from '@testing-library/react'
import { ObservationBlock } from '@/features/clinical-summary/reports/components/ObservationBlock'
import type { Observation } from '@/features/clinical-summary/reports/types'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'
import { RightDetailProvider, useRightDetail } from '@/src/application/providers/right-detail.provider'

// jsdom has no matchMedia, so the layout hook reads "desktop" unless a test
// opts in — which is what keeps the desktop case honest below.
function useCompactLayout() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

function RightDetailProbe() {
  const { detail } = useRightDetail()
  return <span data-testid="right-detail-source">{detail?.sourceId ?? 'none'}</span>
}

const POTASSIUM: Observation = {
  id: 'obs-k',
  code: { text: 'Potassium' },
  valueQuantity: { value: 4.1, unit: 'mmol/L' },
}

function renderBlock(observation: Observation = POTASSIUM) {
  return render(
    <LanguageProvider>
      <AudienceProvider>
        <RightDetailProvider>
          <RightDetailProbe />
          <ObservationBlock observation={observation} />
        </RightDetailProvider>
      </AudienceProvider>
    </LanguageProvider>,
  )
}

describe('ObservationBlock trend entry point', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('keeps the icon button on desktop', () => {
    renderBlock()

    const row = screen.getByTestId('compact-lab-result-row')
    expect(row).not.toHaveAttribute('role')
    expect(row.querySelector('[data-report-history-action]')).not.toBeNull()
  })

  it('hands the tap to the row on the single-panel layout', () => {
    // These rows live inside an expanded panel and are ~24px tall, so the 36px
    // icon button they used to carry was clipped to less than it declared. The
    // row is the target instead — same contract as the flat report lists.
    useCompactLayout()
    renderBlock()

    const row = screen.getByTestId('compact-lab-result-row')
    expect(row).toHaveAttribute('role', 'button')
    expect(row).toHaveAttribute('tabindex', '0')
    // The name uses the analyte label the row actually DISPLAYS (canonical "K"
    // for clinicians, the lay name for patients), so the accessible name always
    // matches the visible one.
    expect(row).toHaveAttribute('aria-label', 'K 4.1 mmol/L，查看趨勢')
    expect(row.querySelector('[data-report-history-action]')).toBeNull()

    fireEvent.click(row)
    expect(screen.getByTestId('right-detail-source')).toHaveTextContent('observation-longitudinal:obs-k')
  })

  it('leaves a component-bearing row alone', () => {
    // A panel that expands to components (blood pressure → systolic/diastolic)
    // never offered a trend, because trending only the parent would mislead.
    // The row-tap has to follow the same rule, not invent an entry point.
    useCompactLayout()
    renderBlock({
      id: 'obs-bp',
      code: { text: 'Blood pressure' },
      component: [
        { code: { text: 'Systolic' }, valueQuantity: { value: 128, unit: 'mmHg' } },
        { code: { text: 'Diastolic' }, valueQuantity: { value: 76, unit: 'mmHg' } },
      ],
    })

    const rows = screen.getAllByTestId('compact-lab-result-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row).not.toHaveAttribute('role')
  })

  it('renders blood-pressure components without a redundant parent row or nested border', () => {
    const { container } = renderBlock({
      id: 'obs-bp',
      code: {
        text: 'Blood Pressure',
        coding: [{ system: 'http://loinc.org', code: '85354-9' }],
      },
      component: [
        {
          code: { text: 'Systolic blood pressure' },
          valueQuantity: { value: 130, unit: 'mmHg' },
        },
        {
          code: { text: 'Diastolic blood pressure' },
          valueQuantity: { value: 90, unit: 'mmHg' },
        },
      ],
    })

    expect(screen.queryByText('Blood Pressure')).not.toBeInTheDocument()
    expect(screen.getByText('Systolic blood pressure')).toBeInTheDocument()
    expect(screen.getByText('Diastolic blood pressure')).toBeInTheDocument()
    expect(screen.getAllByTestId('compact-lab-result-row')).toHaveLength(2)
    expect(container.querySelector('.border-l')).toBeNull()
  })

  it('keeps the parent row for other composite observations', () => {
    const { container } = renderBlock({
      id: 'obs-panel',
      code: { text: 'Metabolic panel' },
      component: [
        { code: { text: 'Sodium' }, valueQuantity: { value: 140, unit: 'mmol/L' } },
        { code: { text: 'Potassium' }, valueQuantity: { value: 4.1, unit: 'mmol/L' } },
      ],
    })

    expect(screen.getByText('Metabolic panel')).toBeInTheDocument()
    expect(screen.getAllByTestId('compact-lab-result-row')).toHaveLength(3)
    expect(container.querySelector('.border-l')).not.toBeNull()
  })

  it('uses the same conservative comparison for nested observations', () => {
    renderBlock({
      id: 'obs-hba1c',
      code: { text: 'HbA1c' },
      valueQuantity: { value: 6.1, unit: '%' },
      referenceRange: [{ text: '[4.0 - 6.0]' }],
    })

    expect(screen.getByLabelText('高於參考')).toBeInTheDocument()
    expect(screen.queryByText('未判讀')).not.toBeInTheDocument()
  })

  it('keeps multiple reference ranges unassessed instead of selecting the first', () => {
    renderBlock({
      id: 'obs-age-bands',
      code: { text: 'Age-stratified analyte' },
      valueQuantity: { value: 6.1, unit: 'mg/dL' },
      referenceRange: [
        { low: { value: 4, unit: 'mg/dL' }, high: { value: 6, unit: 'mg/dL' } },
        { low: { value: 5, unit: 'mg/dL' }, high: { value: 7, unit: 'mg/dL' } },
      ],
    })

    expect(screen.getByLabelText('未判讀')).toBeInTheDocument()
    expect(screen.queryByText('高於參考')).not.toBeInTheDocument()
    expect(screen.queryByText('低於參考')).not.toBeInTheDocument()
  })
})
