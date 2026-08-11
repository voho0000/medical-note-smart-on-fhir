// Browser-tab-local identity for imported FHIR data.
//
// The payload itself lives in origin-wide IndexedDB because Bundles and images
// can be much larger than Web Storage.  Only the active import pointer lives in
// sessionStorage, which gives every MediPrisma tab its own patient scope while
// still surviving a reload of that tab.

export const LOCAL_BUNDLE_STORAGE_KEY = 'fhir_bundle_override'
export const LOCAL_BUNDLE_DEMO_FLAG_KEY = 'mediprisma:demo-active'
export const LOCAL_BUNDLE_MARKER = '1'
export const LOCAL_BUNDLE_IMPORT_MARKER_PREFIX = 'import:'

export function importIdFromLocalBundleMarker(raw: string | null): string | null {
  if (!raw?.startsWith(LOCAL_BUNDLE_IMPORT_MARKER_PREFIX)) return null
  const importId = raw.slice(LOCAL_BUNDLE_IMPORT_MARKER_PREFIX.length).trim()
  return importId || null
}

export function localBundleMarker(importId: string | null): string {
  return importId
    ? `${LOCAL_BUNDLE_IMPORT_MARKER_PREFIX}${importId}`
    : LOCAL_BUNDLE_MARKER
}

/** Read only this tab's active import. Origin-wide localStorage is deliberately
 * not consulted here; it is reserved for one-time migration of older builds. */
export function readTabLocalImportId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return importIdFromLocalBundleMarker(
      window.sessionStorage.getItem(LOCAL_BUNDLE_STORAGE_KEY),
    )
  } catch {
    return null
  }
}

/** Stable non-PHI namespace for caches owned by one local import. */
export function localImportScopeSegment(importId = readTabLocalImportId()): string {
  return importId ? `import-${encodeURIComponent(importId)}` : 'non-local'
}
