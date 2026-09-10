import { getDocs, orderBy, where } from 'firebase/firestore'
import { getMySharedPrompts, getSharedPrompts } from '@/features/prompt-gallery/services/prompt-gallery.service'
import { PROMPT_SPECIALTY_GROUPS } from '@/features/prompt-gallery/constants/prompt-specialties'
import { en } from '@/src/shared/i18n/locales/en'
import { zhTW } from '@/src/shared/i18n/locales/zh-TW'
import type { PromptGalleryFilter } from '@/features/prompt-gallery/types/prompt.types'

jest.mock('@/src/shared/config/firebase.config', () => ({ db: {} }))
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn((_collection, ...constraints) => constraints),
  where: jest.fn((field, operator, value) => ({ field, operator, value })),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
}))

function record(id: string, specialty: string[], types = ['chat', 'summary']) {
  return {
    id,
    data: () => ({ title: id, prompt: id, category: 'summary', specialty, types, tags: [] }),
  }
}

const fetchers = [
  ['all templates', (filter: PromptGalleryFilter) => getSharedPrompts(filter)],
  ['my templates', (filter: PromptGalleryFilter) => getMySharedPrompts('test-author', filter)],
] as const

describe.each(fetchers)('%s specialty filtering', (_name, fetchPrompts) => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getDocs).mockResolvedValue({ docs: [
      record('legacy-internal', ['internal']),
      record('heart', ['cardiology']),
      record('renal', ['nephrology']),
      record('rheumatology', ['rheumatology']),
      record('immunology', ['immunology']),
      record('blood', ['hematology']),
      record('cancer', ['medical_oncology']),
      record('surgery', ['surgery']),
      record('general', ['general']),
    ] } as unknown as Awaited<ReturnType<typeof getDocs>>)
  })

  const expectIndexSafeScope = () => {
    expect(where).toHaveBeenCalledTimes(1)
    expect(where).toHaveBeenCalledWith(
      _name === 'my templates' ? 'authorId' : 'isPublic',
      '==',
      _name === 'my templates' ? 'test-author' : true,
    )
    expect(orderBy).not.toHaveBeenCalled()
  }

  it.each([undefined, 'summary'] as const)('expands internal medicine in memory with type %s', async (type) => {
    const prompts = await fetchPrompts({ specialty: 'internal', type })
    expect(prompts.map((prompt) => prompt.id)).toEqual([
      'legacy-internal', 'heart', 'renal', 'rheumatology', 'immunology', 'blood', 'cancer',
    ])
    expectIndexSafeScope()
  })

  it('includes subspecialties and legacy internal tags for chat without adding an indexed predicate', async () => {
    const prompts = await fetchPrompts({ specialty: 'internal', type: 'chat' })
    expect(prompts.map((prompt) => prompt.id)).toEqual([
      'legacy-internal', 'heart', 'renal', 'rheumatology', 'immunology', 'blood', 'cancer',
    ])
    expectIndexSafeScope()
  })

  it('does not interpret a broad internal tag as a specific subspecialty', async () => {
    const prompts = await fetchPrompts({ specialty: 'nephrology', type: 'chat' })
    expect(prompts.map((prompt) => prompt.id)).toEqual(['renal'])
    expectIndexSafeScope()
  })

  it('keeps old insight summaries discoverable alongside the expanded specialty query', async () => {
    jest.mocked(getDocs).mockResolvedValue({ docs: [
      record('legacy-summary', ['nephrology'], ['insight']),
      record('chat-only', ['nephrology'], ['chat']),
    ] } as unknown as Awaited<ReturnType<typeof getDocs>>)
    const prompts = await fetchPrompts({ specialty: 'internal', type: 'summary' })
    expect(prompts.map((prompt) => prompt.id)).toEqual(['legacy-summary'])
    expectIndexSafeScope()
  })

  it('retains authorization scoping when expanding pathology', async () => {
    await fetchPrompts({ specialty: 'pathology' })
    expectIndexSafeScope()
  })
})

it('has one translated entry per specialty in the shared publishing/filter catalog', () => {
  const specialties = PROMPT_SPECIALTY_GROUPS.flatMap((group) => [...group.specialties])
  expect(new Set(specialties).size).toBe(specialties.length)
  expect([...specialties].sort()).toEqual(Object.keys(zhTW.promptGallery.specialties).sort())
  expect([...specialties].sort()).toEqual(Object.keys(en.promptGallery.specialties).sort())
})
