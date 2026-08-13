import {
  aiResultCacheKey,
  contentSignature,
  purgeExpiredAiResultCaches,
  purgeAiResultCaches,
  removeEncryptedCache,
} from '../encrypted-session-cache'

describe('encrypted-session-cache key/signature/purge', () => {
  beforeEach(() => localStorage.clear())

  it('namespaces AI result keys by import + scope + id', () => {
    expect(aiResultCacheKey('safety', 'p1', 'import-a')).toBe(
      'mediprisma:ai-result:import-import-a:safety:p1',
    )
    expect(aiResultCacheKey('insights', 'p1', 'import-a')).toBe(
      'mediprisma:ai-result:import-import-a:insights:p1',
    )
    // distinct scopes / patients never collide
    expect(aiResultCacheKey('safety', 'p1', 'import-a')).not.toBe(
      aiResultCacheKey('insights', 'p1', 'import-a'),
    )
    expect(aiResultCacheKey('insights', 'p1', 'import-a')).not.toBe(
      aiResultCacheKey('insights', 'p2', 'import-a'),
    )
    // Even identical FHIR ids/content in separate tabs cannot share results.
    expect(aiResultCacheKey('safety', 'p1', 'import-a')).not.toBe(
      aiResultCacheKey('safety', 'p1', 'import-b'),
    )
  })

  it('contentSignature is stable for equal input and differs on change', () => {
    expect(contentSignature('summarise recent changes')).toBe(contentSignature('summarise recent changes'))
    expect(contentSignature('prompt A')).not.toBe(contentSignature('prompt B'))
    expect(contentSignature('')).toBe(contentSignature(''))
  })

  it('purgeAiResultCaches drops only one import namespace', () => {
    const aSafety = aiResultCacheKey('safety', 'p1', 'import-a')
    const aInsights = aiResultCacheKey('insights', 'p2', 'import-a')
    const bSafety = aiResultCacheKey('safety', 'p1', 'import-b')
    localStorage.setItem(aSafety, 'x')
    localStorage.setItem(aInsights, 'y')
    localStorage.setItem(bSafety, 'keep-b')
    localStorage.setItem('ai-config-storage', 'keep-me')
    localStorage.setItem('safety-alerts-prefs', 'keep-me')

    purgeAiResultCaches('import-a')

    expect(localStorage.getItem(aSafety)).toBeNull()
    expect(localStorage.getItem(aInsights)).toBeNull()
    expect(localStorage.getItem(bSafety)).toBe('keep-b')
    // unrelated keys are untouched
    expect(localStorage.getItem('ai-config-storage')).toBe('keep-me')
    expect(localStorage.getItem('safety-alerts-prefs')).toBe('keep-me')
  })

  it('removeEncryptedCache removes a single key', () => {
    const key = aiResultCacheKey('insights', 'p9')
    localStorage.setItem(key, 'z')
    removeEncryptedCache(key)
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('sweeps only expired result records across import namespaces', () => {
    const now = Date.UTC(2026, 7, 11, 12)
    const live = aiResultCacheKey('safety', 'p1', 'import-a')
    const expired = aiResultCacheKey('safety', 'p2', 'import-b')
    localStorage.setItem(live, JSON.stringify({ savedAt: now - 1_000 }))
    localStorage.setItem(expired, JSON.stringify({ savedAt: now - 13 * 60 * 60 * 1_000 }))

    purgeExpiredAiResultCaches(now)

    expect(localStorage.getItem(live)).not.toBeNull()
    expect(localStorage.getItem(expired)).toBeNull()
  })
})
