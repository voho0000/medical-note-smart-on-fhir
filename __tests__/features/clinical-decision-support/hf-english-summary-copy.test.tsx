import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/HeartFailureVisitFlow'
import { buildHeartFailureVisitFlow } from '@/features/clinical-decision-support/renderers/heart-failure-visit-flow'
import { buildHeartFailureBoard } from '@/features/clinical-decision-support/renderers/heart-failure-board'
import type { CdssResult } from '@/features/clinical-decision-support/types'

test('the Chinese UI copies the English preview to the clipboard', async () => {
  const now = new Date('2026-09-12T10:00:00+08:00')
  const result: CdssResult = { packId: 'heart-failure-cdss', packVersion: '2.0.0', title: '', summary: '', recommendations: [], notEvaluated: [], disclaimer: '' }
  const board = buildHeartFailureBoard(result, 'zh-TW', now)!
  const flow = buildHeartFailureVisitFlow({ board, result, now, isEnglish: false, patientId: 'synthetic', decisions: {} })
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const writeText = jest.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  try {
    render(<HeartFailureVisitFlow board={board} flow={flow} now={now} isEnglish={false}
      expandedId={null} onToggle={() => {}} renderDetail={() => null} packVersion="2.0.0" />)
    expect(screen.getByTestId('cdss-hf-summary-text').textContent).toBe(flow.englishSummaryText)
    fireEvent.click(screen.getByRole('button', { name: '複製英文摘要' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(flow.englishSummaryText))
    expect(writeText.mock.calls[0][0]).not.toMatch(/[\u3400-\u9fff]/)
    await waitFor(() => expect(screen.getByTestId('cdss-hf-copy-summary')).toHaveTextContent('已複製'))
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
})
