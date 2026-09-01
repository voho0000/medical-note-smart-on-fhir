import {
  localizeDemoDisplayText,
  localizeDemoOrganizationDisplay,
} from '@/src/shared/utils/demo-display'

describe('demo display localization', () => {
  it('keeps the frozen Chinese demo labels in the default locale', () => {
    expect(localizeDemoDisplayText('陳○明', 'zh-TW')).toBe('陳○明')
    expect(localizeDemoOrganizationDisplay('示範北辰醫院', 'zh-TW'))
      .toBe('示範北辰醫院')
  })

  it('uses readable de-identified English labels in the English demo', () => {
    expect(localizeDemoDisplayText('陳○明', 'en')).toBe('Demo Patient')
    expect(localizeDemoDisplayText('初期慢性腎病追蹤', 'en'))
      .toBe('Early-stage chronic kidney disease follow-up')
    expect(localizeDemoOrganizationDisplay('示範北辰醫院', 'en'))
      .toBe('C Hospital')
  })

  it('does not rewrite non-demo imported names', () => {
    expect(localizeDemoOrganizationDisplay('Taipei City Hospital', 'en'))
      .toBe('Taipei City Hospital')
  })
})
