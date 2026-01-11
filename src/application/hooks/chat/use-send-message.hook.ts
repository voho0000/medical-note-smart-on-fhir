/**
 * Application Hook: Send Message
 * 
 * Facade hook for sending chat messages.
 * Isolates features from core use case details.
 * 
 * Architecture: Application Layer
 * - Features should use this hook instead of directly importing use cases
 */

import { sendMessageUseCase } from '@/src/core/use-cases/chat/send-message.use-case'

export function useSendMessage() {
  return sendMessageUseCase
}
