import { getPromptSource, isSystemPrompt, SYSTEM_PROMPT_AUTHOR_IDS } from '@/features/prompt-gallery/constants/prompt-source'

const [ownerId] = [...SYSTEM_PROMPT_AUTHOR_IDS]

it('treats the seeded owner account and the seed author name as system templates', () => {
  expect(isSystemPrompt({ authorId: ownerId, authorName: 'Yi-Hsin Kuo' })).toBe(true)
  expect(isSystemPrompt({ authorId: 'someone', authorName: 'MediPrisma' })).toBe(true)
  expect(isSystemPrompt({ authorId: 'someone', authorName: 'MediPrisma', isAnonymous: true })).toBe(false)
  expect(isSystemPrompt({ authorId: 'someone', authorName: 'Someone' })).toBe(false)
})

it('labels the source relative to the viewer, with own prompts first', () => {
  expect(getPromptSource({ authorId: ownerId, authorName: 'Yi-Hsin Kuo' }, ownerId)).toBe('mine')
  expect(getPromptSource({ authorId: ownerId, authorName: 'Yi-Hsin Kuo' }, 'bob')).toBe('system')
  expect(getPromptSource({ authorId: 'carol', authorName: 'Carol' }, 'bob')).toBe('shared')
  expect(getPromptSource({ authorId: 'carol', authorName: 'Carol' })).toBe('shared')
})
