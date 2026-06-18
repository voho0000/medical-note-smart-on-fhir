import { test, expect, type Page } from '@playwright/test'
import { importBundle } from '../fixtures/import'

// Import the synthetic bundle, open the Reports tab, switch to the searchable
// "全部" sub-tab (the cumulative tab hides search), and return the search box.
async function openReportsSearch(page: Page) {
  await importBundle(page)
  // Match by text content (filter+hasText), not accessible name — each tab has
  // an icon that perturbs the computed name.
  await page.getByRole('tab').filter({ hasText: '報告' }).first().click()
  await page.getByRole('tab').filter({ hasText: '全部' }).first().click()
  const search = page.getByPlaceholder(/搜尋/)
  await expect(search).toBeVisible()
  return search
}

test.describe('reports search (the v0.16.0 features)', () => {
  test('matches report CONTENT, not just the title (imaging conclusion)', async ({ page }) => {
    const search = await openReportsSearch(page)
    // "cardiomegaly" appears only in the Chest X-ray report's conclusion text.
    await search.fill('cardiomegaly')
    await expect(page.getByText('Chest X-ray').first()).toBeVisible()
    await expect(page.getByText(/顯示 \d+ \/ 共 \d+ 筆/)).toBeVisible()
  })

  test('matches by institution name', async ({ page }) => {
    const search = await openReportsSearch(page)
    await search.fill('台北測試醫院')
    await expect(page.getByText('Chest X-ray').first()).toBeVisible()
    await expect(page.getByText(/顯示 [1-9]\d* \/ 共/)).toBeVisible()
  })

  test('highlights the matched term in the row title', async ({ page }) => {
    const search = await openReportsSearch(page)
    await search.fill('Chest')
    await expect(page.locator('mark', { hasText: /Chest/i }).first()).toBeVisible()
  })

  test('shows a search-aware empty state when nothing matches', async ({ page }) => {
    const search = await openReportsSearch(page)
    await search.fill('zzzznomatchxyz')
    await expect(page.getByText('沒有符合搜尋的報告')).toBeVisible()
    await expect(page.getByText(/顯示 0 \/ 共/)).toBeVisible()
  })
})
