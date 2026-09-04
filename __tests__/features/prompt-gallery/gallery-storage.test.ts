import { firestore, memory } from './fixtures/firestore-memory'
import { createSharedPrompt, deleteSharedPrompt, getMySharedPrompts, getSharedPrompt, getSharedPrompts, incrementPromptUsage, updateSharedPrompt } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { splitTemplateText, TEXT_CHUNK_BYTES } from '@/src/infrastructure/firebase/template-text-storage'
import { saveChatTemplate, getUserChatTemplates } from '@/src/infrastructure/firebase/template-sync'
import { applyClinicalInsightPanelChanges, getUserClinicalInsightPanels } from '@/src/infrastructure/firebase/clinical-insights-sync'
import type { SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('@/src/shared/config/firebase.config', () => ({ db: {} }))
jest.mock('firebase/firestore', () => jest.requireActual('./fixtures/firestore-memory').firestore)

const largeText = 'START\n' + '中😀'.repeat(180000) + '\nTAIL needle-at-the-end'
const prompt = (overrides = {}): Omit<SharedPrompt, 'id' | 'createdAt' | 'updatedAt'> => ({
  title: 'Test template', prompt: 'Source', types: ['summary'], category: 'summary', specialty: ['general'],
  audience: ['medical'], tags: [], authorId: 'alice', outputFormat: 'html', languagePolicy: 'follow-template', ...overrides,
})
beforeEach(() => memory.reset())

it('splits at transport boundaries without cutting Unicode or limiting total length', () => {
  const chunks = splitTemplateText(largeText)
  expect(chunks.join('')).toBe(largeText)
  expect(chunks.length).toBeGreaterThan(1)
  for (const chunk of chunks) expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(TEXT_CHUNK_BYTES)
})

it('publishes and reads back a >1 MiB prompt exactly, fetching the body only for detail or full-text search', async () => {
  const id = await createSharedPrompt(prompt({ prompt: largeText }))
  const metadata = memory.records.get('sharedPrompts/' + id)!
  expect(metadata.prompt).toHaveLength(180)
  expect(metadata.body.chunks).toBeGreaterThan(1)
  firestore.getDoc.mockClear()
  expect(await getSharedPrompts()).toHaveLength(1)
  expect(firestore.getDoc).not.toHaveBeenCalled()
  expect(await getSharedPrompt(id)).toMatchObject({ prompt: largeText, outputFormat: 'html', languagePolicy: 'follow-template' })
  expect(await getSharedPrompts({ searchQuery: 'needle-at-the-end' })).toHaveLength(1)
  await deleteSharedPrompt(id)
  expect(memory.records.size).toBe(0)
})

it('gives same-title prompts distinct ids and keeps their updates, counters, and deletion independent', async () => {
  const shortId = await createSharedPrompt(prompt({ title: 'Same title', prompt: 'Short content' }))
  const longId = await createSharedPrompt(prompt({ title: 'Same title', prompt: largeText }))

  expect(shortId).not.toBe(longId)
  const listed = await getSharedPrompts({ searchQuery: 'Same title' })
  expect(listed).toHaveLength(2)
  expect(new Set(listed.map(item => item.id))).toEqual(new Set([shortId, longId]))

  await updateSharedPrompt(shortId, { prompt: 'Edited short content' })
  await incrementPromptUsage(longId)
  expect(await getSharedPrompt(shortId)).toMatchObject({ id: shortId, title: 'Same title', prompt: 'Edited short content', usageCount: 0 })
  expect(await getSharedPrompt(longId)).toMatchObject({ id: longId, title: 'Same title', prompt: largeText, usageCount: 1 })

  await deleteSharedPrompt(longId)
  expect(await getSharedPrompt(longId)).toBeNull()
  expect(await getSharedPrompt(shortId)).toMatchObject({ id: shortId, title: 'Same title', prompt: 'Edited short content' })
})

it('does not publish a partial prompt when chunk writing fails', async () => {
  memory.commit.mockRejectedValueOnce(new Error('offline'))
  await expect(createSharedPrompt(prompt({ prompt: largeText }))).rejects.toThrow('offline')
  expect(memory.records.size).toBe(0)
})

it('cleans previously written chunks when a later batch fails, without limiting total prompt size', async () => {
  memory.commit.mockImplementationOnce(async operations => operations.forEach(operation => operation()))
    .mockRejectedValueOnce(new Error('connection lost after first batch'))
  await expect(createSharedPrompt(prompt({ prompt: '中'.repeat(1500000) }))).rejects.toThrow('connection lost')
  expect(memory.records.size).toBe(0)
})

it('retains the old complete version when replacing a body fails', async () => {
  const id = await createSharedPrompt(prompt({ prompt: largeText }))
  memory.commit.mockRejectedValueOnce(new Error('offline'))
  await expect(updateSharedPrompt(id, { prompt: largeText + 'edit' })).rejects.toThrow('offline')
  expect((await getSharedPrompt(id))?.prompt).toBe(largeText)
  await updateSharedPrompt(id, { prompt: 'Short replacement', outputFormat: 'plain-text' })
  expect(await getSharedPrompt(id)).toMatchObject({ prompt: 'Short replacement', outputFormat: 'plain-text' })
  expect([...memory.records.keys()].filter(path => path.startsWith('templateBodies/'))).toEqual([])
})

it('searches and ranks matches beyond the first page for all/my galleries', async () => {
  for (let i = 0; i < 101; i++) memory.seed('sharedPrompts/' + i, {
    ...prompt({ types: i === 100 ? ['insight'] : ['chat'], usageCount: i === 100 ? 999 : 0 }),
    createdAt: firestore.Timestamp.fromDate(new Date(1000 - i)),
  })
  expect((await getSharedPrompts({ type: 'summary' })).map(value => value.id)).toEqual(['100'])
  expect((await getMySharedPrompts('alice', { type: 'summary' })).map(value => value.id)).toEqual(['100'])
  expect((await getSharedPrompts({}, { field: 'usageCount', direction: 'desc' }))[0].id).toBe('100')
  expect(firestore.startAfter).toHaveBeenCalled()
})

it('isolates malformed legacy documents and validates new content before writing', async () => {
  memory.seed('sharedPrompts/valid', { ...prompt(), title: 'Healthy' })
  memory.seed('sharedPrompts/bad-title', { ...prompt(), title: 42 })
  memory.seed('sharedPrompts/bad-prompt', { ...prompt(), prompt: {} })
  memory.seed('sharedPrompts/bad-date', { ...prompt(), createdAt: { toDate: 1 } })
  memory.seed('sharedPrompts/bad-tags', { ...prompt(), tags: [42] })
  expect((await getSharedPrompts({ searchQuery: 'Source' })).map(value => value.id)).toEqual(['valid'])
  await expect(createSharedPrompt(prompt({ title: 42 }))).rejects.toThrow('Invalid template')
  await expect(updateSharedPrompt('valid', { usageCount: 999 })).rejects.toThrow('Cannot change')
  expect(firestore.addDoc).not.toHaveBeenCalled()
})

it('keeps large imported chat and summary templates complete through private save/read', async () => {
  await expect(saveChatTemplate('alice', { id: 'chat', label: 'Chat', content: largeText, order: 0, audience: 'medical' })).resolves.toBe(true)
  expect((await getUserChatTemplates('alice'))[0].content).toBe(largeText)
  const panel = { id: 'summary', title: 'Summary', prompt: largeText, order: 0, audience: 'medical' as const,
    showInSummary: true, autoGenerate: false, outputFormat: 'html' as const, languagePolicy: 'follow-template' as const }
  await expect(applyClinicalInsightPanelChanges('alice', [panel], [])).resolves.toBe(true)
  expect((await getUserClinicalInsightPanels('alice'))[0]).toMatchObject({ prompt: largeText, outputFormat: 'html' })
  const previous = memory.records.get('users/alice/clinicalInsightPanels/summary')
  // The chunk commit succeeds, but the atomic parent commit fails.
  memory.commit.mockImplementationOnce(async operations => operations.forEach(operation => operation())).mockRejectedValueOnce(new Error('offline'))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  await expect(applyClinicalInsightPanelChanges('alice', [{ ...panel, prompt: largeText + 'changed' }], [])).resolves.toBe(false)
  expect(memory.records.get('users/alice/clinicalInsightPanels/summary')).toBe(previous)
  expect((await getUserClinicalInsightPanels('alice'))[0].prompt).toBe(largeText)
  log.mockRestore()
})
