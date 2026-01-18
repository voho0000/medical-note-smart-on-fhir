import type { ChatSessionEntity, ChatSessionMetadata, CreateChatSessionDto, UpdateChatSessionDto } from '@/src/core/entities/chat-session.entity'

describe('chat-session.entity', () => {
  describe('ChatSessionEntity', () => {
    it('should have all required fields', () => {
      const session: ChatSessionEntity = {
        id: '123',
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        title: 'Test Session',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0
      }
      expect(session.id).toBeDefined()
      expect(session.userId).toBeDefined()
      expect(session.fhirServerUrl).toBeDefined()
      expect(session.patientId).toBeDefined()
      expect(session.title).toBeDefined()
      expect(session.messages).toBeDefined()
      expect(session.createdAt).toBeDefined()
      expect(session.updatedAt).toBeDefined()
      expect(session.messageCount).toBeDefined()
    })

    it('should support optional fields', () => {
      const session: ChatSessionEntity = {
        id: '123',
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        title: 'Test Session',
        summary: 'Session summary',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0,
        tags: ['tag1', 'tag2']
      }
      expect(session.summary).toBe('Session summary')
      expect(session.tags).toEqual(['tag1', 'tag2'])
    })
  })

  describe('ChatSessionMetadata', () => {
    it('should have metadata without messages', () => {
      const metadata: ChatSessionMetadata = {
        id: '123',
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        title: 'Test Session',
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 5
      }
      expect(metadata.messageCount).toBe(5)
      expect('messages' in metadata).toBe(false)
    })
  })

  describe('CreateChatSessionDto', () => {
    it('should have required fields for creation', () => {
      const dto: CreateChatSessionDto = {
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        messages: []
      }
      expect(dto.userId).toBeDefined()
      expect(dto.fhirServerUrl).toBeDefined()
      expect(dto.patientId).toBeDefined()
      expect(dto.messages).toBeDefined()
    })

    it('should support optional title and locale', () => {
      const dto: CreateChatSessionDto = {
        userId: 'user-1',
        fhirServerUrl: 'https://fhir.example.com',
        patientId: 'patient-1',
        messages: [],
        title: 'Custom Title',
        locale: 'zh-TW'
      }
      expect(dto.title).toBe('Custom Title')
      expect(dto.locale).toBe('zh-TW')
    })
  })

  describe('UpdateChatSessionDto', () => {
    it('should allow partial updates', () => {
      const dto: UpdateChatSessionDto = {
        title: 'Updated Title'
      }
      expect(dto.title).toBe('Updated Title')
    })

    it('should support all optional fields', () => {
      const dto: UpdateChatSessionDto = {
        messages: [],
        title: 'Updated Title',
        summary: 'Updated Summary',
        tags: ['new-tag']
      }
      expect(dto.messages).toBeDefined()
      expect(dto.title).toBeDefined()
      expect(dto.summary).toBeDefined()
      expect(dto.tags).toBeDefined()
    })
  })
})
