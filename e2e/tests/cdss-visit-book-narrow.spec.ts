/**
 * 決策地圖 v2 inside a phone-width CDSS panel, in English: nothing pushes the
 * page sideways. The English every-visit answers (「Worse / Stable / Better」)
 * and the CHA₂DS₂-VA items used to widen the page at 320 and 390 px and leave
 * buttons half off screen (#219 review). A wide table scrolls inside its own
 * box; the page itself does not.
 *
 * Runs on the dev-only scenario harness, P9 (HF page and AF page).
 */
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'

async function openBook(page: Page, width: number) {
  await page.goto('/dev/cdss-scenarios')
  await page.evaluate(() => localStorage.setItem('medical-note-locale', 'en'))
  await page.locator('button[data-scenario="p9-hfpef-af-dose"]').click()
  await page.waitForURL('**/cdss-scenarios/view')
  await page.goto(`/dev/cdss-scenarios/view?w=${width}`)
  await page.getByRole('button', { name: 'Decision map v2' }).first().click()
  await expect(page.getByTestId('cdss-visit-book')).toBeVisible({ timeout: 90_000 })
}

/** How far the page scrolls sideways, and any answer button that ends past the window. */
async function sideways(page: Page) {
  return page.evaluate(() => {
    const edge = window.innerWidth
    const outside = [...document.querySelectorAll<HTMLElement>('[data-testid="cdss-visit-book"] [role="group"] > button, [data-testid="cdss-visit-book"] [data-visit-action]')]
      .filter((button) => button.getBoundingClientRect().right > edge + 1)
      .map((button) => button.textContent?.trim())
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, outside }
  })
}

for (const width of [320, 390]) {
  test.describe(`${width}px panel, English`, () => {
    test.use({ viewport: { width: width + 40, height: 900 } })

    test(`the HF page stays inside the window at ${width}px`, async ({ page }) => {
      await openBook(page, width)
      await expect(page.locator('[data-book-ask]').first()).toBeVisible()
      expect(await sideways(page)).toEqual({ overflow: 0, outside: [] })
    })

    test(`the AF page stays inside the window at ${width}px`, async ({ page }) => {
      await openBook(page, width)
      await page.getByTestId('cdss-disease-switch-atrial-fibrillation-cdss').click()
      await expect(page.getByTestId('cdss-book-score')).toBeVisible()
      expect(await sideways(page)).toEqual({ overflow: 0, outside: [] })
    })
  })
}
