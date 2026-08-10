import { renderHook, waitFor } from '@testing-library/react'
import { useMedcloudAutoSummary } from '@/src/application/hooks/medical-summary/use-medcloud-auto-summary.hook'
import { useMedcloudLaunchStore } from '@/src/application/launch/medcloud-launch.store'
import { VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID } from '@/src/application/launch/medcloud-launch-context'

describe('useMedcloudAutoSummary', () => {
  beforeEach(() => useMedcloudLaunchStore.getState().clear())

  it('waits for the FHIR summary runtime, then claims and generates once', async () => {
    const generate = jest.fn(async () => undefined)
    useMedcloudLaunchStore.getState().queueSummary('message-1')
    const { rerender } = renderHook((props: {
      dataReady: boolean
      isRestoring: boolean
    }) => useMedcloudAutoSummary({
      hasPatient: true,
      dataReady: props.dataReady,
      isGenerating: false,
      isRestoring: props.isRestoring,
      modelId: VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID,
      generate,
    }), {
      initialProps: { dataReady: false, isRestoring: true },
    })

    expect(generate).not.toHaveBeenCalled()
    expect(useMedcloudLaunchStore.getState().pendingSummaryMessageId).toBe('message-1')

    rerender({ dataReady: true, isRestoring: false })
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    expect(useMedcloudLaunchStore.getState().pendingSummaryMessageId).toBeNull()

    rerender({ dataReady: true, isRestoring: false })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('does not consume a request until tvghbrain is the selected model', () => {
    const generate = jest.fn(async () => undefined)
    useMedcloudLaunchStore.getState().queueSummary('message-2')

    renderHook(() => useMedcloudAutoSummary({
      hasPatient: true,
      dataReady: true,
      isGenerating: false,
      isRestoring: false,
      modelId: 'gemini-2.5-flash-lite',
      generate,
    }))

    expect(generate).not.toHaveBeenCalled()
    expect(useMedcloudLaunchStore.getState().pendingSummaryMessageId).toBe('message-2')
  })
})
