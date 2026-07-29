import { sdkPreservesDistinctSameDayLabResults } from '@/src/shared/utils/sdk-converter-version.utils'

describe('sdkPreservesDistinctSameDayLabResults', () => {
  it.each([
    ['0.1.0', false],
    ['0.1.2', false],
    ['0.1.3', true],
    ['sdk-json-0.1.3', true],
    ['0.2.0', true],
    ['1.0.0', true],
    ['unknown', false],
  ])('classifies %s', (version, expected) => {
    expect(sdkPreservesDistinctSameDayLabResults(version)).toBe(expected)
  })
})
