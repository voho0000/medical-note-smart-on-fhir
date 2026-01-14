import type { ChatMessage } from '@/src/application/stores/chat.store'
import { OpenAiService } from '@/src/infrastructure/ai/services/openai.service'

export interface GenerateSmartTitleOptions {
  userMessage: string
  assistantMessage: string
  locale: string
  apiKey?: string | null  // Decrypted API key from store
}

export class GenerateSmartTitleUseCase {
  async execute(options: GenerateSmartTitleOptions): Promise<string> {
    const { userMessage, assistantMessage, locale, apiKey } = options
    
    // Prepare prompt based on locale
    const prompt = locale === 'zh-TW' 
      ? this.getChinesePrompt(userMessage, assistantMessage)
      : this.getEnglishPrompt(userMessage, assistantMessage)
    
    try {
      // Use OpenAiService which has built-in fallback to Firebase proxy
      const openAiService = new OpenAiService(apiKey)
      
      const response = await openAiService.query({
        modelId: 'gpt-5-nano',
        messages: [{
          role: 'user',
          content: prompt
        }],
        // Note: temperature is omitted to use default value (1)
        // Firebase proxy only supports temperature = 1 for gpt-5-nano
      })

      const generatedTitle = response.text?.trim()
      
      if (!generatedTitle) {
        console.error('[AI Title] No title in response')
        throw new Error('No title generated')
      }
      
      console.log('[AI Title] Generated title:', generatedTitle)

      // Clean up the title (remove quotes, extra spaces)
      const cleanTitle = generatedTitle.replace(/^["']|["']$/g, '').trim()
      
      // Ensure title length is appropriate
      const maxLength = locale === 'zh-TW' ? 12 : 25
      return cleanTitle.length > maxLength 
        ? cleanTitle.substring(0, maxLength) 
        : cleanTitle
    } catch (error) {
      console.error('[AI Title] Failed to generate smart title:', error)
      // Fallback: use first few words of user message
      const fallback = userMessage.substring(0, locale === 'zh-TW' ? 12 : 25)
      return fallback
    }
  }

  private getChinesePrompt(userMessage: string, assistantMessage: string): string {
    return `請根據以下對話生成一個 5-12 字的精簡標題。只輸出標題本身，不要加引號或其他說明。

問題：${userMessage.substring(0, 200)}
回答：${assistantMessage.substring(0, 200)}

標題：`
  }

  private getEnglishPrompt(userMessage: string, assistantMessage: string): string {
    return `Generate a concise 10-25 character title based on the following conversation. Output only the title without quotes or explanations.

Question: ${userMessage.substring(0, 200)}
Answer: ${assistantMessage.substring(0, 200)}

Title:`
  }
}
