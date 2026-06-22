import {
  aiResultCacheKey,
  contentSignature,
  purgeAiResultCaches,
  removeEncryptedCache,
} from '../encrypted-session-cache'

describe('encrypted-session-cache key/signature/purge', () => {
  beforeEach(() => localStorage.clear())

  it('namespaces AI result keys by scope + id', () => {
    expect(aiResultCacheKey('safety', 'p1')).toBe('mediprisma:ai-result:safety:p1')
    expect(aiResultCacheKey('insights', 'p1')).toBe('mediprisma:ai-result:insights:p1')
    // distinct scopes / patients never collide
    expect(aiResultCacheKey('safety', 'p1')).not.toBe(aiResultCacheKey('insights', 'p1'))
    expect(aiResultCacheKey('insights', 'p1')).not.toBe(aiResultCacheKey('insights', 'p2'))
  })

  it('contentSignature is stable for equal input and differs on change', () => {
    expect(contentSignature('summarise recent changes')).toBe(contentSignature('summarise recent changes'))
    expect(contentSignature('prompt A')).not.toBe(contentSignature('prompt B'))
    expect(contentSignature('')).toBe(contentSignature(''))
  })

  it('purgeAiResultCaches drops only the AI-result namespace', () => {
    localStorage.setItem(aiResultCacheKey('safety', 'p1'), 'x')
    localStorage.setItem(aiResultCacheKey('insights', 'p2'), 'y')
    localStorage.setItem('ai-config-storage', 'keep-me')
    localStorage.setItem('safety-alerts-prefs', 'keep-me')

    purgeAiResultCaches()

    expect(localStorage.getItem(aiResultCacheKey('safety', 'p1'))).toBeNull()
    expect(localStorage.getItem(aiResultCacheKey('insights', 'p2'))).toBeNull()
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
})
