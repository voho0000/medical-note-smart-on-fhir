import { useCumulativeReportPrefsStore } from '@/src/application/stores/cumulative-report-prefs.store'

/**
 * Pin the cumulative report to the 分頁 (tabs) layout for a suite that asserts
 * tab-strip behaviour. The shipped default is 直式 (stacked); these suites
 * predate it and exist to lock the tabbed layout down, so they select it
 * explicitly rather than depending on the product default never changing.
 */
export function useTabsCumulativeLayout(): void {
  beforeEach(() => {
    useCumulativeReportPrefsStore.setState({
      layoutMode: 'tabs',
      range: 'latest3',
      categoryOrder: null,
    })
  })

  afterAll(() => {
    useCumulativeReportPrefsStore.setState({
      layoutMode: 'stacked',
      range: 'latest3',
      categoryOrder: null,
    })
  })
}
