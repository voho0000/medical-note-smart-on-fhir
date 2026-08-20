import { renderHook, waitFor } from '@testing-library/react'
import { useAutoGenerate } from '@/features/clinical-insights/hooks/useAutoGenerate'

const basePanel = {
  id: 'summary-card',
  prompt: 'Summarize the record',
  showInSummary: true,
}

describe('useAutoGenerate', () => {
  // The per-module autoGenerate toggle is the ONLY background-run control;
  // there is no separate consent layer above it.
  it('runs only modules whose autoGenerate toggle is on, and only once', async () => {
    const runPanels = jest.fn(async () => undefined)
    const { rerender } = renderHook(
      ({ autoGenerate }) => useAutoGenerate({
        panels: [{ ...basePanel, autoGenerate }],
        canGenerate: true,
        context: 'patient context',
        modelId: 'gpt-5.4-nano',
        runPanels,
        runScope: 'local:import-a',
      }),
      { initialProps: { autoGenerate: false } },
    )

    expect(runPanels).not.toHaveBeenCalled()

    rerender({ autoGenerate: true })
    await waitFor(() => expect(runPanels).toHaveBeenCalledWith(['summary-card']))

    rerender({ autoGenerate: true })
    expect(runPanels).toHaveBeenCalledTimes(1)
  })

  it('does not run in the background while generation is not possible', async () => {
    const runPanels = jest.fn(async () => undefined)
    renderHook(() => useAutoGenerate({
      panels: [{ ...basePanel, autoGenerate: true }],
      canGenerate: false,
      context: 'patient context',
      modelId: 'gpt-5.4-nano',
      runPanels,
      runScope: 'local:import-a',
    }))

    expect(runPanels).not.toHaveBeenCalled()
  })
})
