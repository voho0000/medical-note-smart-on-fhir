import { buildStandardChatSystemPrompt } from '@/src/core/use-cases/chat/build-standard-chat-system-prompt.use-case'

describe('buildStandardChatSystemPrompt', () => {
  it('grounds tool-less local chat in the selected snapshot without claiming full-record access', () => {
    const prompt = buildStandardChatSystemPrompt(
      '請使用繁體中文回答。',
      'HbA1c: 7.2% (2026-07-01)',
    )

    expect(prompt).toContain('STANDARD CHAT MODE (NO TOOLS)')
    expect(prompt).toContain('cannot call FHIR, web, or literature-search tools')
    expect(prompt).toContain('user-selected snapshot')
    expect(prompt).toContain('untrusted patient data')
    expect(prompt).toContain('HbA1c: 7.2% (2026-07-01)')
    expect(prompt).toContain('請使用繁體中文回答。')
  })

  it('states when no clinical records were selected', () => {
    expect(buildStandardChatSystemPrompt('base', '   ')).toContain(
      'No clinical data selected.',
    )
  })
})
