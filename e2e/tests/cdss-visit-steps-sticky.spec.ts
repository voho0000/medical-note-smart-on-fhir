/**
 * The visit's steps stay stuck at the head of the CDSS details as they
 * scroll. Whatever a press moves the page to — a step, the summary, a point's
 * card — must land below them, not under: a unit test's `toBeVisible()` cannot
 * see an overlay, so this drives the real layout (#193 review: after a scroll,
 * 本次摘要's 複製 sat under the steps and a click hit 「03 預後與計畫」).
 *
 * Runs on the dev-only synthetic scenario harness (/dev/cdss-scenarios), with
 * the right panel its own scroll container at a set width, as in the app.
 */
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../fixtures/test'

async function openScenario(page: Page, id: string, width: number) {
  await page.goto('/dev/cdss-scenarios')
  await page.locator(`button[data-scenario="${id}"]`).click()
  await page.waitForURL('**/cdss-scenarios/view')
  await page.goto(`/dev/cdss-scenarios/view?w=${width}&scroll=panel`)
  await expect(page.getByTestId('cdss-visit-steps')).toBeVisible({ timeout: 90_000 })
}

/** Down one screen of the panel, as a clinician reading on would. */
async function scrollPanelOnePage(page: Page) {
  await page.getByTestId('sim-right-panel').evaluate((panel) => { panel.scrollTop += panel.clientHeight })
}

async function bottomOfSteps(page: Page): Promise<number> {
  const box = await page.getByTestId('cdss-visit-steps').boundingBox()
  return box!.y + box!.height
}

/** Whether a press at the element's centre reaches it, rather than what lies over it. */
async function takesThePress(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
  })
}

test.describe('CDSS visit steps held at the head of the details', () => {
  test.use({ viewport: { width: 1024, height: 900 } })

  for (const width of [768, 1000]) {
    test(`the summary lands below the steps after a scroll, 複製 pressable (${width}px panel)`, async ({ page }) => {
      await openScenario(page, 'p5-titrating-af', width)
      await page.getByTestId('cdss-visit-step-treatment').click()
      await scrollPanelOnePage(page)
      await page.getByTestId('cdss-visit-step-summary').click()

      const summary = page.getByTestId('cdss-visit-column-summary')
      await expect(summary).toBeVisible()
      const copy = page.getByTestId('cdss-visit-summary-copy')
      await expect.poll(async () => (await summary.boundingBox())!.y).toBeGreaterThanOrEqual(await bottomOfSteps(page))
      expect(await takesThePress(copy)).toBe(true)
      // Playwright's own check that nothing intercepts the click.
      await copy.click({ trial: true, timeout: 5_000 })
    })
  }

  test('a card opened from the column after a scroll shows its point line below the steps', async ({ page }) => {
    await openScenario(page, 'p5-titrating-af', 768)
    await page.getByTestId('cdss-visit-step-treatment').click()
    await scrollPanelOnePage(page)
    await page.locator('[data-testid="cdss-visit-overview"] button[data-dp="DP-12"]').first().click()

    const slot = page.getByTestId('cdss-visit-detail-slot')
    await expect(slot).toBeVisible()
    await expect.poll(async () => (await slot.boundingBox())!.y).toBeGreaterThanOrEqual(await bottomOfSteps(page))
  })

  test('下一區 lands the next section below the steps', async ({ page }) => {
    await openScenario(page, 'p4-stable-optimised', 768)
    await scrollPanelOnePage(page)
    await page.getByTestId('cdss-visit-next-status').click()

    const treatment = page.getByTestId('cdss-visit-column-treatment')
    await expect(treatment).toBeVisible()
    await expect.poll(async () => (await treatment.boundingBox())!.y).toBeGreaterThanOrEqual(await bottomOfSteps(page))
  })
})
