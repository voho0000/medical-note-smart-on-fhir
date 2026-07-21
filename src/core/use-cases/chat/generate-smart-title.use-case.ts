import type { IAiService } from '@/src/core/interfaces/services/ai.service.interface'
import { logger } from '@/src/shared/services/logger.service'
import { SMART_TITLE_MODEL_ID } from '@/src/shared/constants/ai-models.constants'

const titleLogger = logger.scope('AI Title')

export interface GenerateSmartTitleOptions {
  userMessage: string
  assistantMessage: string
  locale: string
}

/** The single capability this use case needs (interface segregation). */
export type TitleAiService = Pick<IAiService, 'query'>

export class GenerateSmartTitleUseCase {
  // Injected interface — core must not construct concrete infrastructure
  // services (audit C3); the caller picks the provider/key
  constructor(private readonly aiService: TitleAiService) {}

  async execute(options: GenerateSmartTitleOptions): Promise<string> {
    const { userMessage, assistantMessage, locale } = options

    // Prepare prompt based on locale
    const prompt = locale === 'zh-TW' 
      ? this.getChinesePrompt(userMessage, assistantMessage)
      : this.getEnglishPrompt(userMessage, assistantMessage)
    
    try {
      const response = await this.aiService.query({
        modelId: SMART_TITLE_MODEL_ID,
        messages: [{
          role: 'user',
          content: prompt
        }],
        // Note: temperature is omitted to use default value (1)
        // The manifest owns this model's sampling policy.
      })

      const generatedTitle = response.text?.trim()
      
      if (!generatedTitle) {
        titleLogger.error('No title in response')
        throw new Error('No title generated')
      }

      // Clean up the title (remove quotes, extra spaces)
      const cleanTitle = generatedTitle.replace(/^["']|["']$/g, '').trim()
      
      // Ensure title length is appropriate
      const maxLength = locale === 'zh-TW' ? 12 : 25
      return cleanTitle.length > maxLength 
        ? cleanTitle.substring(0, maxLength) 
        : cleanTitle
    } catch (error) {
      titleLogger.error('Failed to generate smart title', error)
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
