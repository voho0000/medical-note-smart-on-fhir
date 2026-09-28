import { measureSummaryCardOutcomes } from '@/src/application/hooks/medical-summary/summary-result-measurement'

const ok = { status: 'fulfilled', value: { result: { text: 'SYNTHETIC-CONTENT' } } } as const
const invalid = { status: 'fulfilled', value: { error: 'PARSE_FAILED' } } as const

test.each([
  [0, 6, 'parse_failed'],
  [3, 3, 'parse_failed'],
  [6, 0, 'ok'],
  [1, 0, 'ok'],
] as const)('counts %i successful / %i failed target cards', (succeeded, failed, outcome) => {
  expect(measureSummaryCardOutcomes([...Array(succeeded).fill(ok), ...Array(failed).fill(invalid)]))
    .toEqual({ outcome, summaryCards: { succeeded, failed } })
})

test('classifies homogeneous non-parse failures and mixed causes without error text', () => {
  const timeout = { status: 'rejected', reason: Object.assign(new Error('SYNTHETIC-SECRET'), { name: 'TimeoutError' }) } as const
  expect(measureSummaryCardOutcomes([ok, timeout, timeout])).toEqual({
    outcome: 'timeout', summaryCards: { succeeded: 1, failed: 2 },
  })
  const mixed = measureSummaryCardOutcomes([ok, invalid, timeout])
  expect(mixed).toEqual({ outcome: 'error', summaryCards: { succeeded: 1, failed: 2 } })
  expect(JSON.stringify(mixed)).not.toMatch(/SYNTHETIC|reason|text/)
})
