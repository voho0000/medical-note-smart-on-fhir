import { fireEvent, render, screen, within } from '@testing-library/react'
import { DecisionPointDetail } from '@/features/clinical-decision-support/renderers/visit/DecisionPointDetail'
import type { DecisionPointView } from '@/features/clinical-decision-support/types'

/**
 * A decision point's card carries what the guideline says about it — the
 * points for the clinician and each cited recommendation — folded under one
 * line, as the evidence is, so the question and buttons stay in front.
 */
const point: DecisionPointView = {
  dp: 'DP-12',
  semanticId: 'hf-iron-anaemia',
  block: 'treatment',
  group: 'additional',
  label: '缺鐵與貧血',
  state: 'info',
  headline: '無缺鐵',
  actions: [],
  moduleIds: [],
  source: 'hf',
  guideline: {
    points: ['所有 HF 病人定期篩檢貧血與缺鐵'],
    references: [{
      source: 'ESC 2026 HF',
      section: '10.x',
      page: 66,
      recommendation: { class: 'I', level: 'C' },
      quote: 'Example sentence from the guideline.',
    }],
  },
}

function renderCard(view: DecisionPointView) {
  return render(
    <DecisionPointDetail
      point={view}
      steps={[{ key: `visit:${view.semanticId}`, point: view }]}
      isEnglish={false}
      sourceOfPage="hf"
      modules={new Map()}
      renderDetail={() => null}
      onClose={jest.fn()}
    />,
  )
}

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn()
})

it('shows the guideline points as the card opens, and folds the cited recommendations under 「出處與依據」', () => {
  renderCard(point)
  // Open at once: a point with nothing to decide still says what the guideline holds.
  const guideline = screen.getByTestId('cdss-visit-detail-guideline')
  expect(within(guideline).getByText('指引重點')).toBeVisible()
  expect(within(guideline).getByTestId('cdss-visit-detail-guideline-points')).toHaveTextContent('所有 HF 病人定期篩檢貧血與缺鐵')
  const fold = screen.getByTestId('cdss-visit-detail-evidence') as HTMLDetailsElement
  expect(fold).not.toContainElement(guideline)
  expect(fold.open).toBe(false)
  expect(fold).toHaveTextContent('出處與依據')
  expect(fold).toHaveTextContent('ESC 2026 HF')
  expect(screen.getAllByRole('group').filter((element) => element.tagName === 'DETAILS')).toHaveLength(1)
  fireEvent.click(within(fold).getByText('出處與依據'))
  expect(fold.open).toBe(true)
  const references = within(fold).getByTestId('cdss-visit-detail-guideline-references')
  expect(references).toHaveTextContent('ESC 2026 HF §10.x · p.66 · Class I, C')
  expect(references).toHaveTextContent('“Example sentence from the guideline.”')
  // With the guideline in the card, there is no 「no module」 line under it.
  expect(screen.queryByText(/沒有對應的模組/)).toBeNull()
})

it('keeps the 「no module」 line for a point with neither a module nor a guideline', () => {
  const { guideline: _unused, ...bare } = point
  renderCard(bare)
  expect(screen.queryByTestId('cdss-visit-detail-evidence')).toBeNull()
  expect(screen.queryByTestId('cdss-visit-detail-guideline')).toBeNull()
  expect(screen.getByText(/沒有對應的模組/)).toBeInTheDocument()
})
