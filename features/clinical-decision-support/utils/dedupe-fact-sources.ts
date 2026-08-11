import type { CdssFactSource } from '../types'

/**
 * A single FHIR resource can support more than one clinical fact. When those
 * facts are flattened into one evidence block, keep the resource only once so
 * source counts, trends, and React identities still represent real records.
 */
export function dedupeFactSources(
  sources: readonly CdssFactSource[],
): CdssFactSource[] {
  const seen = new Set<string>()
  return sources.filter((source) => {
    const key = source.resourceId
      ? `${source.resourceType}/${source.resourceId}`
      : [
          source.resourceType,
          source.date ?? '',
          source.value ?? '',
          source.unit ?? '',
        ].join('/')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
