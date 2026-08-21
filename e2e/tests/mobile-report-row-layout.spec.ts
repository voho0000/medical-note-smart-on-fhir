import { expect, test } from '../fixtures/test'
import { importBundle } from '../fixtures/import'

test.describe('mobile report result row layout', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps a compact lab result and its source metadata on one line', async ({ page }) => {
    await importBundle(page)
    await page.getByRole('tab').filter({ hasText: '報告' }).first().click()
    await page.getByRole('tab').filter({ hasText: /^全部/ }).first().click()

    const rows = page.locator('[data-mobile-adaptive="true"]:visible')
    await expect(rows.first()).toBeVisible()

    const readGeometry = (rowIndex: number) => rows.nth(rowIndex).evaluate((element) => {
      const title = element.querySelector<HTMLElement>('[data-testid="compact-lab-title"]')
      const value = element.querySelector<HTMLElement>('[data-testid="compact-lab-value"]')
      const metadata = element.querySelector<HTMLElement>('[data-testid="compact-lab-meta"]')
      if (!title || !value || !metadata) throw new Error('compact lab row is incomplete')
      const centerY = (node: HTMLElement) => {
        const rect = node.getBoundingClientRect()
        return rect.top + rect.height / 2
      }
      return {
        display: getComputedStyle(element).display,
        flexWrap: getComputedStyle(element).flexWrap,
        centers: [centerY(title), centerY(value), centerY(metadata)],
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }
    })

    // Wide phones and every larger workspace use content-aware wrapping: short
    // results stay on one line, while long results wrap metadata as one unit.
    // In either case no clinical group may overlap or create horizontal scroll.
    for (const width of [390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
      const rowCount = await rows.count()
      let singleLineCount = 0
      for (let index = 0; index < Math.min(rowCount, 8); index += 1) {
        const geometry = await readGeometry(index)
        expect(geometry.display).toBe('flex')
        expect(geometry.flexWrap).toBe('wrap')
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
        if (Math.max(...geometry.centers) - Math.min(...geometry.centers) <= 2) {
          singleLineCount += 1
        }
      }
      expect(singleLineCount).toBeGreaterThan(0)
    }

    // A genuinely narrow phone may use the second line rather than clipping
    // clinical metadata or forcing horizontal scrolling.
    await page.setViewportSize({ width: 320, height: 700 })
    const narrowGeometry = await readGeometry(0)
    expect(narrowGeometry.display).toBe('grid')
    expect(narrowGeometry.scrollWidth).toBeLessThanOrEqual(narrowGeometry.clientWidth)

  })
})
