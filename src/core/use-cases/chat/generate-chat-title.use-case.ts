import type { ChatMessage } from '@/src/application/stores/chat.store'

export class GenerateChatTitleUseCase {
  async execute(messages: ChatMessage[], aiService?: any): Promise<string> {
    if (messages.length === 0) return 'New Conversation'
    
    const firstUserMessage = messages.find(m => m.role === 'user')
    if (!firstUserMessage) return 'New Conversation'
    
    const content = firstUserMessage.content
    const defaultTitle = content.length > 50 ? content.substring(0, 50) + '...' : content
    
    if (!aiService) {
      return defaultTitle
    }
    
    try {
      const prompt = `Generate a concise 5-10 word title for this medical conversation. Only return the title, nothing else.\n\nFirst message: "${content.substring(0, 200)}"`
      
      const response = await aiService.generateText(prompt, {
        maxTokens: 20,
        temperature: 0.3,
      })
      
      const title = response.trim().replace(/^["']|["']$/g, '')
      return title.length > 0 && title.length < 100 ? title : defaultTitle
    } catch (error) {
      console.warn('[Generate Title] Failed to generate AI title, using default:', error)
      return defaultTitle
    }
  }
}
