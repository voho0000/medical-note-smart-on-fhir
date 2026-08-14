import { GROUP_TONES } from '@/src/shared/constants/group-tones'
import { TAB_ACTIVE_CLASSES } from '@/src/shared/config/ui-theme.config'

describe('workspace dark semantic colour roles', () => {
  it('uses one primary interaction colour across themed tabs', () => {
    Object.values(TAB_ACTIVE_CLASSES).forEach((classes) => {
      expect(classes).toContain('dark:data-[state=active]:text-primary')
      expect(classes).toContain('dark:data-[state=active]:bg-primary/10')
    })
  })

  it('keeps grouped classification headings neutral in dark mode', () => {
    Object.values(GROUP_TONES).forEach(({ toneClass, dividerClass }) => {
      expect(toneClass).toContain('dark:text-secondary-foreground')
      expect(dividerClass).toContain('dark:bg-border')
    })
  })
})
