import { test, expect, type Page } from '@playwright/test'
import { importBundle } from '../fixtures/import'

async function openLeftTab(page: Page, tabText: string) {
  await importBundle(page)
  await page.getByRole('tab').filter({ hasText: tabText }).first().click()
}

test.describe('medication + visit search (Phase 3)', () => {
  test('medication list search matches and shows a no-match empty state', async ({ page }) => {
    await openLeftTab(page, '用藥')
    const search = page.getByPlaceholder(/搜尋藥名/)
    await expect(search).toBeVisible()
    await search.fill('Amlodipine')
    await expect(page.getByText(/Amlodipine/).first()).toBeVisible()
    await search.fill('zzznomatchxyz')
    await expect(page.getByText('無符合的藥物')).toBeVisible()
  })

  test('visit-history search matches by institution and shows a no-match empty state', async ({ page }) => {
    await openLeftTab(page, '就診紀錄')
    const search = page.getByPlaceholder(/搜尋機構/)
    await expect(search).toBeVisible()
    await search.fill('台北測試醫院')
    // Result count renders as "符合: X / Y" when a filter is active.
    await expect(page.getByText('符合: 1 / 1')).toBeVisible()
    await search.fill('zzznomatchxyz')
    await expect(page.getByText('無符合此條件的就診紀錄')).toBeVisible()
  })
})
