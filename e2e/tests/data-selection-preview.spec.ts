import { test, expect } from '@playwright/test'
import { importBundle } from '../fixtures/import'

test.describe('Data Selection preview', () => {
  test('opens from Medical Summary and shows assembled context without manual editing controls', async ({ page }) => {
    await importBundle(page)

    const rightTabs = page.getByRole('tablist').filter({
      has: page.getByRole('tab', { name: '醫療摘要' }),
    })

    // Data scope is contextual summary configuration, not a top-level feature.
    await expect(rightTabs.getByRole('button', { name: '更多', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: '摘要設定' }).click()
    const trigger = page.getByTestId('medical-summary-data-scope-trigger')
    await expect(trigger).toHaveText('資料範圍')
    await trigger.click()

    const drawer = page.getByRole('dialog', { name: 'AI 資料範圍' })
    await expect(drawer.getByText('設定醫療摘要與自訂摘要主要提供給 AI 的 FHIR 病歷範圍')).toBeVisible()
    await expect(drawer.getByText('變更會自動儲存，並在下次重新產生摘要時套用。')).toBeVisible()
    await drawer.getByRole('tab', { name: '預覽' }).click()

    await expect(drawer.getByText('AI 臨床資料預覽', { exact: true })).toBeVisible()
    await expect(drawer.getByTestId('clinical-context-preview')).toBeVisible()
    await expect(drawer.getByRole('button', { name: '複製' })).toBeVisible()
    await expect(drawer.getByText('補充說明', { exact: true })).toHaveCount(0)
    await expect(drawer.locator('textarea')).toHaveCount(0)
  })

  test('keeps the same data-scope entry available for custom summaries', async ({ page }) => {
    await importBundle(page)

    await page.getByRole('tab', { name: '自訂摘要' }).click()
    await page.getByRole('button', { name: '摘要設定' }).click()
    const trigger = page.getByTestId('medical-summary-data-scope-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(page.getByRole('dialog', { name: 'AI 資料範圍' })).toBeVisible()
  })
})
