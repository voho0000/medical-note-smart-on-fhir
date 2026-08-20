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
    for (const row of rows) expect(row).not.toHaveAttribute('role')
  })
})
