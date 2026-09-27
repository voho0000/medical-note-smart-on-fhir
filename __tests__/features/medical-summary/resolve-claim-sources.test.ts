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
      [{ source: 'D1', quote: 'Reflux esophagitis, L.A. grade A', verification: 'exact' }],
    )

    expect(resolved).toEqual([{
      ...sharedSource,
      evidenceQuote: 'Reflux esophagitis, L.A. grade A',
    }])
    expect(sharedSource).not.toHaveProperty('evidenceQuote')
  })

  it('warns on a claim with a mismatched or missing quote while keeping the document navigable', () => {
    const source: ResolvedSourceRef = { key: 'D1', num: 1, verified: true, resourceType: 'DocumentReference', resourceId: 'synthetic-document' }
    const byKey = new Map([['D1', source]])
    expect(resolveClaimSources(['D1'], byKey, [{ source: 'D1', quote: 'Mismatched quote', verification: 'not-found' }])[0])
      .toMatchObject({ verified: true, resourceId: source.resourceId, evidenceWarning: 'mismatch' })
    expect(resolveClaimSources(['D1'], byKey)[0]).toMatchObject({ evidenceWarning: 'missing', resourceId: source.resourceId })
    expect(source).not.toHaveProperty('evidenceWarning')
  })

  it('checks an explicitly supplied report quote without requiring quotes for structured reports', () => {
    const source: ResolvedSourceRef = { key: 'L1', num: 1, verified: true, resourceType: 'DiagnosticReport', resourceId: 'synthetic-report' }
    const byKey = new Map([['L1', source]])
    expect(resolveClaimSources(['L1'], byKey)).toEqual([source])
    expect(resolveClaimSources(['L1'], byKey, [{ source: 'L1', quote: 'Unsupported report quote', verification: 'not-found' }])[0])
      .toMatchObject({ evidenceWarning: 'mismatch', resourceId: source.resourceId })
    expect(resolveClaimSources(['L1'], byKey, [{ source: 'L1', quote: 'Exact original report', verification: 'exact' }])[0])
      .not.toHaveProperty('evidenceWarning')
    expect(resolveClaimSources(['L1'], byKey, [{ source: 'L1', quote: 'Old unchecked quote' }])[0])
      .toMatchObject({ evidenceWarning: 'unchecked' })
  })
})
