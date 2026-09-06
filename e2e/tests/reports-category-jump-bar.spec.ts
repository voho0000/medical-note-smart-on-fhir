import { test, expect } from '../fixtures/test'
import { importBundle } from '../fixtures/import'

test('keeps category badges visible after jumping in docked and fullscreen reports', async ({ page }, testInfo) => {
  test.slow()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await importBundle(page)
  await page.getByRole('tab').filter({ hasText: '報告' }).first().click()
  const chip = page.locator('[data-cumulative-jump-chip="urine"]')
  const heading = page.locator('[data-cumulative-section="urine"] [data-cumulative-section-heading]')
  for (const fullscreen of [false, true]) {
    if (fullscreen) await page.getByRole('button', { name: 'Expand to fullscreen', exact: true }).click()
    for (const width of [320, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
      await chip.click()
      await expect(chip).toBeInViewport()
      await expect(heading).toBeInViewport()
      // Visibility alone does not detect a sticky bar hidden behind a panel's
      // tabs, nor a heading covered by the bar. Check the settled hit targets.
      await expect.poll(() => chip.evaluate((node) => {
        const rect = node.getBoundingClientRect()
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      })).toBe(true)
      await expect.poll(async () => {
        const bar = await chip.locator('..').boundingBox()
        const title = await heading.boundingBox()
        return !!bar && !!title && title.y >= bar.y + bar.height
      }).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath(`category-jump-${fullscreen ? 'fullscreen' : 'docked'}-${width}.png`) })
    }
  }
})
