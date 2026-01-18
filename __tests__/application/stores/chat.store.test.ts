import { useChatStore } from '@/src/application/stores/chat.store'
import type { ChatMessage } from '@/src/application/stores/chat.store'

describe('chat.store', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: [] })
  })

  describe('initial state', () => {
    it('should have empty messages array', () => {
      const { messages } = useChatStore.getState()
      expect(messages).toEqual([])
    })
  })

  describe('setMessages', () => {
    it('should set messages with array', () => {
      const newMessages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() }
      ]
      
      useChatStore.getState().setMessages(newMessages)
      
      expect(useChatStore.getState().messages).toEqual(newMessages)
    })

    it('should set messages with function', () => {
      const initialMessages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() }
      ]
      useChatStore.setState({ messages: initialMessages })
      
      useChatStore.getState().setMessages(prev => [
        ...prev,
        { id: '2', role: 'assistant', content: 'Hi', timestamp: Date.now() }
      ])
      
      expect(useChatStore.getState().messages).toHaveLength(2)
    })
  })

  describe('addMessage', () => {
    it('should add a message', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now()
      }
      
      useChatStore.getState().addMessage(message)
      
      expect(useChatStore.getState().messages).toHaveLength(1)
      expect(useChatStore.getState().messages[0]).toEqual(message)
    })

    it('should add multiple messages', () => {
      useChatStore.getState().addMessage({
        id: '1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now()
      })
      
      useChatStore.getState().addMessage({
        id: '2',
        role: 'assistant',
        content: 'Hi',
        timestamp: Date.now()
      })
      
      expect(useChatStore.getState().messages).toHaveLength(2)
    })

    it('should preserve message order', () => {
      const message1: ChatMessage = {
        id: '1',
        role: 'user',
        content: 'First',
        timestamp: Date.now()
      }
      const message2: ChatMessage = {
        id: '2',
        role: 'user',
        content: 'Second',
        timestamp: Date.now()
      }
      
      useChatStore.getState().addMessage(message1)
      useChatStore.getState().addMessage(message2)
      
      const messages = useChatStore.getState().messages
      expect(messages[0].content).toBe('First')
      expect(messages[1].content).toBe('Second')
    })
  })

  describe('clearMessages', () => {
    it('should clear all messages', () => {
      useChatStore.setState({
        messages: [
          { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
          { id: '2', role: 'assistant', content: 'Hi', timestamp: Date.now() }
        ]
      })
      
      useChatStore.getState().clearMessages()
      
      expect(useChatStore.getState().messages).toEqual([])
    })

    it('should work on empty messages', () => {
      useChatStore.getState().clearMessages()
      expect(useChatStore.getState().messages).toEqual([])
    })
  })

  describe('message with optional fields', () => {
    it('should support modelId', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        content: 'Response',
        timestamp: Date.now(),
        modelId: 'gpt-4'
      }
      
      useChatStore.getState().addMessage(message)
      
      expect(useChatStore.getState().messages[0].modelId).toBe('gpt-4')
    })

    it('should support agentStates', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        content: 'Response',
        timestamp: Date.now(),
        agentStates: [
          { state: 'thinking', timestamp: Date.now() },
          { state: 'responding', timestamp: Date.now() }
        ]
      }
      
      useChatStore.getState().addMessage(message)
      
      expect(useChatStore.getState().messages[0].agentStates).toHaveLength(2)
    })
  })
})
