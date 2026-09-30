/**
 * Whatever a press moves the CDSS details to — a section, the summary, a
 * point's card — must land in view and take the press, not sit under what
 * stays stuck: a unit test's `toBeVisible()` cannot see an overlay, so this
 * drives the real layout (#193 review: after a scroll, 本次摘要's 複製 sat
 * under the steps and a click hit 「03 預後與計畫」).
 *
 * Beside the map's column (from a 36rem panel) the column's section names are
 * the steps and nothing is stuck over the details (owner feedback 2026-09-30);
 * stacked, on a narrow panel, the steps stay stuck at the head of the details
 * and a move lands below them.
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
  await expect(page.getByTestId('cdss-visit-map')).toBeVisible({ timeout: 90_000 })
}

/** Down one screen of the panel, as a clinician reading on would. */
async function scrollPanelOnePage(page: Page) {
  await page.getByTestId('sim-right-panel').evaluate((panel) => { panel.scrollTop += panel.clientHeight })
}

/**
 * Waits for the panel to stop moving — a smooth scroll takes a moment — and
 * gives the top of `target` once it has, so a check never reads the place a
 * target started from.
 */
async function settledTop(page: Page, target: Locator): Promise<number> {
  let last = Number.NaN
  await expect.poll(async () => {
    const now = await page.getByTestId('sim-right-panel').evaluate((panel) => panel.scrollTop)
    const still = now === last
    last = now
    return still
  }, { intervals: [200] }).toBe(true)
  return (await target.boundingBox())!.y
}

/** Where the details start for a target moved to: below the stuck steps, else the panel's top. */
async function clearTop(page: Page): Promise<number> {
  const steps = page.getByTestId('cdss-visit-steps')
  if (await steps.count()) {
    const box = await steps.boundingBox()
    return box!.y + box!.height
  }
  return (await page.getByTestId('sim-right-panel').boundingBox())!.y
}

/** Whether a press at the element's centre reaches it, rather than what lies over it. */
async function takesThePress(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
  })
}

test.describe('CDSS visit: a move lands in view, beside the column', () => {
  test.use({ viewport: { width: 1024, height: 900 } })

  for (const width of [768, 1000]) {
    test(`the summary lands in view after a scroll, 複製 pressable (${width}px panel)`, async ({ page }) => {
      await openScenario(page, 'p5-titrating-af', width)
      await expect(page.getByTestId('cdss-visit-steps')).toHaveCount(0)
      await page.getByTestId('cdss-visit-section-toggle-treatment').click()
      await scrollPanelOnePage(page)
      await page.getByTestId('cdss-visit-section-toggle-summary').click()

      const summary = page.getByTestId('cdss-visit-column-summary')
      await expect(summary).toBeVisible()
      const copy = page.getByTestId('cdss-visit-summary-copy')
      expect(await settledTop(page, summary)).toBeGreaterThanOrEqual(await clearTop(page))
      expect(await takesThePress(copy)).toBe(true)
      // Playwright's own check that nothing intercepts the click.
      await copy.click({ trial: true, timeout: 5_000 })
    })
  }

  test('a card opened from the column after a scroll shows its point line in view', async ({ page }) => {
    await openScenario(page, 'p5-titrating-af', 768)
    await page.getByTestId('cdss-visit-section-toggle-treatment').click()
    await scrollPanelOnePage(page)
    await page.locator('[data-testid="cdss-visit-overview"] button[data-dp="DP-12"]').first().click()

    const slot = page.getByTestId('cdss-visit-detail-slot')
    await expect(slot).toBeVisible()
    expect(await settledTop(page, slot)).toBeGreaterThanOrEqual(await clearTop(page))
  })

  test('下一區 lands the next section in view, its heading focused', async ({ page }) => {
    await openScenario(page, 'p4-stable-optimised', 768)
    await scrollPanelOnePage(page)
    await page.getByTestId('cdss-visit-next-status').click()

    const treatment = page.getByTestId('cdss-visit-column-treatment')
    await expect(treatment).toBeVisible()
    await expect(page.locator('#cdss-visit-column-treatment-title')).toBeFocused()
    expect(await settledTop(page, treatment)).toBeGreaterThanOrEqual(await clearTop(page))
  })
})

test.describe('CDSS visit steps held at the head of the details, stacked', () => {
  test.use({ viewport: { width: 440, height: 900 } })

  test('the summary lands below the steps after a scroll, 複製 pressable (400px panel)', async ({ page }) => {
    await openScenario(page, 'p5-titrating-af', 400)
    await expect(page.getByTestId('cdss-visit-steps')).toBeVisible()
    await page.getByTestId('cdss-visit-step-treatment').click()
    await scrollPanelOnePage(page)
    await page.getByTestId('cdss-visit-step-summary').click()

    const summary = page.getByTestId('cdss-visit-column-summary')
    await expect(summary).toBeVisible()
    const copy = page.getByTestId('cdss-visit-summary-copy')
    expect(await settledTop(page, summary)).toBeGreaterThanOrEqual(await clearTop(page))
    expect(await takesThePress(copy)).toBe(true)
    await copy.click({ trial: true, timeout: 5_000 })
  })

  test('下一區 lands the next section below the steps (400px panel)', async ({ page }) => {
    await openScenario(page, 'p4-stable-optimised', 400)
    await scrollPanelOnePage(page)
    await page.getByTestId('cdss-visit-next-status').click()

    const treatment = page.getByTestId('cdss-visit-column-treatment')
    await expect(treatment).toBeVisible()
    expect(await settledTop(page, treatment)).toBeGreaterThanOrEqual(await clearTop(page))
  })
})
