import { canEditFeatureRequest, filterFeatureRequests } from '@/features/feature-request-pool/model'
import type { FeatureRequest } from '@/features/feature-request-pool/types'

const baseRequest = (overrides: Partial<FeatureRequest> = {}): FeatureRequest => ({
  id: 'request-1',
  title: 'Better timeline',
  description: 'Show the key changes together',
  category: 'feature',
  status: 'evaluating',
  displayAuthor: false,
  authorName: '',
  officialNote: '',
  visibility: 'visible',
  hiddenReason: '',
  hiddenBy: '',
  voteCount: 0,
  createdAt: new Date('2026-08-15T00:00:00.000Z'),
  updatedAt: new Date('2026-08-15T00:00:00.000Z'),
  ...overrides,
})
describe('feature request pool model', () => {
  it('allows the owner to edit an evaluating request for 30 minutes', () => {
    const request = baseRequest()
    expect(canEditFeatureRequest(request, true, new Date('2026-08-15T00:30:00.000Z'))).toBe(true)
    expect(canEditFeatureRequest(request, true, new Date('2026-08-15T00:30:00.001Z'))).toBe(false)
    expect(canEditFeatureRequest(request, false, new Date('2026-08-15T00:10:00.000Z'))).toBe(false)
  })

  it('locks editing after the request is planned or hidden', () => {
    expect(canEditFeatureRequest(baseRequest({ status: 'planned' }), true, new Date('2026-08-15T00:10:00.000Z'))).toBe(false)
    expect(canEditFeatureRequest(baseRequest({ visibility: 'hidden' }), true, new Date('2026-08-15T00:10:00.000Z'))).toBe(false)
  })

  it('filters by search, category, status, ownership, and support', () => {
    const requests = [
      baseRequest({ id: 'a', title: 'AI summary', category: 'ai', voteCount: 2 }),
      baseRequest({ id: 'b', title: 'Mobile layout', category: 'ui', voteCount: 8, status: 'planned' }),
      baseRequest({ id: 'c', title: 'Import flow', category: 'feature', voteCount: 4 }),
    ]

    const common = {
      search: '',
      status: 'all' as const,
      category: 'all' as const,
      sort: 'popular' as const,
      ownedIds: new Set(['a']),
      supportedIds: new Set(['b']),
    }

    expect(filterFeatureRequests(requests, { ...common, view: 'mine' }).map((item) => item.id)).toEqual(['a'])
    expect(filterFeatureRequests(requests, { ...common, view: 'supported' }).map((item) => item.id)).toEqual(['b'])
    expect(filterFeatureRequests(requests, { ...common, view: 'all', category: 'ui' }).map((item) => item.id)).toEqual(['b'])
    expect(filterFeatureRequests(requests, { ...common, view: 'all', search: 'import' }).map((item) => item.id)).toEqual(['c'])
  })

  it('keeps hidden requests out of normal views and exposes them only in the hidden view', () => {
    const requests = [
      baseRequest({ id: 'visible' }),
      baseRequest({ id: 'hidden', visibility: 'hidden' }),
    ]
    const options = {
      search: '',
      status: 'all' as const,
      category: 'all' as const,
      sort: 'latest' as const,
      ownedIds: new Set<string>(),
      supportedIds: new Set<string>(),
    }

    expect(filterFeatureRequests(requests, { ...options, view: 'all' }).map((item) => item.id)).toEqual(['visible'])
    expect(filterFeatureRequests(requests, { ...options, view: 'hidden' }).map((item) => item.id)).toEqual(['hidden'])
  })
})
