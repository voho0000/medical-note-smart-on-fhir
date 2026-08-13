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
  const quoteBySource = new Map(
    (documentEvidence ?? []).map((entry) => [entry.source, entry.quote]),
  )
  return sourceKeys.flatMap((key) => {
    const source = byKey.get(key)
    if (!source) return []
    const evidenceQuote = quoteBySource.get(key)
    return evidenceQuote ? [{ ...source, evidenceQuote }] : [source]
  })
}
