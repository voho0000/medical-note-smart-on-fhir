import { getDocs, where } from 'firebase/firestore'
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

  it.each([undefined, 'summary'] as const)('expands the server query for internal medicine with type %s', async (type) => {
    await fetchPrompts({ specialty: 'internal', type })
    expect(where).toHaveBeenCalledWith('specialty', 'array-contains-any', [
      'internal', 'cardiology', 'gastroenterology', 'pulmonology', 'nephrology',
      'rheumatology', 'immunology', 'hematology', 'medical_oncology',
      'endocrinology', 'infectious_diseases',
    ])
    // Firestore may not combine this with a second array predicate for type.
    expect(where).not.toHaveBeenCalledWith('types', 'array-contains', expect.anything())
  })

  it('includes subspecialties and legacy internal tags when chat uses the array query slot', async () => {
    const prompts = await fetchPrompts({ specialty: 'internal', type: 'chat' })
    expect(prompts.map((prompt) => prompt.id)).toEqual([
      'legacy-internal', 'heart', 'renal', 'rheumatology', 'immunology', 'blood', 'cancer',
    ])
    expect(where).toHaveBeenCalledWith('types', 'array-contains', 'chat')
    expect(jest.mocked(where).mock.calls.filter(([field]) => field === 'specialty')).toEqual([])
  })

  it('does not interpret a broad internal tag as a specific subspecialty', async () => {
    const prompts = await fetchPrompts({ specialty: 'nephrology', type: 'chat' })
    expect(prompts.map((prompt) => prompt.id)).toEqual(['renal'])
    await fetchPrompts({ specialty: 'nephrology' })
    expect(where).toHaveBeenCalledWith('specialty', 'array-contains', 'nephrology')
  })

  it('keeps old insight summaries discoverable alongside the expanded specialty query', async () => {
    jest.mocked(getDocs).mockResolvedValue({ docs: [
      record('legacy-summary', ['nephrology'], ['insight']),
      record('chat-only', ['nephrology'], ['chat']),
    ] } as unknown as Awaited<ReturnType<typeof getDocs>>)
    const prompts = await fetchPrompts({ specialty: 'internal', type: 'summary' })
    expect(prompts.map((prompt) => prompt.id)).toEqual(['legacy-summary'])
  })

  it('retains author scoping and expands pathology consistently', async () => {
    await fetchPrompts({ specialty: 'pathology' })
    expect(where).toHaveBeenCalledWith('specialty', 'array-contains-any', [
      'pathology', 'anatomic_pathology', 'clinical_pathology',
    ])
    if (_name === 'my templates') {
      expect(where).toHaveBeenCalledWith('authorId', '==', 'test-author')
    }
  })
})

it('has one translated entry per specialty in the shared publishing/filter catalog', () => {
  const specialties = PROMPT_SPECIALTY_GROUPS.flatMap((group) => [...group.specialties])
  expect(new Set(specialties).size).toBe(specialties.length)
  expect([...specialties].sort()).toEqual(Object.keys(zhTW.promptGallery.specialties).sort())
  expect([...specialties].sort()).toEqual(Object.keys(en.promptGallery.specialties).sort())
})
