import { resolveClaimSources } from '@/features/medical-summary/utils/resolve-claim-sources'
import type { ResolvedSourceRef } from '@/src/core/entities/medical-summary.entity'

describe('resolveClaimSources', () => {
  it('attaches the quote for this claim without mutating the shared source index', () => {
    const sharedSource: ResolvedSourceRef = {
      key: 'D1',
      num: 1,
      verified: true,
      resourceType: 'DocumentReference',
      resourceId: 'discharge-summary-1',
    }
    const byKey = new Map([['D1', sharedSource]])

    const resolved = resolveClaimSources(
      ['D1'],
      byKey,
      [{ source: 'D1', quote: 'Reflux esophagitis, L.A. grade A' }],
    )

    expect(resolved).toEqual([{
      ...sharedSource,
      evidenceQuote: 'Reflux esophagitis, L.A. grade A',
    }])
    expect(sharedSource).not.toHaveProperty('evidenceQuote')
  })
})
