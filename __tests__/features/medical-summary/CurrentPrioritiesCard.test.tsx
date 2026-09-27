import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { CurrentPrioritiesCard } from '@/features/medical-summary/components/CurrentPrioritiesCard'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'
import { trackEvent } from '@/src/application/telemetry/usage-analytics'

jest.mock('sonner', () => ({
  toast: { error: jest.fn() },
}))

jest.mock('@/src/application/telemetry/usage-analytics', () => {
  const actual = jest.requireActual('@/src/application/telemetry/usage-analytics')
  return { ...actual, trackEvent: jest.fn() }
})

const result: MedicalSummaryResult = {
  headline: '近期需關注腎功能與用藥整合',
  summary: [
    { text: '腎功能近期波動。', emphasis: true, sourceKeys: [] },
    { text: '請回診時核對實際藥袋。', emphasis: false, sourceKeys: [] },
  ],
  investigations: [],
  medicationEducation: [],
  medicationReview: { regimen: [], changes: [], reconciliation: [] },
  problems: [],
  decisions: [],
  timeline: [],
  sourceIndex: [],
  droppedTimelineCount: 0,
}

function renderCard(cardResult = result, onNavigate = jest.fn()) {
  render(
    <CurrentPrioritiesCard
      result={cardResult}
      onNavigate={onNavigate}
      title="摘要重點"
      generatedByLine="由 3 筆就醫生成"
      expandSummaryLabel="展開摘要"
      collapseSummaryLabel="收合摘要"
      copyLabel="複製"
      copiedLabel="已複製"
      copyFailedLabel="複製失敗"
      typeLabel={(type) => type ?? ''}
      unverifiedLabel="來源可能有問題"
    />,
  )
}

describe('CurrentPrioritiesCard', () => {
  it('passes claim-specific document evidence through to source navigation', () => {
    const onNavigate = jest.fn()
    renderCard({ ...result, summary: [{ text: '合成測試摘要。', emphasis: false, sourceKeys: ['D1'],
      documentEvidence: [{ source: 'D1', quote: 'Synthetic original passage.', verification: 'exact' }] }],
      sourceIndex: [{ key: 'D1', num: 1, verified: true, resourceType: 'DocumentReference', resourceId: 'doc', display: '合成文件' }] }, onNavigate)
    fireEvent.click(screen.getByRole('button', { name: /1 · DocumentReference/ }))
    fireEvent.click(screen.getByRole('button', { name: /合成文件/ }))
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'doc', evidenceQuote: 'Synthetic original passage.' }))
  })
  const writeText = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('copies the complete clinical summary without provenance UI text', async () => {
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: '複製' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith([
      '摘要重點',
      '近期需關注腎功能與用藥整合',
      '腎功能近期波動。請回診時核對實際藥袋。',
    ].join('\n')))
    await waitFor(() => expect(screen.getByRole('button', { name: '已複製' })).toBeInTheDocument())
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('由 3 筆就醫生成'))
  })

  it('surfaces clipboard permission failures', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: '複製' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('複製失敗'))
  })
})

describe('CurrentPrioritiesCard usage analytics', () => {
  const mockedTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>
  const writeText = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('reports one summary_copy for the hero block', async () => {
    writeText.mockResolvedValue(undefined)
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: '複製' }))

    await waitFor(() => expect(mockedTrackEvent).toHaveBeenCalledTimes(1))
    expect(mockedTrackEvent).toHaveBeenCalledWith('summary_copy', { block: 'hero' })
  })

  it('reports nothing when the clipboard write fails', async () => {
    writeText.mockRejectedValue(new Error('clipboard blocked'))
    renderCard()

    fireEvent.click(screen.getByRole('button', { name: '複製' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(mockedTrackEvent).not.toHaveBeenCalled()
  })
})
