import { memory } from './fixtures/firestore-memory'
import { getPromptFavorites, removePromptFavorite, savePromptFavorite } from '@/features/prompt-gallery/services/prompt-favorites.service'
import { favoriteHasUpdate, toPromptFavorite } from '@/features/prompt-gallery/utils/prompt-favorite.utils'
import type { SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('@/src/shared/config/firebase.config', () => ({ db: {} }))
jest.mock('firebase/firestore', () => jest.requireActual('./fixtures/firestore-memory').firestore)

const source: SharedPrompt = {
  id: 'hf-followup', title: '心衰竭門診追蹤摘要', description: '回診前整理', prompt: '請整理 NT-proBNP 趨勢',
  types: ['chat', 'summary'], category: 'summary', specialty: ['cardiology'], audience: ['medical'], tags: ['心衰竭'],
  outputFormat: 'markdown', exampleOutput: '## 摘要\n- NT-proBNP 下降',
  createdAt: new Date('2026-05-08T00:00:00Z'), updatedAt: new Date('2026-08-21T00:00:00Z'),
  authorId: 'dept-cardio', authorName: '心臟內科', usageCount: 12,
}
beforeEach(() => memory.reset())

it('stores a copy of the prompt under the user and reads it back without the source', async () => {
  const favorite = toPromptFavorite(source, new Date('2026-09-01T00:00:00Z'))
  expect(await savePromptFavorite('alice', favorite)).toBe(true)
  expect(memory.records.get('users/alice/promptFavorites/hf-followup')).toMatchObject({ title: source.title, prompt: source.prompt, exampleOutput: source.exampleOutput })

  const [saved] = await getPromptFavorites('alice')
  expect(saved.id).toBe('hf-followup')
  expect(saved.prompt).toMatchObject({ id: 'hf-followup', title: source.title, prompt: source.prompt, types: ['chat', 'summary'], outputFormat: 'markdown', exampleOutput: source.exampleOutput, usageCount: 0 })
  expect(saved.sourceUpdatedAt.getTime()).toBe(source.updatedAt.getTime())
  expect(saved.savedAt.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  expect(await getPromptFavorites('bob')).toHaveLength(0)
})

it('saves the same prompt once per account and removes it without touching the source', async () => {
  await savePromptFavorite('alice', toPromptFavorite(source))
  await savePromptFavorite('alice', toPromptFavorite(source))
  expect(await getPromptFavorites('alice')).toHaveLength(1)
  expect(await removePromptFavorite('alice', 'hf-followup')).toBe(true)
  expect(await getPromptFavorites('alice')).toHaveLength(0)
  expect(memory.records.has('sharedPrompts/hf-followup')).toBe(false)
})

it('flags a copy only when the gallery source moved on after it was saved', () => {
  const favorite = toPromptFavorite(source)
  expect(favoriteHasUpdate(favorite, undefined)).toBe(false)
  expect(favoriteHasUpdate(favorite, { updatedAt: source.updatedAt })).toBe(false)
  expect(favoriteHasUpdate(favorite, { updatedAt: new Date('2026-08-30T00:00:00Z') })).toBe(true)
})

it('refuses to save an unresolved list excerpt as a copy', () => {
  expect(() => toPromptFavorite({ ...source, body: { id: 'body', chunks: 2 } as SharedPrompt['body'] })).toThrow()
})
