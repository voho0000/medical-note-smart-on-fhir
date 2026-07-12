import {
  estimateFullRecordTokens,
  AUTO_SELECT_ALL_TOKENS,
} from '@/features/data-selection/hooks/useAdaptiveDataDefaults'

const obs = (i: number) => ({
  id: `o${i}`,
  code: { text: 'Creatinine' },
  valueQuantity: { value: 1, unit: 'mg/dL' },
  effectiveDateTime: '2026-01-01',
})

describe('estimateFullRecordTokens', () => {
  it('a tiny structured-only record estimates well under the auto-select threshold', () => {
    const data = { observations: [obs(1), obs(2), obs(3)], diagnosticReports: [], medications: [] } as any
    const tokens = estimateFullRecordTokens(data)
    expect(tokens).toBeLessThan(AUTO_SELECT_ALL_TOKENS)
    expect(tokens).toBeGreaterThan(0)
  })

  it('a huge structured record short-circuits to Infinity (no document decode needed)', () => {
    const many = Array.from({ length: 700 }, (_, i) => obs(i))
    const data = { observations: many } as any
    expect(estimateFullRecordTokens(data)).toBe(Number.POSITIVE_INFINITY)
  })

  it('counts document text weight — a big discharge summary pushes a sparse patient over budget', () => {
    // One CJK-heavy discharge summary ~ 80k chars → ~53k tokens (÷1.5), over 40k.
    const bigNote = '病'.repeat(80_000)
    const data = {
      observations: [obs(1)],
      documentReferences: [
        {
          id: 'big-note',
          date: '2025-01-01',
          type: { coding: [{ code: '18842-5' }] },
          content: [{ attachment: { contentType: 'text/html', data: btoa(unescape(encodeURIComponent(bigNote))) } }],
        },
      ],
    } as any
    expect(estimateFullRecordTokens(data)).toBeGreaterThan(AUTO_SELECT_ALL_TOKENS)
  })

  it('a sparse patient with only small documents stays under budget', () => {
    const smallNote = '<p>Short discharge note.</p>'
    const data = {
      observations: [obs(1), obs(2)],
      documentReferences: [
        {
          id: 'small-note',
          date: '2025-01-01',
          type: { coding: [{ code: '18842-5' }] },
          content: [{ attachment: { contentType: 'text/html', data: btoa(smallNote) } }],
        },
      ],
    } as any
    expect(estimateFullRecordTokens(data)).toBeLessThan(AUTO_SELECT_ALL_TOKENS)
  })
})
