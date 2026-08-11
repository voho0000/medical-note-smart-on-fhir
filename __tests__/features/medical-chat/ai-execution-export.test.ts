import { medicalChatExecutionFilename } from '@/features/medical-chat/utils/ai-execution-export'

describe('medical chat AI execution export', () => {
  it('builds a filesystem-safe JSON filename from the request timestamp', () => {
    expect(medicalChatExecutionFilename('2026-08-05T14:03:02.125Z')).toBe(
      'mediprisma-ai-execution_2026-08-05_14-03-02-125.json',
    )
  })
})
