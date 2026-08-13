import { act, renderHook, waitFor } from '@testing-library/react'
import { useFollowupSuggestions } from '@/features/medical-chat/hooks/useFollowupSuggestions'
import { BUNDLE_CHANGED_EVENT } from '@/src/shared/utils/reset-on-bundle-change'

const mockStream = jest.fn()
const mockStop = jest.fn()

jest.mock('@/src/application/hooks/ai/use-unified-ai.hook', () => ({
  useUnifiedAi: () => ({ stream: mockStream, stop: mockStop }),
}))
jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({ locale: 'zh-TW' }),
}))
jest.mock('@/src/application/providers/audience.provider', () => ({
  useAudience: () => ({ audience: 'medical' }),
}))
jest.mock('@/src/application/hooks/patient/use-patient-query.hook', () => ({
  usePatient: () => ({ patient: null }),
}))

describe('useFollowupSuggestions Bundle ownership', () => {
  it('stops and discards a late suggestion after a same-tab import', async () => {
    let finish!: (value: string) => void
    mockStream.mockImplementationOnce(() => new Promise<string>((resolve) => {
      finish = resolve
    }))
    const { result } = renderHook(() => useFollowupSuggestions())

    let generation!: Promise<void>
    act(() => {
      generation = result.current.generate('A question', 'A answer')
    })
    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1))

    act(() => window.dispatchEvent(new Event(BUNDLE_CHANGED_EVENT)))
    expect(mockStop).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish('{"suggestions":[{"label":"A result","prompt":"show A"}]}')
      await generation
    })

    expect(result.current.suggestions).toEqual([])
  })
})
