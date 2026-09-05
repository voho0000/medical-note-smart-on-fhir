import { clearRecentPrompts, readRecentPrompts, recordRecentPrompt } from '@/features/prompt-gallery/utils/recent-prompts.utils'

beforeEach(() => window.localStorage.clear())

it('keeps one entry per prompt, newest first, capped at ten, per account', () => {
  for (let index = 0; index < 12; index += 1) recordRecentPrompt('alice', { id: `p${index}` }, 1000 + index)
  recordRecentPrompt('alice', { id: 'p5', tenantId: 'cardio' }, 5000)
  const entries = readRecentPrompts('alice')
  expect(entries).toHaveLength(10)
  expect(entries[0]).toEqual({ id: 'p5', tenantId: 'cardio', at: 5000 })
  expect(entries.filter((entry) => entry.id === 'p5')).toHaveLength(1)
  expect(entries.map((entry) => entry.id)).not.toContain('p0')
  expect(readRecentPrompts('bob')).toEqual([])
})

it('stores only ids and timestamps and survives corrupt storage', () => {
  recordRecentPrompt('alice', { id: 'p1', tenantId: 'cardio', title: '含病人資料的標題' } as { id: string; tenantId?: string })
  expect(JSON.parse(window.localStorage.getItem('mediprisma.promptGallery.recent.alice')!)).toEqual([expect.objectContaining({ id: 'p1', tenantId: 'cardio' })])
  expect(Object.keys(readRecentPrompts('alice')[0])).toEqual(['id', 'tenantId', 'at'])
  window.localStorage.setItem('mediprisma.promptGallery.recent.alice', '{not json')
  expect(readRecentPrompts('alice')).toEqual([])
  clearRecentPrompts('alice')
  expect(window.localStorage.getItem('mediprisma.promptGallery.recent.alice')).toBeNull()
})
