import { test, expect } from '../fixtures/test'
import { type Page } from '@playwright/test'
import { importBundle } from '../fixtures/import'

async function openLeftTab(page: Page, tabText: string) {
  await importBundle(page)
  await page.getByRole('tab').filter({ hasText: tabText }).first().click()
}

test.describe('medication + visit search (Phase 3)', () => {
  test('keeps medication rows compact at a zoom-equivalent split width', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 })
    await openLeftTab(page, '用藥')

    const surface = page.locator('[data-medication-list-surface="grouped"]').first()
    const row = surface.locator('[data-medication-row-layout="three-lane"]').first()
    await expect(row).toBeVisible()

    const surfaceWidth = await surface.evaluate((element) => element.clientWidth)
    const rowHeight = await row.evaluate((element) => element.getBoundingClientRect().height)

    expect(surfaceWidth).toBeGreaterThanOrEqual(512)
    expect(surfaceWidth).toBeLessThan(608)
    expect(rowHeight).toBeLessThan(60)
  })

  test('keeps three readable medication lines at a 125%-equivalent split width', async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 900 })
    await openLeftTab(page, '用藥')

    const surface = page.locator('[data-medication-list-surface="grouped"]').first()
    const row = surface.locator('[data-medication-row-layout="three-lane"]').first()
    await expect(row).toBeVisible()

    const surfaceWidth = await surface.evaluate((element) => element.clientWidth)
    const rowHeight = await row.evaluate((element) => element.getBoundingClientRect().height)

    expect(surfaceWidth).toBeGreaterThanOrEqual(416)
    expect(surfaceWidth).toBeLessThan(448)
    // Below the 456px container breakpoint the approved layout uses three
    // lines: name/status, prescription, then diagnosis/institution/refill.
    // Retain a tight height budget while checking that the extra line buys
    // readable prescription space rather than overlap or accidental wrapping.
    expect(rowHeight).toBeLessThanOrEqual(60)
    const layout = await row.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const rect = (selector: string) => {
        const node = element.querySelector(selector)!
        const box = node.getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height }
      }
      return {
        bounds: { left: bounds.left, right: bounds.right, bottom: bounds.bottom },
        name: rect('[data-medication-cell="identity"] > div:first-child'),
        prescription: rect('[data-medication-regimen]'),
        diagnosis: rect('[data-medication-diagnosis]'),
        institution: rect('[data-medication-classification]'),
      }
    })
    expect(layout.prescription.top).toBeGreaterThanOrEqual(layout.name.bottom)
    expect(layout.diagnosis.top).toBeGreaterThanOrEqual(layout.prescription.bottom)
    expect(layout.institution.top).toBe(layout.diagnosis.top)
    expect(layout.diagnosis.right).toBeLessThanOrEqual(layout.institution.left)
    for (const line of [layout.name, layout.prescription, layout.diagnosis, layout.institution]) {
      expect(line.height).toBeGreaterThanOrEqual(16)
      expect(line.left).toBeGreaterThanOrEqual(layout.bounds.left)
      expect(line.right).toBeLessThanOrEqual(layout.bounds.right)
      expect(line.bottom).toBeLessThanOrEqual(layout.bounds.bottom)
    }
    expect(layout.prescription.right).toBeGreaterThan(layout.name.right)
  })

  test('highlights current medication rows with an explicit timeline legend', async ({ page }) => {
    await page.addInitScript(() => {
      Date.now = () => new Date('2026-06-15T12:00:00+08:00').getTime()
    })
    await openLeftTab(page, '用藥')
    await page.getByRole('button', { name: '時間軸', exact: true }).click()

    await expect(page.getByText('目前用藥', { exact: true })).toBeVisible()
    const currentRow = page.locator('[data-timeline-current-row]')
    await expect(currentRow).toHaveCount(1)
    await expect(currentRow.locator('..')).toHaveAttribute('data-timeline-drug-current', 'true')
  })

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
    // Result count stays compact beside the filters when a search is active.
    await expect(page.getByText('1 / 1 筆')).toBeVisible()
    await search.fill('zzznomatchxyz')
    await expect(page.getByText('無符合此條件的就診紀錄')).toBeVisible()
  })
})
