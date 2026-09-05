import { firestore, memory } from './fixtures/firestore-memory'
import { createTenantPrompt, deleteTenantPrompt, getTenantPrompts, incrementTenantPromptUsage } from '@/features/prompt-gallery/services/tenant-prompts.service'
import { createSharedPrompt, getSharedPrompts } from '@/features/prompt-gallery/services/prompt-gallery.service'
import type { SharedPrompt } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('@/src/shared/config/firebase.config', () => ({ db: {} }))
jest.mock('firebase/firestore', () => jest.requireActual('./fixtures/firestore-memory').firestore)

const draft = (overrides = {}): Omit<SharedPrompt, 'id' | 'createdAt' | 'updatedAt' | 'body' | 'tenantName'> => ({
  title: 'HF follow-up', prompt: 'Summarise the NT-proBNP trend', types: ['chat'], category: 'summary', specialty: ['cardiology'],
  audience: ['medical'], tags: ['心衰竭'], authorId: 'builder', authorName: 'Dr. B', ...overrides,
})
beforeEach(() => memory.reset())

it('stores department templates in their own collection, scoped by tenantId, newest first', async () => {
  const first = await createTenantPrompt({ ...draft(), tenantId: 'cardio' })
  const second = await createTenantPrompt({ ...draft({ title: 'Cath note' }), tenantId: 'cardio' })
  memory.records.get('tenantPrompts/' + second)!.createdAt = { toDate: () => new Date('2026-09-01T00:00:00Z') }
  memory.records.get('tenantPrompts/' + first)!.createdAt = { toDate: () => new Date('2026-08-01T00:00:00Z') }
  await createTenantPrompt({ ...draft({ title: 'Other dept' }), tenantId: 'nephro' })

  const cardio = await getTenantPrompts('cardio')
  expect(cardio.map((prompt) => prompt.title)).toEqual(['Cath note', 'HF follow-up'])
  expect(cardio[0]).toMatchObject({ tenantId: 'cardio', usageCount: 0, authorName: 'Dr. B' })
  expect(firestore.where).toHaveBeenCalledWith('tenantId', '==', 'cardio')
  expect(await getSharedPrompts()).toHaveLength(0)
  expect(memory.records.get('tenantPrompts/' + first)).not.toHaveProperty('body')
})

it('counts uses and deletes department templates without touching the public gallery', async () => {
  const id = await createTenantPrompt({ ...draft(), tenantId: 'cardio' })
  const publicId = await createSharedPrompt(draft())
  await incrementTenantPromptUsage(id)
  expect((await getTenantPrompts('cardio'))[0].usageCount).toBe(1)
  await deleteTenantPrompt(id)
  expect(await getTenantPrompts('cardio')).toHaveLength(0)
  expect(memory.records.has('sharedPrompts/' + publicId)).toBe(true)
})

it('never lets a public share carry a tenantId and rejects invalid department drafts', async () => {
  const id = await createSharedPrompt({ ...draft(), tenantId: 'cardio' } as Parameters<typeof createSharedPrompt>[0])
  expect(memory.records.get('sharedPrompts/' + id)).not.toHaveProperty('tenantId')
  await expect(createTenantPrompt({ ...draft(), tenantId: '' })).rejects.toThrow()
  await expect(createTenantPrompt({ ...draft({ title: '' }), tenantId: 'cardio' })).rejects.toThrow()
})
