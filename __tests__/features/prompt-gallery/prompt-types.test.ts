import { normalizePromptTypes } from '@/features/prompt-gallery/types/prompt.types'

describe('Prompt Gallery type normalization', () => {
  it('maps retired insight records to summary without leaking the legacy type', () => {
    expect(normalizePromptTypes('community-template', ['insight'])).toEqual(['summary'])
    expect(normalizePromptTypes('community-template', ['chat', 'insight'])).toEqual([
      'chat',
      'summary',
    ])
  })

  it('upgrades existing citizen seed records to dual chat and summary use', () => {
    expect(normalizePromptTypes('patient-warning-signs', ['chat'])).toEqual([
      'chat',
      'summary',
    ])
  })

  it('deduplicates normalized values and defaults malformed records to chat', () => {
    expect(normalizePromptTypes('community-template', ['summary', 'insight', 'summary'])).toEqual([
      'summary',
    ])
    expect(normalizePromptTypes('community-template', undefined)).toEqual(['chat'])
  })
})
