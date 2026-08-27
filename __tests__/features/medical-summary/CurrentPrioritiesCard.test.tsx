import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { CurrentPrioritiesCard } from '@/features/medical-summary/components/CurrentPrioritiesCard'
import type { MedicalSummaryResult } from '@/src/core/entities/medical-summary.entity'

jest.mock('sonner', () => ({
  toast: { error: jest.fn() },
}))

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

function renderCard() {
  render(
    <CurrentPrioritiesCard
      result={result}
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
