import { isUsableApiKey, sanitizeApiKey } from '@/src/shared/utils/api-key.utils'

describe('api-key utils', () => {
  it('accepts a normal ASCII key (trimmed)', () => {
    expect(isUsableApiKey('sk-ant-abc123_XYZ')).toBe(true)
    expect(sanitizeApiKey('  sk-ant-abc123  ')).toBe('sk-ant-abc123')
  })

  it('rejects empty / whitespace / nullish', () => {
    expect(isUsableApiKey('')).toBe(false)
    expect(isUsableApiKey('   ')).toBe(false)
    expect(isUsableApiKey(null)).toBe(false)
    expect(isUsableApiKey(undefined)).toBe(false)
    expect(sanitizeApiKey('   ')).toBeNull()
    expect(sanitizeApiKey(null)).toBeNull()
  })

  it('rejects non-Latin1 — the Headers-construction crash trigger', () => {
    // The real-world bug: a Chinese sentence pasted into the key field.
    expect(isUsableApiKey('我要演講去公開這個repo開源專案')).toBe(false)
    expect(sanitizeApiKey('我要演講')).toBeNull()
    expect(isUsableApiKey('sk-中文-mixed')).toBe(false)
    expect(isUsableApiKey('emoji-😀-key')).toBe(false)
  })

  it('allows Latin1 range (≤ U+00FF) since that is header-safe', () => {
    expect(isUsableApiKey('key-with-é')).toBe(true)
  })
})
