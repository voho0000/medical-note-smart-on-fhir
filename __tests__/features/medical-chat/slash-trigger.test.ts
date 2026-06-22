import {
  detectSlashToken,
  matchTemplates,
  applyTemplate,
  type SlashTemplate,
} from '@/features/medical-chat/utils/slash-trigger'

describe('detectSlashToken', () => {
  it('detects a slash token at the start of the input', () => {
    expect(detectSlashToken('/soa', 4)).toEqual({ query: 'soa', start: 0, end: 4 })
  })

  it('detects a slash token after whitespace', () => {
    const text = 'draft this /so'
    expect(detectSlashToken(text, text.length)).toEqual({ query: 'so', start: 11, end: 14 })
  })

  it('treats a bare slash as an empty query (show everything)', () => {
    expect(detectSlashToken('/', 1)).toEqual({ query: '', start: 0, end: 1 })
  })

  it('does NOT fire mid-word or inside a URL/path', () => {
    expect(detectSlashToken('http://x', 8)).toBeNull()
    expect(detectSlashToken('a/b', 3)).toBeNull()
  })

  it('dismisses once a space follows the token', () => {
    expect(detectSlashToken('/soap ', 6)).toBeNull()
  })

  it('only considers the token up to the caret, not text after it', () => {
    // caret sits right after "/so", before "ap"
    expect(detectSlashToken('/soap', 3)).toEqual({ query: 'so', start: 0, end: 3 })
  })
})

describe('matchTemplates', () => {
  const items: SlashTemplate[] = [
    { id: '1', label: 'SOAP note', shortcut: 'soap', body: 'S:\nO:\nA:\nP:' },
    { id: '2', label: 'Admission note', shortcut: 'adm', body: 'Admission...' },
    { id: '3', label: 'Discharge summary', body: 'Discharge...' }, // no shortcut
  ]

  it('returns everything for an empty query', () => {
    expect(matchTemplates(items, '').map((t) => t.id)).toEqual(['1', '2', '3'])
  })

  it('ranks shortcut prefix above title prefix', () => {
    // "a" matches adm (shortcut prefix) and would substring others; adm first
    expect(matchTemplates(items, 'adm')[0].id).toBe('2')
  })

  it('falls back to title match when there is no shortcut', () => {
    expect(matchTemplates(items, 'discharge').map((t) => t.id)).toEqual(['3'])
  })

  it('excludes non-matches', () => {
    expect(matchTemplates(items, 'zzz')).toEqual([])
  })
})

describe('applyTemplate', () => {
  it('replaces the token with the body and puts the caret after it', () => {
    const text = 'note: /soap'
    const token = detectSlashToken(text, text.length)!
    const { text: out, caret } = applyTemplate(text, token, 'S:O:A:P:')
    expect(out).toBe('note: S:O:A:P:')
    expect(caret).toBe('note: S:O:A:P:'.length)
  })

  it('preserves text after the token', () => {
    const text = '/soap rest'
    // caret right after "/soap"
    const token = detectSlashToken(text, 5)!
    const { text: out } = applyTemplate(text, token, 'BODY')
    expect(out).toBe('BODY rest')
  })
})
