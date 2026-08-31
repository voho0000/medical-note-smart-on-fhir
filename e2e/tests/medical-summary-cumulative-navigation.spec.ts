import { expect, test } from '../fixtures/test'

const NON_REPORT_TABS = ['就診紀錄', '病人資訊', '用藥', '文件'] as const

test.describe('medical-summary cumulative-report navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('medical-note-locale', 'zh-TW')
      localStorage.setItem('medical-note-audience', 'medical')
      localStorage.setItem('medical-note-audience-selected', '1')
      localStorage.setItem('medical-note-onboarding-v1', '1')
      localStorage.setItem('medical-note-left-browser-tour-v1', '1')
    })
    await page.goto('/')
  })

  test('opens the focused cumulative result from every non-report tab after Reports is pre-mounted', async ({ page }) => {
    test.slow()
    await page.getByTestId('welcome-demo-card').click()
    await expect(page.getByText('陳○明').first()).toBeVisible({ timeout: 30_000 })

    const reportsTab = page.getByRole('tab').filter({ hasText: '報告' }).first()
    const reportsContent = page.getByTestId('clinical-tab-content-reports')
    const reportsPanel = page.locator('[role="tabpanel"]').filter({ has: reportsContent })

    // Reproduce the original race: Reports has been idle-mounted for fast first
    // open, but the clinician is still looking at another top-level tab.
    const visitsTab = page.getByRole('tab').filter({ hasText: '就診紀錄' }).first()
    await visitsTab.click()
    await expect(visitsTab).toHaveAttribute('data-state', 'active')
    await expect(reportsContent).toBeAttached({ timeout: 30_000 })
    await expect(reportsPanel).toHaveAttribute('data-state', 'inactive')

    const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
    const openKidneyCumulative = summaryPanel.getByRole('button', {
      name: /^查看累積報告: 腎功能/,
    })
    await expect(openKidneyCumulative).toBeVisible({ timeout: 20_000 })

    for (const sourceTabName of NON_REPORT_TABS) {
      const sourceTab = page.getByRole('tab').filter({ hasText: sourceTabName }).first()
      await sourceTab.click()
      await expect(sourceTab).toHaveAttribute('data-state', 'active')
      await expect(reportsPanel).toHaveAttribute('data-state', 'inactive')

      await openKidneyCumulative.click()

      await expect(reportsTab).toHaveAttribute('data-state', 'active')
      await expect(reportsPanel).toHaveAttribute('data-state', 'active')
      await expect(reportsPanel.getByRole('tab', { name: '累積報告', exact: true }))
        .toHaveAttribute('data-state', 'active')
      await expect(reportsPanel.getByRole('tab').filter({ hasText: /^生化/ }))
        .toHaveAttribute('data-state', 'active')

      const focusedCreatinine = reportsPanel.locator('[data-lab-test-key="CREA"]').first()
      await expect(focusedCreatinine).toBeVisible()
      await expect(focusedCreatinine).toHaveClass(/bg-primary\/10/)
    }
  })
})
