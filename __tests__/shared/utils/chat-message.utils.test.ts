import {
  createUserMessage,
  createAssistantMessage,
  createAgentState,
  addMessagePair
} from '@/src/shared/utils/chat-message.utils'
import type { ChatMessage } from '@/src/application/stores/chat.store'

describe('chat-message.utils', () => {
  describe('createUserMessage', () => {
    it('should create a user message with correct properties', () => {
      const content = 'Hello, how are you?'
      const message = createUserMessage(content)
      
      expect(message.role).toBe('user')
      expect(message.content).toBe(content)
      expect(message.id).toBeDefined()
      expect(message.timestamp).toBeDefined()
      expect(typeof message.timestamp).toBe('number')
    })

    it('should trim whitespace from content', () => {
      const message = createUserMessage('  Hello  ')
      expect(message.content).toBe('Hello')
    })

    it('should generate unique IDs for different messages', () => {
      const message1 = createUserMessage('Message 1')
      const message2 = createUserMessage('Message 2')
      
      expect(message1.id).not.toBe(message2.id)
    })

    it('should have different timestamps for messages created at different times', async () => {
      const message1 = createUserMessage('Message 1')
      await new Promise(resolve => setTimeout(resolve, 10))
      const message2 = createUserMessage('Message 2')
      
      expect(message2.timestamp).toBeGreaterThanOrEqual(message1.timestamp)
    })
  })

  describe('createAssistantMessage', () => {
    it('should create an assistant message with default values', () => {
      const message = createAssistantMessage()
      
      expect(message.role).toBe('assistant')
      expect(message.content).toBe('')
      expect(message.id).toBeDefined()
      expect(message.timestamp).toBeDefined()
      expect(message.modelId).toBeUndefined()
      expect(message.agentStates).toBeUndefined()
    })

    it('should create an assistant message with modelId', () => {
      const modelId = 'gpt-4'
      const message = createAssistantMessage(modelId)
      
      expect(message.modelId).toBe(modelId)
    })

    it('should create an assistant message with initial content', () => {
      const initialContent = 'Thinking...'
      const message = createAssistantMessage(undefined, initialContent)
      
      expect(message.content).toBe(initialContent)
    })

    it('should create an assistant message with agent states', () => {
      const agentStates = [
        { state: 'thinking', timestamp: Date.now() },
        { state: 'processing', timestamp: Date.now() }
      ]
      const message = createAssistantMessage(undefined, '', agentStates)
      
      expect(message.agentStates).toEqual(agentStates)
    })

    it('should create an assistant message with all parameters', () => {
      const modelId = 'gpt-4'
      const initialContent = 'Processing...'
      const agentStates = [{ state: 'analyzing', timestamp: Date.now() }]
      
      const message = createAssistantMessage(modelId, initialContent, agentStates)
      
      expect(message.role).toBe('assistant')
      expect(message.modelId).toBe(modelId)
      expect(message.content).toBe(initialContent)
      expect(message.agentStates).toEqual(agentStates)
    })

    it('should generate unique IDs for different messages', () => {
      const message1 = createAssistantMessage()
      const message2 = createAssistantMessage()
      
      expect(message1.id).not.toBe(message2.id)
    })
  })

  describe('createAgentState', () => {
    it('should create an agent state with correct properties', () => {
      const state = 'thinking'
      const agentState = createAgentState(state)
      
      expect(agentState.state).toBe(state)
      expect(agentState.timestamp).toBeDefined()
      expect(typeof agentState.timestamp).toBe('number')
    })

    it('should have different timestamps for states created at different times', async () => {
      const state1 = createAgentState('thinking')
      await new Promise(resolve => setTimeout(resolve, 10))
      const state2 = createAgentState('processing')
      
      expect(state2.timestamp).toBeGreaterThanOrEqual(state1.timestamp)
    })
  })

  describe('addMessagePair', () => {
    it('should add user and assistant messages to the chat', () => {
      const currentMessages: ChatMessage[] = []
      const userInput = 'Hello'
      
      const result = addMessagePair(currentMessages, userInput)
      
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe('user')
      expect(result.messages[0].content).toBe('Hello')
      expect(result.messages[1].role).toBe('assistant')
      expect(result.assistantMessageId).toBe(result.messages[1].id)
    })

    it('should preserve existing messages', () => {
      const existingMessage: ChatMessage = {
        id: 'existing-id',
        role: 'user',
        content: 'Previous message',
        timestamp: Date.now()
      }
      const currentMessages = [existingMessage]
      
      const result = addMessagePair(currentMessages, 'New message')
      
      expect(result.messages).toHaveLength(3)
      expect(result.messages[0]).toEqual(existingMessage)
    })

    it('should add assistant message with modelId', () => {
      const modelId = 'gpt-4'
      const result = addMessagePair([], 'Hello', modelId)
      
      expect(result.messages[1].modelId).toBe(modelId)
    })

    it('should add assistant message with initial content', () => {
      const initialContent = 'Thinking...'
      const result = addMessagePair([], 'Hello', undefined, initialContent)
      
      expect(result.messages[1].content).toBe(initialContent)
    })

    it('should add assistant message with agent states', () => {
      const agentStates = [{ state: 'analyzing', timestamp: Date.now() }]
      const result = addMessagePair([], 'Hello', undefined, '', undefined, agentStates)
      
      expect(result.messages[1].agentStates).toEqual(agentStates)
    })

    it('should return the correct assistant message ID', () => {
      const result = addMessagePair([], 'Hello')
      
      expect(result.assistantMessageId).toBe(result.messages[1].id)
    })

    it('should trim user input', () => {
      const result = addMessagePair([], '  Hello  ')
      
      expect(result.messages[0].content).toBe('Hello')
    })

    it('should not mutate the original messages array', () => {
      const currentMessages: ChatMessage[] = []
      const originalLength = currentMessages.length
      
      addMessagePair(currentMessages, 'Hello')
      
      expect(currentMessages).toHaveLength(originalLength)
    })
  })
})
