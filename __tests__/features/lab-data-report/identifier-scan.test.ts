import {
  findDescriptionIdentifiers,
  findRowIdentifier,
  isShortResultText,
} from '@/features/lab-data-report/utils/identifier-scan'
import { DESCRIPTION_VECTORS, RESULT_TEXT_VECTORS, ROW_VECTORS } from './identifier-scan-vectors'

describe('lab-data report identifier scan', () => {
  it.each(ROW_VECTORS)('row text %j → %s', (text, expected) => {
    expect(findRowIdentifier(text)).toBe(expected)
  })

  it.each(DESCRIPTION_VECTORS)('description %j → %j', (text, expected) => {
    expect([...findDescriptionIdentifiers(text)].sort()).toEqual([...expected].sort())
  })

  it.each(RESULT_TEXT_VECTORS)('result text %j is short: %s', (text, expected) => {
    expect(isShortResultText(text)).toBe(expected)
  })

  it('does not apply the 7-digit rule to source rows (institution codes)', () => {
    expect(findRowIdentifier('0601160016')).toBeNull()
    expect(findDescriptionIdentifiers('0601160016')).toContain('long-number')
  })
})
