import { act, render, waitFor } from '@testing-library/react'
import { MedcloudLaunchProvider } from '@/src/application/providers/medcloud-launch.provider'
import {
  MEDCLOUD_LAUNCH_CONTEXT_ACK_TYPE,
  VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID,
  VGTPE_TVGHBRAIN_PROFILE_ID,
} from '@/src/application/launch/medcloud-launch-context'
import { useAiConfigStore } from '@/src/application/stores/ai-config.store'
import { useModelPrefsStore } from '@/src/application/stores/model-prefs.store'
import { useSummaryPrefsStore } from '@/src/application/stores/medical-summary-prefs.store'
import { useSafetyPrefsStore } from '@/src/application/stores/safety-prefs.store'
import { createEmptyOpenAiCompatibleConfig } from '@/src/shared/types/openai-compatible.types'

const launchHref = 'https://mediprisma.tw/app/?medcloud2=auto&site=vghtpe'

function extensionMessage(messageId = 'message-1', credential = 'runtime-secret') {
  const event = new MessageEvent('message', {
    data: {
      source: 'medcloud2-extension',
      type: 'MEDIPRISMA_LAUNCH_CONTEXT',
      version: 1,
      messageId,
      site: 'vghtpe',
      credential,
    },
    origin: 'https://mediprisma.tw',
  })
  Object.defineProperty(event, 'source', { value: window })
  return event
}

describe('MedcloudLaunchProvider', () => {
  let postMessage: jest.SpyInstance

  beforeEach(() => {
    postMessage = jest.spyOn(window, 'postMessage').mockImplementation(() => {})
    useAiConfigStore.setState({
      openAiCompatibleProfiles: [],
      openAiCompatible: createEmptyOpenAiCompatibleConfig(),
      credentialsHydrating: false,
    })
    useModelPrefsStore.setState({
      prefs: { chat: 'gemini-2.5-flash-lite', insights: 'gemini-2.5-flash-lite' },
    })
    useSummaryPrefsStore.setState({ modelId: 'gemini-2.5-flash-lite' })
    useSafetyPrefsStore.setState({ modelId: 'gemini-2.5-flash-lite' })
  })

  afterEach(() => postMessage.mockRestore())

  it('activates the runtime-only profile, selects it everywhere, and acknowledges', async () => {
    const { unmount } = render(
      <MedcloudLaunchProvider launchHref={launchHref}>
        <div>app</div>
      </MedcloudLaunchProvider>,
    )

    act(() => window.dispatchEvent(extensionMessage()))

    await waitFor(() => expect(
      useAiConfigStore.getState().openAiCompatibleProfiles[0],
    ).toMatchObject({
      profileId: VGTPE_TVGHBRAIN_PROFILE_ID,
      runtimeOnly: true,
      apiKey: 'runtime-secret',
    }))
    expect(useModelPrefsStore.getState().prefs).toEqual({
      chat: VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID,
      insights: VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID,
    })
    expect(useSummaryPrefsStore.getState().modelId).toBe(VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID)
    expect(useSafetyPrefsStore.getState().modelId).toBe(VGTPE_TVGHBRAIN_LOGICAL_MODEL_ID)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      source: 'mediprisma',
      type: MEDCLOUD_LAUNCH_CONTEXT_ACK_TYPE,
      messageId: 'message-1',
    }), 'https://mediprisma.tw')
    expect(Array.from({ length: localStorage.length }, (_, index) => (
      localStorage.getItem(localStorage.key(index) ?? '') ?? ''
    )).join('\n')).not.toContain('runtime-secret')

    unmount()
    expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(0)
  })

  it('holds a valid message until credential hydration completes', async () => {
    useAiConfigStore.setState({ credentialsHydrating: true })
    render(
      <MedcloudLaunchProvider launchHref={launchHref}>
        <div>app</div>
      </MedcloudLaunchProvider>,
    )

    act(() => window.dispatchEvent(extensionMessage()))
    expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(0)
    expect(postMessage).not.toHaveBeenCalled()

    act(() => useAiConfigStore.setState({ credentialsHydrating: false }))
    await waitFor(() => expect(
      useAiConfigStore.getState().openAiCompatibleProfiles[0]?.profileId,
    ).toBe(VGTPE_TVGHBRAIN_PROFILE_ID))
    expect(postMessage).toHaveBeenCalledTimes(1)
  })

  it('ignores messages from a different origin', () => {
    render(
      <MedcloudLaunchProvider launchHref={launchHref}>
        <div>app</div>
      </MedcloudLaunchProvider>,
    )
    const event = extensionMessage()
    Object.defineProperty(event, 'origin', { value: 'https://evil.example' })

    act(() => window.dispatchEvent(event))

    expect(useAiConfigStore.getState().openAiCompatibleProfiles).toHaveLength(0)
    expect(postMessage).not.toHaveBeenCalled()
  })
})
