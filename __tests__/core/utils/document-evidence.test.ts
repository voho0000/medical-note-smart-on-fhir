import { verifyDocumentQuote } from '@/src/core/utils/document-evidence.utils'

test('restores whitespace from one contiguous source span without rewriting clinical content', () => {
  const raw = 'Report:\nNo pneumonia.\n\nFollow up in 7 days.'
  expect(verifyDocumentQuote('No pneumonia. Follow up in 7 days.', raw)).toEqual({
    quote: 'No pneumonia.\n\nFollow up in 7 days.', verification: 'whitespace-restored',
  })
  expect(verifyDocumentQuote('No pneumonia.', raw).verification).toBe('exact')
})

test.each([
  ['Pneumonia present.', 'No pneumonia present.'],
  ['Potassium 6.0 mmol/L', 'Potassium 4.0 mmol/L'],
  ['Dose 5 mg', 'Dose 5 Mg'],
  ['first finding last finding', 'first finding; intervening negative statement; last finding'],
])('never repairs changed clinical facts or non-contiguous passages', (quote, raw) => {
  expect(verifyDocumentQuote(quote, raw)).toEqual({ quote, verification: 'not-found' })
})

test('missing source remains unverified', () => {
  expect(verifyDocumentQuote('A clinical excerpt')).toEqual({ quote: 'A clinical excerpt', verification: 'unavailable' })
})

test('exact excerpt status is not a semantic entailment or negation check', () => {
  // A deliberately misleading substring still exists verbatim. The UI must
  // never describe this check as validating the clinical assertion.
  expect(verifyDocumentQuote('pneumonia present.', 'No pneumonia present.').verification).toBe('exact')
})
