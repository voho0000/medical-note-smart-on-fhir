/**
 * On a narrow panel the list of every decision point folds under the map's
 * title, and folds again once a point is picked from it. Whatever the
 * keyboard does next must leave focus on something on the page: closing the
 * card (its ✕, or 收合 under it) and a point the page asks elsewhere (DP-01,
 * DP-34 → 01's diagnosis question) used to send focus to the point's tile,
 * folded out of sight, and it fell to <body> (#194 review).
 *
 * Runs on the dev-only scenario harness at a phone's width, keyboard only.
 */
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'

async function openScenario(page: Page, id: string) {
  await page.goto('/dev/cdss-scenarios')
  await page.locator(`button[data-scenario="${id}"]`).click()
  await page.waitForURL('**/cdss-scenarios/view')
  await page.goto('/dev/cdss-scenarios/view?w=390&scroll=panel')
  await expect(page.getByTestId('cdss-visit-steps')).toBeVisible({ timeout: 90_000 })
}

/** Unfolds the list and presses a point on it with the keyboard. */
async function pickFromList(page: Page, dp: string) {
  await page.getByTestId('cdss-visit-map-fold').focus()
  await page.keyboard.press('Enter')
  const tile = page.locator(`[data-testid="cdss-visit-sections"] button[data-dp="${dp}"]`).first()
  await expect(tile).toBeVisible()
  await tile.focus()
  await page.keyboard.press('Enter')
  // The list folds again once a point is picked.
  await expect(page.getByTestId('cdss-visit-sections')).toHaveAttribute('data-folded', 'true')
}

/** What has focus: its test id or still-open point, whether it is laid out, and what it sits in. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    return {
      tag: element?.tagName ?? '',
      testId: element?.getAttribute('data-testid') ?? '',
      stillOpen: element?.getAttribute('data-still-open') ?? '',
      laidOut: Boolean(element && element !== document.body && element.getClientRects().length > 0),
      inQuestion: Boolean(element?.closest('[data-testid="cdss-hf-question-hf-suspicion"]')),
    }
  })
}

test.describe('CDSS decision map on a narrow panel, by keyboard', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const [how, close] of [
    ['its ✕', (page: Page) => page.getByRole('button', { name: '收起 DP-12' })],
    ['收合 under it', (page: Page) => page.getByTestId('cdss-visit-detail-stepper').getByRole('button', { name: '收合' })],
  ] as const) {
    test(`closing a card picked from the folded list by ${how} leaves focus on the page`, async ({ page }) => {
      await openScenario(page, 'p5-titrating-af')
      await pickFromList(page, 'DP-12')
      await expect(page.locator('#cdss-visit-dp-detail-title')).toBeFocused()

      await close(page).focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('#cdss-visit-dp-detail')).toHaveCount(0)

      await expect.poll(async () => (await focused(page)).laidOut).toBe(true)
      const now = await focused(page)
      // Back where it was picked — its row in 02, still open — or the list's 「展開」.
      expect(now.stillOpen === 'DP-12' || now.testId === 'cdss-visit-map-fold').toBe(true)
    })
  }

  for (const dp of ['DP-01', 'DP-34']) {
    test(`${dp}, asked in 01's diagnosis question, takes focus into that question`, async ({ page }) => {
      await openScenario(page, 'p5-titrating-af')
      await pickFromList(page, dp)

      await expect.poll(async () => (await focused(page)).laidOut).toBe(true)
      expect((await focused(page)).inQuestion).toBe(true)
    })
  }
})
