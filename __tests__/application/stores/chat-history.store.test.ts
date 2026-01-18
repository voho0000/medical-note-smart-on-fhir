import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'

describe('chat-history.store', () => {
  beforeEach(() => {
    // Reset store state
    useChatHistoryStore.setState({
      currentSessionId: null,
      isTitleGenerating: false,
    })
  })

  describe('initial state', () => {
    it('should have null currentSessionId initially', () => {
      const state = useChatHistoryStore.getState()
      expect(state.currentSessionId).toBeNull()
    })

    it('should have isTitleGenerating false initially', () => {
      const state = useChatHistoryStore.getState()
      expect(state.isTitleGenerating).toBe(false)
    })
  })

  describe('setCurrentSessionId', () => {
    it('should set current session ID', () => {
      const { setCurrentSessionId } = useChatHistoryStore.getState()
      
      setCurrentSessionId('session-1')
      
      expect(useChatHistoryStore.getState().currentSessionId).toBe('session-1')
    })

    it('should clear current session ID', () => {
      const { setCurrentSessionId } = useChatHistoryStore.getState()
      
      setCurrentSessionId('session-1')
      setCurrentSessionId(null)
      
      expect(useChatHistoryStore.getState().currentSessionId).toBeNull()
    })
  })

  describe('setIsTitleGenerating', () => {
    it('should set title generating state to true', () => {
      const { setIsTitleGenerating } = useChatHistoryStore.getState()

      setIsTitleGenerating(true)

      expect(useChatHistoryStore.getState().isTitleGenerating).toBe(true)
    })

    it('should set title generating state to false', () => {
      const { setIsTitleGenerating } = useChatHistoryStore.getState()

      setIsTitleGenerating(true)
      setIsTitleGenerating(false)

      expect(useChatHistoryStore.getState().isTitleGenerating).toBe(false)
    })
  })

})
