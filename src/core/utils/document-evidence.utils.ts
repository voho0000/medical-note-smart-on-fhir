/** Source-excerpt verification, not semantic verification of a clinical claim. */
export type DocumentQuoteVerification = 'exact' | 'whitespace-restored' | 'not-found' | 'unavailable'

export function verifyDocumentQuote(quote: string, sourceText?: string): {
  quote: string
  verification: DocumentQuoteVerification
} {
  if (!sourceText) return { quote, verification: 'unavailable' }
  if (quote.trim().length < 8) return { quote, verification: 'not-found' }
  if (sourceText.includes(quote)) return { quote, verification: 'exact' }
  // Only whitespace may differ. Do not fuzzy-match, translate, case-fold
  // units, remove negation, change numbers, or join non-contiguous passages.
  const target = quote.replace(/\s+/g, ' ').trim()
  const chars: string[] = [], starts: number[] = [], ends: number[] = []
  for (let i = 0; i < sourceText.length;) {
    const start = i
    if (/\s/.test(sourceText[i])) {
      while (i < sourceText.length && /\s/.test(sourceText[i])) i++
      chars.push(' ')
    } else chars.push(sourceText[i++])
    starts.push(start); ends.push(i)
  }
  const index = chars.join('').indexOf(target)
  if (index < 0) return { quote, verification: 'not-found' }
  return {
    quote: sourceText.slice(starts[index], ends[index + target.length - 1]),
    verification: 'whitespace-restored',
  }
}
