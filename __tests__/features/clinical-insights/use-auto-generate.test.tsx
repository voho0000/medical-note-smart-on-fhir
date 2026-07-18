import { renderHook, waitFor } from '@testing-library/react'
import { useAutoGenerate } from '@/features/clinical-insights/hooks/useAutoGenerate'

const panels = [{
  id: 'summary-card',
  prompt: 'Summarize the record',
  showInSummary: true,
  autoGenerate: true,
}]

describe('useAutoGenerate authorization gate', () => {
  it('does not run in the background until the active import is authorized', async () => {
    const runPanels = jest.fn(async () => undefined)
    const { rerender } = renderHook(
      ({ authorized }) => useAutoGenerate({
        panels,
        canGenerate: true,
        autoRunAuthorized: authorized,
        context: 'patient context',
        modelId: 'gpt-5.4-nano',
        runPanels,
        runScope: 'local:import-a',
      }),
      { initialProps: { authorized: false } },
    )

    expect(runPanels).not.toHaveBeenCalled()

    rerender({ authorized: true })
    await waitFor(() => expect(runPanels).toHaveBeenCalledWith(['summary-card']))

    rerender({ authorized: true })
    expect(runPanels).toHaveBeenCalledTimes(1)
  })
})
