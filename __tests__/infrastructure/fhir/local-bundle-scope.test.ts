import {
  LOCAL_BUNDLE_STORAGE_KEY,
  importIdFromLocalBundleMarker,
  localBundleMarker,
  localImportScopeSegment,
  readTabLocalImportId,
} from '@/src/infrastructure/fhir/services/local-bundle-scope'

describe('local Bundle tab scope', () => {
  it('stores and reads an import pointer from sessionStorage only', () => {
    localStorage.setItem(LOCAL_BUNDLE_STORAGE_KEY, localBundleMarker('other-tab'))
    sessionStorage.setItem(LOCAL_BUNDLE_STORAGE_KEY, localBundleMarker('this-tab'))

    expect(readTabLocalImportId()).toBe('this-tab')
  })

  it('does not discover another tab through origin-wide localStorage', () => {
    localStorage.setItem(LOCAL_BUNDLE_STORAGE_KEY, localBundleMarker('other-tab'))

    expect(readTabLocalImportId()).toBeNull()
  })

  it('round-trips safe marker and cache namespace values', () => {
    expect(importIdFromLocalBundleMarker(localBundleMarker('import/a'))).toBe('import/a')
    expect(localImportScopeSegment('import/a')).toBe('import-import%2Fa')
  })
})
