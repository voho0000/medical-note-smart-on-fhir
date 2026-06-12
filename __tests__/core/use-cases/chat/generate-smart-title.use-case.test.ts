import { GenerateSmartTitleUseCase } from '@/src/core/use-cases/chat/generate-smart-title.use-case'
import type { GenerateSmartTitleOptions } from '@/src/core/use-cases/chat/generate-smart-title.use-case'
import type { TitleAiService } from '@/src/core/use-cases/chat/generate-smart-title.use-case'

// DI makes mocking trivial — no module mock of concrete infrastructure needed
function makeAiService(overrides?: Partial<TitleAiService>): TitleAiService {
  return {
    query: jest.fn().mockResolvedValue({ text: 'Generated Title' }),
    ...overrides,
  }
}

describe('GenerateSmartTitleUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('execute', () => {
    it('returns the AI-generated title', async () => {
      const useCase = new GenerateSmartTitleUseCase(makeAiService())
      const options: GenerateSmartTitleOptions = {
        userMessage: 'What are the symptoms of diabetes?',
        assistantMessage: 'Common symptoms include increased thirst...',
        locale: 'en',
      }

      const result = await useCase.execute(options)

      expect(result).toBe('Generated Title')
    })

    it('strips surrounding quotes from the generated title', async () => {
      const useCase = new GenerateSmartTitleUseCase(
        makeAiService({ query: jest.fn().mockResolvedValue({ text: '"Quoted Title"' }) })
      )

      const result = await useCase.execute({
        userMessage: 'Q',
        assistantMessage: 'A',
        locale: 'en',
      })

      expect(result).toBe('Quoted Title')
    })

    it('truncates AI titles beyond the locale max length', async () => {
      const useCase = new GenerateSmartTitleUseCase(
        makeAiService({
          query: jest.fn().mockResolvedValue({ text: '這是一個非常長的標題應該要被截斷以符合限制' }),
        })
      )

      const result = await useCase.execute({
        userMessage: 'Q',
        assistantMessage: 'A',
        locale: 'zh-TW',
      })

      expect(result.length).toBeLessThanOrEqual(12)
    })

    it('falls back to the user message when the service throws', async () => {
      const useCase = new GenerateSmartTitleUseCase(
        makeAiService({ query: jest.fn().mockRejectedValue(new Error('boom')) })
      )

      const result = await useCase.execute({
        userMessage: 'Test question about medical topic',
        assistantMessage: 'Test answer',
        locale: 'en',
      })

      expect(result).toBe('Test question about medic')
      expect(result.length).toBeLessThanOrEqual(25)
    })

    it('falls back when the service returns no text', async () => {
      const useCase = new GenerateSmartTitleUseCase(
        makeAiService({ query: jest.fn().mockResolvedValue({ text: '' }) })
      )

      const result = await useCase.execute({
        userMessage: 'Question',
        assistantMessage: 'Answer',
        locale: 'en',
      })

      expect(result).toBe('Question')
    })

    it('truncates long fallback titles per locale', async () => {
      const failing = makeAiService({ query: jest.fn().mockRejectedValue(new Error('x')) })

      const en = await new GenerateSmartTitleUseCase(failing).execute({
        userMessage: 'This is a very long message that should be truncated to fit',
        assistantMessage: 'Answer',
        locale: 'en',
      })
      expect(en.length).toBeLessThanOrEqual(25)

      const zh = await new GenerateSmartTitleUseCase(failing).execute({
        userMessage: '這是一個非常長的訊息應該要被截斷以符合最大長度限制',
        assistantMessage: '回答',
        locale: 'zh-TW',
      })
      expect(zh.length).toBeLessThanOrEqual(12)
    })

    it('truncates long messages inside the prompt', async () => {
      const query = jest.fn().mockResolvedValue({ text: 'Title' })
      const useCase = new GenerateSmartTitleUseCase(makeAiService({ query }))

      await useCase.execute({
        userMessage: 'A'.repeat(300),
        assistantMessage: 'B'.repeat(300),
        locale: 'en',
      })

      const prompt = (query.mock.calls[0][0] as { messages: Array<{ content: string }> })
        .messages[0].content
      // 200-char caps per message — the prompt must not carry the full 300s
      expect(prompt).not.toContain('A'.repeat(201))
      expect(prompt).not.toContain('B'.repeat(201))
    })
  })
})
