/**
 * An open decision prints the record values it reads under its row (#201).
 * On a phone the longest of them — 「ARNI (ACE inhibitor/ARB when ARNI is not
 * feasible)」 and its 「Not currently taking」 — must wrap inside the row, not
 * run out of it or squeeze the value to a letter a line (#201 review, 320 px).
 *
 * Runs on the dev-only scenario harness, P2's four pillar starts, in English
 * and in 繁中.
 */
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'

async function openP2(page: Page, width: number, locale: 'en' | 'zh-TW') {
  await page.goto('/dev/cdss-scenarios')
  await page.evaluate((value) => localStorage.setItem('medical-note-locale', value), locale)
  await page.locator('button[data-scenario="p2-new-hfref"]').click()
  await page.waitForURL('**/cdss-scenarios/view')
  await page.goto(`/dev/cdss-scenarios/view?w=${width}&scroll=panel`)
  await expect(page.getByTestId('cdss-visit-steps')).toBeVisible({ timeout: 90_000 })
  await page.getByTestId('cdss-visit-step-treatment').click()
  await expect(page.locator('[data-visit-basis]').first()).toBeVisible()
}

for (const width of [320, 390]) {
  test.describe(`${width}px panel`, () => {
    test.use({ viewport: { width: width + 40, height: 900 } })
    for (const [locale, status] of [['en', 'Not currently taking'], ['zh-TW', '目前未使用']] as const) {
      test(`P2's pillar values stay inside their rows at ${width}px (${locale})`, async ({ page }) => {
        await openP2(page, width, locale)
        const lists = await page.locator('[data-visit-basis]').evaluateAll((elements, text) => elements.map((element) => {
          const box = element.getBoundingClientRect()
          const statusValue = [...element.querySelectorAll('dd')].find((dd) => dd.textContent === text)
          const statusBox = statusValue?.getBoundingClientRect()
          return {
            inside: element.scrollWidth <= element.clientWidth + 1
              && [...element.children].every((item) => item.getBoundingClientRect().right <= box.right + 1),
            // Read whole: on one line, not a letter a line.
            statusOnOneLine: statusBox ? statusBox.height < 24 && statusBox.width > 30 : null,
          }
        }), status)
        expect(lists.length).toBeGreaterThanOrEqual(4)
        for (const list of lists) {
          expect(list.inside).toBe(true)
          if (list.statusOnOneLine !== null) expect(list.statusOnOneLine).toBe(true)
        }
        expect(lists.some((list) => list.statusOnOneLine === true)).toBe(true)
      })
    }
  })
}
