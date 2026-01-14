import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  onSnapshot,
  Timestamp,
  type Unsubscribe
} from 'firebase/firestore'
import { db } from '@/src/shared/config/firebase.config'
import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import type { 
  ChatSessionEntity, 
  ChatSessionMetadata,
  CreateChatSessionDto,
  UpdateChatSessionDto 
} from '@/src/core/entities/chat-session.entity'

export class FirestoreChatSessionRepository implements IChatSessionRepository {
  private readonly COLLECTION_NAME = 'chats'

  private toFirestoreDoc(entity: ChatSessionEntity) {
    // Ensure all required fields are not undefined
    if (!entity.userId || !entity.fhirServerUrl || !entity.patientId) {
      throw new Error('Missing required fields for chat session')
    }
    
    // Clean messages to remove any undefined values
    const cleanMessages = (entity.messages || []).map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      ...(msg.modelId && { modelId: msg.modelId }),
      ...(msg.agentStates && { agentStates: msg.agentStates }),
    }))
    
    const doc: any = {
      userId: entity.userId,
      fhirServerUrl: entity.fhirServerUrl,
      patientId: entity.patientId,
      title: entity.title || 'New Conversation',
      messages: cleanMessages,
      createdAt: Timestamp.fromDate(entity.createdAt),
      updatedAt: Timestamp.fromDate(entity.updatedAt),
      tags: entity.tags ?? [],
      messageCount: entity.messageCount || 0,
    }
    
    // Only add summary if it's not undefined and not null
    if (entity.summary !== undefined && entity.summary !== null) {
      doc.summary = entity.summary
    }
    
    return doc
  }

  private toEntity(id: string, data: any): ChatSessionEntity {
    return {
      id,
      userId: data.userId,
      fhirServerUrl: data.fhirServerUrl,
      patientId: data.patientId,
      title: data.title,
      summary: data.summary || undefined,
      messages: data.messages || [],
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      messageCount: data.messageCount || data.messages?.length || 0,
      tags: data.tags || [],
    }
  }

  private toMetadata(id: string, data: any): ChatSessionMetadata {
    return {
      id,
      userId: data.userId,
      fhirServerUrl: data.fhirServerUrl,
      patientId: data.patientId,
      title: data.title,
      summary: data.summary || undefined,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      messageCount: data.messageCount || data.messages?.length || 0,
      tags: data.tags || [],
    }
  }

  async create(dto: CreateChatSessionDto): Promise<ChatSessionEntity> {
    if (!db) throw new Error('Firestore not initialized')

    // Debug: Log all incoming DTO fields
    console.log('[Repository] Creating chat session with DTO:', {
      userId: dto.userId,
      fhirServerUrl: dto.fhirServerUrl,
      patientId: dto.patientId,
      title: dto.title,
      messagesCount: dto.messages?.length,
    })

    const chatRef = doc(collection(db, 'users', dto.userId, this.COLLECTION_NAME))
    const now = new Date()
    
    const entity: ChatSessionEntity = {
      id: chatRef.id,
      userId: dto.userId,
      fhirServerUrl: dto.fhirServerUrl,
      patientId: dto.patientId,
      title: dto.title || this.generateDefaultTitle(dto.messages, dto.locale),
      summary: undefined,
      messages: dto.messages,
      createdAt: now,
      updatedAt: now,
      tags: undefined,
      messageCount: dto.messages.length,
    }

    const firestoreDoc = this.toFirestoreDoc(entity)
    
    // Debug: Log the final Firestore document
    console.log('[Repository] Firestore document to save:', JSON.stringify(firestoreDoc, null, 2))

    await setDoc(chatRef, firestoreDoc)
    return entity
  }

  async updateTitle(chatId: string, userId: string, title: string): Promise<void> {
    if (!db) throw new Error('Firestore not initialized')

    const chatRef = doc(db, 'users', userId, this.COLLECTION_NAME, chatId)
    await updateDoc(chatRef, {
      title,
      updatedAt: Timestamp.now(),
    })
  }

  async update(chatId: string, userId: string, dto: UpdateChatSessionDto): Promise<void> {
    if (!db) throw new Error('Firestore not initialized')

    const chatRef = doc(db, 'users', userId, this.COLLECTION_NAME, chatId)
    const updateData: any = {
      updatedAt: Timestamp.now(),
    }

    if (dto.messages !== undefined && dto.messages !== null) {
      // Clean messages to remove any undefined values
      const cleanMessages = dto.messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        ...(msg.modelId && { modelId: msg.modelId }),
        ...(msg.agentStates && { agentStates: msg.agentStates }),
      }))
      updateData.messages = cleanMessages
      updateData.messageCount = cleanMessages.length
    }
    if (dto.title !== undefined && dto.title !== null) {
      updateData.title = dto.title
    }
    if (dto.summary !== undefined && dto.summary !== null) {
      updateData.summary = dto.summary
    }
    if (dto.tags !== undefined && dto.tags !== null) {
      updateData.tags = dto.tags
    }

    await updateDoc(chatRef, updateData)
  }

  async getById(chatId: string, userId: string): Promise<ChatSessionEntity | null> {
    if (!db) throw new Error('Firestore not initialized')

    const chatRef = doc(db, 'users', userId, this.COLLECTION_NAME, chatId)
    const snapshot = await getDoc(chatRef)

    if (!snapshot.exists()) return null
    return this.toEntity(snapshot.id, snapshot.data())
  }

  async listByPatient(
    userId: string, 
    patientId: string, 
    fhirServerUrl: string
  ): Promise<ChatSessionMetadata[]> {
    if (!db) throw new Error('Firestore not initialized')

    const chatsRef = collection(db, 'users', userId, this.COLLECTION_NAME)
    const q = query(
      chatsRef,
      where('patientId', '==', patientId),
      where('fhirServerUrl', '==', fhirServerUrl),
      orderBy('updatedAt', 'desc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => this.toMetadata(doc.id, doc.data()))
  }

  async listByUser(userId: string, limit: number = 50): Promise<ChatSessionMetadata[]> {
    if (!db) throw new Error('Firestore not initialized')

    const chatsRef = collection(db, 'users', userId, this.COLLECTION_NAME)
    const q = query(
      chatsRef,
      orderBy('updatedAt', 'desc'),
      firestoreLimit(limit)
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => this.toMetadata(doc.id, doc.data()))
  }

  async delete(chatId: string, userId: string): Promise<void> {
    if (!db) throw new Error('Firestore not initialized')

    const chatRef = doc(db, 'users', userId, this.COLLECTION_NAME, chatId)
    await deleteDoc(chatRef)
  }

  subscribe(
    userId: string,
    patientId: string,
    fhirServerUrl: string,
    callback: (sessions: ChatSessionMetadata[]) => void
  ): Unsubscribe {
    if (!db) throw new Error('Firestore not initialized')

    const chatsRef = collection(db, 'users', userId, this.COLLECTION_NAME)
    const q = query(
      chatsRef,
      where('patientId', '==', patientId),
      where('fhirServerUrl', '==', fhirServerUrl),
      orderBy('updatedAt', 'desc')
    )

    return onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => this.toMetadata(doc.id, doc.data()))
      callback(sessions)
    })
  }

  private generateDefaultTitle(messages: any[], locale?: string): string {
    if (messages.length === 0) return 'New Conversation'
    
    const firstUserMessage = messages.find(m => m.role === 'user')
    if (!firstUserMessage) return 'New Conversation'
    
    const { content } = firstUserMessage
    
    // Use different max length based on user's language preference (matching ChatGPT UX)
    // Chinese: 20 chars, English: 40 chars
    const isChinese = locale === 'zh-TW'
    const maxLength = isChinese ? 20 : 40
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content
  }
}
