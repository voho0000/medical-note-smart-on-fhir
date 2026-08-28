import {
  formatOrganizationContextDisplay,
  formatOrganizationDisplay,
} from '@/src/shared/utils/organization-display'

describe('formatOrganizationDisplay', () => {
  it('shows only the institution name from a legacy NHI requester display', () => {
    expect(formatOrganizationDisplay('新北市聯合醫院;門診;0131020016'))
      .toBe('新北市聯合醫院')
  })

  it('supports full-width semicolon delimiters', () => {
    expect(formatOrganizationDisplay('新北市聯合醫院；門診；0131020016'))
      .toBe('新北市聯合醫院')
  })

  it('preserves an ordinary organization name', () => {
    expect(formatOrganizationDisplay(' 新北市聯合醫院 ')).toBe('新北市聯合醫院')
  })

  it('hides a code-only legacy fallback when no name exists', () => {
    expect(formatOrganizationDisplay('0131020016')).toBe('')
  })

  it('keeps compatibility with comma-delimited trailing codes', () => {
    expect(formatOrganizationDisplay('新北市聯合醫院,0131020016'))
      .toBe('新北市聯合醫院')
  })

  it('keeps the legacy care setting but hides the organization code', () => {
    expect(formatOrganizationContextDisplay('新北市聯合醫院;門診;0131020016'))
      .toBe('新北市聯合醫院 門診')
    expect(formatOrganizationContextDisplay('煜安健保藥;藥局;5931025656'))
      .toBe('煜安健保藥 藥局')
    expect(formatOrganizationContextDisplay('新北市聯合醫院;急診'))
      .toBe('新北市聯合醫院 急診')
  })

  it('preserves other source-provided care settings instead of filtering them', () => {
    expect(formatOrganizationContextDisplay('安心診所;居家醫療;1234567890'))
      .toBe('安心診所 居家醫療')
  })

  it('uses a structured MediCloud setting when requester display is name-only', () => {
    expect(formatOrganizationContextDisplay('新北市聯合醫院', '急診'))
      .toBe('新北市聯合醫院 急診')
    expect(formatOrganizationContextDisplay('新北市聯合醫院', 'inpatient'))
      .toBe('新北市聯合醫院 住院')
  })

  it('localizes common structured care settings for an English UI', () => {
    expect(formatOrganizationContextDisplay('New Taipei Hospital', 'OPD', 'en'))
      .toBe('New Taipei Hospital Outpatient')
  })

  it('still hides a code-only display even when a setting exists', () => {
    expect(formatOrganizationContextDisplay('0131020016', '門診')).toBe('')
  })
})
