import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'

describe('chat-history.store', () => {
  beforeEach(() => {
    // Reset store state
    useChatHistoryStore.setState({
      currentSessionId: null,
    })
  })

  describe('initial state', () => {
    it('should have null currentSessionId initially', () => {
      const state = useChatHistoryStore.getState()
      expect(state.currentSessionId).toBeNull()
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

})
