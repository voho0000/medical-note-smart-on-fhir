import {
  REPORT_ABNORMAL_TONE,
  REPORT_ACTIVE_CONTROL_TONE,
  REPORT_CATEGORY_TONE,
  REPORT_SOURCE_TONE,
} from '@/features/clinical-summary/reports/components/report-color-roles'

describe('report dark-mode colour roles', () => {
  it('uses primary blue consistently for interaction and source links', () => {
    expect(REPORT_ACTIVE_CONTROL_TONE).toContain('text-primary')
    expect(REPORT_SOURCE_TONE).toContain('dark:text-primary')
  })

  it('keeps classification neutral and reserves coral for abnormal findings', () => {
    expect(REPORT_CATEGORY_TONE).toContain('dark:bg-secondary')
    expect(REPORT_CATEGORY_TONE).toContain('dark:text-secondary-foreground')
    expect(REPORT_ABNORMAL_TONE).toContain('dark:text-clinical-abnormal')
    expect(REPORT_ABNORMAL_TONE).toContain('dark:bg-clinical-abnormal')
  })

  it('does not reintroduce competing emerald, blue, or rose dark variants', () => {
    const darkRoles = [
      REPORT_ACTIVE_CONTROL_TONE,
      REPORT_CATEGORY_TONE,
      REPORT_SOURCE_TONE,
      REPORT_ABNORMAL_TONE,
    ].join(' ')

    expect(darkRoles).not.toMatch(/dark:(?:bg|text|ring)-(?:emerald|blue|rose)/)
  })
})
