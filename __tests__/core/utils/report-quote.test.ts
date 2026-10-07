import { verifyReportQuote } from '@/src/core/utils/report-quote.utils'

test.each([
  ['RVSP 58mmHg', 'RVSP: 58mmHg'],
  ['RVSP 58 mmHg', 'RVSP:58mmHg'],
  ['RVSP: 58mmHg', 'RVSP 58 mmHg'],
  ['RVSP 58mmHg', 'RVSP ： 58 mmHg'],
  ['RVSP 58mmHg', 'RVSP:\n58 mmHg'],
])('restores report typography for %s from %s', (quote, raw) => {
  expect(verifyReportQuote(quote, 'Echo finding: ' + raw + '. No effusion.')).toBe(raw)
})

test.each([
  ['RVSP 58mmHg', 'RVSP: 580mmHg'],
  ['RVSP 58mmHg', 'RVSP: 5.8mmHg'],
  ['RVSP 58mmHg', 'RVSP: -58mmHg'],
  ['RVSP 58mmHg', 'RVSP: <58mmHg'],
  ['RVSP 58mmHg', 'RVSP: 58cmHg'],
  ['RVSP 58mmHg', 'RVSP: 58MMHG'],
  ['RVSP 58mmHg', 'RVSP: normal. Other value: 58mmHg'],
  ['ratio 12', 'ratio 1:2'],
  ['No pulmonary hypertension RVSP 58mmHg', 'Pulmonary hypertension RVSP: 58mmHg'],
])('does not repair changed content in %s from %s', (quote, raw) => {
  expect(verifyReportQuote(quote, raw)).toBeNull()
})

test('retains strict quote handling and rejects missing reports and short fragments', () => {
  expect(verifyReportQuote('No effusion.', 'No effusion.')).toBe('No effusion.')
  expect(verifyReportQuote('RVSP 58mmHg')).toBeNull()
  expect(verifyReportQuote('A 5mg', 'A: 5 mg')).toBeNull()
})
