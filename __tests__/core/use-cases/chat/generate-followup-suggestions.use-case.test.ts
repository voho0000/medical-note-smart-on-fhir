import { generateFollowupSuggestionsUseCase as uc } from '@/src/core/use-cases/chat/generate-followup-suggestions.use-case'

describe('GenerateFollowupSuggestionsUseCase.parse', () => {
  it('parses a clean JSON object', () => {
    const out = uc.parse('{"suggestions":[{"label":"A","prompt":"do A"},{"label":"B","prompt":"do B"}]}')
    expect(out).toEqual([
      { label: 'A', prompt: 'do A' },
      { label: 'B', prompt: 'do B' },
    ])
  })

  it('strips ```json markdown fences', () => {
    const out = uc.parse('```json\n{"suggestions":[{"label":"X","prompt":"do X"}]}\n```')
    expect(out).toEqual([{ label: 'X', prompt: 'do X' }])
  })

  it('slices to the outermost object when wrapped in prose', () => {
    const out = uc.parse('Sure! {"suggestions":[{"label":"Y","prompt":"do Y"}]} hope it helps')
    expect(out).toEqual([{ label: 'Y', prompt: 'do Y' }])
  })

  it('caps at 4 and drops entries missing label or prompt', () => {
    const out = uc.parse(JSON.stringify({
      suggestions: [
        { label: '1', prompt: 'a' }, { label: '2', prompt: 'b' },
        { label: '3', prompt: 'c' }, { label: '4', prompt: 'd' },
        { label: '5', prompt: 'e' },
        { label: 'no prompt' }, { prompt: 'no label' },
        { label: '', prompt: 'x' },
      ],
    }))
    expect(out).toHaveLength(4)
    expect(out.map((s) => s.label)).toEqual(['1', '2', '3', '4'])
  })

  it('returns [] on garbage / empty / non-object', () => {
    expect(uc.parse('not json at all')).toEqual([])
    expect(uc.parse('')).toEqual([])
    expect(uc.parse('{"suggestions":"oops"}')).toEqual([])
  })
})

describe('GenerateFollowupSuggestionsUseCase.buildMessages', () => {
  it('includes both turns, asks for JSON, and sets the label language', () => {
    const msgs = uc.buildMessages({ lastUser: 'WHAT_I_ASKED', lastAssistant: 'WHAT_AI_SAID', locale: 'zh-TW' })
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('JSON')
    expect(msgs[0].content).toContain('Traditional Chinese')
    expect(msgs[1].content).toContain('WHAT_I_ASKED')
    expect(msgs[1].content).toContain('WHAT_AI_SAID')
  })

  // ── Personalisation ① — audience + mode bias the KIND of suggestion ──────────
  it('defaults to the medical-professional + quick-chat framing', () => {
    const sys = uc.buildMessages({ lastUser: 'q', lastAssistant: 'a', locale: 'en' })[0].content
    expect(sys).toContain('MEDICAL PROFESSIONAL')
    expect(sys).toContain('quick-chat')
  })

  it('switches to plain-language framing for a patient audience', () => {
    const sys = uc.buildMessages({ lastUser: 'q', lastAssistant: 'a', locale: 'en', audience: 'patient' })[0].content
    expect(sys).toContain('PATIENT')
    expect(sys).toContain('plain language')
    expect(sys).not.toContain('MEDICAL PROFESSIONAL')
  })

  it('uses deep-research framing when isDeepMode is set', () => {
    const sys = uc.buildMessages({ lastUser: 'q', lastAssistant: 'a', locale: 'en', isDeepMode: true })[0].content
    expect(sys).toContain('deep-research')
  })

  // ── Personalisation ② — earlier questions are an AVOID-LIST (don't re-suggest) ─
  it('lists earlier questions as a do-not-repeat set, dropping the current one and blanks', () => {
    const user = uc.buildMessages({
      lastUser: 'CURRENT_Q',
      lastAssistant: 'a',
      locale: 'en',
      recentUserMessages: ['OLDER_Q1', '  ', 'OLDER_Q2', 'CURRENT_Q'],
    })[1].content
    expect(user).toContain('do NOT re-suggest')
    expect(user).toContain('OLDER_Q1')
    expect(user).toContain('OLDER_Q2')
    // current question shows once (as the latest message), never echoed into the avoid-list
    expect(user.match(/CURRENT_Q/g)?.length).toBe(1)
  })

  it('omits the avoid-list block when there are no earlier questions', () => {
    const user = uc.buildMessages({ lastUser: 'q', lastAssistant: 'a', locale: 'en' })[1].content
    expect(user).not.toContain('do NOT re-suggest')
  })
})
