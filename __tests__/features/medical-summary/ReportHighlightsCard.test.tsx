/** @jest-environment jsdom */
// 影像與病理重點 rendering: modality groups in clinical order, newest three per
// group with a toggle, fallback rows labelled as such, and the whole row
// opening the report. Synthetic fixtures only.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ReportHighlightsCard } from '@/features/medical-summary/components/ReportHighlightsCard'
import type { ReportHighlight, ReportHighlights } from '@/src/core/entities/medical-summary.entity'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))

const ms = zhTW.medicalSummary
const LABELS = {
  title: ms.reportsTitle,
  subtitle: ms.reportsSubtitle,
  kindLabels: ms.reportsKindLabels,
  showMore: ms.reportsShowMore,
  showLess: ms.reportsShowLess,
  conclusionTag: ms.reportsConclusionTag,
  openingTag: ms.reportsOpeningTag,
  droppedQuotes: ms.reportsDroppedQuotes,
  fallbackCount: ms.reportsFallbackCount,
}

const item = (overrides: Partial<ReportHighlight> & Pick<ReportHighlight, 'key' | 'kind'>): ReportHighlight => ({
  resourceType: 'DiagnosticReport',
  resourceId: `dr-${overrides.key}`,
  title: `Report ${overrides.key}`,
  date: '2026-01-01',
  organization: '示範測試醫院',
  excerpts: [`Excerpt of ${overrides.key}.`],
  excerptSource: 'ai',
  ...overrides,
})

const HIGHLIGHTS: ReportHighlights = {
  items: [
    item({ key: 'L1', kind: 'xray', date: '2026-06-02' }),
    item({ key: 'L2', kind: 'ct', date: '2026-05-01', excerpts: ['No acute lesion.', 'Old infarct in left basal ganglia.'] }),
    item({ key: 'L3', kind: 'ct', date: '2026-04-01' }),
    item({ key: 'L4', kind: 'ct', date: '2026-03-01', excerptSource: 'conclusion', excerpts: ['Stable post-operative change.'] }),
    item({ key: 'L5', kind: 'ct', date: '2026-02-01', excerptSource: 'opening', excerpts: ['Axial images were obtained'], excerptTruncated: true }),
    item({ key: 'L6', kind: 'pathology', date: '2025-12-01', excerpts: ['管狀腺瘤，低度分化不良。'] }),
    item({ key: 'L7', kind: 'other', date: '2025-11-01' }),
    item({ key: 'L8', kind: 'echo', date: '2025-10-01' }),
  ],
  totalReports: 8,
  aiSummarized: 6,
  droppedQuoteCount: 2,
}

const groupOrder = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-report-kind]')].map((node) => node.getAttribute('data-report-kind'))

describe('ReportHighlightsCard', () => {
  it('groups by modality in clinical order with the verbatim subtitle', () => {
    const { container } = render(<ReportHighlightsCard highlights={HIGHLIGHTS} labels={LABELS} />)
    expect(screen.getByRole('heading', { name: /影像與病理重點/ })).toHaveTextContent('AI 只從原文挑句，未改寫')
    expect(groupOrder(container)).toEqual(['pathology', 'ct', 'echo', 'xray', 'other'])
    expect(screen.getByRole('heading', { name: /^病理/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^心臟超音波/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^X 光/ })).toBeInTheDocument()
  })

  it('shows the newest three per group and toggles the rest', () => {
    render(<ReportHighlightsCard highlights={HIGHLIGHTS} labels={LABELS} />)
    const ct = screen.getByRole('group', { name: /^CT/ })
    expect(within(ct).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      expect.stringContaining('2026-05-01'),
      expect.stringContaining('2026-04-01'),
      expect.stringContaining('2026-03-01'),
    ])
    const toggle = within(ct).getByRole('button', { name: '顯示其餘 1 份' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(within(ct).getAllByRole('listitem')).toHaveLength(4)
    expect(within(ct).getByRole('button', { name: '收合' })).toHaveAttribute('aria-expanded', 'true')
    // Groups with three or fewer reports have no toggle.
    expect(within(screen.getByRole('group', { name: /^病理/ })).queryByRole('button', { name: /顯示其餘/ })).toBeNull()
  })

  it('labels fallback rows, quotes each excerpt on its own line, and states the counts', () => {
    render(<ReportHighlightsCard highlights={HIGHLIGHTS} labels={LABELS} />)
    const ct = screen.getByRole('group', { name: /^CT/ })
    fireEvent.click(within(ct).getByRole('button', { name: '顯示其餘 1 份' }))
    const rows = within(ct).getAllByRole('listitem')
    expect(within(rows[0]).getByText('“No acute lesion.”')).toBeInTheDocument()
    expect(within(rows[0]).getByText('“Old infarct in left basal ganglia.”')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('結論段')).toBeNull()
    expect(within(rows[2]).getByText('結論段')).toBeInTheDocument()
    expect(within(rows[3]).getByText('原文開頭')).toBeInTheDocument()
    expect(within(rows[3]).getByText('“Axial images were obtained…”')).toBeInTheDocument()
    expect(screen.getByText('「管狀腺瘤，低度分化不良。」')).toBeInTheDocument()
    expect(screen.getByText('2 句與原文不符，已略過')).toBeInTheDocument()
    expect(screen.getByText('2 份僅列結論段或開頭')).toBeInTheDocument()
  })

  it('hides the footer lines when there is nothing to report', () => {
    render(
      <ReportHighlightsCard
        highlights={{ items: [item({ key: 'L1', kind: 'ct' })], totalReports: 1, aiSummarized: 1, droppedQuoteCount: 0 }}
        labels={LABELS}
      />,
    )
    expect(screen.queryByText(/與原文不符/)).toBeNull()
    expect(screen.queryByText(/僅列結論段/)).toBeNull()
  })

  it('navigates to the report with its first excerpt as the pinpoint', () => {
    const onNavigate = jest.fn()
    render(<ReportHighlightsCard highlights={HIGHLIGHTS} labels={LABELS} onNavigate={onNavigate} />)
    const ct = screen.getByRole('group', { name: /^CT/ })
    fireEvent.click(within(ct).getAllByRole('listitem')[0].querySelector('button')!)
    expect(onNavigate).toHaveBeenCalledWith({
      resourceType: 'DiagnosticReport',
      resourceId: 'dr-L2',
      display: 'Report L2',
      date: '2026-05-01',
      evidenceQuote: 'No acute lesion.',
    })
  })

  it('renders nothing without reports', () => {
    const { container } = render(
      <ReportHighlightsCard highlights={{ items: [], totalReports: 0, aiSummarized: 0, droppedQuoteCount: 0 }} labels={LABELS} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
