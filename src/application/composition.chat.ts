// Chat-session composition — separate from composition.ts on purpose: this
// module pulls in the Firebase initialization graph, which clinical-data
// consumers (calculator, reports, their tests) must not inherit.
import type { IChatSessionRepository } from '@/src/core/interfaces/repositories/chat-session.repository.interface'
import { FirestoreChatSessionRepository } from '@/src/infrastructure/firebase/repositories/chat-session.repository'

// Stateless Firestore facade — one shared instance is enough.
let chatSessionRepository: IChatSessionRepository | null = null

export function getChatSessionRepository(): IChatSessionRepository {
  if (!chatSessionRepository) {
    chatSessionRepository = new FirestoreChatSessionRepository()
  }
  return chatSessionRepository
}
