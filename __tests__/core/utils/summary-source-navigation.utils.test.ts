import {
  resolveSummarySourceNavigationMode,
  summarySourceNavigationEnabled,
} from '@/src/core/utils/summary-source-navigation.utils'

describe('summary source navigation mode', () => {
  it('uses the centralized source index for focused records', () => {
    const mode = resolveSummarySourceNavigationMode(true)
    expect(mode).toBe('enabled')
    expect(summarySourceNavigationEnabled(mode)).toBe(true)
  })

  it('keeps navigation enabled even for more than 500 source records', () => {
    const mode = resolveSummarySourceNavigationMode(true)
    expect(mode).toBe('enabled')
    expect(summarySourceNavigationEnabled(mode)).toBe(true)
  })

  it('automatically omits the index only after a context-window overflow', () => {
    const mode = resolveSummarySourceNavigationMode(true, true)
    expect(mode).toBe('disabled-auto')
    expect(summarySourceNavigationEnabled(mode)).toBe(false)
  })

  it('honours the user setting regardless of record size', () => {
    expect(resolveSummarySourceNavigationMode(false, true)).toBe('disabled-user')
  })
})
