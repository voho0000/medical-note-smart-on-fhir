import { test, expect, type Page } from '@playwright/test'
import { importBundle } from '../fixtures/import'

async function openReportsSubTab(page: Page, subTab: string) {
  await importBundle(page)
  await page.getByRole('tab').filter({ hasText: '報告' }).first().click()
  await page.getByRole('tab').filter({ hasText: subTab }).first().click()
}

test.describe('trend charts (v0.15.18–v0.16.0 features)', () => {
  test('blood-pressure trend is reachable and shows SBP/DBP', async ({ page }) => {
    await openReportsSubTab(page, '生命徵象')
    // The composite-BP trend button (added so vital-sign BP rows get a trend).
    await page.getByRole('button', { name: '查看趨勢', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Abbreviated component labels in the dialog (header / subtitle).
    await expect(dialog.getByText(/SBP/).first()).toBeVisible()
    await expect(dialog.getByText(/DBP/).first()).toBeVisible()
  })

  test('single-analyte trend shows the chart with always-on value labels and normal-range band', async ({ page }) => {
    await openReportsSubTab(page, '檢驗')
    // The 檢驗 tab defaults to 依採檢日 day-cards (one card per day×institution);
    // the per-analyte 查看趨勢 trend lives in the 單項列表 flat view.
    await page.getByRole('button', { name: '單項列表' }).click()
    // Select the fixture analyte that owns the asserted range/value. Using the
    // first trend button is order-dependent and can open Sodium (no range).
    await page.getByRole('searchbox', { name: '搜尋檢驗名稱、結果、機構、日期...' }).fill('Albumin')
    const albuminRow = page.locator('[data-row-id]').filter({ hasText: '4.3 g/dL' })
    await expect(albuminRow).toBeVisible()
    await albuminRow.getByRole('button', { name: '查看趨勢', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('tab', { name: '趨勢圖表' }).click()
    // Soft green normal-range band label + an always-on value label on a point.
    await expect(dialog.getByText('正常範圍')).toBeVisible()
    await expect(dialog.getByText('4.3').first()).toBeVisible()
  })
})
