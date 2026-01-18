import { useChatHistoryStore } from '@/src/application/stores/chat-history.store'
import type { ChatSessionMetadata } from '@/src/core/entities/chat-session.entity'

describe('chat-history.store', () => {
  beforeEach(() => {
    // Reset store state
    useChatHistoryStore.setState({
      sessions: [],
      currentSessionId: null,
      isLoading: false,
    })
  })

  describe('initial state', () => {
    it('should have empty sessions initially', () => {
      const state = useChatHistoryStore.getState()
      expect(state.sessions).toEqual([])
    })

    it('should have null currentSessionId initially', () => {
      const state = useChatHistoryStore.getState()
      expect(state.currentSessionId).toBeNull()
    })

    it('should not be loading initially', () => {
      const state = useChatHistoryStore.getState()
      expect(state.isLoading).toBe(false)
    })
  })

  describe('setSessions', () => {
    it('should set sessions', () => {
      const { setSessions } = useChatHistoryStore.getState()
      const sessions: ChatSessionMetadata[] = [
        {
          id: 'session-1',
          userId: 'user-1',
          fhirServerUrl: 'https://fhir.example.com',
          patientId: 'patient-1',
          title: 'Session 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 5
        }
      ]
      
      setSessions(sessions)
      
      expect(useChatHistoryStore.getState().sessions).toEqual(sessions)
    })

    it('should replace existing sessions', () => {
      const { setSessions } = useChatHistoryStore.getState()
      
      setSessions([{ id: '1' } as ChatSessionMetadata])
      setSessions([{ id: '2' } as ChatSessionMetadata])
      
      expect(useChatHistoryStore.getState().sessions).toHaveLength(1)
      expect(useChatHistoryStore.getState().sessions[0].id).toBe('2')
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

  describe('setIsLoading', () => {
    it('should set loading state to true', () => {
      const { setIsLoading } = useChatHistoryStore.getState()
      
      setIsLoading(true)
      
      expect(useChatHistoryStore.getState().isLoading).toBe(true)
    })

    it('should set loading state to false', () => {
      const { setIsLoading } = useChatHistoryStore.getState()
      
      setIsLoading(true)
      setIsLoading(false)
      
      expect(useChatHistoryStore.getState().isLoading).toBe(false)
    })
  })

  describe('addSession', () => {
    it('should add new session at the beginning', () => {
      const { addSession } = useChatHistoryStore.getState()
      const session: ChatSessionMetadata = {
        id: 'session-1',
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        title: 'New Session',
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0
      }
      
      addSession(session)
      
      const state = useChatHistoryStore.getState()
      expect(state.sessions).toHaveLength(1)
      expect(state.sessions[0]).toEqual(session)
    })

    it('should add new session at the beginning of existing sessions', () => {
      const { addSession, setSessions } = useChatHistoryStore.getState()
      
      setSessions([{ id: 'old-session' } as ChatSessionMetadata])
      addSession({ id: 'new-session' } as ChatSessionMetadata)
      
      const sessions = useChatHistoryStore.getState().sessions
      expect(sessions).toHaveLength(2)
      expect(sessions[0].id).toBe('new-session')
      expect(sessions[1].id).toBe('old-session')
    })

    it('should update existing session instead of adding duplicate', () => {
      const { addSession } = useChatHistoryStore.getState()
      
      addSession({ id: 'session-1', title: 'Original' } as ChatSessionMetadata)
      addSession({ id: 'session-1', title: 'Updated' } as ChatSessionMetadata)
      
      const sessions = useChatHistoryStore.getState().sessions
      expect(sessions).toHaveLength(1)
      expect(sessions[0].title).toBe('Updated')
    })
  })

  describe('updateSession', () => {
    it('should update session properties', () => {
      const { addSession, updateSession } = useChatHistoryStore.getState()
      
      addSession({ id: 'session-1', title: 'Original', messageCount: 5 } as ChatSessionMetadata)
      updateSession('session-1', { title: 'Updated' })
      
      const session = useChatHistoryStore.getState().sessions[0]
      expect(session.title).toBe('Updated')
      expect(session.messageCount).toBe(5)
    })

    it('should not affect other sessions', () => {
      const { addSession, updateSession } = useChatHistoryStore.getState()
      
      addSession({ id: 'session-1', title: 'Session 1' } as ChatSessionMetadata)
      addSession({ id: 'session-2', title: 'Session 2' } as ChatSessionMetadata)
      
      updateSession('session-2', { title: 'Updated Session 2' })
      
      const sessions = useChatHistoryStore.getState().sessions
      expect(sessions[0].title).toBe('Updated Session 2')
      expect(sessions[1].title).toBe('Session 1')
    })
  })

  describe('removeSession', () => {
    it('should remove session by ID', () => {
      const { addSession, removeSession } = useChatHistoryStore.getState()
      
      addSession({ id: 'session-1' } as ChatSessionMetadata)
      removeSession('session-1')
      
      expect(useChatHistoryStore.getState().sessions).toHaveLength(0)
    })

    it('should clear currentSessionId if removing current session', () => {
      const { addSession, setCurrentSessionId, removeSession } = useChatHistoryStore.getState()
      
      addSession({ id: 'session-1' } as ChatSessionMetadata)
      setCurrentSessionId('session-1')
      removeSession('session-1')
      
      expect(useChatHistoryStore.getState().currentSessionId).toBeNull()
    })

    it('should not clear currentSessionId if removing different session', () => {
      const { addSession, setCurrentSessionId, removeSession } = useChatHistoryStore.getState()
      
      addSession({ id: 'session-1' } as ChatSessionMetadata)
      addSession({ id: 'session-2' } as ChatSessionMetadata)
      setCurrentSessionId('session-1')
      removeSession('session-2')
      
      expect(useChatHistoryStore.getState().currentSessionId).toBe('session-1')
    })
  })

  describe('clearSessions', () => {
    it('should clear all sessions', () => {
      const { addSession, clearSessions } = useChatHistoryStore.getState()
      
      addSession({ id: 'session-1' } as ChatSessionMetadata)
      addSession({ id: 'session-2' } as ChatSessionMetadata)
      clearSessions()
      
      expect(useChatHistoryStore.getState().sessions).toEqual([])
    })

    it('should clear currentSessionId', () => {
      const { addSession, setCurrentSessionId, clearSessions } = useChatHistoryStore.getState()
      
      addSession({ id: 'session-1' } as ChatSessionMetadata)
      setCurrentSessionId('session-1')
      clearSessions()
      
      expect(useChatHistoryStore.getState().currentSessionId).toBeNull()
    })
  })
})
