import { test, expect } from '@playwright/test'
import { importBundle } from '../fixtures/import'

test.describe('Medical summary model picker', () => {
  test('remains available in patient mode', async ({ page }) => {
    await importBundle(page)

    await page.getByRole('button', { name: '使用身份' }).click()
    await page.getByRole('menuitem', { name: '民眾' }).click()

    const summaryPanel = page.getByRole('tabpanel', { name: '醫療摘要' })
    await expect(summaryPanel.getByRole('heading', { name: '我的健康摘要' })).toBeVisible()
    await expect(summaryPanel.getByTestId('model-picker-trigger')).toBeVisible()
  })
})
