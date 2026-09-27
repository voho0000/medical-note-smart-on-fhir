import type {
  DocumentEvidence,
  ResolvedSourceRef,
} from '@/src/core/entities/medical-summary.entity'

/**
 * Resolve one claim's source keys and attach its claim-specific free-text
 * excerpt. The global source index deliberately remains quote-free because
 * the same D1 document can support several claims at different passages.
 */
export function resolveClaimSources(
  sourceKeys: string[],
  byKey: ReadonlyMap<string, ResolvedSourceRef>,
  documentEvidence?: DocumentEvidence[],
): ResolvedSourceRef[] {
  const evidenceBySource = new Map(
    (documentEvidence ?? []).map((entry) => [entry.source, entry]),
  )
  return sourceKeys.flatMap((key) => {
    const source = byKey.get(key)
    if (!source) return []
    const evidence = evidenceBySource.get(key)
    const evidenceQuote = evidence?.quote
    const isDocument = source.resourceType === 'Composition' || source.resourceType === 'DocumentReference'
    if (!isDocument) return evidenceQuote ? [{ ...source, evidenceQuote }] : [source]
    const evidenceWarning = !evidenceQuote ? 'missing'
      : evidence?.verification === 'not-found' ? 'mismatch'
        : evidence?.verification === 'exact' || evidence?.verification === 'whitespace-restored' ? undefined : 'unchecked'
    return [{ ...source, ...(evidenceQuote ? { evidenceQuote } : {}), ...(evidenceWarning ? { evidenceWarning } : {}) }]
  })
}
