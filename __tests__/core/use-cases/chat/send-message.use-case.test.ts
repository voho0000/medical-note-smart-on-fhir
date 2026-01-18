import { SendMessageUseCase } from '@/src/core/use-cases/chat/send-message.use-case'
import type { ChatMessage, SendMessageInput } from '@/src/core/use-cases/chat/send-message.use-case'

describe('SendMessageUseCase', () => {
  let useCase: SendMessageUseCase

  beforeEach(() => {
    useCase = new SendMessageUseCase()
  })

  describe('createMessage', () => {
    it('should create a user message', () => {
      const message = useCase.createMessage('user', 'Hello')
      
      expect(message.role).toBe('user')
      expect(message.content).toBe('Hello')
      expect(message.id).toBeDefined()
      expect(message.timestamp).toBeDefined()
      expect(typeof message.timestamp).toBe('number')
    })

    it('should create an assistant message', () => {
      const message = useCase.createMessage('assistant', 'Hi there')
      
      expect(message.role).toBe('assistant')
      expect(message.content).toBe('Hi there')
    })

    it('should create a system message', () => {
      const message = useCase.createMessage('system', 'System prompt')
      
      expect(message.role).toBe('system')
      expect(message.content).toBe('System prompt')
    })

    it('should include modelId when provided', () => {
      const message = useCase.createMessage('assistant', 'Response', 'gpt-4')
      
      expect(message.modelId).toBe('gpt-4')
    })

    it('should generate unique IDs', () => {
      const message1 = useCase.createMessage('user', 'Message 1')
      const message2 = useCase.createMessage('user', 'Message 2')
      
      expect(message1.id).not.toBe(message2.id)
    })

    it('should generate different timestamps', async () => {
      const message1 = useCase.createMessage('user', 'Message 1')
      await new Promise(resolve => setTimeout(resolve, 1))
      const message2 = useCase.createMessage('user', 'Message 2')
      
      expect(message2.timestamp).toBeGreaterThanOrEqual(message1.timestamp)
    })
  })

  describe('validate', () => {
    it('should validate valid input', () => {
      const input: SendMessageInput = {
        userMessage: 'Hello',
        conversationHistory: [],
        systemPrompt: 'You are a helpful assistant',
        modelId: 'gpt-4'
      }
      
      const result = useCase.validate(input)
      expect(result.valid).toBe(true)
    })

    it('should return error for empty user message', () => {
      const input: SendMessageInput = {
        userMessage: '',
        conversationHistory: [],
        systemPrompt: 'System prompt',
        modelId: 'gpt-4'
      }
      
      const result = useCase.validate(input)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Message cannot be empty')
    })

    it('should return error for whitespace-only message', () => {
      const input: SendMessageInput = {
        userMessage: '   ',
        conversationHistory: [],
        systemPrompt: 'System prompt',
        modelId: 'gpt-4'
      }
      
      const result = useCase.validate(input)
      expect(result.valid).toBe(false)
    })

    it('should return error for empty model ID', () => {
      const input: SendMessageInput = {
        userMessage: 'Hello',
        conversationHistory: [],
        systemPrompt: 'System prompt',
        modelId: ''
      }
      
      const result = useCase.validate(input)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Model ID is required')
    })

    it('should return error for empty system prompt', () => {
      const input: SendMessageInput = {
        userMessage: 'Hello',
        conversationHistory: [],
        systemPrompt: '',
        modelId: 'gpt-4'
      }
      
      const result = useCase.validate(input)
      expect(result.valid).toBe(false)
    })
  })

  describe('buildMessages', () => {
    it('should build messages with system prompt', () => {
      const input: SendMessageInput = {
        userMessage: 'Hello',
        conversationHistory: [],
        systemPrompt: 'You are helpful',
        modelId: 'gpt-4'
      }
      
      const result = useCase.buildMessages(input)
      
      expect(result).toHaveLength(1)
      expect(result[0].role).toBe('system')
      expect(result[0].content).toBe('You are helpful')
    })

    it('should include conversation history', () => {
      const history: ChatMessage[] = [
        { id: '1', role: 'user', content: 'First', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Second', timestamp: Date.now() }
      ]
      
      const input: SendMessageInput = {
        userMessage: 'Third',
        conversationHistory: history,
        systemPrompt: 'System',
        modelId: 'gpt-4'
      }
      
      const result = useCase.buildMessages(input)
      
      expect(result).toHaveLength(3)
      expect(result[0].content).toBe('System')
      expect(result[1].content).toBe('First')
      expect(result[2].content).toBe('Second')
    })
  })

  describe('prepareMessageSend', () => {
    it('should prepare message with assistant ID', () => {
      const input: SendMessageInput = {
        userMessage: 'Hello',
        conversationHistory: [],
        systemPrompt: 'System',
        modelId: 'gpt-4'
      }
      
      const result = useCase.prepareMessageSend(input)
      
      expect(result.assistantMessageId).toBeDefined()
      expect(typeof result.assistantMessageId).toBe('string')
      expect(result.messages).toBeDefined()
    })

    it('should include user message in history', () => {
      const input: SendMessageInput = {
        userMessage: 'Hello',
        conversationHistory: [],
        systemPrompt: 'System',
        modelId: 'gpt-4'
      }
      
      const result = useCase.prepareMessageSend(input)
      
      expect(result.messages.length).toBeGreaterThan(1)
    })
  })
})
